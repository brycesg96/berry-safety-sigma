import { supabaseClient } from './supabase';
import type { Evidence, Inspection } from './model';
import type { Correction } from './follow-up';

export type CloudInspectionRow = { id: string; author_id: string; data: Inspection & { partial?: boolean }; revision: number; updated_at: string; workflow: string; final_excel_stored?: boolean; active_edit_operation?: string | null };
type StoredEvidence = Evidence & { dataRef?: string; originalRef?: string };
type Runtime = { actor: string; files: Map<string, Promise<string>>; revisions: Map<string, { base: number; saved: number }>; queues: Map<string, Promise<unknown>> };
let runtime: Runtime | undefined;
function forActor(actor: string): Runtime {
  if (runtime?.actor !== actor) runtime = { actor, files: new Map(), revisions: new Map(), queues: new Map() };
  return runtime;
}
export function clearCloudRuntime() { runtime = undefined; }
export async function cloudRpc<T>(name: string, params: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabaseClient().rpc(name, params);
  if (error) {
    if (error.code === '40001') throw new Error('La inspección cambió en otro dispositivo. Vuelve a abrirla antes de guardar; tu edición se conserva en este navegador.');
    if (error.code === '42501') throw new Error('Tu sesión no tiene acceso a esta operación. Revisa tu cuenta y vuelve a iniciar sesión.');
    if (error.code === 'PGRST202') throw new Error('Falta activar la conexión de inspecciones en Supabase.');
    if (error.code?.startsWith('22')) throw new Error('Revisa los campos, las personas seleccionadas y las evidencias antes de continuar.');
    throw new Error('No pudimos guardar los cambios en tu cuenta. Conserva esta pestaña y vuelve a intentarlo.');
  }
  return data as T;
}
async function actorIs(expected: string) {
  const { data: { session } } = await supabaseClient().auth.getSession();
  if (session?.user.id !== expected) throw new Error('La sesión cambió. Vuelve a iniciar sesión antes de guardar.');
}
function cacheDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('berry-cloud-pending-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('drafts', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}
async function cachePut(draft: Inspection | null, id: string) {
  const db = await cacheDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('drafts', 'readwrite'), store = tx.objectStore('drafts');
    if (draft) store.put(draft); else store.delete(id);
    tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
async function pendingDrafts(actor: string): Promise<Inspection[]> {
  const db = await cacheDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('drafts', 'readonly'), request = tx.objectStore('drafts').getAll();
    request.onsuccess = () => resolve((request.result as Inspection[]).filter(draft => draft.ownerId === actor && !draft.delivery));
    request.onerror = () => reject(request.error); tx.oncomplete = () => db.close();
  });
}
function dataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob);
  });
}
async function storedImage(path: string, state: Runtime) {
  let pending = state.files.get(path);
  if (!pending) {
    pending = (async () => {
      const { data, error } = await supabaseClient().storage.from('berry-evidence').download(path);
      if (error || !data) throw new Error('No pudimos recuperar una evidencia. Revisa tu conexión y vuelve a abrir la inspección.');
      return dataUri(data);
    })();
    state.files.set(path, pending);
    void pending.catch(() => state.files.delete(path));
  }
  return pending;
}
async function mapImages(draft: Inspection, transform: (photo: StoredEvidence) => Promise<StoredEvidence>): Promise<Inspection> {
  return {
    ...draft,
    observations: await Promise.all(draft.observations.map(async observation => ({ ...observation, photos: await Promise.all(observation.photos.map(transform)) }))),
    registrationDetails: Object.fromEntries(await Promise.all(Object.entries(draft.registrationDetails || {}).map(async ([key, record]) => [key, { ...record, ...(record.signature ? { signature: await transform(record.signature) } : {}) }]))),
    ...(draft.delivery ? { delivery: { ...draft.delivery, corrections: Object.fromEntries(await Promise.all(Object.entries(draft.delivery.corrections || {}).map(async ([key, correction]) => [key, { ...correction, photos: await Promise.all(correction.photos.map(transform)) }]))) } } : {}),
  };
}
export async function hydrateCloudInspection(row: CloudInspectionRow, actor: string): Promise<Inspection> {
  await actorIs(actor);
  const state = forActor(actor);
  const snapshot = { ...row.data, id: row.id, ownerId: row.author_id, storage: 'cloud' as const, cloudRevision: Number(row.revision), finalExcelStored: row.final_excel_stored, archiveEditOperation: row.active_edit_operation || undefined, updatedAt: row.updated_at };
  return mapImages(snapshot, async photo => ({ ...photo, data: photo.dataRef ? await storedImage(photo.dataRef, state) : photo.data, ...(photo.originalRef ? { originalData: await storedImage(photo.originalRef, state) } : {}) }));
}
export async function loadCloudInspections(actor: string) {
  await actorIs(actor);
  const ready = await cloudRpc<string>('berry_cloud_session', {});
  if (ready !== actor) throw new Error('La sesión cambió. Vuelve a iniciar sesión para continuar.');
  const { data, error } = await supabaseClient().from('berry_inspections').select('*').is('deleted_at', null).or(`author_id.eq.${actor},data->delivery->recipientIds.cs.${JSON.stringify([actor])}`).order('updated_at', { ascending: false });
  if (error) throw new Error('No pudimos consultar tus inspecciones. Revisa tu conexión.');
  const rows = (data || []) as CloudInspectionRow[];
  // The administration panel has wider read permissions. The personal workspace
  // loads only authored or assigned reports and their images.
  const remote = await Promise.all(rows.filter(row => !row.data.partial && (row.author_id === actor || row.workflow !== 'draft' && row.data.delivery?.recipientIds.includes(actor))).map(row => hydrateCloudInspection(row, actor)));
  const pending = await pendingDrafts(actor).catch(() => []);
  const retired = new Set<string>();
  if (pending.length) {
    const result = await supabaseClient().rpc('berry_cloud_tombstones', { p_ids: pending.map(draft => draft.id) });
    // Older schemas do not expose this RPC; other failures must not revive a
    // draft which an administrator may have removed on another device.
    if (result.error && result.error.code !== 'PGRST202') throw new Error('No pudimos comprobar tus borradores pendientes. Revisa tu conexión.');
    for (const id of (result.data || []) as string[]) retired.add(id);
  }
  for (const draft of pending) {
    if (retired.has(draft.id)) { await cachePut(null, draft.id); continue; }
    const existing = remote.find(item => item.id === draft.id);
    if (existing?.delivery) { await cachePut(null, draft.id); continue; }
    const index = remote.findIndex(item => item.id === draft.id);
    if (index >= 0) remote[index] = draft; else remote.push(draft);
  }
  return remote.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
async function uploadImage(data: string, inspectionId: string, photoId: string, state: Runtime): Promise<string> {
  const match = data.match(/^data:(image\/(jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
  if (!match || !/^[a-f0-9-]{36}$/i.test(photoId)) throw new Error('La evidencia no tiene un formato válido.');
  const raw = atob(match[3]), bytes = Uint8Array.from(raw, char => char.charCodeAt(0));
  if (bytes.length > 15 * 1024 * 1024) throw new Error('La evidencia supera 15 MB.');
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.buffer));
  const hash = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
  const path = `${inspectionId}/${photoId}/${hash}.${match[2] === 'jpeg' ? 'jpg' : match[2]}`;
  if (state.files.has(path)) return path;
  const { error } = await supabaseClient().storage.from('berry-evidence').upload(path, new Blob([bytes], { type: match[1] }), { contentType: match[1], upsert: false, cacheControl: '31536000' });
  if (error && error.statusCode !== '409' && !/already exists/i.test(error.message)) throw new Error('No se pudo guardar la evidencia. Conserva esta pestaña y vuelve a intentarlo.');
  state.files.set(path, Promise.resolve(data));
  return path;
}
async function encodeImages(draft: Inspection, state: Runtime): Promise<Inspection> {
  return mapImages(draft, async photo => {
    const dataRef = await uploadImage(photo.data, draft.id, photo.id, state);
    const originalRef = photo.originalData ? await uploadImage(photo.originalData, draft.id, photo.id, state) : undefined;
    return { ...photo, data: undefined, originalData: undefined, dataRef, originalRef } as unknown as StoredEvidence;
  });
}
export async function encodeCloudImagesForActor(draft: Inspection, actor: string): Promise<Inspection> {
  await actorIs(actor); return encodeImages(draft, forActor(actor));
}
export async function persistCloudInspection(draft: Inspection): Promise<Inspection> {
  const state = forActor(draft.ownerId);
  const previous = state.queues.get(draft.id) || Promise.resolve();
  const work = previous.catch(() => {}).then(async () => {
    await actorIs(draft.ownerId);
    const base = Number(draft.cloudRevision || 0);
    let version = state.revisions.get(draft.id);
    if (!version || base !== version.base && base !== version.saved) { version = { base, saved: base }; state.revisions.set(draft.id, version); }
    try { await cachePut({ ...draft, cloudRevision: version.saved }, draft.id); } catch { /* A successful server save does not require a writable browser cache. */ }
    const header = await cloudRpc<CloudInspectionRow>('berry_ensure_draft', { p_id: draft.id });
    if (!version.saved && header.data.partial) version.saved = Number(header.revision);
    try { await cachePut({ ...draft, cloudRevision: version.saved }, draft.id); } catch { /* Keep the expected revision with the offline edit whenever possible. */ }
    const encoded = await encodeImages(draft, state);
    delete encoded.finalExcelStored;
    await actorIs(draft.ownerId);
    const saved = await cloudRpc<CloudInspectionRow>('berry_save_draft', { p_id: draft.id, p_expected: version.saved, p_data: encoded });
    version.saved = Number(saved.revision);
    try { await cachePut(null, draft.id); } catch { /* The server already saved this revision. */ }
    return hydrateCloudInspection(saved, draft.ownerId);
  });
  state.queues.set(draft.id, work);
  return work;
}
export async function discardCloudPending(id: string, actor: string) {
  await actorIs(actor);
  const state = forActor(actor);
  await state.queues.get(id)?.catch(() => {});
  await actorIs(actor);
  await cachePut(null, id);
  state.revisions.delete(id); state.queues.delete(id);
}
export async function removeCloudInspection(id: string, actor: string, revision: number) {
  await actorIs(actor);
  const state = forActor(actor);
  const work = (state.queues.get(id) || Promise.resolve()).catch(() => {}).then(async () => {
    await actorIs(actor);
    const expected = state.revisions.get(id)?.saved ?? revision;
    const saved = await cloudRpc<number>('berry_remove_draft', { p_id: id, p_expected: expected });
    state.revisions.set(id, { base: revision, saved: Number(saved) });
    await cachePut(null, id);
  });
  state.queues.set(id, work);
  return work;
}
export async function changeCloudCorrection(draft: Inspection, observationId: string, actor: string, action: string, value: Partial<Correction>) {
  await actorIs(actor);
  let encoded = value;
  if (value.photos) {
    const state = forActor(actor);
    encoded = { ...value, photos: await Promise.all(value.photos.map(async photo => ({ ...photo, dataRef: await uploadImage(photo.data, draft.id, photo.id, state), originalRef: photo.originalData ? await uploadImage(photo.originalData, draft.id, photo.id, state) : undefined, data: undefined, originalData: undefined } as unknown as Evidence))) };
  }
  const row = await cloudRpc<CloudInspectionRow>('berry_change_correction', { p_id: draft.id, p_observation: observationId, p_expected: draft.cloudRevision, p_action: action, p_value: encoded });
  window.dispatchEvent(new Event('berry-cloud-inspections-changed'));
  return hydrateCloudInspection(row, actor);
}
export async function cloudStoredExcel(draft: Inspection) {
  const { data, error } = await supabaseClient().from('berry_documents').select('filename,storage_path,sha256').eq('inspection_id', draft.id).eq('kind', 'excel').order('revision').limit(1).single();
  if (error || !data) throw new Error('No pudimos encontrar el Excel guardado.');
  const file = await supabaseClient().storage.from('berry-documents').download(data.storage_path);
  if (file.error || !file.data) throw new Error('No pudimos descargar el archivo guardado.');
  const bytes = new Uint8Array(await file.data.arrayBuffer());
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.buffer)), byte => byte.toString(16).padStart(2, '0')).join('');
  if (hash !== data.sha256) throw new Error('El archivo no coincide con la versión registrada.');
  return { bytes, name: data.filename as string };
}
