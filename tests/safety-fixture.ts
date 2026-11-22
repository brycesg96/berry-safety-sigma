import type { BrowserContext, Page } from '@playwright/test';
import type { SafetyDocument } from '../src/safety-documents';
export const safetyActor='dd000000-0000-4000-8000-000000000001';
export const safetyManagement='dd000000-0000-4000-8000-000000000010';
export const safetyArea='dd000000-0000-4000-8000-000000000011';
export const safetyArea2='dd000000-0000-4000-8000-000000000012';
const origin='https://rwacygoxhkxxxkvushmb.supabase.co';
export function safetyRow(patch:Partial<SafetyDocument>={}):SafetyDocument {return {id:'dd000000-0000-4000-8000-000000000020',owner_id:null,owner_name:'Trabajador de Campo',kind:'ATS',title:'Mantenimiento de equipos',document_date:'2026-11-22',workplace:'Fundo',file_name:'ats.pdf',storage_path:'public/fixture/documento.pdf',file_size:100,mime_type:'application/pdf',status:'pending',review_note:'',reviewed_at:null,created_at:'2026-11-22T12:00:00Z',revision:1,management_id:safetyManagement,management_name:'Operaciones',area_id:safetyArea,area_name:'Mantenimiento',submission_source:'guest',...patch};}
export async function mockSafety(context:BrowserContext,admin=false){
 const state={ready:true,uploads:0,submits:0,begins:0,failReceipt:false,failUpload:false,loseUploadReply:false,conflict:false,rows:[] as SafetyDocument[],files:new Map<string,Buffer>(),requests:[] as string[],tickets:new Map<string,{token:string;path:string;values:Record<string,string|number>}>()};
 const profile={id:safetyActor,email:'seguridad@example.invalid',full_name:admin?'Administradora':'Trabajador de Campo',management:'Operaciones',area:'Campo',job_title:'Operario',role:admin?'admin':'inspector',enabled:true,must_change_password:false,can_create_inspections:admin,can_receive_inspections:admin,access_revision:1,yo_seguro_management_id:safetyManagement as string|null,yo_seguro_scope_set:true};
 const user={id:safetyActor,aud:'authenticated',role:'authenticated',email:profile.email,email_confirmed_at:new Date().toISOString(),app_metadata:{provider:'email',providers:['email']},user_metadata:{berry_profile_setup_completed_at:'2026-11-01T12:00:00Z'},identities:[],created_at:new Date().toISOString()};
 const token=`eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({sub:safetyActor,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url')}.fixture`;
 await context.route('**/api/accounts',route=>route.fulfill({json:{ok:true,accounts:[profile]}}));
 await context.route(`${origin}/**`,async route=>{
  const req=route.request(),url=new URL(req.url()),path=decodeURIComponent(url.pathname);state.requests.push(path);
  if(path==='/auth/v1/token')return route.fulfill({json:{access_token:token,token_type:'bearer',expires_in:3600,refresh_token:'fixture',user}});
  if(path==='/auth/v1/user')return route.fulfill({json:user});
  if(path==='/auth/v1/logout')return route.fulfill({status:204});
  if(path.endsWith('/berry_profiles'))return route.fulfill({json:url.searchParams.has('id')?profile:[profile]});
  if(path.endsWith('/berry_schema_status'))return route.fulfill({json:{schema_version:'202611070001',sync_ready:true,reports_version:'202611080003',account_identity_version:'202611150015'}});
  if(path.endsWith('/berry_admin_accounts'))return route.fulfill({json:[profile]});
  if(path.endsWith('/berry_safety_document_status'))return route.fulfill({json:{ready:true,version:'202611220024'}});
  if(path.endsWith('/berry_yo_seguro_account_access'))return route.fulfill({json:{user_id:profile.id,management_id:profile.yo_seguro_management_id}});
  if(path.endsWith('/berry_set_yo_seguro_access')){if(state.conflict)return route.fulfill({status:409,json:{code:'40001'}});const v=req.postDataJSON();profile.yo_seguro_management_id=v.p_management;return route.fulfill({json:profile});}
  if(path.endsWith('/berry_yo_seguro_scope'))return route.fulfill(state.ready?{json:{version:'202611220025',admin,management_id:profile.yo_seguro_management_id,management_name:'Operaciones'}}:{status:404,json:{code:'PGRST202'}});
  if(path.endsWith('/berry_yo_seguro_catalog'))return route.fulfill(state.ready?{json:{version:'202611220025',catalog:[{id:safetyManagement,name:'Operaciones',areas:[{id:safetyArea,name:'Mantenimiento'},{id:safetyArea2,name:'Cosecha'}]},{id:'dd000000-0000-4000-8000-000000000013',name:'Administración',areas:[{id:'dd000000-0000-4000-8000-000000000014',name:'Servicios'}]}]}}:{status:404,json:{code:'PGRST202'}});
  if(path.endsWith('/berry_begin_yo_seguro_upload')){state.begins++;const v=req.postDataJSON();let ticket=state.tickets.get(v.p_id);if(!ticket){ticket={token:v.p_token,path:`public/${v.p_id}/${v.p_token}/documento.pdf`,values:v};state.tickets.set(v.p_id,ticket);}return route.fulfill({json:{id:v.p_id,path:ticket.path,completed:state.rows.some(row=>row.id===v.p_id)}});}
  if(path.endsWith('/berry_finish_yo_seguro_upload')){state.submits++;const v=req.postDataJSON(),ticket=state.tickets.get(v.p_id)!;if(!state.rows.some(row=>row.id===v.p_id)){const value=ticket.values;state.rows.unshift(safetyRow({id:v.p_id,owner_name:String(value.p_worker),kind:value.p_kind as SafetyDocument['kind'],title:String(value.p_title),document_date:String(value.p_date),workplace:String(value.p_workplace),file_name:String(value.p_file_name),storage_path:ticket.path,area_id:String(value.p_area),area_name:value.p_area===safetyArea2?'Cosecha':'Mantenimiento'}));}if(state.failReceipt){state.failReceipt=false;return route.fulfill({status:503,json:{message:'Receipt lost'}});}return route.fulfill({json:{id:v.p_id,received:true}});}
  if(path.endsWith('/berry_safety_documents')){
   const rows=state.rows.filter(row=>(!url.searchParams.has('kind')||`eq.${row.kind}`===url.searchParams.get('kind'))&&(!url.searchParams.has('status')||`eq.${row.status}`===url.searchParams.get('status'))&&(!url.searchParams.has('management_id')||`eq.${row.management_id}`===url.searchParams.get('management_id'))&&(!url.searchParams.has('area_id')||`eq.${row.area_id}`===url.searchParams.get('area_id'))&&(!url.searchParams.has('title')||row.title.toLowerCase().includes(url.searchParams.get('title')!.replace(/^ilike\.%|%$/g,'').toLowerCase())));
   return route.fulfill({json:rows,headers:{'content-range':`0-${rows.length-1}/${rows.length}`}});
  }
  if(path.includes('/storage/v1/object/')){const key=path.split('berry-safety-documents/')[1];if(req.method()==='POST'){state.uploads++;if(state.failUpload)return route.fulfill({status:503,json:{message:'Unavailable'}});if(state.files.has(key))return route.fulfill({status:409,json:{statusCode:'409',error:'Duplicate',message:'Already exists'}});state.files.set(key,req.postDataBuffer()!);if(state.loseUploadReply){state.loseUploadReply=false;return route.fulfill({status:503,json:{message:'Lost upload reply'}});}return route.fulfill({json:{Key:`berry-safety-documents/${key}`}});}return route.fulfill({contentType:'application/pdf',body:Buffer.from('%PDF-1.4\nfixture document\n%%EOF')});}
  if(path.endsWith('/berry_review_safety_document')){if(state.conflict)return route.fulfill({status:409,json:{code:'40001',message:'DOCUMENT_CONFLICT'}});const v=req.postDataJSON(),row=state.rows.find(row=>row.id===v.p_id)!;Object.assign(row,{status:v.p_status,review_note:v.p_note,revision:row.revision+1,reviewed_at:new Date().toISOString()});return route.fulfill({json:row});}
  if(path.endsWith('/berry_archive_safety_document')){state.rows=state.rows.filter(row=>row.id!==req.postDataJSON().p_id);return route.fulfill({status:204});}
  if(path.endsWith('/berry_cloud_session'))return route.fulfill({json:safetyActor});
  if(path.endsWith('/berry_next_registration'))return route.fulfill({json:{code:'IH-2026-001',year:2026,sequence:1}});
  if(path.endsWith('/berry_shared_texts'))return route.fulfill({json:null});
  if(path.endsWith('/berry_inspections')||path.endsWith('/berry_cloud_tombstones'))return route.fulfill({json:[]});
  return route.fulfill({status:404,json:{code:'PGRST202',message:'Unmocked RPC'}});
 });
 return state;
}
export async function enterSafety(page:Page,admin=false){
 await page.goto('./?acceso=cuenta');await page.getByLabel(/^Correo electrónico/).fill('seguridad@example.invalid');await page.getByLabel(/^Contraseña/).fill('Fictitious!47');await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
 if(admin){await page.getByRole('heading',{name:'Mis inspecciones',exact:true}).waitFor();const menu=page.getByRole('button',{name:'Abrir menú',exact:true});if(await menu.isVisible())await menu.click();await page.getByRole('button',{name:'Yo Seguro',exact:true}).click();}
 await page.getByRole('heading',{name:'Yo Seguro',exact:true}).waitFor();
}
