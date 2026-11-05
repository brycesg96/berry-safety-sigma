import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApi } from './index.mjs';
import { reportPayload, REPORT_PATH } from './make-report.mjs';
import { openReportRegistry } from './report-registry.mjs';
const token='report-test-only-'.repeat(4);
const env={BERRY_PROTOTYPE_MODE:'false',MAKE_REPORTS_ENABLED:'true',MAKE_WEBHOOK_URL:'https://hook.us2.make.com/fictitious',MAKE_TEST_API_TOKEN:token,BERRY_ALLOWED_ORIGINS:'https://berry.example',NODE_ENV:'production'};
const body=(id=randomUUID())=>({action:'inspection.send',inspection:{id,date:'2026-11-04',area:'Taller <Armonía>',facility:'Armonía 2',objective:'Verificar seguridad',inspector:{name:'Ana',email:'ana@example.com'},responsibles:[{name:'Persona Uno',email:'UNO@example.com'},{name:'Persona Dos',email:'dos@example.com'},{name:'Duplicado',email:'uno@example.com'}],cc:['jefe@example.com','JEFE@example.com','uno@example.com','gerente@example.com'],observationCount:2},attachment:{contentBase64:readFileSync(new URL('./fixtures/example.xlsx',import.meta.url)).toString('base64')}});
async function api(t,options={}){
 const calls=[],registry=options.reportRegistry || openReportRegistry(':memory:');
 const server=createApi({env,reportRegistry:registry,fetchImpl:async(url,request)=>{calls.push({url,request});return new Response('Accepted');},...options});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(()=>{if(!options.reportRegistry)registry.close();resolve();});}));
 const send=async(input=body(),headers={})=>{const response=await fetch(`http://127.0.0.1:${server.address().port}${REPORT_PATH}`,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://berry.example',Authorization:`Bearer ${token}`,'Idempotency-Key':input.inspection?.id || randomUUID(),...headers},body:JSON.stringify(input)});return{status:response.status,data:await response.json()};};
 return{calls,send};
}
test('informe: Para y CC deduplicados, HTML general escapado y XLSX real adjunto; sin confirmar Outlook',async t=>{
 const {send,calls}=await api(t);const input=body();const result=await send(input);
 assert.equal(result.status,200);assert.equal(result.data.email_requested,true);assert.equal(result.data.outlook_status,'not_confirmed');
 const p=JSON.parse(calls[0].request.body);
 assert.equal(p.mode,'inspection');assert.equal(p.send_email,true);assert.equal(p.codigo_reservado,false);
 assert.deepEqual(p.destinatarios,{para:['uno@example.com','dos@example.com'],cc:['jefe@example.com','gerente@example.com'],cco:[]});
 assert.deepEqual(p.outlook.para,[{address:'uno@example.com',name:'Persona Uno'},{address:'dos@example.com',name:'Persona Dos'}]);
 assert.ok(p.cuerpo_html.includes('Taller &lt;Armonía&gt;'));assert.ok(p.cuerpo_html.includes('Excel adjunto'));
 assert.equal(p.adjuntos[0].contenido_base64,input.attachment.contentBase64);assert.ok(p.adjuntos[0].nombre.endsWith('.xlsx'));
 assert.ok(!JSON.stringify(result.data).includes(env.MAKE_WEBHOOK_URL));assert.equal(calls[0].request.headers.Authorization,undefined);
});
test('informe desactivado o sin clave nunca llama Make; check habilitado solo consulta configuración',async t=>{
 const disabled=await api(t,{env:{...env,MAKE_REPORTS_ENABLED:'false'}});assert.equal((await disabled.send()).status,503);assert.equal(disabled.calls.length,0);
 const active=await api(t);assert.equal((await active.send(body(),{Authorization:'Bearer bad'})).status,401);
 assert.equal((await active.send({action:'inspection.check'})).data.enabled,true);assert.equal(active.calls.length,0);
 assert.equal((await active.send(body(),{Origin:'https://evil.example'})).status,403);
});
test('destinatarios inválidos, adjunto inválido y desajuste de ID no se envían',async t=>{
 const {send,calls}=await api(t);
 const invalid=body();invalid.inspection.responsibles[0].email='victim@example.com\r\nBcc:other@example.com';assert.equal((await send(invalid)).status,400);
 const file=body();file.attachment.contentBase64=Buffer.from('not excel').toString('base64');assert.equal((await send(file)).status,400);
 assert.equal((await send(body(),{'Idempotency-Key':randomUUID()})).status,400);assert.equal(calls.length,0);
 assert.throws(()=>reportPayload({...body(),attachment:{contentBase64:'A'.repeat(12*1024*1024)}}));
});
test('doble clic y cambios posteriores: un POST a Make, primer archivo conservado, datos distintos rechazados',async t=>{
 const {send,calls}=await api(t);const input=body();const [a,b]=await Promise.all([send(input),send(input)]);
 assert.deepEqual(a,b);assert.equal(calls.length,1);
 input.inspection.area='Otra área';assert.equal((await send(input)).status,409);assert.equal(calls.length,1);
});
test('journal en disco evita reenviar después de reiniciar y conserva intentos ambiguos',async t=>{
 const directory=mkdtempSync(join(tmpdir(),'berry-report-'));t.after(()=>rmSync(directory,{recursive:true,force:true}));const path=join(directory,'receipts.sqlite');
 const input=body();const one=openReportRegistry(path);
 const first=await api(t,{reportRegistry:one,fetchImpl:async()=>{throw new Error('timeout with secret provider data');}});
 assert.equal((await first.send(input)).data.receipt,'unconfirmed');one.close();
 const two=openReportRegistry(path);t.after(()=>two.close());const second=await api(t,{reportRegistry:two});
 assert.equal((await second.send(input)).data.receipt,'unconfirmed');assert.equal(second.calls.length,0);
 const orphan=body();two.claim(orphan.inspection.id,reportPayload(orphan).hash);
 assert.equal((await second.send(orphan)).data.receipt,'unconfirmed');assert.equal(second.calls.length,0);
});

test('prototipo global habilita envíos sin clave desde el origen de la app, manteniendo límites y deduplicación',async t=>{
 const defaults={...env};delete defaults.BERRY_PROTOTYPE_MODE;
 const automatic=await api(t,{env:defaults});assert.equal((await automatic.send({action:'inspection.check'},{Authorization:''})).status,200);
 const {send,calls}=await api(t,{env:{...env,BERRY_PROTOTYPE_MODE:'true'}});
 assert.equal((await send({action:'inspection.check'},{Authorization:''})).data.enabled,true);
 const input=body();assert.equal((await send(input,{Authorization:''})).status,200);assert.equal(calls.length,1);
 assert.equal((await send(input,{Authorization:''})).status,200);assert.equal(calls.length,1);
 assert.equal((await send(body(),{Authorization:'',Origin:'https://evil.example'})).status,403);
 assert.equal((await send(body(),{Authorization:'',Origin:''})).status,403);
 for(let i=0;i<4;i++)assert.equal((await send(body(),{Authorization:''})).status,200);
 assert.equal((await send(body(),{Authorization:''})).status,429);
});
