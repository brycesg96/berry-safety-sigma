import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import JSZip from 'jszip';
import { createCloudReportHandler } from './cloud-reports.mjs';

const origin = 'https://berry.example', project = 'https://rwacygoxhkxxxkvushmb.supabase.co';
const secret = 'sb_secret_fictitious_report_key_123456789012345';
const actor = '60000000-0000-4000-8000-000000000001', id = '70000000-0000-4000-8000-000000000001';
const editOperation='71000000-0000-4000-8000-000000000001';
const editInput=()=>({inspectionId:id,operationId:editOperation,contentBase64:source.toString('base64')});
const jwt = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: actor, iat: 100 })).toString('base64url')}.fictitious`;
const source = await readFile(new URL('../public/templates/inspection.xlsx', import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = (data,status=200) => new Response(data===null ? null : JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
const input = () => ({ inspectionId:id, expectedRevision:2, contentBase64:source.toString('base64') });
function stateOf() { return { calls:[], files:new Map(), row:{ id, author_id:actor, workflow:'draft', revision:2, data:{ id, ownerId:actor, date:'2026-11-05', area:'Taller', facility:'Armonía', objective:'Inspeccionar', unfavorableCause:'No aplica', closingRemarks:'Dar seguimiento', inspector:'Ana Inspectora', inspectorEmail:'ana@example.com', additionalInspectors:[], responsibles:[{name:'Responsable',email:'responsable@example.com'}], emailCc:['jefe@example.com'], observations:[{id:'observation'}] } }, job:'queued', document:null, sourceHash:null, uploadFails:false, authValid:true, access:true, yearChanged:false, mailStatus:200, mailThrows:false, finishThrows:false, cleanup:[], deleteFails:false, deleteThrowsAfterRemove:false }; }
async function setup(t, state=stateOf(), extraEnv={}) {
  const env={ NODE_ENV:'production', BERRY_PROTOTYPE_MODE:'true', BERRY_ALLOWED_ORIGINS:origin, SUPABASE_URL:project, SUPABASE_SECRET_KEY:secret, MAKE_REPORTS_ENABLED:'true', MAKE_WEBHOOK_URL:'https://hook.us2.make.com/fictitious', MAKE_TEST_API_TOKEN:'fictitious-token-32-characters-long', ...extraEnv };
  const handler=createCloudReportHandler({env,fetchImpl:async(address,options)=>{
    const url=new URL(address), path=decodeURIComponent(url.pathname);
    const body=typeof options.body==='string' ? JSON.parse(options.body) : options.body;
    state.calls.push({path,body,headers:options.headers,method:options.method});
    if(url.hostname==='hook.us2.make.com') { if(state.mailThrows) throw new Error('private timeout'); return json({},state.mailStatus); }
    assert.equal(url.origin,project); assert.equal(options.headers.apikey,secret);
    if(path==='/auth/v1/user') { assert.equal(options.headers.Authorization,`Bearer ${jwt}`); return state.authValid ? json({id:actor}) : json({message:'private auth detail'},401); }
    if(path==='/rest/v1/rpc/berry_prepare_report') {
      assert.equal(options.headers.Authorization,`Bearer ${jwt}`);
      if(!state.access) return json({code:'42501',message:'private access detail'},403);
      if(state.row.code) {
        if(body.p_hash && body.p_hash!==state.sourceHash) return json({code:'23505',message:'different bytes'},409);
        return json({registered:true,inspection:state.row,document:state.document});
      }
      return json({registered:false,lease:{operation_id:'operation',code:state.yearChanged?'IH-2026-001':'IH-2027-001'},inspection:state.row});
    }
    if(path==='/rest/v1/rpc/berry_prepare_final') {
      assert.equal(options.headers.Authorization,`Bearer ${jwt}`);
      if(!state.access||state.row.workflow!=='closed')return json({code:'42501'},403);
      return json({complete:state.document.is_final===true,inspection:state.row,document:state.document});
    }
    assert.equal(options.headers.Authorization,`Bearer ${secret}`);
    if(path==='/storage/v1/object/berry-documents'&&options.method==='DELETE') {
      if(state.deleteFails)return json({},503);
      for(const file of body.prefixes)state.files.delete('/storage/v1/object/berry-documents/'+file);
      if(state.deleteThrowsAfterRemove)throw new Error('response lost after deletion');
      return json(body.prefixes.map(name=>({name})));
    }
    if(path==='/rest/v1/rpc/berry_admin_edit_upload') {
      assert.equal(body.p_actor,actor);assert.equal(body.p_iat,100);assert.equal(body.p_operation,editOperation);
      if(state.editFailure)return json({code:state.editFailure,message:state.editFailureMessage},state.editFailure==='42501'?403:409);
      const row=state.editState==='prepared'?{...state.row,data:state.editData}:state.row;
      return json({state:state.editState,inspection:row,document:state.document});
    }
    if(path==='/rest/v1/rpc/berry_commit_admin_edit') {
      assert.equal(body.p_actor,actor);assert.equal(body.p_iat,100);
      assert.ok(state.files.has('/storage/v1/object/berry-documents/'+body.p_document.storage_path));
      state.cleanup.push(state.document.storage_path);state.document={...body.p_document};
      state.row={...state.row,data:state.editData,revision:state.row.revision+1,active_edit_operation:editOperation};state.editState='committed';
      if(state.editCommitLost){state.editCommitLost=false;throw new Error('lost commit response');}
      return json({inspection:state.row,document:state.document});
    }
    if(path==='/rest/v1/rpc/berry_admin_edit_cleanup')return json(state.cleanup);
    if(path==='/rest/v1/rpc/berry_finish_admin_edit') {
      assert.ok(state.cleanup.every(path=>!state.files.has('/storage/v1/object/berry-documents/'+path)));
      state.cleanup=[];state.row.active_edit_operation=null;state.editState='complete';state.row.revision++;
      return json(state.row);
    }
    if(path==='/rest/v1/rpc/berry_commit_final') {
      assert.equal(body.p_actor,actor);assert.equal(body.p_actor_iat,100);
      state.cleanup.push(state.document.storage_path);state.document={...body.p_document,is_final:true};state.row.revision++;
      return json({inspection:state.row,document:state.document});
    }
    if(path==='/rest/v1/rpc/berry_final_cleanup')return json(state.cleanup);
    if(path==='/rest/v1/rpc/berry_finish_final') {
      state.cleanup=state.cleanup.filter(path=>!body.p_removed.includes(path));
      assert.equal(state.cleanup.length,0);
      if(!state.row.final_excel_stored){state.row.final_excel_stored=true;state.row.revision++;}
      return json(state.row);
    }
    if(path.startsWith('/storage/v1/object/berry-documents/')) {
      if(state.uploadFails) return json({message:'private storage error'},503);
      if(!/^[\x20-\x7e]+$/.test(path)) return json({error:'InvalidKey'},400);
      assert.equal(options.headers['x-upsert'],'false');
      if(state.files.has(path)) return json({error:'Duplicate',statusCode:'409'},400);
      state.files.set(path,Buffer.from(body)); return json({Key:path});
    }
    if(path.startsWith('/storage/v1/object/authenticated/berry-documents/')) {
      const file=state.files.get(path.replace('/authenticated/','/'));
      return file ? new Response(file) : json({},404);
    }
    if(path==='/rest/v1/rpc/berry_commit_report') {
      assert.equal(body.p_actor,actor); assert.equal(body.p_actor_iat,100);
      if(state.yearChanged) { state.yearChanged=false; return json({code:'40001',message:'YEAR_CHANGED'},409); }
      state.document=body.p_document; state.sourceHash=hash(source);
      state.row={...state.row,code:'IH-2027-001',workflow:'sent',revision:3,data:{...state.row.data,delivery:{recipientIds:['recipient'],corrections:{}},emailDelivery:{state:'pending'}}};
      return json({inspection:state.row,document:state.document});
    }
    if(path==='/rest/v1/rpc/berry_cancel_report') return json(null);
    if(path==='/rest/v1/rpc/berry_claim_report_mail') { const dispatch=state.job==='queued'; if(dispatch) state.job='dispatching'; return json({dispatch,state:state.job}); }
    if(path==='/rest/v1/rpc/berry_finish_report_mail') {
      if(state.finishThrows) throw new Error('lost finish response');
      state.job=body.p_result.state; state.row.data.emailDelivery=body.p_result; return json(state.row);
    }
    throw new Error('Unexpected mock path '+path);
  }});
  const server=createServer((req,res)=>void handler(req,res));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  const send=async(body=input(),headers={},path='/api/reports/send')=>{
    const response=await fetch(`http://127.0.0.1:${server.address().port}${path}`,{method:'POST',headers:{Origin:origin,Authorization:`Bearer ${jwt}`,'Content-Type':'application/json','Idempotency-Key':id,...headers},body:JSON.stringify(body)});
    const data=await response.json(); assert.ok(!JSON.stringify(data).includes(secret)); assert.ok(!JSON.stringify(data).includes('private'));
    return {status:response.status,data};
  };
  return {state,send,revise:(body=editInput(),headers={})=>send(body,{'Idempotency-Key':editOperation,...headers},'/api/reports/revise'),finalize:(body=input(),headers={})=>send(body,headers,'/api/reports/finalize')};
}
test('cloud archive keeps the inspection month and sends exactly the stored, valid Excel with its committed code',async t=>{
  const api=await setup(t), result=await api.send(); assert.equal(result.status,200);
  const doc=result.data.document; assert.match(doc.storage_path,/^2026\/11-NOVIEMBRE\//);
  const file=api.state.files.get('/storage/v1/object/berry-documents/'+doc.storage_path);
  assert.equal(hash(file),doc.sha256);
  const zip=await JSZip.loadAsync(file,{checkCRC32:true}); assert.match(await zip.file('xl/worksheets/sheet1.xml').async('string'),/IH-2027-001/);
  const mail=api.state.calls.find(call=>call.path==='/fictitious').body;
  assert.deepEqual(Buffer.from(mail.adjuntos[0].contenido_base64,'base64'),file);
  assert.equal(mail.adjuntos[0].nombre,'REG_INS_TALLER_05.11.2026.xlsx');
  assert.equal(mail.numero,'IH-2027-001'); assert.equal(mail.codigo_reservado,true);
  assert.match(mail.cuerpo_html,/Compañero SIGMA/); assert.equal(result.data.inspection.data.emailDelivery.state,'accepted');
});
test('accented area stores an ASCII object key and retains the original name in both initial email and final workbook',async t=>{
  const state=stateOf(); state.row.data.area='Maquinaria - Armonía 2';
  const api=await setup(t,state), initial=await api.send(); assert.equal(initial.status,200);
  assert.match(initial.data.document.storage_path,/REG_INS_MAQUINARIA - ARMONIA 2_05.11.2026.xlsx$/);
  assert.equal(initial.data.document.filename,'REG_INS_MAQUINARIA - ARMONÍA 2_05.11.2026.xlsx');
  const mail=state.calls.find(c=>c.path==='/fictitious').body;
  assert.equal(mail.adjuntos[0].nombre,initial.data.document.filename);
  assert.deepEqual(Buffer.from(mail.adjuntos[0].contenido_base64,'base64'),state.files.values().next().value);
  state.row.workflow='closed'; const final=await api.finalize(await finalInput()); assert.equal(final.status,200);
  assert.equal(final.data.document.filename,initial.data.document.filename); assert.match(final.data.document.storage_path,/ARMONIA 2/);
  assert.equal(state.files.size,1); assert.equal(state.calls.filter(c=>c.path==='/fictitious').length,1);
});
test('retries and a restarted API retain the original document and cannot send a second email or register different bytes',async t=>{
  const api=await setup(t); await api.send();
  const again=await setup(t,api.state); assert.equal((await again.send({inspectionId:id})).status,200);
  assert.equal(api.state.calls.filter(c=>c.path==='/rest/v1/rpc/berry_commit_report').length,1);
  assert.equal(api.state.calls.filter(c=>c.path==='/fictitious').length,1);
  assert.equal((await again.send({...input(),contentBase64:Buffer.from('different').toString('base64')})).status,409);
});
test('authentication, readiness and configuration reject requests before upload, commit or mail, even in prototype mode',async t=>{
  const api=await setup(t);
  assert.equal((await api.send(input(),{Authorization:''})).status,401);
  assert.equal((await api.send(input(),{Origin:'https://other.example'})).status,403);
  api.state.authValid=false; assert.equal((await api.send()).status,401);
  api.state.authValid=true; api.state.access=false; assert.equal((await api.send()).status,403);
  assert.ok(!api.state.calls.some(c=>c.path.includes('/storage/')||c.path==='/fictitious'));
  const disabled=await setup(t,stateOf(),{MAKE_REPORTS_ENABLED:'false'}); assert.equal((await disabled.send()).status,503); assert.equal(disabled.state.calls.length,0);
  assert.equal((await api.send({...input(),actor_id:actor})).status,400);
});
test('upload or Excel failure releases the reservation and never commits a code or calls mail',async t=>{
  const api=await setup(t); api.state.uploadFails=true;
  assert.equal((await api.send()).status,503);
  assert.ok(api.state.calls.some(c=>c.path==='/rest/v1/rpc/berry_cancel_report'));
  assert.ok(!api.state.calls.some(c=>c.path==='/rest/v1/rpc/berry_commit_report'||c.path==='/fictitious'));
  api.state.uploadFails=false;
  assert.equal((await api.send({...input(),contentBase64:Buffer.from('not Excel').toString('base64')})).status,400);
  assert.equal(api.state.row.workflow,'draft');
});
test('a year change regenerates the Excel with the new candidate, and only its committed version reaches mail',async t=>{
  const state=stateOf(); state.yearChanged=true; const api=await setup(t,state);
  assert.equal((await api.send()).status,200);
  assert.equal(state.calls.filter(c=>c.path==='/rest/v1/rpc/berry_commit_report').length,2);
  assert.equal(state.calls.filter(c=>c.path==='/fictitious').length,1);
  assert.equal(state.calls.find(c=>c.path==='/fictitious').body.numero,'IH-2027-001');
});
test('rejected, timed-out or ambiguously completed mail stays archived without automatic duplicate delivery',async t=>{
  for(const change of [{mailStatus:500},{mailThrows:true},{finishThrows:true}]) {
    const state=Object.assign(stateOf(),change),api=await setup(t,state);
    const first=await api.send(); assert.equal(first.status,change.finishThrows?503:200);
    assert.ok(state.row.code); assert.ok(state.document);
    state.finishThrows=false;
    const restarted=await setup(t,state); assert.equal((await restarted.send({inspectionId:id})).status,200);
    assert.equal(state.calls.filter(c=>c.path==='/fictitious').length,1);
  }
});
async function finalInput() {
  const zip=await JSZip.loadAsync(source),sheet=zip.file('xl/worksheets/sheet1.xml');
  zip.file(sheet.name,(await sheet.async('string')).replace('</sheetData>','<row r="2000"><c r="B2000" t="inlineStr"><is><t>Acción realizada final</t></is></c></row></sheetData>'));
  return {...input(),contentBase64:(await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'})).toString('base64')};
}
test('complete closure replaces the stored Excel, deletes its initial bytes and never requests another email or code',async t=>{
  const api=await setup(t);await api.send();const original=api.state.document.storage_path;
  assert.equal((await api.finalize()).status,403);api.state.row.workflow='closed';
  const result=await api.finalize(await finalInput());assert.equal(result.status,200);assert.equal(result.data.inspection.final_excel_stored,true);
  assert.equal(api.state.files.size,1);assert.equal(api.state.files.has('/storage/v1/object/berry-documents/'+original),false);
  const bytes=api.state.files.get('/storage/v1/object/berry-documents/'+result.data.document.storage_path);
  const zip=await JSZip.loadAsync(bytes,{checkCRC32:true});const sheet=await zip.file('xl/worksheets/sheet1.xml').async('string');assert.match(sheet,/Acción realizada final/);assert.match(sheet,/IH-2027-001/);
  assert.equal(api.state.calls.filter(c=>c.path==='/fictitious').length,1);assert.equal(api.state.calls.filter(c=>c.path==='/rest/v1/rpc/berry_commit_report').length,1);
  assert.equal((await api.finalize({inspectionId:id})).status,200);assert.equal(api.state.calls.filter(c=>c.path==='/rest/v1/rpc/berry_commit_final').length,1);
});
test('failed final upload preserves the initial workbook; interrupted cleanup resumes after restart without another upload',async t=>{
  const api=await setup(t);await api.send();api.state.row.workflow='closed';const original=api.state.document.storage_path;
  api.state.uploadFails=true;assert.equal((await api.finalize(await finalInput())).status,503);assert.equal(api.state.document.storage_path,original);assert.equal(api.state.files.size,1);
  api.state.uploadFails=false;api.state.deleteFails=true;assert.equal((await api.finalize(await finalInput())).status,503);assert.equal(api.state.files.size,2);assert.equal(api.state.document.is_final,true);assert.ok(!api.state.row.final_excel_stored);
  api.state.deleteFails=false;api.state.deleteThrowsAfterRemove=true;
  const restarted=await setup(t,api.state,{MAKE_REPORTS_ENABLED:'false'});assert.equal((await restarted.finalize({inspectionId:id})).status,503);assert.equal(api.state.files.size,1);
  api.state.deleteThrowsAfterRemove=false;assert.equal((await restarted.finalize({inspectionId:id})).status,200);assert.equal(api.state.files.size,1);assert.equal(api.state.calls.filter(c=>c.path==='/rest/v1/rpc/berry_commit_final').length,1);
});
test('final storage accepts workbooks larger than the email limit without overflowing base64 validation',async t=>{
  const api=await setup(t);await api.send();api.state.row.workflow='closed';
  const zip=await JSZip.loadAsync(source);zip.file('xl/media/large.bin',randomBytes(4*1024*1024));
  const inputFile={...input(),contentBase64:(await zip.generateAsync({type:'nodebuffer',compression:'STORE'})).toString('base64')};
  assert.equal((await api.send(inputFile)).status,400);
  assert.equal((await api.finalize(inputFile)).status,200);assert.equal(api.state.files.size,1);
});

async function registeredEdit(t, options={}) {
 const state=stateOf(),api=await setup(t,state);await api.send();
 state.editState='prepared';state.editData={...state.row.data,area:'Fundo – Armonía II – Taller corregido',date:'2026-12-03',objective:'Objetivo corregido'};
 return {state,api:await setup(t,state,options)};
}
test('administrator edit replaces the workbook in the inspection month with the same code, without registration or another email',async t=>{
 const {state,api}=await registeredEdit(t,{MAKE_REPORTS_ENABLED:'false'}),mailCount=state.calls.filter(c=>c.path==='/fictitious').length;
 const before=state.row,oldPath=state.document.storage_path,result=await api.revise();assert.equal(result.status,200);
 assert.equal(result.data.inspection.code,before.code);assert.equal(result.data.inspection.author_id,before.author_id);
 assert.equal(result.data.inspection.data.area,state.editData.area);assert.equal(state.files.size,1);assert.ok(!state.files.has('/storage/v1/object/berry-documents/'+oldPath));
 assert.match(state.document.storage_path,/^2026\/12-DICIEMBRE\//);assert.match(state.document.storage_path,/ARMONIA II/);assert.match(state.document.filename,/ARMONÍA II/);
 const bytes=[...state.files.values()][0],zip=await JSZip.loadAsync(bytes,{checkCRC32:true});assert.match(await zip.file('xl/worksheets/sheet1.xml').async('string'),/IH-2027-001/);
 assert.equal(state.calls.filter(c=>c.path==='/rest/v1/rpc/berry_commit_report').length,1);assert.equal(state.calls.filter(c=>c.path==='/fictitious').length,mailCount);
 const calls=state.calls.length;assert.equal((await api.revise({inspectionId:id,operationId:editOperation})).status,200);
 assert.ok(!state.calls.slice(calls).some(c=>c.path.includes('cleanup')||c.path.includes('/storage/')));
});
test('upload failure leaves the original active; commit response loss and cleanup failure recover after restarting without reupload',async t=>{
 const {state,api}=await registeredEdit(t),before=structuredClone(state.row),old=structuredClone(state.document);
 state.uploadFails=true;assert.equal((await api.revise()).status,503);assert.deepEqual(state.row,before);assert.deepEqual(state.document,old);
 state.uploadFails=false;state.editCommitLost=true;assert.equal((await api.revise()).status,503);assert.equal(state.editState,'committed');
 const uploads=state.calls.filter(c=>c.method==='POST'&&c.path.startsWith('/storage/')).length;
 state.deleteFails=true;const again=await setup(t,state);assert.equal((await again.revise({inspectionId:id,operationId:editOperation})).status,503);assert.equal(state.editState,'committed');
 state.deleteFails=false;const restarted=await setup(t,state);assert.equal((await restarted.revise({inspectionId:id,operationId:editOperation})).status,200);
 assert.equal(state.files.size,1);assert.equal(state.calls.filter(c=>c.method==='POST'&&c.path.startsWith('/storage/')).length,uploads);
 assert.equal(state.calls.filter(c=>c.path==='/fictitious').length,1);
});
test('edit rejects wrong inspection, role, closed or stale report and expired operation before any file change',async t=>{
 const {state,api}=await registeredEdit(t);const files=state.files.size;
 for(const [code,message,status] of [['42501','REPORT_NOT_EDITABLE',403],['40001','REVISION_CONFLICT',409],['40001','EDIT_EXPIRED',409]]) {
  state.editFailure=code;state.editFailureMessage=message;assert.equal((await api.revise()).status,status);assert.equal(state.files.size,files);
 }
 state.editFailure=null;
 assert.equal((await api.revise({...editInput(),inspectionId:actor})).status,400);
 for(const patch of [{operationId:'bad'},{actor_id:actor},{expectedRevision:2}])assert.equal((await api.revise({...editInput(),...patch})).status,400);
 assert.equal((await api.revise(editInput(),{'Idempotency-Key':id})).status,400);
});
