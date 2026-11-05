import { loadConfig, reply, bodyOf, secureEqual } from './make-test.mjs';
import { issueMailSession } from './session-token.mjs';
export const MAIL_SESSION_PATH='/api/mail/session';
export function createMailSessionHandler({env=process.env,now=()=>new Date()}={}) {
  const config=loadConfig({...env,MAKE_TEST_ENABLED:'false'}), attempts=new Map();
  return async(req,res)=>{
    const origin=req.headers.origin;
    const cors=config.origins.has(origin)?{'Access-Control-Allow-Origin':origin,Vary:'Origin','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type'}:{};
    const fail=(status,code,message)=>reply(res,status,{ok:false,code,message},cors);
    if(!origin || !config.origins.has(origin))return fail(403,'ORIGIN_NOT_ALLOWED','Origen no permitido.');
    if(req.method==='OPTIONS'){res.writeHead(204,{'Cache-Control':'no-store',...cors});res.end();return;}
    if(req.method!=='POST')return fail(405,'METHOD_NOT_ALLOWED','Solo POST.');
    if(config.token.length<32)return fail(503,'SESSION_UNAVAILABLE','Falta configurar la clave de envíos en el servidor.');
    const time=now().getTime(),ip=req.socket.remoteAddress || 'unknown';
    for(const[key,v]of attempts)if(v.expires<=time)attempts.delete(key);
    if((attempts.get(ip)?.count || 0)>=10)return fail(429,'RATE_LIMITED','Espera un minuto antes de volver a activar los envíos.');
    const auth=req.headers.authorization || '';
    if(!auth.startsWith('Bearer ') || !secureEqual(auth.slice(7),config.token)) {
      const prior=attempts.get(ip);attempts.set(ip,{count:(prior?.count || 0)+1,expires:prior?.expires || time+60000});
      if(attempts.size>1000)attempts.delete(attempts.keys().next().value);
      return fail(401,'UNAUTHORIZED','La clave de configuración no es válida.');
    }
    if((req.headers['content-type'] || '').split(';')[0].trim()!=='application/json')return fail(415,'JSON_REQUIRED','Se requiere JSON.');
    let input;try{input=await bodyOf(req,1024);}catch{return fail(400,'INVALID_BODY','Solicitud inválida.');}
    if(input?.action!=='session.create' || Object.keys(input).length!==1)return fail(400,'INVALID_ACTION','Solicitud inválida.');
    const session=issueMailSession(config.token,origin,time);
    reply(res,200,{ok:true,access_token:session.token,expires_at:new Date(session.expiresAt).toISOString()},cors);
  };
}
