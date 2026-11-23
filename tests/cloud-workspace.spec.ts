import { openWorkspaceProfile } from './workspace-profile-fixture';
import { selectSecondResponsible } from './responsible-fixture';
import { selectValue } from './select-fixture';
import { selectLocation } from './location-fixture';
import { mockOrganizationCatalog } from './organization-fixture';
import { test, expect } from './test-fixture';
import type { BrowserContext, Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import JSZip from 'jszip';
import { registeredExcel } from '../server/xlsx-registration.mjs';

const project='https://rwacygoxhkxxxkvushmb.supabase.co';
const author='31000000-0000-4000-8000-000000000001',recipient='31000000-0000-4000-8000-000000000002';
const profiles=[{id:author,email:'ana@example.com',full_name:'Ana Inspectora',area:'SIGMA',job_title:'Supervisora',role:'admin',enabled:true,must_change_password:false,supervisor_emails:[],can_create_inspections:true,can_receive_inspections:true},{id:recipient,email:'bruno@example.com',full_name:'Bruno Responsable',area:'Mantenimiento',job_title:'Jefe',role:'inspector',enabled:true,must_change_password:false,supervisor_emails:['jefe@example.com'],can_create_inspections:true,can_receive_inspections:true}];
const png={name:'evidencia.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64')};
type Row={id:string;author_id:string;workflow:string;revision:number;updated_at:string;deleted_at?:string|null;code?:string;data:any;final_excel_stored?:boolean};
const stateOf=()=>({rows:new Map<string,Row>(),files:new Map<string,Buffer>(),documents:new Map<string,any>(),sends:0,saves:0,paths:[] as string[],retired:new Set<string>(),failSave:false,failFinal:false,schemaFails:false,profileFails:false,finalizes:0,nextSequence:null as number|null,previewCalls:0,previewFails:false,profileSaveFails:false,profileSetupFails:false,profileMetadataUpdates:[] as Record<string,unknown>[]});
type State=ReturnType<typeof stateOf>;
async function mock(context:BrowserContext,state:State,actor:string,overrides:Partial<typeof profiles[number]> & {management?:string}={},metadata:Record<string,unknown>={}) {
  const profile={...profiles.find(p=>p.id===actor)!,...overrides};
  const user={id:actor,aud:'authenticated',role:'authenticated',email:profile.email,email_confirmed_at:new Date().toISOString(),app_metadata:{provider:'email',providers:['email']},user_metadata:metadata,identities:[],created_at:new Date().toISOString()};
  const token=`eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({sub:actor,iat:100,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url')}.fictitious`;
  const canRead=(row:Row)=>row.author_id===actor||row.workflow!=='draft'&&row.data.delivery?.recipientIds.includes(actor);
  await context.route(`${project}/**`,async route=>{
    const req=route.request(),url=new URL(req.url()),path=decodeURIComponent(url.pathname);state.paths.push(path);
    if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'}});
    expect(req.headers().apikey).toMatch(/^sb_publishable_/);
    if(path==='/auth/v1/token')return route.fulfill({json:{access_token:token,token_type:'bearer',expires_in:3600,refresh_token:'fictitious-refresh',user}});
    if(path==='/auth/v1/user'){if(req.method()==='PUT'){if(state.profileSetupFails)return route.fulfill({status:503,json:{message:'offline'}});const values=req.postDataJSON().data;state.profileMetadataUpdates.push(values);Object.assign(metadata,values);}return route.fulfill({json:user});}
    if(path==='/auth/v1/logout')return route.fulfill({status:204});
    if(path==='/rest/v1/rpc/berry_next_registration') { expect(req.headers().authorization).toBe(`Bearer ${token}`);state.previewCalls++;if(state.previewFails)return route.fulfill({status:503,json:{message:'offline'}});const sequence=state.nextSequence??state.sends+1;return route.fulfill({json:{code:`IH-2026-${String(sequence).padStart(3,'0')}`,year:2026,sequence,checked_at:'2026-11-09T12:00:00Z'}}); }
    if(path==='/rest/v1/rpc/berry_schema_status')return route.fulfill({status:state.schemaFails?503:200,json:state.schemaFails?{message:'offline'}:{schema_version:'202611070001',stage:'reports',sync_ready:true,reports_version:'202611080003'}});
    expect(req.headers().authorization).toBe(`Bearer ${token}`);
    if(path==='/rest/v1/berry_profiles'&&req.method()==='PATCH'){if(state.profileSaveFails)return route.fulfill({status:503,json:{message:'offline'}});const data=req.postDataJSON();expect(Object.keys(data).sort()).toEqual(['area','full_name','job_title',...(profile.management!==undefined?['management']:[])]);Object.assign(profile,data);}
    if(path==='/rest/v1/berry_profiles')return route.fulfill({status:state.profileFails?503:200,json:state.profileFails?{code:'PGRST002',message:'Service unavailable'}:url.searchParams.has('id')?profile:profiles.map(p=>p.id===actor?profile:p)});
    if(path==='/rest/v1/berry_shared_texts')return route.fulfill({json:null});
    if(path==='/rest/v1/rpc/berry_cloud_tombstones')return route.fulfill({json:req.postDataJSON().p_ids.filter((id:string)=>state.retired.has(id))});
    if(path==='/rest/v1/rpc/berry_cloud_session')return route.fulfill({json:actor});
    if(path==='/rest/v1/berry_inspections'){
      const id=url.searchParams.get('id')?.slice(3);
      if(!id)expect(url.searchParams.get('or')).toBe(`(author_id.eq.${actor},data->delivery->recipientIds.cs.${JSON.stringify([actor])})`);
      const rows=[...state.rows.values()].filter(r=>canRead(r)&&!r.deleted_at);
      return route.fulfill({json:id?rows.find(r=>r.id===id):rows});
    }
    if(path==='/rest/v1/berry_documents')return route.fulfill({json:state.documents.get(url.searchParams.get('inspection_id')!.slice(3))});
    if(path==='/rest/v1/rpc/berry_ensure_draft'){
      if(state.failSave)return route.fulfill({status:503,json:{message:'offline'}});
      const {p_id}=req.postDataJSON();let row=state.rows.get(p_id);
      if(!row){row={id:p_id,author_id:actor,workflow:'draft',revision:1,final_excel_stored:false,updated_at:new Date().toISOString(),data:{partial:true}};state.rows.set(p_id,row);}
      expect(row.author_id).toBe(actor);expect(row.workflow).toBe('draft');return route.fulfill({json:row});
    }
    if(path==='/rest/v1/rpc/berry_save_draft'){
      const {p_id,p_expected,p_data}=req.postDataJSON(),row=state.rows.get(p_id)!;
      if(state.failSave)return route.fulfill({status:503,json:{message:'offline'}});
      const clean={...p_data};for(const key of ['storage','cloudRevision','updatedAt','serverRegistration','delivery','emailDelivery','emailCc'])delete clean[key];
      if(isDeepStrictEqual(row.data,clean))return route.fulfill({json:row});
      if(row.revision!==p_expected)return route.fulfill({status:409,json:{code:'40001',message:'REVISION_CONFLICT'}});
      expect(p_data.ownerId).toBe(actor);expect(JSON.stringify(p_data)).not.toContain('data:image/');
      state.saves++; row.data=clean;row.revision++;row.updated_at=new Date().toISOString();return route.fulfill({json:row});
    }
    if(path==='/rest/v1/rpc/berry_remove_draft'){
      const {p_id}=req.postDataJSON(),row=state.rows.get(p_id)!;row.deleted_at=new Date().toISOString();row.revision++;return route.fulfill({json:row.revision});
    }
    if(path==='/rest/v1/rpc/berry_change_correction'){
      const {p_id,p_observation,p_expected,p_action,p_value}=req.postDataJSON(),row=state.rows.get(p_id)!;
      if(row.revision!==p_expected)return route.fulfill({status:409,json:{code:'40001',message:'REVISION_CONFLICT'}});
      const previous=row.data.delivery.corrections[p_observation]||{photos:[],responsibleName:'Bruno Responsable',action:'',date:'2026-11-20',decision:'draft',state:'Pendiente'};
      let correction={...previous,...p_value};
      if(p_action==='save'||p_action==='submit'){expect(actor).toBe(recipient);correction.actorId=actor;correction.decision=p_action==='submit'?'review':'draft';}
      if(p_action==='approve'||p_action==='changes'){expect(actor).toBe(author);correction.state=p_action==='approve'?'Ejecutado':'Pendiente';correction.decision=p_action==='approve'?'approved':'changes';}
      row.data.delivery.corrections[p_observation]=correction;row.revision++;
      if(Object.values(row.data.delivery.corrections).every((c:any)=>c.decision==='approved'&&c.state==='Ejecutado'))row.workflow='closed';
      return route.fulfill({json:row});
    }
    if(path.startsWith('/storage/v1/object/berry-evidence/')&&req.method()==='POST'){
      const form=await new Response(new Uint8Array(req.postDataBuffer()!),{headers:{'Content-Type':req.headers()['content-type']}}).formData();
      const file=form.get('') as File;const key=path.slice('/storage/v1/object/'.length);
      state.files.set(key,Buffer.from(await file.arrayBuffer()));return route.fulfill({json:{Key:key}});
    }
    if(path.startsWith('/storage/v1/object/')&&req.method()==='GET'){
      const key=path.replace('/storage/v1/object/','').replace(/^authenticated\//,''),bytes=state.files.get(key);expect(bytes).toBeTruthy();
      return route.fulfill({body:bytes!,contentType:key.startsWith('berry-evidence/')?'image/jpeg':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    }
    throw new Error(`Unexpected cloud operation ${req.method()} ${path}`);
  });
  // This mock records the API request; no Make/Outlook service is contacted.
  await context.route('**/api/reports/finalize',async route=>{
    const req=route.request(),input=req.postDataJSON(),row=state.rows.get(input.inspectionId)!;
    expect(req.headers().authorization).toBe(`Bearer ${token}`);expect(row.workflow).toBe('closed');
    if(state.failFinal)return route.fulfill({status:503,json:{ok:false,message:'No se pudo guardar el Excel final. Vuelve a intentarlo.'}});
    let document=state.documents.get(row.id);
    if(!document.is_final){
      const bytes=registeredExcel(Buffer.from(input.contentBase64,'base64'),row.code!),hash=createHash('sha256').update(bytes).digest('hex');
      const storage_path=document.storage_path.replace(document.sha256,hash);
      state.files.set('berry-documents/'+storage_path,bytes);state.files.delete('berry-documents/'+document.storage_path);
      document={...document,storage_path,sha256:hash,is_final:true};state.documents.set(row.id,document);row.revision++;state.finalizes++;
    }
    row.final_excel_stored=true;return route.fulfill({json:{ok:true,inspection:row,document}});
  });
  await context.route('**/api/reports/send',async route=>{
    const req=route.request(),input=req.postDataJSON(),row=state.rows.get(input.inspectionId)!;
    expect(req.headers().authorization).toBe(`Bearer ${token}`);expect(row.author_id).toBe(actor);expect(input.expectedRevision).toBe(row.revision);
    const sequence=state.nextSequence??state.sends+1,code=`IH-2026-${String(sequence).padStart(3,'0')}`;
    state.sends++;if(state.nextSequence!==null)state.nextSequence++;
    const bytes=registeredExcel(Buffer.from(input.contentBase64,'base64'),code);
    const hash=createHash('sha256').update(bytes).digest('hex'),name='REG_INS_TALLER NUBE_05.11.2026.xlsx';
    const storage_path=`2026/11-NOVIEMBRE/${row.id}/${hash}/${name}`;
    state.files.set('berry-documents/'+storage_path,bytes);
    const document={filename:name,storage_path,sha256:hash};state.documents.set(row.id,document);
    row.workflow='sent';row.code=code;row.revision++;
    row.data={...row.data,serverRegistration:{inspectionId:row.id,code:row.code,acceptedAt:'2026-11-08T12:00:00Z'},delivery:{sentAt:'2026-11-08T12:00:00Z',recipientIds:row.data.responsibles.map((p:any)=>p.personId),revision:row.revision,corrections:{}},emailCc:['jefe@example.com'],emailDelivery:{state:'accepted',message:'Informe guardado y envío aceptado.',updatedAt:'2026-11-08T12:00:00Z'}};
    await route.fulfill({json:{ok:true,inspection:row,document}});
  });
  return profile;
}
async function login(page:Page,actor:string){
  await page.goto('./?acceso=cuenta');await page.getByLabel(/^Correo electrónico/).fill(profiles.find(p=>p.id===actor)!.email);
  await page.getByLabel(/^Contraseña/).fill('Fictitious!47');await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Mis inspecciones',exact:true})).toBeVisible();
}
async function openEditor(page:Page){
  await expect(page.getByRole('heading',{name:'Mis inspecciones',exact:true})).toBeVisible();
  const resume=page.locator('.inspection-list-row').getByRole('button',{name:'Continuar',exact:true});
  if(await resume.count())await resume.first().click();
  else await page.locator('.page-heading').getByRole('button',{name:'Nueva inspección',exact:true}).click();
  await expect(page.locator('.card-eyebrow')).toBeVisible();
}
async function enter(page:Page,actor:string){await login(page,actor);await openEditor(page);}

for(const actor of [author,recipient])test(`el ingreso de ${actor===author?'administrador':'inspector'} abre Mis inspecciones y conserva el acceso voluntario al perfil`,async({page,context})=>{
  const state=stateOf();await mock(context,state,actor);
  await page.addInitScript(()=>{
    (window as any).profileShown=false;
    new MutationObserver(()=>{if(document.querySelector('.cloud-profile-heading'))(window as any).profileShown=true;}).observe(document,{subtree:true,childList:true});
  });
  await login(page,actor);
  expect(await page.evaluate(()=>(window as any).profileShown)).toBe(false);
  await expect(page.locator('.sidebar-nav').getByRole('button',{name:'Mis inspecciones',exact:true})).toHaveClass('active');
  await expect(page.locator('.sidebar-nav').getByRole('button',{name:'Administración',exact:true})).toHaveCount(actor===author?1:0);
  await expect(page.locator('.card-eyebrow')).toHaveCount(0);expect(state.rows.size).toBe(0);expect(state.previewCalls).toBe(0);
  await page.reload();await expect(page.getByRole('heading',{name:'Mis inspecciones',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>(window as any).profileShown)).toBe(false);
  await openWorkspaceProfile(page);
  const profile=page.getByRole('dialog',{name:'Mi perfil',exact:true});await expect(profile).toContainText(profiles.find(p=>p.id===actor)!.full_name);
  await profile.getByRole('button',{name:'Ir a mi perfil',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Mi perfil',exact:true})).toBeVisible();await expect(page).toHaveURL(/seccion=perfil/);
  await expect(page.getByLabel('Nombres y apellidos')).toHaveValue(profiles.find(p=>p.id===actor)!.full_name);
  await expect(page.getByRole('button',{name:'Gestión de Usuarios',exact:true})).toHaveCount(actor===author?1:0);
  await expect(page.getByRole('button',{name:'Gestión de Inspecciones',exact:true})).toHaveCount(actor===author?1:0);
  await page.reload();await expect(page.getByRole('heading',{name:'Mi perfil',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Entrar al espacio de trabajo'}).click();await expect(page.getByRole('heading',{name:'Mis inspecciones',exact:true})).toBeVisible();
  await expect(page).not.toHaveURL(/seccion=/);
  await openWorkspaceProfile(page);await page.getByRole('button',{name:'Ir a mi perfil',exact:true}).click();
  await page.getByRole('button',{name:'Cerrar sesión en este dispositivo',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Inicia sesión',exact:true})).toBeVisible();await expect(page).not.toHaveURL(/seccion=/);
  await page.getByLabel(/^Correo electrónico/).fill(profiles.find(p=>p.id===actor)!.email);await page.getByLabel(/^Contraseña/).fill('Fictitious!47');await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Mis inspecciones',exact:true})).toBeVisible();expect(state.rows.size).toBe(0);expect(state.saves).toBe(0);
});

test('un fallo de conexión al abrir el espacio permite reintentar sin mandar al formulario de perfil',async({page,context})=>{
  const state=stateOf();state.schemaFails=true;await mock(context,state,author);
  await page.goto('./?acceso=cuenta');await page.getByLabel(/^Correo electrónico/).fill('ana@example.com');await page.getByLabel(/^Contraseña/).fill('Fictitious!47');await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('No pudimos abrir tu espacio de trabajo');await expect(page.getByLabel('Nombres y apellidos')).toHaveCount(0);
  state.schemaFails=false;await page.getByRole('button',{name:'Reintentar',exact:true}).click();await expect(page.getByRole('heading',{name:'Mis inspecciones',exact:true})).toBeVisible();expect(state.rows.size).toBe(0);
});

test('un fallo del servicio de perfiles conserva la sesión y reintentar abre Mis inspecciones sin otro ingreso',async({page,context})=>{
  const state=stateOf();state.profileFails=true;await mock(context,state,author);
  await page.goto('./?acceso=cuenta');await page.getByLabel(/^Correo electrónico/).fill('ana@example.com');await page.getByLabel(/^Contraseña/).fill('Fictitious!47');await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('El servicio de datos no pudo responder');await expect(page.getByRole('alert')).toContainText('Tu sesión sigue iniciada');
  await expect(page.getByLabel('Nombres y apellidos')).toHaveCount(0);expect(state.paths.filter(path=>path==='/auth/v1/token')).toHaveLength(1);expect(state.paths.filter(path=>path==='/rest/v1/berry_profiles')).toHaveLength(1);expect(state.rows.size).toBe(0);
  state.profileFails=false;await page.getByRole('button',{name:'Reintentar',exact:true}).click();await expect(page.getByRole('heading',{name:'Mis inspecciones',exact:true})).toBeVisible();expect(state.paths.filter(path=>path==='/auth/v1/token')).toHaveLength(1);
});

test('un servicio de numeración saturado espacia los intentos y se consulta otra vez al recuperar conexión',async({page,context})=>{
  const state=stateOf();await mock(context,state,author);await enter(page,author);
  const badge=page.getByRole('textbox',{name:'Número de registro',exact:true});await expect(badge).toHaveValue('IH-2026-001');
  state.previewFails=true;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(badge).toHaveValue('Por confirmar');const calls=state.previewCalls;
  // Observe a complete normal polling interval: a failed service must not be retried after five seconds.
  await page.waitForTimeout(6000);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));expect(state.previewCalls).toBe(calls);
  state.previewFails=false;state.nextSequence=2;await page.evaluate(()=>window.dispatchEvent(new Event('online')));await expect(badge).toHaveValue('IH-2026-002');expect(state.previewCalls).toBe(calls+1);expect(state.sends).toBe(0);
});

test('private drafts resume on another device and full approval replaces the initial Excel with the stored final',async({browser,page,context})=>{
  test.setTimeout(90000);
  const state=stateOf();await mock(context,state,author);await enter(page,author);
  await expect(page.getByText('Modo de prueba',{exact:true})).toHaveCount(0);
  await page.getByLabel('Área e instalación inspeccionada').fill('Taller nube');await page.getByLabel('Fecha de inspección').fill('2026-11-05');
  await selectLocation(page, 'Sede', 'Fundo'); await selectLocation(page, 'Zona de inspección', 'Armonía II');
  await page.getByLabel('Hora de inspección').fill('09:30');await selectValue(page.getByLabel('AM o PM'), 'AM');await page.getByRole('radio',{name:'Planeada',exact:true}).check();
  await page.getByRole('textbox',{name:'Objetivo de la inspección interna',exact:true}).fill('Comprobar condiciones seguras.');
  await page.getByRole('combobox',{name:/Nombre completo/}).first().fill('Bruno');await page.getByRole('option',{name:/Bruno Responsable/}).click();await selectSecondResponsible(page,'ana@example.com');
  await page.getByRole('button',{name:'Continuar',exact:true}).click();await page.getByRole('button',{name:'Añadir observación',exact:true}).click();
  await page.getByLabel('Descripción').fill('Protección pendiente.');await page.getByLabel('Acción a tomar').fill('Instalar protección.');await page.getByLabel('Fecha de Cierre').fill('2026-11-20');
  await page.getByLabel('Añadir fotos a observación 1').setInputFiles(png);
  await expect(page.locator('.photo-thumb img')).toBeVisible();
  await page.waitForTimeout(1200);expect(state.rows.size).toBe(0);expect(state.files.size).toBe(0);
  await page.getByRole('button',{name:'Guardar',exact:true}).first().click();await expect(page.getByText('Guardado en tu cuenta',{exact:true})).toBeVisible();
  const row=[...state.rows.values()].find(r=>!r.data.partial)!;await expect.poll(()=>row.data.observations[0].photos[0]?.dataRef).toBeTruthy();
  expect(state.files.size).toBe(1);expect(await page.evaluate(()=>localStorage.getItem('berry-demo-accounts-v1'))).toBeNull();
  const imageReads=()=>state.paths.filter(path=>path.includes('/object/authenticated/berry-evidence/')).length;
  const reads=imageReads();
  await openWorkspaceProfile(page);await page.getByRole('button',{name:'Ir a mi perfil',exact:true}).click();
  await page.getByRole('button',{name:'Entrar al espacio de trabajo'}).click();
  await openEditor(page);
  await expect(page.locator('.photo-thumb img').first()).toBeVisible();expect(imageReads()).toBe(reads);
  const device=await browser.newContext();await mock(device,state,author);const other=await device.newPage();await enter(other,author);
  await expect(other.getByLabel('Descripción')).toHaveValue('Protección pendiente.');
  await expect(other.locator('.photo-thumb img').first()).toBeVisible();
  const recipientDevice=await browser.newContext({viewport:{width:390,height:844}});await mock(recipientDevice,state,recipient);const receiver=await recipientDevice.newPage();await enter(receiver,recipient);
  await receiver.getByRole('button',{name:'Abrir menú',exact:true}).click();await receiver.getByRole('button',{name:/Buzón de Inspecciones/}).click();
  await expect(receiver.getByRole('heading',{name:'No tienes informes a tu cargo'})).toBeVisible();
  await other.getByRole('button',{name:'Continuar',exact:true}).click();await other.getByRole('button',{name:'Continuar',exact:true}).click();
  await other.getByRole('textbox',{name:'CONCLUSIONES Y RECOMENDACIONES',exact:true}).fill('Gestionar la medida indicada.');
  await expect(other.locator('.registration-meta-job').first()).toHaveText('Supervisora');await expect(other.locator('.registration-person-meta input')).toHaveCount(0);
  await other.getByRole('button',{name:'Continuar',exact:true}).click();await other.getByRole('button',{name:'Enviar inspección',exact:true}).click();
  await expect(other.getByText('Compartir solo en este navegador')).toHaveCount(0);
  state.failSave=true;await other.getByRole('button',{name:'Enviar informe por correo',exact:true}).click();
  await expect(other.getByRole('dialog').getByRole('alert')).toContainText('No se pudo confirmar el guardado');expect(state.sends).toBe(0);expect(row.code).toBeUndefined();
  state.failSave=false;await other.getByRole('button',{name:'Enviar informe por correo',exact:true}).click();
  await expect(other.getByRole('heading',{name:'Fundo – Armonía II – Taller nube',exact:true})).toBeVisible();await expect(other.locator('.followup-heading')).toContainText('IH-2026-001');expect(state.sends).toBe(1);
  await other.waitForFunction(()=>window.scrollY===0);
  await other.screenshot({path:'/tmp/berry-cloud-report.png',fullPage:true,animations:'disabled'});
  const downloadPromise=other.waitForEvent('download');await other.getByRole('button',{name:'Descargar Excel',exact:true}).click();const download=await downloadPromise;
  const bytes=await readFile((await download.path())!);expect(bytes.equals(state.files.get('berry-documents/'+state.documents.get(row.id).storage_path)!)).toBe(true);
  // Same recipient device now sees the sent record, without local account switching or copied IndexedDB data.
  await receiver.reload();await expect(receiver.getByRole('heading',{name:'Mis inspecciones',exact:true})).toBeVisible();
  await receiver.getByRole('button',{name:'Abrir menú',exact:true}).click();await receiver.getByRole('button',{name:/Buzón de Inspecciones/}).click();await receiver.getByRole('button',{name:'Revisar inspección',exact:true}).click();
  await expect(receiver.locator('.breadcrumbs')).toContainText('Buzón de Inspecciones');await expect(receiver.locator('.breadcrumbs')).toContainText('Por atender');
  await expect(receiver.getByLabel('Responsable del Levantamiento')).toHaveValue('Bruno Responsable');
  await expect(receiver.getByLabel('Responsable del Levantamiento')).toHaveAttribute('readonly','');
  expect(await receiver.evaluate(()=>localStorage.getItem('berry-last-submitted-texts'))).toBeNull();
  await receiver.waitForFunction(()=>document.querySelector('.sidebar')!.getBoundingClientRect().right<=0);
  await receiver.screenshot({path:'/tmp/berry-cloud-mobile.png',fullPage:true,animations:'disabled'});
  const submissions:any[]=[];let failSubmission=true;
  await receiver.route(`${project}/rest/v1/rpc/berry_change_correction`,async route=>{
    const input=route.request().postDataJSON();submissions.push(input);
    if(failSubmission){failSubmission=false;return route.fulfill({status:503,json:{message:'Service unavailable'}});}
    return route.fallback();
  });
  await receiver.getByLabel('Acción realizada').fill('Protección instalada.');
  await receiver.getByRole('button',{name:'Enviar levantamiento',exact:true}).click();
  await expect(receiver.getByRole('alert')).toBeVisible();
  await expect(receiver.getByText('Avance guardado y levantamiento enviado a revisión.',{exact:true})).toHaveCount(0);
  await expect(receiver.getByLabel('Acción realizada')).toHaveValue('Protección instalada.');
  expect(row.data.delivery.corrections[row.data.observations[0].id]).toBeUndefined();
  await receiver.getByRole('button',{name:'Enviar levantamiento',exact:true}).click();
  await expect(receiver.getByText('Avance guardado y levantamiento enviado a revisión.',{exact:true})).toBeVisible();
  expect(submissions.map(input=>input.p_action)).toEqual(['submit','submit']);
  expect(row.data.delivery.corrections[row.data.observations[0].id]).toMatchObject({action:'Protección instalada.',decision:'review'});
  await other.getByRole('button',{name:'Volver',exact:true}).click();await other.getByRole('button',{name:'Revisar informe',exact:true}).click();
  await expect(other.getByLabel('Responsable del Levantamiento')).toHaveValue('Bruno Responsable');
  await other.getByLabel('Comentario de revisión').fill('Comentario interno del revisor.');
  state.failFinal=true;const originalPath=state.documents.get(row.id).storage_path;
  await other.getByRole('button',{name:'Aprobar levantamiento',exact:true}).click();await expect(other.getByLabel('Estado',{exact:true})).toHaveValue('Ejecutado');await expect(other.getByRole('button',{name:'Descargar PDF',exact:true})).toBeVisible();
  expect(row.workflow).toBe('closed');expect(row.data.delivery.corrections[row.data.observations[0].id].state).toBe('Ejecutado');
  await expect(other.getByRole('alert')).toContainText('No se pudo guardar el Excel final');expect(state.documents.get(row.id).storage_path).toBe(originalPath);
  state.failFinal=false;await other.getByRole('button',{name:'Reintentar guardar Excel final'}).click();await expect.poll(()=>row.final_excel_stored).toBe(true);
  expect(state.documents.size).toBe(1);expect(state.files.has('berry-documents/'+originalPath)).toBe(false);expect(state.finalizes).toBe(1);expect(state.sends).toBe(1);
  const finalDownloadPromise=other.waitForEvent('download');await other.getByRole('button',{name:'Descargar Excel',exact:true}).click();const finalDownload=await finalDownloadPromise;
  const finalBytes=await readFile((await finalDownload.path())!);expect(finalBytes.equals(state.files.get('berry-documents/'+state.documents.get(row.id).storage_path)!)).toBe(true);
  const archive=await JSZip.loadAsync(finalBytes,{checkCRC32:true});const sheet=await archive.file('xl/worksheets/sheet1.xml')!.async('string');expect(sheet).toContain('Instalar protección.');expect(sheet).not.toContain('Protección instalada.');expect(sheet).not.toContain('Acción realizada:');expect(sheet).not.toContain('Comentario interno del revisor.');expect(sheet).toContain('IH-2026-001');
  // Historical stored finals are cleaned on download, including the admin read-only path.
  const legacy=await JSZip.loadAsync(finalBytes),sheetPath='xl/worksheets/sheet1.xml';
  legacy.file(sheetPath,(await legacy.file(sheetPath)!.async('string')).replace('Instalar protección.','Instalar protección.\n\nAcción realizada:\nProtección instalada.\n\nObservación del revisor:\nComentario interno del revisor.'));
  const legacyBytes=await legacy.generateAsync({type:'nodebuffer'}),document=state.documents.get(row.id),storageKey='berry-documents/'+document.storage_path;
  document.sha256=createHash('sha256').update(legacyBytes).digest('hex');state.files.set(storageKey,legacyBytes);
  for(const readOnly of [false,true]){
   const ready=other.waitForEvent('download');
   await other.evaluate(async({row,author,readOnly})=>{const {hydrateCloudInspection}=await import('/src/cloud-store.ts');const {exportExcel}=await import('/src/export.ts');await exportExcel(await hydrateCloudInspection(row,author),{readOnly});},{row,author,readOnly});
   const downloaded=await readFile((await(await ready).path())!),clean=await JSZip.loadAsync(downloaded,{checkCRC32:true});
   const xml=await clean.file(sheetPath)!.async('string');expect(xml).toContain('Instalar protección.');expect(xml).toContain('IH-2026-001');expect(xml).not.toContain('Protección instalada.');expect(xml).not.toContain('Comentario interno del revisor.');
   for(const name of Object.keys(legacy.files).filter(name=>!legacy.files[name].dir&&name!==sheetPath))expect(await clean.file(name)!.async('nodebuffer')).toEqual(await legacy.file(name)!.async('nodebuffer'));
  }
  expect(state.files.get(storageKey)).toEqual(legacyBytes);expect(state.finalizes).toBe(1);expect(state.sends).toBe(1);
  expect(row.data.delivery.corrections[row.data.observations[0].id]).toMatchObject({action:'Protección instalada.',note:'Comentario interno del revisor.'});
  await expect(other.getByLabel('Acción realizada')).toHaveValue('Protección instalada.');await expect(other.getByRole('region',{name:'Conversación y seguimiento'})).toContainText('Comentario interno del revisor.');
  await device.close();await recipientDevice.close();
});

test('listas consultan metadatos por bloques y descargan evidencias solo al abrir el informe',async({page,context})=>{
 const state=stateOf();await mock(context,state,author);await login(page,author);
 const draft=await page.evaluate(async(author)=>{const {newInspection,newObservation}=await import('/src/model.ts');const d=newInspection({name:'Ana Inspectora',email:'ana@example.com',accountId:author,storage:'cloud'}),o=newObservation('2026-11-20');o.description='Evidencia diferida';o.photos=[{id:crypto.randomUUID(),name:'evidencia.png',data:'',dataRef:`${d.id}/foto.png`} as any];return {...d,area:'Informe con evidencia diferida',step:1,observations:[o]};},author);
 state.rows.set(draft.id,{id:draft.id,author_id:author,data:draft,revision:1,updated_at:new Date().toISOString(),workflow:'draft'});
 state.files.set('berry-evidence/'+(draft.observations[0].photos[0] as any).dataRef,png.buffer);
 await page.reload();await expect(page.locator('.inspection-list-row')).toContainText('Informe con evidencia diferida');
 expect(state.paths.some(path=>path.startsWith('/storage/v1/object/berry-evidence/'))).toBe(false);
 await openEditor(page);await expect(page.locator('.photo-thumb img')).toBeVisible();expect(state.paths.some(path=>path.startsWith('/storage/v1/object/berry-evidence/'))).toBe(true);
});

test('Guardar sin conexión conserva el borrador por usuario y sincroniza al recuperar internet',async({page,context})=>{
 const state=stateOf();await mock(context,state,author);await enter(page,author);
 await context.setOffline(true);await page.getByRole('textbox',{name:'Objetivo de la inspección interna',exact:true}).fill('Trabajo guardado desde el campo sin internet.');
 await page.getByRole('button',{name:'Guardar',exact:true}).first().click();await expect(page.getByText('Guardado en este dispositivo',{exact:true})).toBeVisible();
 expect(state.rows.size).toBe(0);expect(await page.evaluate(async(actor)=>{const {offlineJobs}=await import('/src/offline-store.ts');return(await offlineJobs(actor)).length;},author)).toBe(1);
 await context.setOffline(false);await expect.poll(()=>[...state.rows.values()].find(r=>!r.data.partial)?.data.objective).toBe('Trabajo guardado desde el campo sin internet.');
 await expect.poll(()=>page.evaluate(async(actor)=>{const {offlineJobs}=await import('/src/offline-store.ts');return(await offlineJobs(actor)).length;},author)).toBe(0);
 expect(state.saves).toBe(1);
});

test('seguimiento conserva comentarios por observación sin mostrar el panel de correos',async({page,context})=>{
 const state=stateOf();await mock(context,state,author);await login(page,author);
 const report=await page.evaluate(async(author)=>{const {newInspection,newObservation}=await import('/src/model.ts');const d=newInspection({name:'Ana Inspectora',email:'ana@example.com',accountId:author,storage:'cloud'});d.area='Seguimiento de entrega y conversación';d.observations=[newObservation('2026-11-20')];d.delivery={sentAt:new Date().toISOString(),recipientIds:[],revision:1,corrections:{}};return d;},author);
 state.rows.set(report.id,{id:report.id,author_id:author,data:report,revision:1,updated_at:new Date().toISOString(),workflow:'sent',code:'IH-2026-055'});
 const events:any[]=[];
 await page.route(`${project}/rest/v1/berry_followup_events*`,route=>route.fulfill({json:events}));
 await page.route(`${project}/rest/v1/berry_mail_recipients*`,route=>route.fulfill({json:[{request_id:report.id,email:'recipient@example.invalid',state:'submitted',provider_id:'provider-id',detail:'',occurred_at:new Date().toISOString()}]}));
 await page.route(`${project}/rest/v1/rpc/berry_add_followup_comment`,route=>{const input=route.request().postDataJSON();expect(input.p_id).toBe(report.id);events.unshift({id:input.p_operation,inspection_id:report.id,observation_id:input.p_observation,actor_id:author,actor_name:'Ana Inspectora',action:'comment',body:input.p_body,created_at:new Date().toISOString()});return route.fulfill({json:events[0]});});
 await page.reload();await expect(page.locator('.inspection-list-row')).toContainText(report.area);
 await page.evaluate(()=>{const value=JSON.parse(localStorage.getItem('berry-offline-schema-v1')||'{}');localStorage.setItem('berry-offline-schema-v1',JSON.stringify({...value,productivity_version:'202611170023'}));});
 await page.getByRole('button',{name:'Revisar informe',exact:true}).click();await expect(page.getByText('Seguimiento de correos',{exact:true})).toHaveCount(0);
 const conversation=page.getByRole('region',{name:'Conversación y seguimiento'});await conversation.getByLabel('Escribir comentario').fill('Confirmar el avance de esta observación.');await conversation.getByRole('button',{name:'Enviar comentario',exact:true}).click();await expect(conversation.getByText('Confirmar el avance de esta observación.',{exact:true})).toBeVisible();expect(events).toHaveLength(1);
 await expect(page.getByRole('button',{name:'Actualizar estado',exact:true})).toHaveCount(0);await expect(page.locator('.mail-state')).toHaveCount(0);
});

test('offline edits stay recoverable and an obsolete device cannot overwrite a newer draft',async({browser,page,context})=>{
  const state=stateOf();await mock(context,state,author);await enter(page,author);await page.getByLabel('Área e instalación inspeccionada').fill('Primera versión');await page.getByRole('button',{name:'Guardar',exact:true}).first().click();await expect(page.getByText('Guardado en tu cuenta',{exact:true})).toBeVisible();
  const device=await browser.newContext();await mock(device,state,author);const second=await device.newPage();await enter(second,author);
  await second.getByLabel('Área e instalación inspeccionada').fill('Versión nueva');await second.getByRole('button',{name:'Guardar',exact:true}).first().click();await expect(second.getByText('Guardado en tu cuenta',{exact:true})).toBeVisible();
  await page.getByLabel('Área e instalación inspeccionada').fill('Edición obsoleta');await page.getByRole('button',{name:'Guardar',exact:true}).first().click();await expect(page.getByText('Cambios sin guardar',{exact:true})).toBeVisible();
  expect([...state.rows.values()][0].data.area).toBe('Versión nueva');await expect(page.getByLabel('Área e instalación inspeccionada')).toHaveValue('Edición obsoleta');
  await page.getByRole('button',{name:'Abrir versión guardada',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Abrir versión guardada',exact:true}).click();await expect(page.getByLabel('Área e instalación inspeccionada')).toHaveValue('Versión nueva');
  state.failSave=true;await second.getByLabel('Área e instalación inspeccionada').fill('Edición sin conexión');await second.getByRole('button',{name:'Guardar',exact:true}).first().click();await expect(second.getByText('Cambios sin guardar',{exact:true})).toBeVisible();state.failSave=false;
  await second.reload();await openEditor(second);await expect(second.getByLabel('Área e instalación inspeccionada')).toHaveValue('Edición sin conexión');await second.getByRole('button',{name:'Guardar',exact:true}).first().click();await expect(second.getByText('Guardado en tu cuenta',{exact:true})).toBeVisible();
  await device.close();
});


test('un usuario que solo recibe no crea borradores ni ve controles de creación o administración',async({page,context})=>{
  const state=stateOf();await mock(context,state,recipient,{can_create_inspections:false,can_receive_inspections:true,role:'inspector'});
  await page.goto('./?acceso=cuenta');await page.getByLabel(/^Correo electrónico/).fill('bruno@example.com');await page.getByLabel(/^Contraseña/).fill('Fictitious!47');await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Mis inspecciones',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Buzón de Inspecciones',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Buzón de Inspecciones',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Nueva inspección',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Administración',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Mis inspecciones',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Mis inspecciones',exact:true})).toBeVisible();
  expect(state.rows.size).toBe(0);expect(state.saves).toBe(0);
  await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click();await page.getByRole('button',{name:'Salir',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Inicia sesión',exact:true})).toBeVisible();
});

test('un borrador pendiente retirado por el administrador o el reinicio no reaparece al recargar',async({page,context})=>{
  const state=stateOf();await mock(context,state,author);await enter(page,author);
  state.failSave=true;await page.getByLabel('Área e instalación inspeccionada').fill('Borrador retirado');await page.getByRole('button',{name:'Guardar',exact:true}).first().click();
  await expect(page.getByRole('alert').filter({hasText:'No se pudo confirmar el guardado del borrador.'})).toBeVisible();
  const pending=await page.evaluate(async()=>{const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('berry-cloud-pending-v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});return new Promise<any[]>(resolve=>{const tx=db.transaction('drafts');const r=tx.objectStore('drafts').getAll();r.onsuccess=()=>resolve(r.result);tx.oncomplete=()=>db.close();});});
  expect(pending.length).toBe(1);state.retired.add(pending[0].id);state.failSave=false;
  page.once('dialog',dialog=>dialog.accept());await page.reload();
  await openEditor(page);
  await expect(page.getByLabel('Área e instalación inspeccionada')).toHaveValue('');
  expect(state.rows.has(pending[0].id)).toBe(false);
  expect(state.paths).toContain('/rest/v1/rpc/berry_cloud_tombstones');
});

test('Salir advierte cambios pendientes sin guardar automáticamente ni cerrar sesión',async({page,context})=>{
  const state=stateOf();await mock(context,state,author);await enter(page,author);
  state.failSave=true;await page.getByLabel('Área e instalación inspeccionada').fill('Borrador antes de salir');
  await openWorkspaceProfile(page);
  await page.getByRole('dialog',{name:'Mi perfil',exact:true}).getByRole('button',{name:'Cerrar sesión',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'¿Estás seguro de salir?',exact:true});
  await expect(dialog.getByRole('button',{name:'Salir',exact:true})).toHaveCount(0);
  await expect(dialog.getByRole('button',{name:'Salir sin guardar',exact:true})).toBeVisible();
  await expect(dialog.locator('.modal-actions button')).toHaveCount(2);
  await expect(dialog).toContainText('los datos previamente guardados se conservan');
  await expect(dialog.getByRole('alert')).toHaveCount(0);expect(state.saves).toBe(0);
  expect(state.paths).not.toContain('/auth/v1/logout');
  state.failSave=false;await dialog.getByRole('button',{name:'Seguir en la aplicación'}).click();await page.getByRole('button',{name:'Guardar',exact:true}).first().click();await expect(page.getByText('Guardado en tu cuenta',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click();await page.getByRole('dialog',{name:'¿Estás seguro de salir?',exact:true}).getByRole('button',{name:'Salir',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Inicia sesión',exact:true})).toBeVisible();
  expect([...state.rows.values()].some(row=>row.data.area==='Borrador antes de salir')).toBe(true);
  expect(state.paths).toContain('/auth/v1/logout');
});

test('siguiente correlativo compartido se refresca al recibir foco y cada cinco segundos sin reservar ni alterar el borrador',async({browser,page,context})=>{
 test.setTimeout(60000);const state=stateOf();state.nextSequence=21;await mock(context,state,author);await enter(page,author);
 const badge=page.getByRole('textbox',{name:'Número de registro',exact:true});await expect(badge).toHaveValue('IH-2026-021');await expect(badge).toHaveAttribute('readonly','');
 await page.getByRole('textbox',{name:'Objetivo de la inspección interna',exact:true}).fill('Objetivo que debe conservarse.');await page.getByRole('button',{name:'Guardar',exact:true}).first().click();await expect(page.getByText('Guardado en tu cuenta',{exact:true})).toBeVisible();
 const row=[...state.rows.values()].find(row=>row.author_id===author&&!row.data.partial)!;expect(row.code).toBeUndefined();expect(row.data.serverRegistration).toBeUndefined();expect(row.data.registrationNumber).toBe('');expect(state.sends).toBe(0);
 const second=await browser.newContext();try {
  await mock(second,state,recipient);const other=await second.newPage();await enter(other,recipient);await expect(other.getByRole('textbox',{name:'Número de registro',exact:true})).toHaveValue('IH-2026-021');
  state.nextSequence=22;await page.bringToFront();await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(badge).toHaveValue('IH-2026-022');
  state.nextSequence=23;await expect(badge).toHaveValue('IH-2026-023',{timeout:7500});await expect(page.getByRole('textbox',{name:'Objetivo de la inspección interna',exact:true})).toHaveValue('Objetivo que debe conservarse.');
  await other.bringToFront();await other.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(other.getByRole('textbox',{name:'Número de registro',exact:true})).toHaveValue('IH-2026-023');
  state.previewFails=true;await page.bringToFront();await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(badge).toHaveValue('Por confirmar');
  state.previewFails=false;state.nextSequence=24;await page.evaluate(()=>window.dispatchEvent(new Event('online')));await expect(badge).toHaveValue('IH-2026-024');expect(state.sends).toBe(0);expect(row.data.objective).toBe('Objetivo que debe conservarse.');
 }finally{await second.close();}
});

test('guardado manual: escribir y navegar no escriben; Guardar conserva el borrador y el número de registro sigue pendiente',async({page,context})=>{
 const state=stateOf();await mock(context,state,author);await enter(page,author);
 await page.getByLabel('Área e instalación inspeccionada').fill('Borrador manual');
 await page.waitForTimeout(1200);expect(state.rows.size).toBe(0);expect(state.saves).toBe(0);expect(state.files.size).toBe(0);
 await page.getByRole('button',{name:'Mis inspecciones',exact:true}).click();await expect(page.getByText(/Hay información sin guardar/)).toBeVisible();await expect(page.getByLabel('Área e instalación inspeccionada')).toHaveValue('Borrador manual');
 await page.getByRole('dialog',{name:'¿Qué quieres hacer con los cambios?',exact:true}).getByRole('button',{name:'Seguir editando',exact:true}).click();
 await page.getByRole('button',{name:'Guardar',exact:true}).first().click();await expect(page.getByText('Guardado en tu cuenta',{exact:true})).toBeVisible();expect(state.saves).toBe(1);
 const row=[...state.rows.values()].find(r=>!r.data.partial)!;expect(row.data.area).toBe('Borrador manual');expect(row.code).toBeUndefined();expect(state.sends).toBe(0);
 await page.getByRole('button',{name:'Mis inspecciones',exact:true}).click();await page.reload();await openEditor(page);await expect(page.getByLabel('Área e instalación inspeccionada')).toHaveValue('Borrador manual');
 await page.waitForTimeout(1200);expect(state.saves).toBe(1);
});

test('editar durante Guardar mantiene el cambio nuevo pendiente hasta el siguiente guardado explícito',async({page,context})=>{
 const state=stateOf();await mock(context,state,author);await enter(page,author);
 let release!:()=>void;const held=new Promise<void>(resolve=>release=resolve);let waiting=false;
 await page.route('**/rest/v1/rpc/berry_save_draft',async route=>{waiting=true;await held;await route.fallback();});
 await page.getByLabel('Área e instalación inspeccionada').fill('Primera edición');
 const saveWidth=(await page.locator('.save-exit').boundingBox())!.width;
 await page.getByRole('button',{name:'Guardar',exact:true}).first().click();await expect.poll(()=>waiting).toBe(true);
 expect((await page.locator('.save-exit').boundingBox())!.width).toBeCloseTo(saveWidth, 0);
 await expect(page.locator('.save-exit')).toHaveAttribute('data-save-phase','pending');
 await expect(page.locator('.save-exit')).toHaveAttribute('aria-busy','true');
 await expect(page.locator('.save-exit')).toBeDisabled();
 await page.getByLabel('Área e instalación inspeccionada').fill('Segunda edición');release();await expect.poll(()=>state.saves).toBe(1);
 await expect(page.getByText('Cambios sin guardar',{exact:true})).toBeVisible();
 await expect(page.locator('.save-exit')).toHaveAttribute('data-save-phase','idle');
 await page.waitForTimeout(1200);expect(state.saves).toBe(1);
 await page.getByRole('button',{name:'Guardar',exact:true}).first().click();await expect(page.getByText('Guardado en tu cuenta',{exact:true})).toBeVisible();expect(state.saves).toBe(2);expect([...state.rows.values()].find(r=>!r.data.partial)!.data.area).toBe('Segunda edición');
 await expect(page.locator('.save-exit')).toHaveAttribute('data-save-phase','success');
});


test('un servicio que no responde termina el guardado, conserva el intento y permite salir sin guardar cambios nuevos',async({page,context})=>{
 test.setTimeout(60000);const state=stateOf();await mock(context,state,author);await enter(page,author);
 await page.evaluate(()=>{
  const transport=window.fetch;let attempts=0;
  Object.assign(window,{stalledSaveAttempts:()=>attempts});
  window.fetch=(input,init)=>{
   const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
   if(!url.includes('/rpc/berry_save_draft'))return transport(input,init);
   attempts++;
   return new Promise<Response>((_,reject)=>{
    const signal=init?.signal;
    if(!signal)return;
    if(signal.aborted)reject(signal.reason);
    else signal.addEventListener('abort',()=>reject(signal.reason),{once:true});
   });
  };
 });
 await page.getByLabel('Área e instalación inspeccionada').fill('Intento recuperable tras tiempo agotado');
 await page.getByRole('button',{name:'Guardar',exact:true}).first().click();
 await expect(page.getByRole('button',{name:'Guardando…',exact:true})).toBeVisible();
 await expect(page.getByRole('alert').filter({hasText:'No se pudo confirmar el guardado'})).toBeVisible({timeout:35000});
 await expect(page.getByRole('button',{name:'Guardar',exact:true}).first()).toBeEnabled();
 await expect(page.getByLabel('Área e instalación inspeccionada')).toHaveValue('Intento recuperable tras tiempo agotado');
 expect(await page.evaluate(()=>(window as any).stalledSaveAttempts())).toBe(1);expect(state.saves).toBe(0);
 await page.getByLabel('Área e instalación inspeccionada').fill('Cambio nuevo que elijo descartar');
 await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'¿Estás seguro de salir?',exact:true});
 await expect(dialog).toContainText('los datos previamente guardados se conservan');
 await dialog.getByRole('button',{name:'Salir sin guardar',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Inicia sesión',exact:true})).toBeVisible();
 await enter(page,author);await expect(page.getByLabel('Área e instalación inspeccionada')).toHaveValue('Intento recuperable tras tiempo agotado');
 await expect(page.getByText('Cambios sin guardar',{exact:true})).toBeVisible();expect(state.saves).toBe(0);
});


test('Enviar guarda sin un Guardar previo y dos cuentas reciben 051 y 052 según el orden de envío',async({browser,page,context})=>{
 test.setTimeout(60000);const state=stateOf();state.nextSequence=51;await mock(context,state,author);await enter(page,author);
 const device=await browser.newContext();try {
  await mock(device,state,recipient);const other=await device.newPage();await enter(other,recipient);
  for(const current of [page,other])await expect(current.getByRole('textbox',{name:'Número de registro',exact:true})).toHaveValue('IH-2026-051');
  async function complete(current:Page,responsible:string){
   await current.getByLabel('Área e instalación inspeccionada').fill('Taller nube');await selectLocation(current,'Sede','Fundo');await selectLocation(current,'Zona de inspección','Armonía II');
   await current.getByLabel('Hora de inspección').fill('09:30');await selectValue(current.getByLabel('AM o PM'), 'AM');await current.getByRole('radio',{name:'Planeada',exact:true}).check();
   await current.getByRole('textbox',{name:'Objetivo de la inspección interna',exact:true}).fill('Objetivo guardado al enviar.');
   await current.getByRole('combobox',{name:/Nombre completo/}).first().fill(responsible);await current.getByRole('option',{name:new RegExp(responsible)}).click();await selectSecondResponsible(current,responsible==='Bruno'?'ana@example.com':'bruno@example.com');
   await current.getByRole('button',{name:'Continuar',exact:true}).click();await current.getByRole('button',{name:'Añadir observación',exact:true}).click();
   await current.getByLabel('Descripción').fill('Hallazgo guardado al enviar.');await current.getByLabel('Acción a tomar').fill('Corregir el hallazgo.');await current.getByLabel('Fecha de Cierre').fill('2026-12-01');
   await current.getByRole('button',{name:'Continuar',exact:true}).click();await current.getByRole('button',{name:'Continuar',exact:true}).click();
   await current.getByRole('textbox',{name:'CONCLUSIONES Y RECOMENDACIONES',exact:true}).fill('Última edición antes del envío.');await current.getByRole('button',{name:'Continuar',exact:true}).click();
  }
  await complete(page,'Bruno');await complete(other,'Ana');expect(state.rows.size).toBe(0);expect(state.saves).toBe(0);
  await other.getByRole('button',{name:'Enviar inspección',exact:true}).click();await other.getByRole('button',{name:'Enviar informe por correo',exact:true}).click();
  await expect(other.locator('.followup-heading')).toContainText('IH-2026-051');
  await page.bringToFront();await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(page.locator('.details-grid')).toContainText('IH-2026-052');
  await page.getByRole('button',{name:'Enviar inspección',exact:true}).click();await page.getByRole('button',{name:'Enviar informe por correo',exact:true}).click();
  await expect(page.locator('.followup-heading')).toContainText('IH-2026-052');expect(state.sends).toBe(2);expect(state.saves).toBe(2);
  for(const row of state.rows.values()){expect(row.data.closingRemarks).toBe('Última edición antes del envío.');expect(row.data.observations[0].description).toBe('Hallazgo guardado al enviar.');expect(row.data.delivery.recipientIds).toHaveLength(2);}
 }finally{await device.close();}
});


test('textos de una cuenta sin historial están en blanco aunque reciba informes; sus borradores se reutilizan en otro dispositivo',async({browser,page,context})=>{
 const state=stateOf();await mock(context,state,recipient);await page.goto('./?acceso=cuenta');
 const report=await page.evaluate(async author=>{
  const {newInspection}=await import('/src/model.ts');const draft=newInspection({name:'Ana Inspectora',email:'ana@example.com',accountId:author,storage:'cloud'});
  return {...draft,objective:'Objetivo privado de Ana.',unfavorableCause:'Causa privada de Ana.',closingRemarks:'Conclusiones privadas de Ana.'};
 },author);
 const stamp='2026-11-10T12:00:00Z';report.delivery={sentAt:stamp,recipientIds:[recipient],revision:2,corrections:{}};
 state.rows.set(report.id,{id:report.id,author_id:author,workflow:'sent',revision:2,updated_at:stamp,code:'IH-2026-001',data:report});
 await context.route('**/rest/v1/berry_shared_texts*',route=>route.fulfill({json:{objective:'Texto compartido antiguo.',unfavorable_cause:'Causa global.',closing_remarks:'Conclusiones globales.',submitted_at:'2099-11-10T12:00:00Z'}}));
 await enter(page,recipient);const objective=page.getByRole('textbox',{name:'Objetivo de la inspección interna',exact:true});await expect(objective).toHaveValue('');
 await objective.fill('Objetivo privado de Bruno.');await page.getByRole('button',{name:'Guardar',exact:true}).first().click();await expect(page.getByText('Guardado en tu cuenta',{exact:true})).toBeVisible();
 const device=await browser.newContext();try{
  await mock(device,state,recipient);const other=await device.newPage();await enter(other,recipient);await other.getByRole('button',{name:'Mis inspecciones',exact:true}).click();await openEditor(other);
  // Open a genuinely new form, rather than the resumed draft.
  await other.getByRole('button',{name:'Mis inspecciones',exact:true}).click();await other.locator('.page-heading').getByRole('button',{name:'Nueva inspección',exact:true}).click();
  await expect(other.getByRole('textbox',{name:'Objetivo de la inspección interna',exact:true})).toHaveValue('Objetivo privado de Bruno.');
  expect(state.paths).not.toContain('/rest/v1/berry_shared_texts');
 }finally{await device.close();}
});

test('Guardar y salir conserva el destino, no sale si falla y permite reintentar sin enviar ni asignar número de registro',async({page,context})=>{
 const state=stateOf();await mock(context,state,author);await enter(page,author);
 await page.getByLabel('Área e instalación inspeccionada').fill('Guardado antes de ir a mi cuenta');
 await openWorkspaceProfile(page);await page.getByRole('button',{name:'Ir a mi perfil',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'¿Qué quieres hacer con los cambios?',exact:true});await expect(dialog).toBeVisible();
 state.failSave=true;await dialog.getByRole('button',{name:'Guardar y salir',exact:true}).click();
 await expect(dialog.getByRole('alert')).toContainText('No se pudo confirmar el guardado');expect(state.saves).toBe(0);await expect(page.getByLabel('Área e instalación inspeccionada')).toHaveValue('Guardado antes de ir a mi cuenta');
 state.failSave=false;await dialog.getByRole('button',{name:'Guardar y salir',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Mi perfil',exact:true})).toBeVisible();expect(state.saves).toBe(1);expect(state.sends).toBe(0);
 const row=[...state.rows.values()].find(item=>!item.data.partial)!;expect(row.data.area).toBe('Guardado antes de ir a mi cuenta');expect(row.code).toBeUndefined();
});

test('Descartar un intento recuperado conserva el borrador confirmado y retira solo la copia pendiente',async({page,context})=>{
 const state=stateOf();await mock(context,state,author);await enter(page,author);
 await page.getByLabel('Área e instalación inspeccionada').fill('Versión confirmada');await page.getByRole('button',{name:'Guardar',exact:true}).click();await expect(page.getByText('Guardado en tu cuenta',{exact:true})).toBeVisible();
 state.failSave=true;await page.getByLabel('Área e instalación inspeccionada').fill('Intento sin confirmar');await page.getByRole('button',{name:'Guardar',exact:true}).click();await expect(page.getByRole('alert')).toContainText('No se pudo confirmar');
 page.once('dialog',native=>native.accept());await page.reload();await openEditor(page);await expect(page.getByLabel('Área e instalación inspeccionada')).toHaveValue('Intento sin confirmar');
 let readFails=true;await page.route('**/rest/v1/rpc/berry_cloud_session',route=>readFails?route.fulfill({status:503,json:{message:'offline'}}):route.fallback());
 const dialog=page.getByRole('dialog',{name:'¿Qué quieres hacer con los cambios?',exact:true});
 await page.getByRole('button',{name:'Mis inspecciones',exact:true}).click();await dialog.getByRole('button',{name:'Descartar cambios',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('Tus cambios siguen aquí');
 // A failed read cannot erase the recovery copy, even after another reload.
 readFails=false;page.once('dialog',native=>native.accept());await page.reload();await openEditor(page);await expect(page.getByLabel('Área e instalación inspeccionada')).toHaveValue('Intento sin confirmar');
 state.failSave=false;await page.getByRole('button',{name:'Mis inspecciones',exact:true}).click();await dialog.getByRole('button',{name:'Descartar cambios',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Mis inspecciones',exact:true})).toBeVisible();await expect(page.locator('.inspection-list-row')).toHaveCount(1);await expect(page.locator('.inspection-list-row')).toContainText('Versión confirmada');
 page.once('dialog',native=>native.accept());await page.reload();await openEditor(page);await expect(page.getByLabel('Área e instalación inspeccionada')).toHaveValue('Versión confirmada');
 expect(state.saves).toBe(1);expect(state.sends).toBe(0);expect([...state.rows.values()].filter(row=>!row.deleted_at)).toHaveLength(1);
});

test('Administración reúne Gestión de Usuarios y Gestión de Inspecciones sin cambiar permisos',async({page,context})=>{
 const state=stateOf();await mock(context,state,author);
 await page.route('**/rest/v1/rpc/berry_admin_dashboard',route=>route.fulfill({json:[]}));await login(page,author);
 await page.locator('.sidebar-nav').getByRole('button',{name:'Administración',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Gestión de Usuarios',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Gestión de Inspecciones',exact:true}).click();await expect(page.getByRole('heading',{name:'Gestión de Inspecciones',exact:true})).toBeVisible();
 await expect(page.getByRole('combobox',{name:'Área',exact:true})).toBeVisible();expect(state.saves).toBe(0);expect(state.sends).toBe(0);
});

test('directorio autenticado muestra área y cargo de los inspectores sin cuadro de correo y conserva el correo al guardar',async({page,context})=>{
 const state=stateOf();await mock(context,state,author);await enter(page,author);
 await expect(page.locator('.primary-inspector-field').getByText('SIGMA — Supervisora',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Añadir inspector',exact:true}).click();
 const extra=page.locator('.general-inspectors .additional-inspector');await extra.getByRole('combobox').fill('Bruno');await page.getByRole('option',{name:/Bruno Responsable/}).click();
 await expect(extra.getByText('Mantenimiento — Jefe',{exact:true})).toBeVisible();await expect(extra.getByRole('textbox',{name:/Correo/})).toHaveCount(0);
 await page.getByRole('button',{name:'Guardar',exact:true}).click();await expect(page.getByText('Guardado en tu cuenta',{exact:true})).toBeVisible();
 const row=[...state.rows.values()].find(row=>!row.data.partial)!;expect(row.data.inspectorEmail).toBe('ana@example.com');expect(row.data.additionalInspectors[0]).toMatchObject({personId:recipient,email:'bruno@example.com',area:'Mantenimiento',jobTitle:'Jefe'});expect(row.code).toBeUndefined();expect(state.sends).toBe(0);
 page.once('dialog',dialog=>dialog.accept());await page.reload();await openEditor(page);await expect(extra.getByRole('combobox')).toHaveValue('Bruno Responsable');await expect(extra.getByText('Mantenimiento — Jefe',{exact:true})).toBeVisible();
});

async function firstLogin(page:Page,actor:string,password='Fictitious!47'){
 await page.goto('./?acceso=cuenta');await page.getByLabel(/^Correo electrónico/).fill(profiles.find(p=>p.id===actor)!.email);await page.getByLabel(/^Contraseña/).fill(password);await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
}

for (const width of [1366,390]) test(`primer perfil exige gerencia, área y puesto, conserva la edición ante fallos y se recuerda en otra sesión y dispositivo (${width}px)`,async({browser,page,context})=>{
 await page.setViewportSize({width,height:900});await mockOrganizationCatalog(page);
 const state=stateOf(),metadata:Record<string,unknown>={berry_profile_setup_required:true};
 const profile=await mock(context,state,recipient,{management:'',area:'',job_title:''},metadata);await firstLogin(page,recipient);
 const management=page.getByRole('combobox',{name:'Gerencia',exact:true}),area=page.getByRole('combobox',{name:'Área',exact:true}),position=page.getByRole('combobox',{name:'Puesto',exact:true});
 const save=page.getByRole('button',{name:'Guardar y continuar',exact:true});
 await expect(page.getByRole('heading',{name:'Mi perfil',exact:true})).toBeVisible();await expect(page.getByText(/Este paso es obligatorio y se solicita una sola vez/)).toBeVisible();
 await expect(page.getByRole('button',{name:'Entrar al espacio de trabajo',exact:true})).toHaveCount(0);await expect(position).toHaveAttribute('aria-required','true');await expect(area).toBeDisabled();await expect(position).toBeDisabled();
 await save.click();await expect(page.getByRole('alert')).toContainText('Selecciona una gerencia');expect(state.profileMetadataUpdates).toHaveLength(0);expect(state.paths).not.toContain('/rest/v1/rpc/berry_cloud_session');
 await selectValue(management,'Gerencia de prueba A');await selectValue(area,'Área de prueba A1');await save.click();await expect(page.getByRole('alert')).toContainText('Selecciona un puesto');
 await selectValue(position,'Puesto de prueba A1');await selectValue(area,'Área de prueba A2');await expect(position).toHaveText('Selecciona un puesto');
 await position.click();await expect(page.getByRole('option',{name:'Puesto de prueba A1',exact:true})).toHaveCount(0);await page.getByRole('searchbox',{name:'Buscar puestos',exact:true}).press('Escape');
 await selectValue(management,'Gerencia de prueba B');await expect(area).toHaveText('Selecciona un área');await expect(position).toBeDisabled();
 await selectValue(area,'Área de prueba B1');await selectValue(position,'Puesto de prueba B1');
 state.profileSaveFails=true;await save.click();await expect(page.getByRole('alert')).toContainText('No se guardó el perfil');expect(metadata.berry_profile_setup_completed_at).toBeUndefined();await expect(position).toHaveText('Puesto de Prueba B1');
 state.profileSaveFails=false;state.profileSetupFails=true;await save.click();await expect(page.getByRole('alert')).toContainText('No pudimos confirmar la configuración');expect(metadata.berry_profile_setup_required).toBe(true);expect(state.paths).not.toContain('/rest/v1/rpc/berry_cloud_session');
 await page.locator('.cloud-account-card').screenshot({path:test.info().outputPath(`perfil-obligatorio-${width}.png`)});
 state.profileSetupFails=false;await save.click();await expect(page.getByRole('heading',{name:'Mis inspecciones',exact:true})).toBeVisible();
 expect(profile).toMatchObject({management:'Gerencia de prueba B',area:'Área de prueba B1',job_title:'Puesto de prueba B1'});expect(metadata.berry_profile_setup_required).toBe(false);expect(typeof metadata.berry_profile_setup_completed_at).toBe('string');expect(state.rows.size).toBe(0);expect(state.saves).toBe(0);expect(state.sends).toBe(0);
 await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click();await page.getByRole('dialog',{name:'¿Estás seguro de salir?',exact:true}).getByRole('button',{name:'Salir',exact:true}).click();await login(page,recipient);
 const device=await browser.newContext();try{await mock(device,state,recipient,profile,metadata);const other=await device.newPage();await mockOrganizationCatalog(other);await login(other,recipient);await expect(other.locator('.cloud-profile-heading')).toHaveCount(0);expect(await other.evaluate(()=>localStorage.getItem('berry-demo-accounts-v1'))).toBeNull();}finally{await device.close();}
});

test('una cuenta nueva con datos precargados confirma Mi perfil después de cambiar la contraseña temporal',async({page,context})=>{
 await mockOrganizationCatalog(page);const state=stateOf(),metadata:Record<string,unknown>={};const profile=await mock(context,state,recipient,{must_change_password:true,management:''},metadata);
 await page.route('**/api/accounts/password',route=>{profile.must_change_password=false;return route.fulfill({json:{ok:true}});});await firstLogin(page,recipient);
 await expect(page.getByRole('heading',{name:'Actualiza tu contraseña',exact:true})).toBeVisible();await expect(page.getByRole('textbox',{name:'Área',exact:true})).toHaveCount(0);
 await page.getByLabel(/^Nueva contraseña/).fill('Personal!Clave47');await page.getByLabel(/^Repite la nueva contraseña/).fill('Personal!Clave47');await page.getByRole('button',{name:'Actualizar contraseña',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Inicia sesión',exact:true})).toBeVisible();expect(metadata.berry_profile_setup_required).toBe(true);
 await firstLogin(page,recipient,'Personal!Clave47');await expect(page.getByRole('heading',{name:'Mi perfil',exact:true})).toBeVisible();await expect(page.getByRole('combobox',{name:'Área',exact:true})).toHaveText('Mantenimiento');
 await selectValue(page.getByRole('combobox',{name:'Gerencia',exact:true}),'Gerencia de prueba B');await selectValue(page.getByRole('combobox',{name:'Área',exact:true}),'Área de prueba B1');await selectValue(page.getByRole('combobox',{name:'Puesto',exact:true}),'Puesto de prueba B1');
 await page.getByRole('button',{name:'Guardar y continuar',exact:true}).click();await expect(page.getByRole('heading',{name:'Mis inspecciones',exact:true})).toBeVisible();
 expect(metadata.berry_profile_setup_required).toBe(false);expect(state.rows.size).toBe(0);
});

test('un perfil incompleto sin confirmación no salta al panel administrativo por un enlace directo',async({page,context})=>{
 await mockOrganizationCatalog(page);const state=stateOf();await mock(context,state,author,{management:'',area:'',job_title:''});await firstLogin(page,author);
 await expect(page.getByRole('heading',{name:'Mi perfil',exact:true})).toBeVisible();await page.goto('./?acceso=cuenta&seccion=usuarios');
 await expect(page.getByRole('heading',{name:'Mi perfil',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Gestión de Usuarios',exact:true})).toHaveCount(0);expect(state.paths.some(path=>path.includes('berry_admin_'))).toBe(false);
 await selectValue(page.getByRole('combobox',{name:'Gerencia',exact:true}),'Gerencia de prueba B');await selectValue(page.getByRole('combobox',{name:'Área',exact:true}),'Área de prueba B1');await selectValue(page.getByRole('combobox',{name:'Puesto',exact:true}),'Puesto de prueba B1');await page.getByRole('button',{name:'Guardar y continuar',exact:true}).click();await expect(page.getByRole('heading',{name:'Mis inspecciones',exact:true})).toBeVisible();
});


test('sin catálogo oficial el primer perfil permanece pendiente y las cuentas anteriores conservan el acceso',async({page,context})=>{
 const state=stateOf();await mock(context,state,author,{management:'',area:'',job_title:''});await firstLogin(page,author);
 await expect(page.getByText('La lista de gerencias, áreas y puestos está pendiente de configuración. Contacta a un administrador para completar tu perfil.',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Guardar y continuar',exact:true})).toBeDisabled();await expect(page.getByRole('combobox',{name:'Gerencia',exact:true})).toBeDisabled();
 await page.goto('./?acceso=cuenta&seccion=panel');await expect(page.getByRole('heading',{name:'Mi perfil',exact:true})).toBeVisible();expect(state.paths).not.toContain('/rest/v1/rpc/berry_cloud_session');expect(state.profileMetadataUpdates).toHaveLength(0);
 await page.getByRole('button',{name:'Cerrar sesión en este dispositivo',exact:true}).click();
 await mock(context,state,author);await login(page,author);await expect(page.getByRole('heading',{name:'Mis inspecciones',exact:true})).toBeVisible();
});
