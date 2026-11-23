import { supabaseClient } from './supabase';

export type SafetyKind = 'ATS' | 'PETAR' | 'CHECKLIST';
export type SafetyStatus = 'pending' | 'approved' | 'corrections';
export type SafetyDocument = { id: string; owner_id: string | null; owner_name: string; kind: SafetyKind; title: string; document_date: string; workplace: string; storage_path: string; file_name: string; mime_type: string; file_size: number; status: SafetyStatus; review_note: string; reviewed_at: string | null; created_at: string; revision: number; management_id?: string | null; area_id?: string | null; management_name?: string; area_name?: string; submission_source?: 'account' | 'guest'; batch_id?:string|null; site_id?:string|null; zone_id?:string|null; site_name?:string; zone_name?:string };
export const SAFETY_LABELS = { ATS: 'ATS', PETAR: 'PETAR', CHECKLIST: 'Checklist' };
const BUCKET = 'berry-safety-documents';
const MAX_FILE = 10 * 1024 * 1024;
export type UploadIntent = { id: string; file: File; mime: string; extension: string; uploaded: boolean; started: boolean };

function failure(error: { code?: string; message?: string }) {
  if (error.code === '40001' || error.message?.includes('DOCUMENT_CONFLICT')) return new Error('El documento cambió en otra sesión. Actualiza la lista antes de revisarlo.');
  if (error.code === '42501') return new Error('Tu cuenta no tiene permiso para esta acción.');
  if (error.message?.includes('REVIEW_NOTE_REQUIRED')) return new Error('Indica qué correcciones se necesitan.');
  return new Error('No pudimos confirmar la operación. Conservamos el formulario; vuelve a intentarlo con conexión.');
}

export async function prepareSafetyFile(file: File): Promise<UploadIntent> {
  if (!file.size || file.size > MAX_FILE) throw new Error('El archivo debe tener contenido y pesar como máximo 10 MB.');
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const text = new TextDecoder().decode(bytes);
  const detected = text.startsWith('%PDF-') ? ['application/pdf', 'pdf'] : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? ['image/jpeg', 'jpg'] : bytes[0] === 137 && text.slice(1, 4) === 'PNG' ? ['image/png', 'png'] : text.startsWith('RIFF') && text.slice(8, 12) === 'WEBP' ? ['image/webp', 'webp'] : null;
  const extensionMatches = detected && new RegExp(`\\.${detected[1] === 'jpg' ? 'jpe?g' : detected[1]}$`, 'i').test(file.name);
  if (!detected || file.type && file.type !== detected[0] || !extensionMatches) throw new Error('Elige un PDF o una foto JPG, PNG o WebP válida.');
  return { id: crypto.randomUUID(), file, mime: detected[0], extension: detected[1], uploaded: false, started: false };
}

export async function safetyReady() {
  const { data, error } = await supabaseClient().rpc('berry_safety_document_status');
  if (error?.code === 'PGRST202' || error?.code === '42883') return false;
  if (error) throw failure(error);
  return data?.ready === true;
}

export async function listSafetyDocuments({ type = '', types = [], status = '', query = '', page = 0, management = '', area = '' }: { type?: string; types?:string[]; status?: string; query?: string; page?: number; management?: string; area?: string }) {
  let request = supabaseClient().from('berry_safety_documents').select('*', { count: 'exact' }).order('management_name').order('area_name').order('created_at', { ascending: false }).order('id').range(page * 20, page * 20 + 19);
  if (management) request = request.eq('management_id', management);
  if (area) request = request.eq('area_id', area);
  if (types.length) request = request.in('kind', types);
  if (type) request = request.eq('kind', type);
  if (status) request = request.eq('status', status);
  if (query.trim()) request = request.ilike('owner_name', `%${query.trim().replace(/[\\%_]/g, '\\$&')}%`);
  const { data, count, error } = await request;
  if (error) throw new Error('No pudimos consultar los documentos. Revisa tu conexión y pulsa Actualizar lista.');
  return { rows: data as SafetyDocument[], count: count || 0 };
}

export async function submitSafetyDocument(actor: string, intent: UploadIntent, values: { kind: SafetyKind; title: string; date: string; workplace: string }, onPhase: (phase: string) => void) {
  if (!navigator.onLine) throw new Error('Necesitas conexión para subir el documento. Tu selección sigue en este formulario.');
  const client = supabaseClient(); intent.started = true;
  const path = `${actor}/${intent.id}/documento.${intent.extension}`;
  if (!intent.uploaded) {
    onPhase('Subiendo archivo…');
    const { error } = await client.storage.from(BUCKET).upload(path, intent.file, { contentType: intent.mime, upsert: false });
    // A repeated upload of the same retained intent may follow a lost response.
    if (error && !['409', 'Duplicate'].includes(String((error as { statusCode?: string }).statusCode || error.name))) throw failure(error);
    intent.uploaded = true;
  }
  onPhase('Confirmando registro…');
  const { data, error } = await client.rpc('berry_submit_safety_document', { p_id: intent.id, p_kind: values.kind, p_title: values.title.trim(), p_date: values.date, p_workplace: values.workplace.trim(), p_file_name: intent.file.name.replace(/[\\/\r\n]/g, '_').slice(0, 200), p_mime: intent.mime });
  if (error) throw failure(error);
  return data as SafetyDocument;
}

export async function archiveSafetyDocument(document: SafetyDocument) {
  const { error } = await supabaseClient().rpc('berry_archive_safety_document', { p_id: document.id, p_revision: document.revision });
  if (error) throw failure(error);
}

export async function safetyFile(document: SafetyDocument) {
  const { data, error } = await supabaseClient().storage.from(BUCKET).download(document.storage_path);
  if (error || !data) throw new Error('No se pudo descargar el archivo. Verifica tu conexión y tu acceso al documento.');
  return new Blob([data], { type: document.mime_type });
}

// Private, authenticated updates. Polling also covers missed events and permission changes.
export function subscribeSafetyDocuments(onChange:()=>void) {
 let timer=0,disposed=false;
 const refresh=()=>{if(disposed||document.visibilityState!=='visible'||!navigator.onLine)return;clearTimeout(timer);timer=window.setTimeout(()=>{if(!disposed)onChange();},350);};
 const channel=supabaseClient().channel(`yo-seguro-${crypto.randomUUID()}`).on('postgres_changes',{event:'INSERT',schema:'public',table:'berry_safety_documents'},refresh).subscribe();
 const interval=window.setInterval(refresh,15000);window.addEventListener('focus',refresh);window.addEventListener('online',refresh);document.addEventListener('visibilitychange',refresh);
 return()=>{disposed=true;clearTimeout(timer);clearInterval(interval);window.removeEventListener('focus',refresh);window.removeEventListener('online',refresh);document.removeEventListener('visibilitychange',refresh);void supabaseClient().removeChannel(channel);};
}
