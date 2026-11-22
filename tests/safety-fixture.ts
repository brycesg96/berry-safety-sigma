import type { BrowserContext, Page } from '@playwright/test';
import type { SafetyDocument } from '../src/safety-documents';

export const safetyActor='dd000000-0000-4000-8000-000000000001';
const origin='https://rwacygoxhkxxxkvushmb.supabase.co';
export async function mockSafety(context:BrowserContext,admin=false){
 const state={ready:true,uploads:0,submits:0,failReceipt:false,failUpload:false,conflict:false,rows:[] as SafetyDocument[],files:new Map<string,Buffer>(),requests:[] as string[]};
 const profile={id:safetyActor,email:'seguridad@example.invalid',full_name:admin?'Administradora':'Trabajador de Campo',management:'Operaciones',area:'Campo',job_title:'Operario',role:admin?'admin':'inspector',enabled:true,must_change_password:false,can_create_inspections:admin,can_receive_inspections:admin,access_revision:1};
 const user={id:safetyActor,aud:'authenticated',role:'authenticated',email:profile.email,email_confirmed_at:new Date().toISOString(),app_metadata:{provider:'email',providers:['email']},user_metadata:{berry_profile_setup_completed_at:'2026-11-01T12:00:00Z'},identities:[],created_at:new Date().toISOString()};
 const token=`eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({sub:safetyActor,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url')}.fixture`;
 await context.route(`${origin}/**`,async route=>{
  const req=route.request(),url=new URL(req.url()),path=decodeURIComponent(url.pathname);state.requests.push(path);
  if(path==='/auth/v1/token')return route.fulfill({json:{access_token:token,token_type:'bearer',expires_in:3600,refresh_token:'fixture',user}});
  if(path==='/auth/v1/user')return route.fulfill({json:user});
  if(path==='/auth/v1/logout')return route.fulfill({status:204});
  if(path.endsWith('/berry_profiles'))return route.fulfill({json:url.searchParams.has('id')?profile:[profile]});
  if(path.endsWith('/berry_schema_status'))return route.fulfill({json:{schema_version:'202611070001',sync_ready:true,reports_version:'202611080003',account_identity_version:'202611150015'}});
  if(path.endsWith('/berry_admin_accounts'))return route.fulfill({json:[profile]});
  if(path.endsWith('/berry_safety_document_status'))return route.fulfill(state.ready?{json:{ready:true,version:'202611220024'}}:{status:404,json:{code:'PGRST202'}});
  if(path.endsWith('/berry_safety_documents')){
   const rows=state.rows.filter(row=>(!url.searchParams.has('kind')||`eq.${row.kind}`===url.searchParams.get('kind'))&&(!url.searchParams.has('status')||`eq.${row.status}`===url.searchParams.get('status')));
   return route.fulfill({json:rows,headers:{'content-range':`0-${rows.length-1}/${rows.length}`}});
  }
  if(path.includes('/storage/v1/object/')){
   const key=path.split('berry-safety-documents/')[1];
   if(req.method()==='POST'){state.uploads++;if(state.failUpload)return route.fulfill({status:503,json:{message:'Unavailable'}});state.files.set(key,req.postDataBuffer()!);return route.fulfill({json:{Key:`berry-safety-documents/${key}`}});}
   return route.fulfill({contentType:'application/pdf',body:Buffer.from('%PDF-1.4\nfixture document\n%%EOF')});
  }
  if(path.endsWith('/berry_submit_safety_document')){
   state.submits++;const v=req.postDataJSON();let row=state.rows.find(row=>row.id===v.p_id);
   if(!row){row={id:v.p_id,owner_id:safetyActor,owner_name:profile.full_name,kind:v.p_kind,title:v.p_title,document_date:v.p_date,workplace:v.p_workplace,file_name:v.p_file_name,storage_path:`${safetyActor}/${v.p_id}/documento.pdf`,file_size:32,mime_type:v.p_mime,status:'pending',review_note:'',reviewed_at:null,created_at:new Date().toISOString(),revision:1};state.rows.unshift(row);}
   if(state.failReceipt){state.failReceipt=false;return route.fulfill({status:503,json:{message:'Receipt lost'}});}
   return route.fulfill({json:row});
  }
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
 if(admin){await page.getByRole('heading',{name:'Mis inspecciones',exact:true}).waitFor();const menu=page.getByRole('button',{name:'Abrir menú',exact:true});if(await menu.isVisible())await menu.click();await page.getByRole('button',{name:'Documentos de seguridad',exact:true}).click();}
 await page.getByRole('heading',{name:'Documentos de seguridad',exact:true}).waitFor();
}
