import { authorizedMail } from './session-token.mjs';
import { createHash } from 'node:crypto';
import { loadConfig, reply, bodyOf } from './make-test.mjs';
import { openReportRegistry } from './report-registry.mjs';
export const REPORT_PATH = '/api/inspections/send';
export const MAX_EXCEL_BYTES = 3 * 1024 * 1024;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const escape = value => value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function text(value, max, required = true) { if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value) || (required && !value.trim())) throw new Error('INVALID_REPORT'); return value.trim(); }
function email(value) { const result = text(value, 254).toLowerCase(); if (!/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(result)) throw new Error('INVALID_REPORT'); return result; }
export function reportPayload(input) {
  const d = input?.inspection;
  if (input?.action !== 'inspection.send' || !d || !uuid.test(d.id)) throw new Error('INVALID_REPORT');
  const date = text(d.date, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(`${date}T12:00:00Z`).toISOString().slice(0,10) !== date) throw new Error('INVALID_REPORT');
  const area = text(d.area, 500), facility = text(d.facility || '', 500, false), objective = text(d.objective, 560);
  const inspector = { nombre: text(d.inspector?.name, 250), correo: email(d.inspector?.email) };
  if (!Array.isArray(d.responsibles) || !d.responsibles.length || d.responsibles.length > 50 || !Array.isArray(d.cc) || d.cc.length > 50) throw new Error('INVALID_REPORT');
  const seen = new Set(); const people = [];
  for (const p of d.responsibles) { const address=email(p.email); const name=text(p.name,250); if (!seen.has(address)) {seen.add(address);people.push({address,name});} }
  const cc = [...new Set(d.cc.map(email))].filter(address => !seen.has(address));
  if (!Number.isInteger(d.observationCount) || d.observationCount < 1 || d.observationCount > 500) throw new Error('INVALID_REPORT');
  const base64 = input.attachment?.contentBase64;
  if (typeof base64 !== 'string' || base64.length > Math.ceil(MAX_EXCEL_BYTES/3)*4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) throw new Error('INVALID_ATTACHMENT');
  const buffer=Buffer.from(base64,'base64');
  if (buffer.length < 4 || buffer.length > MAX_EXCEL_BYTES || buffer.subarray(0,4).toString('hex') !== '504b0304') throw new Error('INVALID_ATTACHMENT');
  const metadata = {id:d.id,date,area,facility,objective,inspector,responsibles:people,cc,observationCount:d.observationCount};
  const payload = {
    schema_version:'1.1',source:'Berry Safety / BR Sigma',request_id:d.id,inspection_id:d.id,
    mode:'inspection',send_email:true,es_ejemplo:false,codigo_reservado:false,numero:'SIN CÓDIGO DEFINITIVO',
    fecha:date,fundo:facility,area,inspector,responsables:people.map(p=>({nombre:p.name,correo:p.address})),
    destinatarios:{para:people.map(p=>p.address),cc,cco:[]},
    outlook:{para:people,cc:cc.map(address=>({address,name:''})),cco:[]},
    asunto:`Informe de inspección de seguridad - ${area.replace(/[\r\n]+/g,' ')} - ${date}`,
    cuerpo_html:`<p>Estimado equipo:</p><p>Se ha compartido con ustedes un informe de inspección de seguridad y salud en el trabajo. Encontrarán el informe Excel adjunto para su revisión y seguimiento.</p><p><strong>Área e instalación:</strong> ${escape(area)}<br><strong>Fecha:</strong> ${escape(date)}<br><strong>Inspector:</strong> ${escape(inspector.nombre)}</p><p>Por favor, revisen los hallazgos y las acciones a tomar indicadas en el documento.</p><p>Berry Safety / BR Sigma</p><p><small>Formato Excel provisional. Código definitivo pendiente de registro central.</small></p>`,
    adjuntos:[{nombre:`Inspeccion-${date}-${d.id.slice(0,8)}.xlsx`,tipo:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',contenido_base64:base64}],
  };
  return {payload, hash:createHash('sha256').update(JSON.stringify(metadata)).digest('hex')};
}
export function createReportHandler({ env=process.env, fetchImpl=fetch, now=()=>new Date(), timeoutMs=10000, reportRegistry } = {}) {
  const config=loadConfig({...env,MAKE_TEST_ENABLED:env.MAKE_REPORTS_ENABLED});
  let registry=reportRegistry; const pending=new Map(); let attempts=[]; const unauthorized=new Map();
  const unconfirmed=id=>({status:502,body:{ok:false,receipt:'unconfirmed',request_id:id,code:'REPORT_UNCONFIRMED',message:'Recepción no confirmada. Revisa Make antes de cualquier reenvío. No se reenvió automáticamente.'}});
  return async (req,res)=>{
    const origin=req.headers.origin;
    const cors=origin && config.origins.has(origin)?{'Access-Control-Allow-Origin':origin,Vary:'Origin','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type, Idempotency-Key'}:{};
    const fail=(status,code,message)=>reply(res,status,{ok:false,code,message},cors);
    if(origin && !config.origins.has(origin))return fail(403,'ORIGIN_NOT_ALLOWED','Origen no permitido.');
    if(req.method==='OPTIONS'){res.writeHead(204,cors);res.end();return;}
    if(req.method!=='POST')return fail(405,'METHOD_NOT_ALLOWED','Solo POST.');
    if(!config.enabled)return fail(503,'REPORTS_DISABLED','Activa MAKE_REPORTS_ENABLED en Render después de configurar destinatarios y adjunto en Make.');
    const time=now().getTime(),ip=req.socket.remoteAddress || 'unknown';
    for(const [key,v] of unauthorized)if(v.expires<=time)unauthorized.delete(key);
    if((unauthorized.get(ip)?.count || 0)>=10)return fail(429,'RATE_LIMITED','Espera un minuto antes de repetir.');
    const auth=req.headers.authorization || '';
    if(!authorizedMail(auth,config.token,origin,time)){
      const v=unauthorized.get(ip);unauthorized.set(ip,{count:(v?.count||0)+1,expires:v?.expires||time+60000});
      if(unauthorized.size>1000)unauthorized.delete(unauthorized.keys().next().value);
      return fail(401,'UNAUTHORIZED','La clave de API no es válida.');
    }
    if((req.headers['content-type']||'').split(';')[0].trim()!=='application/json')return fail(415,'JSON_REQUIRED','Se requiere JSON.');
    let data;try{data=await bodyOf(req,5*1024*1024);}catch{return fail(400,'INVALID_BODY','JSON inválido o demasiado grande. El Excel admite hasta 3 MB.');}
    if(data?.action==='inspection.check' && Object.keys(data).length===1)return reply(res,200,{ok:true,enabled:true},cors);
    let report;try{report=reportPayload(data);}catch{return fail(400,'INVALID_REPORT','Revisa los datos, los destinatarios y el Excel (máximo 3 MB).');}
    const id=report.payload.inspection_id;
    if(req.headers['idempotency-key']!==id)return fail(400,'REQUEST_ID_REQUIRED','El ID debe coincidir con la inspección.');
    registry ||= openReportRegistry(env.REPORT_REGISTRY_PATH);
    const prior=registry.find(id);
    if(prior){
      if(prior.hash!==report.hash)return fail(409,'REPORT_CHANGED','La inspección ya tiene un intento con otros datos. Revisa Make antes de enviar otra versión.');
      const result=prior.result || (pending.has(id)?await pending.get(id):unconfirmed(id));
      return reply(res,result.status,result.body,cors);
    }
    attempts=attempts.filter(t=>time-t<60000);
    if(attempts.length>=5)return fail(429,'RATE_LIMITED','Se permiten cinco informes nuevos por minuto.');
    if(!registry.claim(id,report.hash)){const result=unconfirmed(id);return reply(res,result.status,result.body,cors);}
    attempts.push(time);
    const work=(async()=>{
      let result;
      try{
        const upstream=await fetchImpl(config.webhook,{method:'POST',headers:{'Content-Type':'application/json','X-Berry-Mode':'inspection'},body:JSON.stringify(report.payload),redirect:'error',signal:AbortSignal.timeout(timeoutMs)});
        await upstream.body?.cancel();
        result=upstream.ok?{status:200,body:{ok:true,receipt:'http_accepted',request_id:id,upstream_status:upstream.status,submitted_at:now().toISOString(),email_requested:true,outlook_status:'not_confirmed'}}:{status:502,body:{ok:false,receipt:'rejected',code:'MAKE_REJECTED',request_id:id,upstream_status:upstream.status}};
      }catch{result=unconfirmed(id);}
      registry.finish(id,result);return result;
    })();
    pending.set(id,work);
    try{const result=await work;reply(res,result.status,result.body,cors);}finally{pending.delete(id);}
  };
}
