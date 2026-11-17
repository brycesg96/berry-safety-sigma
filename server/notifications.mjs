import { createHmac, timingSafeEqual } from 'node:crypto';
import { loadConfig, reply, bodyOf } from './make-test.mjs';
import { supabaseServerConfig } from './accounts.mjs';
export const MAIL_EVENTS_PATH='/api/mail/events';
export const REMINDERS_PATH='/api/reminders/run';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const email=/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function equal(a,b){return typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));}
export function eventSignature(secret,timestamp,body){return createHmac('sha256',secret).update(`${timestamp}.${body}`).digest('hex');}
export function createNotificationsHandler({env=process.env,fetchImpl=fetch,now=()=>new Date(),timeoutMs=10000}={}) {
 const config=supabaseServerConfig(env),mail=loadConfig({...env,MAKE_TEST_ENABLED:env.MAKE_REPORTS_ENABLED});
 let running=false;
 async function request(path,body,binary=false){
  if(!config)throw Error('UNAVAILABLE');
  const response=await fetchImpl(config.url+path,{method:binary?'GET':'POST',headers:{apikey:config.key,Authorization:`Bearer ${config.key}`,'Content-Type':'application/json'},body:binary?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(timeoutMs)});
  if(!response.ok)throw Error('UPSTREAM');
  return binary?Buffer.from(await response.arrayBuffer()):response.status===204?null:response.json();
 }
 return async(req,res)=>{
  const fail=(status,code,message)=>reply(res,status,{ok:false,code,message});
  if(req.method!=='POST')return fail(405,'METHOD_NOT_ALLOWED','Esta ruta solo admite POST.');
  if(!config)return fail(503,'UNAVAILABLE','El servicio no está configurado.');
  if(req.url===MAIL_EVENTS_PATH){
   const secret=env.MAIL_EVENTS_SECRET||'';
   if(env.MAIL_TRACKING_ENABLED!=='true'||secret.length<32)return fail(503,'TRACKING_DISABLED','La confirmación de correo no está habilitada.');
   const timestamp=req.headers['x-berry-timestamp'],signature=req.headers['x-berry-signature'];
   if(typeof timestamp!=='string'||!/^\d{10}$/.test(timestamp)||Math.abs(now().getTime()/1000-Number(timestamp))>300||typeof signature!=='string'||!/^sha256=[a-f0-9]{64}$/.test(signature))return fail(401,'INVALID_SIGNATURE','Firma no válida.');
   try{
    const chunks=[];let bytes=0;
    for await(const chunk of req){bytes+=chunk.length;if(bytes>8192)return fail(413,'BODY_TOO_LARGE','Evento demasiado grande.');chunks.push(chunk);}
    const raw=Buffer.concat(chunks).toString('utf8');
    if(!equal(`sha256=${eventSignature(secret,timestamp,raw)}`,signature))return fail(401,'INVALID_SIGNATURE','Firma no válida.');
    let event;try{event=JSON.parse(raw);}catch{return fail(400,'INVALID_EVENT','Evento JSON no válido.');}
    if(!event||Array.isArray(event)||Object.keys(event).some(k=>!['event_id','request_id','recipient','state','provider_id','detail','occurred_at'].includes(k))||typeof event.event_id!=='string'||!event.event_id||event.event_id.length>250||!uuid.test(event.request_id)||typeof event.recipient!=='string'||event.recipient.length>254||!email.test(event.recipient)||!['submitted','delivered','bounced','deferred'].includes(event.state)||typeof event.occurred_at!=='string'||!/(Z|[+-]\d{2}:\d{2})$/.test(event.occurred_at)||!Number.isFinite(Date.parse(event.occurred_at))||Date.parse(event.occurred_at)>now().getTime()+300000||event.detail!==undefined&&(typeof event.detail!=='string'||event.detail.length>1000)||event.provider_id!==undefined&&(typeof event.provider_id!=='string'||event.provider_id.length>500))return fail(400,'INVALID_EVENT','Revisa los campos del evento.');
    const result=await request('/rest/v1/rpc/berry_record_mail_event',{p_event:event.event_id,p_request:event.request_id,p_email:event.recipient.toLowerCase(),p_state:event.state,p_provider:event.provider_id||null,p_detail:event.detail||'',p_occurred:event.occurred_at});
    return reply(res,200,{ok:true,duplicate:result.duplicate===true});
   }catch{return fail(503,'EVENT_UNCONFIRMED','No se confirmó el registro. Reintenta el mismo identificador de evento.');}
  }
  if(req.url!==REMINDERS_PATH)return fail(404,'NOT_FOUND','Ruta no disponible.');
  const secret=env.REMINDERS_CRON_SECRET||'';
  if(secret.length<32||!equal(req.headers.authorization,`Bearer ${secret}`))return fail(401,'UNAUTHORIZED','Credencial no válida.');
  if(env.REMINDERS_ENABLED!=='true'||!mail.enabled)return fail(503,'REMINDERS_DISABLED','Los recordatorios no están habilitados.');
  if(running)return fail(409,'RUNNING','Hay un procesamiento en curso.');
  let input;try{input=await bodyOf(req,1024);}catch{return fail(400,'INVALID_BODY','Solicitud no válida.');}
  if(!input||input.action!=='reminders.run'||Object.keys(input).length!==1)return fail(400,'INVALID_ACTION','Acción no válida.');
  running=true;let accepted=0,unconfirmed=0,rejected=0;
  try{
   const jobs=await request('/rest/v1/rpc/berry_claim_reminders',{p_limit:10});
   for(const job of jobs){
    let state='unconfirmed';
    try{
     if(!uuid.test(job.request_id)||!uuid.test(job.id)||!email.test(job.email)||typeof job.storage_path!=='string')throw Error('INVALID_JOB');
     const attachment=await request('/storage/v1/object/authenticated/berry-documents/'+job.storage_path.split('/').map(encodeURIComponent).join('/'),null,true);
     if(attachment.length>3*1024*1024)throw Error('ATTACHMENT_TOO_LARGE');
     const payload={schema_version:'1.2',source:'Berry Safety',request_id:job.request_id,inspection_id:job.id,mode:'reminder',send_email:true,es_ejemplo:false,codigo_reservado:true,numero:job.code,fecha:job.data.date,area:job.data.area,
      destinatarios:{para:[job.email],cc:[],cco:[]},outlook:{para:[{address:job.email,name:job.full_name}],cc:[],cco:[]},
      asunto:`Recordatorio de ${job.reason==='review'?'revisión':'levantamiento'} — ${job.code}`,
      cuerpo_html:`<p>Hola, ${escape(job.full_name)}:</p><p>La inspección <strong>${escape(job.code)}</strong>, ${escape(job.data.area)}, tiene observaciones ${job.reason==='review'?'pendientes de validar o aprobar':'próximas a vencer o vencidas, pendientes de atención'}.</p><p>Ingresa a Berry Safety para consultar los plazos, ${job.reason==='review'?'revisar las evidencias':'registrar las acciones correctivas'} y dar seguimiento a su cierre.</p><p>Se adjunta el registro de la inspección.</p>`,
      adjuntos:[{nombre:job.filename,tipo:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',contenido_base64:attachment.toString('base64')}]};
     if(env.MAIL_TRACKING_ENABLED==='true')await request('/rest/v1/rpc/berry_initialize_mail',{p_id:job.id,p_request:job.request_id,p_emails:[job.email]});
     const response=await fetchImpl(mail.webhook,{method:'POST',headers:{'Content-Type':'application/json','X-Berry-Mode':'reminder'},body:JSON.stringify(payload),redirect:'error',signal:AbortSignal.timeout(timeoutMs)});
     await response.body?.cancel();state=response.ok?'accepted':'rejected';
    }catch{state='unconfirmed';}
    if(state==='accepted')accepted++;else if(state==='rejected')rejected++;else unconfirmed++;
    await request('/rest/v1/rpc/berry_finish_reminder',{p_id:job.request_id,p_state:state,p_result:{state,processed_at:now().toISOString()}});
   }
   return reply(res,200,{ok:true,accepted,rejected,unconfirmed});
  }catch{return fail(503,'RUN_UNCONFIRMED','Revisa los intentos registrados antes de solicitar otro procesamiento.');}
  finally{running=false;}
 };
}
