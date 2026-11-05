import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from './index.mjs';
import { authorizedMail, issueMailSession, SESSION_MS } from './session-token.mjs';
const key='test-configuration-only-'.repeat(3), origin='https://berry.example';
const env={BERRY_PROTOTYPE_MODE:'false',MAKE_TEST_API_TOKEN:key,MAKE_TEST_ENABLED:'true',MAKE_REPORTS_ENABLED:'true',MAKE_WEBHOOK_URL:'https://hook.us2.make.com/fictitious',BERRY_ALLOWED_ORIGINS:origin,NODE_ENV:'production'};
test('token de sesión: firma, caducidad, origen y rotación de clave',()=>{
 const time=Date.now(),session=issueMailSession(key,origin,time);
 assert.ok(!session.token.includes(key));assert.equal(session.expiresAt,time+SESSION_MS);
 assert.equal(authorizedMail(`Bearer ${session.token}`,key,origin,time),true);
 assert.equal(authorizedMail(`Bearer ${session.token}`,key,'https://evil.example',time),false);
 assert.equal(authorizedMail(`Bearer ${session.token}`,key,origin,session.expiresAt),false);
 assert.equal(authorizedMail(`Bearer ${session.token}`,key+'rotated',origin,time),false);
 const parts=session.token.split('.');parts[1]=Buffer.from(JSON.stringify({expiresAt:time+10*SESSION_MS})).toString('base64url');
 assert.equal(authorizedMail(`Bearer ${parts.join('.')}`,key,origin,time),false);
 assert.equal(authorizedMail(`Bearer ${session.token}`,key,origin,time-1),false);
});
async function setup(t){
 let time=new Date(),calls=0;
 const server=createApi({env,now:()=>time,fetchImpl:async()=>{calls++;return new Response('Accepted');}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
 const send=async(path,authorization=`Bearer ${key}`,body={action:'session.create'},extra={})=>{
  const response=await fetch(`http://127.0.0.1:${server.address().port}${path}`,{method:'POST',headers:{Origin:origin,Authorization:authorization,'Content-Type':'application/json',...extra},body:JSON.stringify(body)});
  return{status:response.status,data:await response.json(),headers:response.headers};
 };
 return{send,getCalls:()=>calls,advance:()=>{time=new Date(time.getTime()+SESSION_MS);}};
}
test('autorizar una vez no llama Make; la sesión autoriza informes y expira sin enviar',async t=>{
 const api=await setup(t),session=await api.send('/api/mail/session');
 assert.equal(session.status,200);assert.equal(session.headers.get('cache-control'),'no-store');assert.equal(api.getCalls(),0);
 assert.ok(!JSON.stringify(session.data).includes(key));
 const auth=`Bearer ${session.data.access_token}`;
 assert.equal((await api.send('/api/inspections/send',auth,{action:'inspection.check'})).data.enabled,true);
 assert.equal((await api.send('/api/inspections/send',auth,{action:'inspection.check'})).status,200);
 api.advance();assert.equal((await api.send('/api/inspections/send',auth,{action:'inspection.check'})).status,401);assert.equal(api.getCalls(),0);
});
test('una sesión no puede renovarse a sí misma; clave incorrecta, origen extraño y cuerpo no válido se rechazan',async t=>{
 const api=await setup(t);
 assert.equal((await api.send('/api/mail/session','Bearer bad')).status,401);
 assert.equal((await api.send('/api/mail/session',`Bearer ${key}`,{action:'session.create'},{Origin:'https://evil.example'})).status,403);
 assert.equal((await api.send('/api/mail/session',`Bearer ${key}`,{action:'session.create',expiresAt:'forever'})).status,400);
 const first=await api.send('/api/mail/session');
 assert.equal((await api.send('/api/mail/session',`Bearer ${first.data.access_token}`)).status,401);
 assert.equal(api.getCalls(),0);
});
test('la emisión de sesiones limita intentos fallidos',async t=>{
 const api=await setup(t);for(let i=0;i<10;i++)assert.equal((await api.send('/api/mail/session','Bearer bad')).status,401);
 assert.equal((await api.send('/api/mail/session')).status,429);assert.equal(api.getCalls(),0);
});
