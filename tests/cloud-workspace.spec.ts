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
const stateOf=()=>({rows:new Map<string,Row>(),files:new Map<string,Buffer>(),documents:new Map<string,any>(),sends:0,saves:0,paths:[] as string[],retired:new Set<string>(),failSave:false,failFinal:false,finalizes:0});
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
    if(path==='/rest/v1/rpc/berry_schema_status')return route.fulfill({json:{schema_version:'202611070001',stage:'reports',sync_ready:true,reports_version:'202611080003'}});
    expect(req.headers().authorization).toBe(`Bearer ${token}`);
    if(path==='/rest/v1/berry_profiles')return route.fulfill({json:url.searchParams.has('id')?profile:profiles.map(p=>p.id===actor?profile:p)});
    if(path==='/rest/v1/berry_shared_texts')return route.fulfill({json:null});
    if(path==='/rest/v1/rpc/berry_cloud_tombstones')return route.fulfill({json:req.postDataJSON().p_ids.filter((id:string)=>state.retired.has(id))});
    if(path==='/rest/v1/rpc/berry_cloud_session')return route.fulfill({json:actor});
    if(path==='/rest/v1/berry_inspections'){
      const id=url.searchParams.get('id')?.slice(3);
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
    expect(req.headers().authorization).toBe(`Bearer ${token}`);expect(actor).toBe(author);
    state.sends++;
    const bytes=registeredExcel(Buffer.from(input.contentBase64,'base64'),'IH-2026-001');
    const hash=createHash('sha256').update(bytes).digest('hex'),name='REG_INS_TALLER NUBE_05.11.2026.xlsx';
    const storage_path=`2026/11-NOVIEMBRE/${row.id}/${hash}/${name}`;
    state.files.set('berry-documents/'+storage_path,bytes);
    const document={filename:name,storage_path,sha256:hash};state.documents.set(row.id,document);
    row.workflow='sent';row.code='IH-2026-001';row.revision++;
    row.data={...row.data,serverRegistration:{inspectionId:row.id,code:row.code,acceptedAt:'2026-11-08T12:00:00Z'},delivery:{sentAt:'2026-11-08T12:00:00Z',recipientIds:[recipient],revision:row.revision,corrections:{}},emailCc:['jefe@example.com'],emailDelivery:{state:'accepted',message:'Informe guardado y envío aceptado.',updatedAt:'2026-11-08T12:00:00Z'}};
    await route.fulfill({json:{ok:true,inspection:row,document}});
  });
}
async function enter(page:Page,actor:string){
  await page.goto('./?acceso=cuenta');await page.getByLabel(/^Correo electrónico/).fill(profiles.find(p=>p.id===actor)!.email);
  await page.getByLabel(/^Contraseña/).fill('Fictitious!47');await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
  await page.getByRole('button',{name:'Entrar al espacio de trabajo'}).click();
  await expect(page.locator('.card-eyebrow')).toBeVisible();
}
test('private drafts resume on another device and full approval replaces the initial Excel with the stored final',async({browser,page,context})=>{
  test.setTimeout(90000);
  const state=stateOf();await mock(context,state,author);await enter(page,author);
  await expect(page.getByText('Modo de prueba',{exact:true})).toHaveCount(0);
  await page.getByLabel('Área inspeccionada').fill('Taller nube');await page.getByLabel('Fecha de inspección').fill('2026-11-05');
  await page.getByLabel('Hora de inspección').fill('09:30');await page.getByLabel('AM o PM').selectOption('AM');await page.getByRole('radio',{name:'Planeada',exact:true}).check();
  await page.getByRole('textbox',{name:'Objetivo de la inspección interna',exact:true}).fill('Comprobar condiciones seguras.');
  await page.getByRole('combobox',{name:/Nombre completo/}).fill('Bruno');await page.getByRole('option',{name:/Bruno Responsable/}).click();
  await page.getByRole('button',{name:'Continuar',exact:true}).click();await page.getByRole('button',{name:'Añadir observación',exact:true}).click();
  await page.getByLabel('Descripción').fill('Protección pendiente.');await page.getByLabel('Acción a tomar').fill('Instalar protección.');await page.getByLabel('Fecha de Cierre').fill('2026-11-20');
  await page.getByLabel('Añadir fotos a observación 1').setInputFiles(png);
  await expect(page.getByText('Guardado en tu cuenta',{exact:true})).toBeVisible();
  const row=[...state.rows.values()].find(r=>!r.data.partial)!;expect(row.data.observations[0].photos[0].dataRef).toBeTruthy();
  expect(state.files.size).toBe(1);expect(await page.evaluate(()=>localStorage.getItem('berry-demo-accounts-v1'))).toBeNull();
  const imageReads=()=>state.paths.filter(path=>path.includes('/object/authenticated/berry-evidence/')).length;
  const reads=imageReads();
  await page.getByRole('button',{name:'Mi perfil',exact:true}).click();await page.getByRole('button',{name:'Ir a mi cuenta',exact:true}).click();
  await page.getByRole('button',{name:'Entrar al espacio de trabajo'}).click();
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
  await other.getByRole('button',{name:'Enviar informe por correo',exact:true}).click();
  await expect(other.getByRole('heading',{name:'Taller nube',exact:true})).toBeVisible();await expect(other.locator('.followup-heading')).toContainText('IH-2026-001');expect(state.sends).toBe(1);
  await other.waitForFunction(()=>window.scrollY===0);
  await other.screenshot({path:'/tmp/berry-cloud-report.png',fullPage:true,animations:'disabled'});
  const downloadPromise=other.waitForEvent('download');await other.getByRole('button',{name:'Descargar Excel',exact:true}).click();const download=await downloadPromise;
  const bytes=await readFile((await download.path())!);expect(bytes.equals(state.files.get('berry-documents/'+state.documents.get(row.id).storage_path)!)).toBe(true);
  // Same recipient device now sees the sent record, without local account switching or copied IndexedDB data.
  await receiver.reload();await receiver.getByRole('button',{name:'Entrar al espacio de trabajo'}).click();
  await receiver.getByRole('button',{name:'Abrir menú',exact:true}).click();await receiver.getByRole('button',{name:/Inspecciones recibidas/}).click();await receiver.getByRole('button',{name:'Revisar inspección',exact:true}).click();
  await expect(receiver.locator('.breadcrumbs')).toContainText('Inspecciones recibidas');await expect(receiver.locator('.breadcrumbs')).toContainText('Pendientes');
  await expect(receiver.getByLabel('Apellidos y nombres del responsable del levantamiento')).toHaveValue('Bruno Responsable');
  expect(await receiver.evaluate(()=>localStorage.getItem('berry-last-submitted-texts'))).toBeNull();
  await receiver.waitForFunction(()=>document.querySelector('.sidebar')!.getBoundingClientRect().right<=0);
  await receiver.screenshot({path:'/tmp/berry-cloud-mobile.png',fullPage:true,animations:'disabled'});
  await receiver.getByLabel('Acción realizada').fill('Protección instalada.');await receiver.getByRole('button',{name:'Enviar a revisión',exact:true}).click();await expect(receiver.getByText('Levantamiento enviado a revisión.',{exact:true})).toBeVisible();
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
  const state=stateOf();await mock(context,state,author);await enter(page,author);await page.getByLabel('Área inspeccionada').fill('Primera versión');await expect(page.getByText('Guardado en tu cuenta',{exact:true})).toBeVisible();
  const device=await browser.newContext();await mock(device,state,author);const second=await device.newPage();await enter(second,author);
  await second.getByLabel('Área inspeccionada').fill('Versión nueva');await expect(second.getByText('Guardado en tu cuenta',{exact:true})).toBeVisible();
  await page.getByLabel('Área inspeccionada').fill('Edición obsoleta');await expect(page.getByText('Sin guardar',{exact:true})).toBeVisible();
  expect([...state.rows.values()][0].data.area).toBe('Versión nueva');await expect(page.getByLabel('Área inspeccionada')).toHaveValue('Edición obsoleta');
  await page.getByRole('button',{name:'Abrir versión guardada',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Abrir versión guardada',exact:true}).click();await expect(page.getByLabel('Área inspeccionada')).toHaveValue('Versión nueva');
  state.failSave=true;await second.getByLabel('Área inspeccionada').fill('Edición sin conexión');await expect(second.getByText('Sin guardar',{exact:true})).toBeVisible();state.failSave=false;
  await second.reload();await second.getByRole('button',{name:'Entrar al espacio de trabajo'}).click();await expect(second.getByLabel('Área inspeccionada')).toHaveValue('Edición sin conexión');await expect(second.getByText('Guardado en tu cuenta',{exact:true})).toBeVisible();
  await device.close();
});


test('un usuario que solo recibe no crea borradores ni ve controles de creación o administración',async({page,context})=>{
  const state=stateOf();await mock(context,state,recipient,{can_create_inspections:false,can_receive_inspections:true,role:'inspector'});
  await page.goto('./?acceso=cuenta');await page.getByLabel(/^Correo electrónico/).fill('bruno@example.com');await page.getByLabel(/^Contraseña/).fill('Fictitious!47');await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
  await page.getByRole('button',{name:'Entrar al espacio de trabajo'}).click();
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
  state.failSave=true;await page.getByLabel('Área inspeccionada').fill('Borrador retirado');
  await expect(page.getByRole('alert').filter({hasText:'No se ha podido guardar el borrador.'})).toBeVisible();
  const pending=await page.evaluate(async()=>{const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('berry-cloud-pending-v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});return new Promise<any[]>(resolve=>{const tx=db.transaction('drafts');const r=tx.objectStore('drafts').getAll();r.onsuccess=()=>resolve(r.result);tx.oncomplete=()=>db.close();});});
  expect(pending.length).toBe(1);state.retired.add(pending[0].id);state.failSave=false;
  page.once('dialog',dialog=>dialog.accept());await page.reload();
  await page.getByRole('button',{name:'Entrar al espacio de trabajo'}).click();
  await expect(page.getByLabel('Área inspeccionada')).toHaveValue('');
  expect(state.rows.has(pending[0].id)).toBe(false);
  expect(state.paths).toContain('/rest/v1/rpc/berry_cloud_tombstones');
});

test('Salir conserva el borrador y no cierra sesión si falla su guardado',async({page,context})=>{
  const state=stateOf();await mock(context,state,author);await enter(page,author);
  state.failSave=true;await page.getByLabel('Área inspeccionada').fill('Borrador antes de salir');
  await page.getByRole('button',{name:'Mi perfil',exact:true}).click();
  await page.getByRole('dialog',{name:'Tu perfil',exact:true}).getByRole('button',{name:'Cerrar sesión',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'¿Estás seguro de salir?',exact:true});
  await dialog.getByRole('button',{name:'Salir',exact:true}).click();
  await expect(dialog.getByRole('alert')).toContainText('No pudimos guardar el borrador');
  expect(state.paths).not.toContain('/auth/v1/logout');
  state.failSave=false;await dialog.getByRole('button',{name:'Salir',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Inicia sesión',exact:true})).toBeVisible();
  expect([...state.rows.values()].some(row=>row.data.area==='Borrador antes de salir')).toBe(true);
  expect(state.paths).toContain('/auth/v1/logout');
});
