import { createHash } from 'node:crypto';
import { supabaseServerConfig } from './accounts.mjs';
import { loadConfig, bodyOf, reply } from './make-test.mjs';
import { reportPayload, MAX_EXCEL_BYTES } from './make-report.mjs';
import { registeredExcel } from './xlsx-registration.mjs';
import { inspectionArchivePath } from '../shared/archive-path.mjs';
import { reportFilename } from '../shared/report-filename.mjs';

export const CLOUD_REPORT_PATH = '/api/reports/send';
export const CLOUD_FINAL_PATH = '/api/reports/finalize';
export const CLOUD_EDIT_PATH = '/api/reports/revise';
const MAX_FINAL_BYTES = 15 * 1024 * 1024;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
class ReportError extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code; } }
const encodePath = path => path.split('/').map(encodeURIComponent).join('/');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function payloadFor(row, bytes) {
  const d = row.data;
  const report = reportPayload({ action: 'inspection.send', inspection: { id: row.id, date: d.date, area: d.area, facility: d.facility, objective: d.objective, unfavorableCause: d.unfavorableCause || '', closingRemarks: d.closingRemarks || '', inspector: { name: d.inspector, email: d.inspectorEmail }, inspectors: [{ name: d.inspector, email: d.inspectorEmail }, ...(d.additionalInspectors || []).map(person => ({ name: person.name, email: person.email }))], responsibles: d.responsibles, cc: d.emailCc || [], observationCount: d.observations.length }, attachment: { contentBase64: bytes.toString('base64') } });
  if (row.code) { report.payload.numero = row.code; report.payload.codigo_reservado = true; }
  return report.payload;
}
export function createCloudReportHandler({ env = process.env, fetchImpl = fetch, timeoutMs = 10000, now = () => new Date() } = {}) {
  const config = supabaseServerConfig(env);
  const mail = loadConfig({ ...env, MAKE_TEST_ENABLED: env.MAKE_REPORTS_ENABLED });
  const attempts = new Map();
  async function upstream(path, { method = 'POST', token, body, bytes, binary = false } = {}) {
    if (!config) throw new ReportError(503, 'CLOUD_UNAVAILABLE', 'Falta configurar el servidor de inspecciones.');
    try {
      const response = await fetchImpl(config.url + path, { method, headers: { apikey: config.key, Authorization: `Bearer ${token || config.key}`, 'Content-Type': bytes ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/json', ...(bytes ? { 'x-upsert': 'false' } : {}) }, body: bytes || (body === undefined ? undefined : JSON.stringify(body)), redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
      if (binary && response.ok) return { ok: true, status: response.status, data: Buffer.from(await response.arrayBuffer()) };
      const text = response.status === 204 ? '' : await response.text();
      return { ok: response.ok, status: response.status, data: text ? JSON.parse(text) : null };
    } catch { throw new ReportError(503, 'CLOUD_UNCONFIRMED', 'No pudimos confirmar la operación. Conserva el borrador y vuelve a abrir la inspección antes de reintentar.'); }
  }
  async function rpc(name, body, token) {
    const result = await upstream(`/rest/v1/rpc/${name}`, { body, token });
    if (!result.ok) {
      const code = result.data?.code;
      if (name.includes('admin_edit')) {
        if(code==='PGRST202') throw new ReportError(503,'ADMIN_EDIT_MIGRATION_REQUIRED','Falta activar el paso 10 de Supabase para editar informes.');
        if(code==='42501') throw new ReportError(403,'ADMIN_EDIT_DENIED','Tu cuenta no puede editar esta inspección. Comprueba tus permisos y que siga abierta.');
        if(code==='40001'&&result.data?.message==='EDIT_EXPIRED') throw new ReportError(409,'EDIT_EXPIRED','La preparación de la edición venció. Vuelve a guardar los cambios.');
        if(code==='40001'&&result.data?.message==='MAIL_IN_PROGRESS') throw new ReportError(409,'MAIL_IN_PROGRESS','El envío anterior sigue en curso. Espera un momento antes de editar.');
        if(code==='40001'&&result.data?.message==='EDIT_CLEANUP_PENDING') throw new ReportError(503,'EDIT_CLEANUP_PENDING','Los cambios están guardados. Falta completar el reemplazo del Excel; vuelve a intentarlo.');
      }
      if (code === '42501') throw new ReportError(403, 'ACCESS_DENIED', 'Tu cuenta no puede registrar esta inspección. Comprueba tu sesión.');
      if (code === 'PGRST202' || code === '42703') throw new ReportError(503, 'REPORTS_MIGRATION_REQUIRED', name.includes('final') ? 'Falta activar el paso 4 de Supabase para guardar el Excel final.' : 'Falta activar el registro compartido de inspecciones en Supabase.');
      if (code === '23505') throw new ReportError(409, 'REGISTERED_CONTENT_CHANGED', 'Esta inspección ya está registrada con otro archivo. Vuelve a abrirla para consultar el original.');
      if (code === '55P03') throw new ReportError(409, 'REGISTRATION_BUSY', 'Se está registrando otra inspección. Espera un momento y vuelve a intentarlo.');
      if (code === '40001') throw new ReportError(409, result.data?.message === 'YEAR_CHANGED' ? 'YEAR_CHANGED' : 'REVISION_CONFLICT', 'La inspección cambió en otra sesión. Vuelve a abrirla antes de enviarla.');
      if (code?.startsWith('22')) throw new ReportError(400, 'INVALID_INSPECTION', 'Revisa los datos, los responsables y las evidencias de la inspección.');
      throw new ReportError(503, 'REGISTRATION_UNCONFIRMED', 'No se confirmó el registro. Vuelve a abrir la inspección antes de repetir.');
    }
    return result.data;
  }
  return async function handle(req, res) {
    const origin = req.headers.origin;
    const cors = mail.origins.has(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type, Idempotency-Key' } : {};
    try {
      if (!origin || !mail.origins.has(origin)) throw new ReportError(403, 'ORIGIN_NOT_ALLOWED', 'Origen de la aplicación no permitido.');
      if (req.method === 'OPTIONS') { res.writeHead(204, { 'Cache-Control': 'no-store', ...cors }); res.end(); return; }
      if (req.method !== 'POST') throw new ReportError(405, 'METHOD_NOT_ALLOWED', 'Solo se permite registrar mediante POST.');
      if (!config) throw new ReportError(503, 'CLOUD_UNAVAILABLE', 'Falta configurar el servidor de inspecciones.');
      if (!mail.enabled && req.url !== CLOUD_FINAL_PATH && req.url !== CLOUD_EDIT_PATH) throw new ReportError(503, 'REPORTS_DISABLED', 'El envío de informes aún no está habilitado. El borrador se conserva.');
      const authorization = req.headers.authorization || '';
      if (!authorization.startsWith('Bearer ')) throw new ReportError(401, 'SESSION_REQUIRED', 'Inicia sesión para enviar tu inspección.');
      const token = authorization.slice(7);
      const auth = await upstream('/auth/v1/user', { method: 'GET', token });
      if (!auth.ok || !auth.data?.id || !uuid.test(auth.data.id)) throw new ReportError(401, 'SESSION_INVALID', 'Vuelve a iniciar sesión antes de enviar.');
      let issuedAt;
      try { issuedAt = JSON.parse(Buffer.from(token.split('.')[1], 'base64url')).iat; } catch { /* Require a server-verified issue time. */ }
      if (!Number.isSafeInteger(issuedAt) || issuedAt <= 0) throw new ReportError(401, 'SESSION_INVALID', 'Vuelve a iniciar sesión antes de enviar.');
      const actor = auth.data.id, time = now().getTime();
      for (const [id, value] of attempts) if (value.until <= time) attempts.delete(id);
      const rate = attempts.get(actor) || { until: time + 60000, count: 0 };
      if (rate.count >= 10) throw new ReportError(429, 'RATE_LIMITED', 'Espera un minuto antes de volver a intentarlo.');
      attempts.set(actor, { ...rate, count: rate.count + 1 });
      if (attempts.size > 1000) attempts.delete(attempts.keys().next().value);
      if ((req.headers['content-type'] || '').split(';')[0].trim() !== 'application/json') throw new ReportError(415, 'JSON_REQUIRED', 'Envía el informe en formato JSON.');
      let input;
      try { input = await bodyOf(req, [CLOUD_FINAL_PATH,CLOUD_EDIT_PATH].includes(req.url) ? 21 * 1024 * 1024 : 5 * 1024 * 1024); } catch { throw new ReportError(400, 'INVALID_REPORT', 'El informe supera el tamaño permitido o no es válido.'); }
      if (!input || !uuid.test(input.inspectionId) || req.headers['idempotency-key'] !== (req.url===CLOUD_EDIT_PATH ? input.operationId : input.inspectionId) || (req.url===CLOUD_EDIT_PATH && !uuid.test(input.operationId)) || Object.keys(input).some(key => !(req.url===CLOUD_EDIT_PATH ? ['inspectionId','operationId','contentBase64'] : ['inspectionId','expectedRevision','contentBase64']).includes(key))) throw new ReportError(400, 'INVALID_REPORT', 'Revisa el identificador y los datos del informe.');
      const id = input.inspectionId;
      let source = null, sourceHash = null;
      if (input.contentBase64 !== undefined) {
        const limit = [CLOUD_FINAL_PATH,CLOUD_EDIT_PATH].includes(req.url) ? MAX_FINAL_BYTES : MAX_EXCEL_BYTES;
        if (typeof input.contentBase64 !== 'string' || input.contentBase64.length > Math.ceil(limit / 3) * 4 || input.contentBase64.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(input.contentBase64)) throw new ReportError(400, 'INVALID_EXCEL', 'El Excel no es válido o supera el tamaño permitido.');
        source = Buffer.from(input.contentBase64, 'base64'); sourceHash = digest(source);
      }
      if (req.url === CLOUD_EDIT_PATH) {
        const op = { p_operation: input.operationId, p_actor: actor, p_iat: issuedAt };
        let edited = await rpc('berry_admin_edit_upload', op);
        if (edited.inspection.id !== id) throw new ReportError(400,'INVALID_REPORT','La edición no corresponde a esta inspección.');
        if (edited.state === 'complete') { reply(res,200,{ok:true,inspection:edited.inspection,document:edited.document},cors); return; }
        if (edited.state === 'prepared') {
          let bytes;
          try { bytes = registeredExcel(source,edited.inspection.code,MAX_FINAL_BYTES); }
          catch { throw new ReportError(400,'INVALID_EXCEL','No se pudo generar el Excel actualizado. El informe anterior se conserva.'); }
          const d=edited.inspection.data,name=reportFilename(d.area,d.date),hash=digest(bytes),path=inspectionArchivePath(d.date,id,hash,name);
          const stored=await upstream(`/storage/v1/object/berry-documents/${encodePath(path)}`,{bytes});
          if(!stored.ok && stored.status!==409 && stored.data?.error!=='Duplicate' && stored.data?.statusCode!=='409') throw new ReportError(503,'EDIT_ARCHIVE_FAILED','No se pudo guardar el Excel actualizado. El informe anterior se conserva; vuelve a intentarlo.');
          edited=await rpc('berry_commit_admin_edit',{...op,p_document:{filename:name,storage_path:path,sha256:hash,byte_size:bytes.length}});
        }
        const cleanup=await rpc('berry_admin_edit_cleanup',op);
        if(cleanup.length){
          const removed=await upstream('/storage/v1/object/berry-documents',{method:'DELETE',body:{prefixes:cleanup}});
          if(!removed.ok && removed.status!==404) throw new ReportError(503,'EDIT_CLEANUP_PENDING','Los cambios están guardados. Falta completar el reemplazo del Excel; vuelve a intentarlo.');
        }
        edited.inspection=await rpc('berry_finish_admin_edit',{...op,p_removed:cleanup});
        reply(res,200,{ok:true,inspection:edited.inspection,document:edited.document},cors);return;
      }
      if (req.url === CLOUD_FINAL_PATH) {
        let final = await rpc('berry_prepare_final', { p_id: id, p_expected: input.expectedRevision || null }, token);
        if (!final.complete) {
          let bytes;
          try { bytes = registeredExcel(source, final.inspection.code, MAX_FINAL_BYTES); }
          catch { throw new ReportError(400, 'INVALID_EXCEL', 'No se pudo generar el Excel final. La inspección y su archivo anterior se conservan.'); }
          if (bytes.length > MAX_FINAL_BYTES) throw new ReportError(400, 'EXCEL_TOO_LARGE', 'El Excel final supera los 15 MB permitidos.');
          const d = final.inspection.data, name = reportFilename(d.area, d.date), hash = digest(bytes);
          const path = inspectionArchivePath(d.date, id, hash, name);
          const stored = await upstream(`/storage/v1/object/berry-documents/${encodePath(path)}`, { bytes });
          if (!stored.ok && stored.status !== 409 && stored.data?.error !== 'Duplicate' && stored.data?.statusCode !== '409') throw new ReportError(503, 'FINAL_ARCHIVE_FAILED', 'No se pudo guardar el Excel final. El archivo anterior se conserva; vuelve a intentarlo.');
          final = await rpc('berry_commit_final', { p_id: id, p_actor: actor, p_actor_iat: issuedAt, p_expected: input.expectedRevision || null, p_document: { filename: name, storage_path: path, byte_size: bytes.length, sha256: hash } });
        }
        const cleanup = await rpc('berry_final_cleanup', { p_id: id, p_actor: actor, p_actor_iat: issuedAt });
        if (cleanup.length) {
          const removed = await upstream('/storage/v1/object/berry-documents', { method: 'DELETE', body: { prefixes: cleanup } });
          if (!removed.ok && removed.status !== 404) throw new ReportError(503, 'FINAL_CLEANUP_PENDING', 'El Excel final está guardado. Falta completar el reemplazo; vuelve a intentarlo.');
        }
        final.inspection = await rpc('berry_finish_final', { p_id: id, p_actor: actor, p_actor_iat: issuedAt, p_removed: cleanup });
        reply(res, 200, { ok: true, inspection: final.inspection, document: final.document }, cors); return;
      }
      let registered;
      for (let attempt = 0; attempt < 2; attempt++) {
        const prepared = await rpc('berry_prepare_report', { p_id: id, p_expected: input.expectedRevision || null, p_hash: sourceHash }, token);
        if (prepared.registered) { registered = prepared; break; }
        const lease = prepared.lease;
        try {
          let bytes;
          try { bytes = registeredExcel(source, lease.code); payloadFor(prepared.inspection, source); }
          catch { throw new ReportError(400, 'INVALID_EXCEL', 'Revisa los datos y el Excel. El borrador se conserva.'); }
          if (bytes.length > MAX_EXCEL_BYTES) throw new ReportError(400, 'EXCEL_TOO_LARGE', 'El Excel supera 3 MB. Reduce las fotografías.');
          const d = prepared.inspection.data, name = reportFilename(d.area, d.date), hash = digest(bytes);
          const path = inspectionArchivePath(d.date, id, hash, name);
          const stored = await upstream(`/storage/v1/object/berry-documents/${encodePath(path)}`, { bytes });
          if (!stored.ok && stored.status !== 409 && stored.data?.error !== 'Duplicate' && stored.data?.statusCode !== '409') throw new ReportError(503, 'ARCHIVE_FAILED', 'No se pudo guardar el Excel. El código no se ha confirmado.');
          registered = await rpc('berry_commit_report', { p_operation: lease.operation_id, p_actor: actor, p_actor_iat: issuedAt, p_document: { filename: name, storage_path: path, byte_size: bytes.length, sha256: hash } });
          break;
        } catch (error) {
          try { await rpc('berry_cancel_report', { p_operation: lease.operation_id, p_actor: actor }); } catch { /* Expiry releases abandoned registrations without consuming a code. */ }
          if (error.code === 'YEAR_CHANGED' && attempt === 0) continue;
          if (error.code === 'REVISION_CONFLICT') {
            const replay = await rpc('berry_prepare_report', { p_id: id, p_expected: input.expectedRevision || null, p_hash: sourceHash }, token);
            if (replay.registered) { registered = replay; break; }
          }
          throw error;
        }
      }
      if (!registered) throw new ReportError(503, 'REGISTRATION_UNCONFIRMED', 'Vuelve a abrir la inspección para comprobar su registro.');
      const job = await rpc('berry_claim_report_mail', { p_id: id, p_actor: actor });
      if (job.dispatch) {
        let result;
        try {
          const file = await upstream(`/storage/v1/object/authenticated/berry-documents/${encodePath(registered.document.storage_path)}`, { method: 'GET', binary: true });
          if (!file.ok || digest(file.data) !== registered.document.sha256) throw new Error('ARCHIVE_CHANGED');
          const payload = payloadFor(registered.inspection, file.data);
          const response = await fetchImpl(mail.webhook, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Berry-Mode': 'inspection' }, body: JSON.stringify(payload), redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
          await response.body?.cancel();
          result = { state: response.ok ? 'accepted' : 'rejected', upstreamStatus: response.status, message: response.ok ? 'Informe guardado y envío aceptado por el servicio de correo.' : 'Informe guardado. El servicio de correo rechazó el envío.' };
        } catch { result = { state: 'unconfirmed', message: 'Informe guardado. La recepción del correo no está confirmada.' }; }
        registered.inspection = await rpc('berry_finish_report_mail', { p_id: id, p_actor: actor, p_result: result });
      }
      reply(res, 200, { ok: true, inspection: registered.inspection, document: registered.document }, cors);
    } catch (error) {
      reply(res, error.status || 503, { ok: false, code: error.code || (req.url===CLOUD_EDIT_PATH ? 'EDIT_UNCONFIRMED' : 'REGISTRATION_UNCONFIRMED'), message: error instanceof ReportError ? error.message : req.url===CLOUD_EDIT_PATH ? 'No se confirmó la actualización. Conserva esta pestaña y reintenta el guardado para comprobar su estado.' : 'No se confirmó el registro. Conserva tu borrador y vuelve a abrir la inspección.' }, cors);
    }
  };
}
