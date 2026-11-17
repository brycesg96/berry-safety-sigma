import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { createNotificationsHandler, eventSignature } from './notifications.mjs';
const secret='fictitious-notification-secret-32-characters',cron='fictitious-cron-secret-32-characters';
const id='ba000000-0000-4000-8000-000000000001',request='ba000000-0000-4000-8000-000000000002';
const now=new Date('2026-11-17T02:00:00Z'),timestamp=String(now.getTime()/1000);
const env={SUPABASE_URL:'https://rwacygoxhkxxxkvushmb.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_fictitious_notification_key_123456789',MAIL_TRACKING_ENABLED:'true',MAIL_EVENTS_SECRET:secret,REMINDERS_ENABLED:'true',REMINDERS_CRON_SECRET:cron,MAKE_REPORTS_ENABLED:'true',MAKE_WEBHOOK_URL:'https://hook.us2.make.com/fictitious',MAKE_TEST_API_TOKEN:secret,BERRY_ALLOWED_ORIGINS:'https://berry.example'};
async function setup(t,options={}){
 const calls=[];let claimed=false;
 const handler=createNotificationsHandler({env:{...env,...options.env},now:()=>now,fetchImpl:async(url,init)=>{
  const path=new URL(url).pathname,body=typeof init.body==='string'?JSON.parse(init.body):null;calls.push({path,body});
  if(path==='/rest/v1/rpc/berry_record_mail_event')return Response.json({duplicate:options.duplicate||false});
  if(path==='/rest/v1/rpc/berry_claim_reminders'){const jobs=claimed?[]:[{request_id:request,id,email:'recipient@example.invalid',full_name:'Persona <responsable>',reason:'correction',data:{area:'Taller <seguro>',date:'2026-11-16'},code:'IH-2026-001',storage_path:'record/report.xlsx',filename:'Informe.xlsx'}];claimed=true;return Response.json(jobs);}
  if(path.startsWith('/storage/'))return new Response(Buffer.from('504b03040000','hex'));
  if(path==='/rest/v1/rpc/berry_initialize_mail'||path==='/rest/v1/rpc/berry_finish_reminder')return new Response(null,{status:204});
  if(path==='/fictitious'){if(options.mailThrows)throw Error('private provider details');return new Response('Accepted',{status:options.mailStatus||200});}
  throw Error('Unexpected fake route');
 }});
 const server=createServer((req,res)=>void handler(req,res));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
 const send=async(path,input,headers={})=>{const response=await fetch(`http://127.0.0.1:${server.address().port}${path}`,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:typeof input==='string'?input:JSON.stringify(input)});const data=await response.json();assert.ok(!JSON.stringify(data).includes(secret));assert.ok(!JSON.stringify(data).includes('private'));return{status:response.status,data};};
 return{calls,send};
}
const event=()=>({event_id:'delivery-1',request_id:request,recipient:'recipient@example.invalid',state:'delivered',occurred_at:now.toISOString(),provider_id:'provider-id'});
const signed=body=>({'x-berry-timestamp':timestamp,'x-berry-signature':`sha256=${eventSignature(secret,timestamp,body)}`});
test('authenticated delivery event records only the signed normalized recipient and preserves deduplication',async t=>{
 const api=await setup(t,{duplicate:true}),body=JSON.stringify(event()),result=await api.send('/api/mail/events',body,signed(body));
 assert.equal(result.status,200);assert.equal(result.data.duplicate,true);assert.equal(api.calls[0].body.p_state,'delivered');assert.equal(api.calls[0].body.p_email,'recipient@example.invalid');
});
test('unsigned, modified and expired callbacks cannot forge delivery or call the database',async t=>{
 const api=await setup(t),body=JSON.stringify(event());
 assert.equal((await api.send('/api/mail/events',body)).status,401);
 assert.equal((await api.send('/api/mail/events',body+' ',signed(body))).status,401);
 assert.equal((await api.send('/api/mail/events',body,{...signed(body),'x-berry-timestamp':'1000000000'})).status,401);
 assert.equal(api.calls.length,0);
});
test('malformed, oversized and unsupported states cannot become delivery confirmations',async t=>{
 const api=await setup(t);
 for(const value of [{...event(),state:'http_accepted'},{...event(),recipient:'r@example.invalid\r\nBcc:other@example.invalid'},{...event(),occurred_at:'2026-11-19T00:00:00Z'},{...event(),detail:'a'.repeat(9000)}]){
  const body=JSON.stringify(value),result=await api.send('/api/mail/events',body,signed(body));assert.ok([400,413].includes(result.status));
 }
 assert.equal(api.calls.length,0);
});
test('reminders require the cron secret, claim once and use only the assigned recipient with the stored workbook',async t=>{
 const api=await setup(t),input={action:'reminders.run'},headers={Authorization:`Bearer ${cron}`};
 assert.equal((await api.send('/api/reminders/run',input)).status,401);assert.equal(api.calls.length,0);
 const result=await api.send('/api/reminders/run',input,headers);assert.equal(result.status,200);assert.equal(result.data.accepted,1);
 const payload=api.calls.find(c=>c.path==='/fictitious').body;
 assert.deepEqual(payload.destinatarios,{para:['recipient@example.invalid'],cc:[],cco:[]});assert.equal(payload.mode,'reminder');assert.equal(payload.request_id,request);assert.equal(payload.inspection_id,id);assert.ok(payload.cuerpo_html.includes('&lt;seguro&gt;'));assert.equal(payload.adjuntos.length,1);
 await api.send('/api/reminders/run',input,headers);assert.equal(api.calls.filter(c=>c.path==='/fictitious').length,1);
});
test('uncertain reminder submission is recorded without a blind resend and disabled workers send nothing',async t=>{
 const api=await setup(t,{mailThrows:true});const result=await api.send('/api/reminders/run',{action:'reminders.run'},{Authorization:`Bearer ${cron}`});assert.equal(result.data.unconfirmed,1);assert.equal(api.calls.find(c=>c.path==='/rest/v1/rpc/berry_finish_reminder').body.p_state,'unconfirmed');
 const disabled=await setup(t,{env:{REMINDERS_ENABLED:'false'}});assert.equal((await disabled.send('/api/reminders/run',{action:'reminders.run'},{Authorization:`Bearer ${cron}`})).status,503);assert.equal(disabled.calls.length,0);
});
