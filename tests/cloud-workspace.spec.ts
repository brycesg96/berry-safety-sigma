import { selectValue } from './select-fixture';
import { selectLocation } from './location-fixture';
import { test, expect } from '@playwright/test';
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
const stateOf=()=>({rows:new Map<string,Row>(),files:new Map<string,Buffer>(),documents:new Map<string,any>(),sends:0,saves:0,paths:[] as string[],retired:new Set<string>(),failSave:false,failFinal:false,schemaFails:false,profileFails:false,finalizes:0,nextSequence:null as number|null,previewCalls:0,previewFails:false});
type State=ReturnType<typeof stateOf>;
async function mock(context:BrowserContext,state:State,actor:string,overrides:Partial<typeof profiles[number]>={}) {
  const profile={...profiles.find(p=>p.id===actor)!,...overrides};
  const user={id:actor,aud:'authenticated',role:'authenticated',email:profile.email,email_confirmed_at:new Date().toISOString(),app_metadata:{provider:'email',providers:['email']},user_metadata:{},identities:[],created_at:new Date().toISOString()};
  const token=`eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({sub:actor,iat:100,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url')}.fictitious`;
  const canRead=(row:Row)=>row.author_id===actor||row.workflow!=='draft'&&row.data.delivery?.recipientIds.includes(actor);
  await context.route(`${project}/**`,async route=>{
    const req=route.request(),url=new URL(req.url()),path=decodeURIComponent(url.pathname);state.paths.push(path);
    if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'}});
    expect(req.headers().apikey).toMatch(/^sb_publishable_/);
    if(path==='/auth/v1/token')return route.fulfill({json:{access_token:token,token_type:'bearer',expires_in:3600,refresh_token:'fictitious-refresh',user}});
    if(path==='/auth/v1/user')return route.fulfill({json:user});
    if(path==='/auth/v1/logout')return route.fulfill({status:204});
    if(path==='/rest/v1/rpc/berry_next_registration') { expect(req.headers().authorization).toBe(`Bearer ${token}`);state.previewCalls++;if(state.previewFails)return route.fulfill({status:503,json:{message:'offline'}});const sequence=state.nextSequence??state.sends+1;return route.fulfill({json:{code:`IH-2026-${String(sequence).padStart(3,'0')}`,year:2026,sequence,checked_at:'2026-11-09T12:00:00Z'}}); }
    if(path==='/rest/v1/rpc/berry_schema_status')return route.fulfill({status:state.schemaFails?503:200,json:state.schemaFails?{message:'offline'}:{schema_version:'202611070001',stage:'reports',sync_ready:true,reports_version:'202611080003'}});
    expect(req.headers().authorization).toBe(`Bearer ${token}`);
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
  await expect(page.locator('.card-eyebrow')).toHaveCount(0);expect(state.rows.size).toBe(0);expect(state.previewCalls).toBe(0);
  await page.reload();await expect(page.getByRole('heading',{name:'Mis inspecciones',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>(window as any).profileShown)).toBe(false);
  await page.getByRole('button',{name:'Mi perfil',exact:true}).click();
  const profile=page.getByRole('dialog',{name:'Tu perfil',exact:true});await expect(profile).toContainText(profiles.find(p=>p.id===actor)!.full_name);
  await profile.getByRole('button',{name:'Ir a mi cuenta',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Tu perfil',exact:true})).toBeVisible();await expect(page).toHaveURL(/seccion=perfil/);
  await expect(page.getByLabel('Nombres y apellidos')).toHaveValue(profiles.find(p=>p.id===actor)!.full_name);
  await expect(page.getByRole('button',{name:'Gestión de Cuentas',exact:true})).toHaveCount(actor===author?1:0);
  await expect(page.getByRole('button',{name:'Panel de inspecciones',exact:true})).toHaveCount(actor===author?1:0);
  await page.reload();await expect(page.getByRole('heading',{name:'Tu perfil',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Entrar al espacio de trabajo'}).click();await expect(page.getByRole('heading',{name:'Mis inspecciones',exact:true})).toBeVisible();
  await expect(page).not.toHaveURL(/seccion=/);
  await page.getByRole('button',{name:'Mi perfil',exact:true}).click();await page.getByRole('button',{name:'Ir a mi cuenta',exact:true}).click();
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
  const badge=page.getByRole('textbox',{name:'Código de inspección',exact:true});await expect(badge).toHaveValue('IH-2026-001');
  state.previewFails=true;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(badge).toHaveValue('Por confirmar');const calls=state.previewCalls;
  // Observe a complete normal polling interval: a failed service must not be retried after five seconds.
  await page.waitForTimeout(6000);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));expect(state.previewCalls).toBe(calls);
  state.previewFails=false;state.nextSequence=2;await page.evaluate(()=>window.dispatchEvent(new Event('online')));await expect(badge).toHaveValue('IH-2026-002');expect(state.previewCalls).toBe(calls+1);expect(state.sends).toBe(0);
});

test('private drafts resume on another device and full approval replaces the initial Excel with the stored final',async({browser,page,context})=>{
  test.setTimeout(90000);
  const state=stateOf();await mock(context,state,author);await enter(page,author);
  await expect(page.getByText('Modo de prueba',{exact:true})).toHaveCount(0);
  await page.getByLabel('Área inspeccionada').fill('Taller nube');await page.getByLabel('Fecha de inspección').fill('2026-11-05');
  await selectLocation(page, 'Sede', 'Fundo'); await selectLocation(page, 'Zona de inspección', 'Armonía II');
  await page.getByLabel('Hora de inspección').fill('09:30');await selectValue(page.getByLabel('AM o PM'), 'AM');await page.getByRole('radio',{name:'Planeada',exact:true}).check();
  await page.getByRole('textbox',{name:'Objetivo de la inspección interna',exact:true}).fill('Comprobar condiciones seguras.');
  await page.getByRole('combobox',{name:/Nombre completo/}).fill('Bruno');await page.getByRole('option',{name:/Bruno Responsable/}).click();
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
  await page.getByRole('button',{name:'Mi perfil',exact:true}).click();await page.getByRole('button',{name:'Ir a mi cuenta',exact:true}).click();
  await page.getByRole('button',{name:'Entrar al espacio de trabajo'}).click();
  await openEditor(page);
  await expect(page.locator('.photo-thumb img').first()).toBeVisible();expect(imageReads()).toBe(reads);
  const device=await browser.newContext();await mock(device,state,author);const other=await device.newPage();await enter(other,author);
  await expect(other.getByLabel('Descripción')).toHaveValue('Protección pendiente.');
  await expect(other.locator('.photo-thumb img').first()).toBeVisible();
  const recipientDevice=await browser.newContext({viewport:{width:390,height:844}});await mock(recipientDevice,state,recipient);const receiver=await recipientDevice.newPage();await enter(receiver,recipient);
  await receiver.getByRole('button',{name:'Abrir menú',exact:true}).click();await receiver.getByRole('button',{name:/Inspecciones recibidas/}).click();
  await expect(receiver.getByRole('heading',{name:'No tienes inspecciones recibidas'})).toBeVisible();
  await other.getByRole('button',{name:'Continuar',exact:true}).click();await other.getByRole('button',{name:'Continuar',exact:true}).click();
  await other.getByRole('textbox',{name:'CONCLUSIONES Y RECOMENDACIONES',exact:true}).fill('Gestionar la medida indicada.');
  await expect(other.getByLabel('Puesto',{exact:true})).toHaveValue('Supervisora');await expect(other.getByLabel('Puesto',{exact:true})).toHaveAttribute('readonly','');
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
  await receiver.getByRole('button',{name:'Abrir menú',exact:true}).click();await receiver.getByRole('button',{name:/Inspecciones recibidas/}).click();await receiver.getByRole('button',{name:'Revisar inspección',exact:true}).click();
  await expect(receiver.locator('.breadcrumbs')).toContainText('Inspecciones recibidas');await expect(receiver.locator('.breadcrumbs')).toContainText('Pendientes');
  await expect(receiver.getByLabel('Apellidos y nombres del responsable del levantamiento')).toHaveValue('Bruno Responsable');
  await expect(receiver.getByLabel('Apellidos y nombres del responsable del levantamiento')).toHaveAttribute('readonly','');
  expect(await receiver.evaluate(()=>localStorage.getItem('berry-last-submitted-texts'))).toBeNull();
  await receiver.waitForFunction(()=>document.querySelector('.sidebar')!.getBoundingClientRect().right<=0);
  await receiver.screenshot({path:'/tmp/berry-cloud-mobile.png',fullPage:true,animations:'disabled'});
  await receiver.getByLabel('Acción realizada').fill('Protección instalada.');await receiver.getByRole('button',{name:'Guardar avance',exact:true}).click();await receiver.getByRole('button',{name:'Enviar a revisión',exact:true}).click();await expect(receiver.getByText('Levantamiento enviado a revisión.',{exact:true})).toBeVisible();
  await other.getByRole('button',{name:'Volver',exact:true}).click();await other.getByRole('button',{name:'Revisar informe',exact:true}).click();
  await expect(other.getByLabel('Apellidos y nombres del responsable del levantamiento')).toHaveValue('Bruno Responsable');
  state.failFinal=true;const originalPath=state.documents.get(row.id).storage_path;
  await other.getByRole('button',{name:'Aprobar levantamiento',exact:true}).click();await expect(other.getByText('Inspección cerrada: todos los estados están en Ejecutado.',{exact:true})).toBeVisible();await expect(other.getByRole('button',{name:'Descargar PDF',exact:true})).toBeVisible();
  expect(row.workflow).toBe('closed');expect(row.data.delivery.corrections[row.data.observations[0].id].state).toBe('Ejecutado');
  await expect(other.getByRole('alert')).toContainText('No se pudo guardar el Excel final');expect(state.documents.get(row.id).storage_path).toBe(originalPath);
  state.failFinal=false;await other.getByRole('button',{name:'Reintentar guardar Excel final'}).click();await expect.poll(()=>row.final_excel_stored).toBe(true);
  expect(state.documents.size).toBe(1);expect(state.files.has('berry-documents/'+originalPath)).toBe(false);expect(state.finalizes).toBe(1);expect(state.sends).toBe(1);
  const finalDownloadPromise=other.waitForEvent('download');await other.getByRole('button',{name:'Descargar Excel',exact:true}).click();const finalDownload=await finalDownloadPromise;
  const finalBytes=await readFile((await finalDownload.path())!);expect(finalBytes.equals(state.files.get('berry-documents/'+state.documents.get(row.id).storage_path)!)).toBe(true);
  const archive=await JSZip.loadAsync(finalBytes,{checkCRC32:true});const sheet=await archive.file('xl/worksheets/sheet1.xml')!.async('string');expect(sheet).toContain('Protección instalada.');expect(sheet).toContain('Acción realizada:');expect(sheet).toContain('IH-2026-001');
  await device.close();await recipientDevice.close();
});

test('offline edits stay recoverable and an obsolete device cannot overwrite a newer draft',async({browser,page,context})=>{
  const state=stateOf();await mock(context,state,author);await enter(page,author);await page.getByLabel('Área inspeccionada').fill('Primera versión');await page.getByRole('button',{name:'Guardar',exact:true}).first().click();await expect(page.getByText('Guardado en tu cuenta',{exact:true})).toBeVisible();
  const device=await browser.newContext();await mock(device,state,author);const second=await device.newPage();await enter(second,author);
  await second.getByLabel('Área inspeccionada').fill('Versión nueva');await second.getByRole('button',{name:'Guardar',exact:true}).first().click();await expect(second.getByText('Guardado en tu cuenta',{exact:true})).toBeVisible();
  await page.getByLabel('Área inspeccionada').fill('Edición obsoleta');await page.getByRole('button',{name:'Guardar',exact:true}).first().click();await expect(page.getByText('Cambios sin guardar',{exact:true})).toBeVisible();
  expect([...state.rows.values()][0].data.area).toBe('Versión nueva');await expect(page.getByLabel('Área inspeccionada')).toHaveValue('Edición obsoleta');
  await page.getByRole('button',{name:'Abrir versión guardada',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Abrir versión guardada',exact:true}).click();await expect(page.getByLabel('Área inspeccionada')).toHaveValue('Versión nueva');
  state.failSave=true;await second.getByLabel('Área inspeccionada').fill('Edición sin conexión');await second.getByRole('button',{name:'Guardar',exact:true}).first().click();await expect(second.getByText('Cambios sin guardar',{exact:true})).toBeVisible();state.failSave=false;
  await second.reload();await openEditor(second);await expect(second.getByLabel('Área inspeccionada')).toHaveValue('Edición sin conexión');await second.getByRole('button',{name:'Guardar',exact:true}).first().click();await expect(second.getByText('Guardado en tu cuenta',{exact:true})).toBeVisible();
  await device.close();
});


test('un usuario que solo recibe no crea borradores ni ve controles de creación o administración',async({page,context})=>{
  const state=stateOf();await mock(context,state,recipient,{can_create_inspections:false,can_receive_inspections:true,role:'inspector'});
  await page.goto('./?acceso=cuenta');await page.getByLabel(/^Correo electrónico/).fill('bruno@example.com');await page.getByLabel(/^Contraseña/).fill('Fictitious!47');await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Mis inspecciones',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Inspecciones recibidas',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Inspecciones recibidas',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Nueva inspección',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Gestión de Cuentas',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Mis inspecciones',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Mis inspecciones',exact:true})).toBeVisible();
  expect(state.rows.size).toBe(0);expect(state.saves).toBe(0);
  await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click();await page.getByRole('button',{name:'Salir',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Inicia sesión',exact:true})).toBeVisible();
});

test('un borrador pendiente retirado por el administrador o el reinicio no reaparece al recargar',async({page,context})=>{
  const state=stateOf();await mock(context,state,author);await enter(page,author);
  state.failSave=true;await page.getByLabel('Área inspeccionada').fill('Borrador retirado');await page.getByRole('button',{name:'Guardar',exact:true}).first().click();
  await expect(page.getByRole('alert').filter({hasText:'No se pudo confirmar el guardado del borrador.'})).toBeVisible();
  const pending=await page.evaluate(async()=>{const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('berry-cloud-pending-v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});return new Promise<any[]>(resolve=>{const tx=db.transaction('drafts');const r=tx.objectStore('drafts').getAll();r.onsuccess=()=>resolve(r.result);tx.oncomplete=()=>db.close();});});
  expect(pending.length).toBe(1);state.retired.add(pending[0].id);state.failSave=false;
  page.once('dialog',dialog=>dialog.accept());await page.reload();
  await openEditor(page);
  await expect(page.getByLabel('Área inspeccionada')).toHaveValue('');
  expect(state.rows.has(pending[0].id)).toBe(false);
  expect(state.paths).toContain('/rest/v1/rpc/berry_cloud_tombstones');
});

test('Salir advierte cambios pendientes sin guardar automáticamente ni cerrar sesión',async({page,context})=>{
  const state=stateOf();await mock(context,state,author);await enter(page,author);
  state.failSave=true;await page.getByLabel('Área inspeccionada').fill('Borrador antes de salir');
  await page.getByRole('button',{name:'Mi perfil',exact:true}).click();
  await page.getByRole('dialog',{name:'Tu perfil',exact:true}).getByRole('button',{name:'Cerrar sesión',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'¿Estás seguro de salir?',exact:true});
  await dialog.getByRole('button',{name:'Salir',exact:true}).click();
  await expect(dialog.getByRole('alert')).toContainText('Hay cambios sin guardar');expect(state.saves).toBe(0);
  expect(state.paths).not.toContain('/auth/v1/logout');
  state.failSave=false;await dialog.getByRole('button',{name:'Seguir en la aplicación'}).click();await page.getByRole('button',{name:'Guardar',exact:true}).first().click();await expect(page.getByText('Guardado en tu cuenta',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click();await page.getByRole('dialog',{name:'¿Estás seguro de salir?',exact:true}).getByRole('button',{name:'Salir',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Inicia sesión',exact:true})).toBeVisible();
  expect([...state.rows.values()].some(row=>row.data.area==='Borrador antes de salir')).toBe(true);
  expect(state.paths).toContain('/auth/v1/logout');
});

test('siguiente correlativo compartido se refresca al recibir foco y cada cinco segundos sin reservar ni alterar el borrador',async({browser,page,context})=>{
 test.setTimeout(60000);const state=stateOf();state.nextSequence=21;await mock(context,state,author);await enter(page,author);
 const badge=page.getByRole('textbox',{name:'Código de inspección',exact:true});await expect(badge).toHaveValue('IH-2026-021');await expect(badge).toHaveAttribute('readonly','');
 await page.getByRole('textbox',{name:'Objetivo de la inspección interna',exact:true}).fill('Objetivo que debe conservarse.');await page.getByRole('button',{name:'Guardar',exact:true}).first().click();await expect(page.getByText('Guardado en tu cuenta',{exact:true})).toBeVisible();
 const row=[...state.rows.values()].find(row=>row.author_id===author&&!row.data.partial)!;expect(row.code).toBeUndefined();expect(row.data.serverRegistration).toBeUndefined();expect(row.data.registrationNumber).toBe('');expect(state.sends).toBe(0);
 const second=await browser.newContext();try {
  await mock(second,state,recipient);const other=await second.newPage();await enter(other,recipient);await expect(other.getByRole('textbox',{name:'Código de inspección',exact:true})).toHaveValue('IH-2026-021');
  state.nextSequence=22;await page.bringToFront();await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(badge).toHaveValue('IH-2026-022');
  state.nextSequence=23;await expect(badge).toHaveValue('IH-2026-023',{timeout:7500});await expect(page.getByRole('textbox',{name:'Objetivo de la inspección interna',exact:true})).toHaveValue('Objetivo que debe conservarse.');
  await other.bringToFront();await other.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(other.getByRole('textbox',{name:'Código de inspección',exact:true})).toHaveValue('IH-2026-023');
  state.previewFails=true;await page.bringToFront();await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(badge).toHaveValue('Por confirmar');
  state.previewFails=false;state.nextSequence=24;await page.evaluate(()=>window.dispatchEvent(new Event('online')));await expect(badge).toHaveValue('IH-2026-024');expect(state.sends).toBe(0);expect(row.data.objective).toBe('Objetivo que debe conservarse.');
 }finally{await second.close();}
});

test('guardado manual: escribir y navegar no escriben; Guardar conserva el borrador y el código sigue pendiente',async({page,context})=>{
 const state=stateOf();await mock(context,state,author);await enter(page,author);
 await page.getByLabel('Área inspeccionada').fill('Borrador manual');
 await page.waitForTimeout(1200);expect(state.rows.size).toBe(0);expect(state.saves).toBe(0);expect(state.files.size).toBe(0);
 await page.getByRole('button',{name:'Mis inspecciones',exact:true}).click();await expect(page.getByText(/Hay cambios sin guardar/)).toBeVisible();await expect(page.getByLabel('Área inspeccionada')).toHaveValue('Borrador manual');
 await page.getByRole('button',{name:'Guardar',exact:true}).first().click();await expect(page.getByText('Guardado en tu cuenta',{exact:true})).toBeVisible();expect(state.saves).toBe(1);
 const row=[...state.rows.values()].find(r=>!r.data.partial)!;expect(row.data.area).toBe('Borrador manual');expect(row.code).toBeUndefined();expect(state.sends).toBe(0);
 await page.getByRole('button',{name:'Mis inspecciones',exact:true}).click();await page.reload();await openEditor(page);await expect(page.getByLabel('Área inspeccionada')).toHaveValue('Borrador manual');
 await page.waitForTimeout(1200);expect(state.saves).toBe(1);
});

test('editar durante Guardar mantiene el cambio nuevo pendiente hasta el siguiente guardado explícito',async({page,context})=>{
 const state=stateOf();await mock(context,state,author);await enter(page,author);
 let release!:()=>void;const held=new Promise<void>(resolve=>release=resolve);let waiting=false;
 await page.route('**/rest/v1/rpc/berry_save_draft',async route=>{waiting=true;await held;await route.fallback();});
 await page.getByLabel('Área inspeccionada').fill('Primera edición');await page.getByRole('button',{name:'Guardar',exact:true}).first().click();await expect.poll(()=>waiting).toBe(true);
 await page.getByLabel('Área inspeccionada').fill('Segunda edición');release();await expect.poll(()=>state.saves).toBe(1);
 await expect(page.getByText('Cambios sin guardar',{exact:true})).toBeVisible();await page.waitForTimeout(1200);expect(state.saves).toBe(1);
 await page.getByRole('button',{name:'Guardar',exact:true}).first().click();await expect(page.getByText('Guardado en tu cuenta',{exact:true})).toBeVisible();expect(state.saves).toBe(2);expect([...state.rows.values()].find(r=>!r.data.partial)!.data.area).toBe('Segunda edición');
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
 await page.getByLabel('Área inspeccionada').fill('Intento recuperable tras tiempo agotado');
 await page.getByRole('button',{name:'Guardar',exact:true}).first().click();
 await expect(page.getByRole('button',{name:'Guardando…',exact:true})).toBeVisible();
 await expect(page.getByRole('alert').filter({hasText:'No se pudo confirmar el guardado'})).toBeVisible({timeout:35000});
 await expect(page.getByRole('button',{name:'Guardar',exact:true}).first()).toBeEnabled();
 await expect(page.getByLabel('Área inspeccionada')).toHaveValue('Intento recuperable tras tiempo agotado');
 expect(await page.evaluate(()=>(window as any).stalledSaveAttempts())).toBe(1);expect(state.saves).toBe(0);
 await page.getByLabel('Área inspeccionada').fill('Cambio nuevo que elijo descartar');
 await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'¿Estás seguro de salir?',exact:true});
 await expect(dialog).toContainText('los datos ya guardados se conservan');
 await dialog.getByRole('button',{name:'Salir sin guardar',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Inicia sesión',exact:true})).toBeVisible();
 await enter(page,author);await expect(page.getByLabel('Área inspeccionada')).toHaveValue('Intento recuperable tras tiempo agotado');
 await expect(page.getByText('Cambios sin guardar',{exact:true})).toBeVisible();expect(state.saves).toBe(0);
});


test('Enviar guarda sin un Guardar previo y dos cuentas reciben 051 y 052 según el orden de envío',async({browser,page,context})=>{
 test.setTimeout(60000);const state=stateOf();state.nextSequence=51;await mock(context,state,author);await enter(page,author);
 const device=await browser.newContext();try {
  await mock(device,state,recipient);const other=await device.newPage();await enter(other,recipient);
  for(const current of [page,other])await expect(current.getByRole('textbox',{name:'Código de inspección',exact:true})).toHaveValue('IH-2026-051');
  async function complete(current:Page,responsible:string){
   await current.getByLabel('Área inspeccionada').fill('Taller nube');await selectLocation(current,'Sede','Fundo');await selectLocation(current,'Zona de inspección','Armonía II');
   await current.getByLabel('Hora de inspección').fill('09:30');await selectValue(current.getByLabel('AM o PM'), 'AM');await current.getByRole('radio',{name:'Planeada',exact:true}).check();
   await current.getByRole('textbox',{name:'Objetivo de la inspección interna',exact:true}).fill('Objetivo guardado al enviar.');
   await current.getByRole('combobox',{name:/Nombre completo/}).fill(responsible);await current.getByRole('option',{name:new RegExp(responsible)}).click();
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
  for(const row of state.rows.values()){expect(row.data.closingRemarks).toBe('Última edición antes del envío.');expect(row.data.observations[0].description).toBe('Hallazgo guardado al enviar.');expect(row.data.delivery.recipientIds).toHaveLength(1);}
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
