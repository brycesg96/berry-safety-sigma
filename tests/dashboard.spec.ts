import { selectValue } from './select-fixture';
import { selectLocation } from './location-fixture';
import { createHash } from 'node:crypto';
import { test, expect } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';

const project='https://rwacygoxhkxxxkvushmb.supabase.co', actor='66000000-0000-4000-8000-000000000001', other='66000000-0000-4000-8000-000000000002';
async function setup(page:Page,context:BrowserContext,admin=true) {
 const profile={id:actor,email:'admin@example.invalid',full_name:'Administradora',area:'Seguridad',job_title:'Supervisora',role:admin?'admin':'inspector',enabled:true,must_change_password:false,can_create_inspections:true,can_receive_inspections:true,access_revision:1};
 const user={id:actor,aud:'authenticated',role:'authenticated',email:profile.email,app_metadata:{provider:'email'},user_metadata:{},identities:[],created_at:new Date().toISOString()};
 const token=`eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({sub:actor,iat:100,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url')}.fictitious`;
 const state={rows:[] as any[],paths:[] as string[],fail:false,delay:null as Promise<void>|null, editing:false, prepared:null as any, failEdit:false, editCalls:0,editBytes:null as Buffer|null,editDocument:null as any, deletes:[] as any[], deleteFailure:false};
 const newRecipient={...profile,id:'66000000-0000-4000-8000-000000000003',full_name:'Nueva Responsable',email:'nueva@example.invalid',role:'inspector'};
 await context.route(`${project}/**`,async route=>{
  const req=route.request(),path=new URL(req.url()).pathname;state.paths.push(path);
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'}});
  if(path==='/auth/v1/token')return route.fulfill({json:{access_token:token,token_type:'bearer',expires_in:3600,refresh_token:'fictitious',user}});
  if(path==='/auth/v1/user')return route.fulfill({json:user});
  if(path==='/auth/v1/logout')return route.fulfill({status:204});
  if(path==='/rest/v1/rpc/berry_schema_status')return route.fulfill({json:{schema_version:'202611070001',stage:'reports',sync_ready:true}});
  if(path==='/rest/v1/berry_profiles')return route.fulfill({json:new URL(req.url()).searchParams.has('id')?profile:[profile,newRecipient]});
  if(path==='/rest/v1/berry_documents' && state.editDocument)return route.fulfill({json:state.editDocument});
  if(path.includes('/storage/v1/object/') && state.editBytes)return route.fulfill({body:state.editBytes,contentType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  if(path==='/rest/v1/rpc/berry_admin_dashboard'){
   expect(admin).toBe(true);if(state.delay)await state.delay;
   return route.fulfill({status:state.fail?404:200,json:state.fail?{code:'PGRST202'}:state.rows.map(row=>({...row,data:{...row.data,registrationDetails:{},observations:row.data.observations.map((o:any)=>({...o,photos:[]}))}}))});
  }
  if(path==='/rest/v1/rpc/berry_prepare_admin_edit') {
   expect(admin && state.editing).toBe(true);const body=req.postDataJSON(),row=state.rows.find(r=>r.id===body.p_id);
   expect(body.p_expected).toBe(row.revision);expect(body.p_data.ownerId).toBe(other);expect(body.p_data.inspector).toBe(row.data.inspector);
   state.prepared={operation:body.p_operation,row:{...row,data:{...body.p_data,ownerId:other,inspector:row.data.inspector,inspectorEmail:row.data.inspectorEmail,serverRegistration:row.data.serverRegistration,delivery:{...row.data.delivery,recipientIds:body.p_data.responsibles.map((p:any)=>p.personId)}}}};
   return route.fulfill({json:{state:'prepared',operation_id:body.p_operation,inspection:state.prepared.row}});
  }
  if(path==='/rest/v1/rpc/berry_admin_inspection')return route.fulfill({json:state.rows.find(row=>row.id===req.postDataJSON().p_id)});
  throw new Error(`Unexpected operation: ${req.method()} ${path}`);
 });
 await context.route('**/api/**',async route=>{
  if(state.editing && new URL(route.request().url()).pathname==='/api/reports/revise') {
   state.editCalls++;const body=route.request().postDataJSON();expect(body.operationId).toBe(state.prepared.operation);
   if(state.failEdit)return route.fulfill({status:503,json:{ok:false,code:'EDIT_ARCHIVE_FAILED',message:'No se pudo guardar el Excel actualizado. El informe anterior se conserva; vuelve a intentarlo.'}});
   state.editBytes=Buffer.from(body.contentBase64,'base64');state.editDocument={filename:'EDITADO.xlsx',storage_path:'test-edit.xlsx',sha256:createHash('sha256').update(state.editBytes).digest('hex')};
   const row={...state.prepared.row,revision:state.prepared.row.revision+1};state.rows=state.rows.map(r=>r.id===row.id?row:r);
   return route.fulfill({json:{ok:true,inspection:row,document:{filename:'EDITADO.xlsx'}}});
  }
  if(new URL(route.request().url()).pathname==='/api/accounts/inspections/delete') {
   expect(admin).toBe(true);const body=route.request().postDataJSON();state.deletes.push(body);const row=state.rows.find(r=>r.id===body.id);expect(body.expectedRevision).toBe(row.revision);
   if(state.deleteFailure)return route.fulfill({status:409,json:{ok:false,message:'La inspección cambió. Actualiza el panel.'}});
   state.rows=state.rows.filter(r=>r.id!==body.id);return route.fulfill({json:{ok:true,inspection:{id:body.id,code:row.code,deleted:true}}});
  }
  throw new Error('Dashboard must not write: '+route.request().url());
 });
 await page.goto('./?acceso=cuenta&seccion=perfil');
 state.rows=await page.evaluate(async({actor,other})=>{
  const {newInspection,newObservation}=await import('/src/model.ts');
  return [0,1,2].map((n)=>{
   const id=`67000000-0000-4000-8000-${String(n+1).padStart(12,'0')}`,observation=newObservation(),code=`IH-2026-00${n+1}`;
   const data={...newInspection({name:n===2?'Luis Pérez':'Ana Torres',email:n===2?'luis@example.invalid':'ana@example.invalid',accountId:other}),id,ownerId:other,area:n===2?'Almacén':'Maquinaria - Armonía 2',date:n===0?'2026-11-08':n===1?'2026-12-02':'2026-11-15',type:'Planeada',facility:'Armonía',objective:'Verificar las condiciones de seguridad.',unfavorableCause:'Condición insegura.',closingRemarks:'Realizar seguimiento.',inspectionTime:'09:30',inspectionPeriod:'AM',responsibles:[{id:'responsible',personId:actor,name:'Responsable del área',email:'responsable@example.invalid',area:n===0?'SS.GG':n===1?'Recursos Humanos':'Producción'}],additionalInspectors:n===0?[{id:'assistant',personId:'assistant',name:'Inspectora adicional',email:'adicional@example.invalid'}]:[],status:'ready',observations:[{...observation,description:'Hallazgo de prueba',correctiveAction:'Aplicar la medida.',dueDate:'2026-11-01',severity:n===2?'alta':'media',photos:[]}],serverRegistration:{inspectionId:id,code,acceptedAt:'2026-11-08T12:00:00Z'},delivery:{sentAt:'2026-11-08T12:00:00Z',recipientIds:[actor],revision:3,corrections:n===2?{[observation.id]:{actorId:actor,responsibleName:'Responsable',action:'Se corrigió.',date:'2026-11-08',photos:[],proposedState:'Ejecutado',state:'Ejecutado',decision:'approved',note:''}}:{}}};
   return{id,author_id:other,code,workflow:n===2?'closed':'sent',revision:3,updated_at:'2026-11-08T12:00:00Z',data};
  });
 },{actor,other});
 await page.getByLabel(/^Correo electrónico/).fill(profile.email);await page.getByLabel(/^Contraseña/).fill('Fictitious!47');await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Mi perfil',exact:true})).toBeVisible();
 return state;
}
async function panel(page:Page){await page.getByRole('button',{name:'Gestión de Inspecciones',exact:true}).click();await expect(page.locator('.dashboard-results tbody tr')).toHaveCount(3);}
test('panel filtra estadísticas y consolidado por fecha, código, área, inspector adicional y responsable; Excel sin imágenes',async({page,context})=>{
 const state=await setup(page,context);await panel(page);
 await selectValue(page.getByLabel('Inspector',{exact:true}), 'adicional@example.invalid');await expect(page.locator('.dashboard-results tbody tr')).toHaveCount(1);
 await page.getByRole('button',{name:'Limpiar filtros'}).click();await page.getByLabel('Desde',{exact:true}).fill('2026-11-01');await page.getByLabel('Hasta',{exact:true}).fill('2026-11-30');await expect(page.locator('.dashboard-results tbody tr')).toHaveCount(2);
 await selectValue(page.getByLabel('Área',{exact:true}), 'ss.gg');await expect(page.locator('.dashboard-results tbody tr')).toHaveCount(1);
 await selectValue(page.getByLabel('Responsable del área',{exact:true}), 'responsable@example.invalid');
 await page.getByLabel('Código de inspección').fill('001');
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Descargar consolidado'}).click();const file=await download,path=(await file.path())!;
 const book=new ExcelJS.Workbook();await book.xlsx.readFile(path);const sheet=book.getWorksheet('Inspecciones')!;
 expect(sheet.rowCount).toBe(2);expect(sheet.getCell('A2').value).toBe('IH-2026-001');expect(sheet.getCell('F2').value).toContain('Inspectora adicional');expect(book.getWorksheet('Observaciones')!.rowCount).toBe(2);
 expect(Object.keys((await JSZip.loadAsync(await (await import('node:fs/promises')).readFile(path))).files).some(name=>name.startsWith('xl/media/'))).toBe(false);
 expect(state.paths.some(path=>path.includes('/storage/'))).toBe(false);
 await page.getByRole('button',{name:'Limpiar filtros'}).click();await page.getByRole('button',{name:'Filtrar mes 2026-12: 1 inspecciones',exact:true}).click();await expect(page.locator('.dashboard-results tbody tr')).toHaveCount(1);await expect(page.getByLabel('Desde',{exact:true})).toHaveValue('2026-12-01');
 await page.getByLabel('Desde',{exact:true}).fill('2027-01-01');await expect(page.getByRole('alert')).toContainText('fecha inicial');await expect(page.getByRole('button',{name:'Descargar consolidado'})).toBeDisabled();
});
test('consulta y descargas de un informe ajeno cerrado no modifican el informe ni envían correo y el panel funciona en teléfono',async({page,context})=>{
 const state=await setup(page,context);await panel(page);await page.screenshot({path:test.info().outputPath('panel-escritorio.png'),fullPage:true});await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:test.info().outputPath('panel-telefono.png'),fullPage:true});
 const closed=page.locator('.dashboard-results tbody tr').filter({hasText:'IH-2026-003'});await closed.getByRole('button',{name:'Revisar',exact:true}).click();
 await expect(page.getByText('Consulta del informe',{exact:true})).toBeVisible();await expect(page.getByLabel('Acción realizada',{exact:false})).toHaveAttribute('readonly','');
 await expect(page.getByRole('button',{name:/Guardar avance|Enviar a revisión|Aprobar levantamiento|Reintentar guardar Excel final/})).toHaveCount(0);
 const excel=page.waitForEvent('download');await page.getByRole('button',{name:'Descargar Excel',exact:true}).click();expect((await excel).suggestedFilename()).toContain('ALMACÉN');
 const pdf=page.waitForEvent('download');await page.getByRole('button',{name:'Descargar PDF',exact:true}).click();expect((await pdf).suggestedFilename()).toMatch(/\.pdf$/);
 expect(state.paths.filter(path=>path.includes('/rpc/')).every(path=>['/rest/v1/rpc/berry_admin_dashboard','/rest/v1/rpc/berry_admin_inspection','/rest/v1/rpc/berry_schema_status'].includes(path))).toBe(true);
 await page.getByRole('button',{name:'Volver',exact:true}).click();await expect(page.locator('.dashboard-results tbody tr')).toHaveCount(3);
});
test('caché del panel mantiene los datos al cambiar de sección y un rechazo de permisos los retira',async({page,context})=>{
 const state=await setup(page,context);await panel(page);await page.getByRole('button',{name:'Mi perfil',exact:true}).click();
 let resume!:()=>void;state.delay=new Promise<void>(resolve=>{resume=resolve;});await page.getByRole('button',{name:'Gestión de Inspecciones',exact:true}).click();await expect(page.locator('.dashboard-results tbody tr')).toHaveCount(3);resume();state.delay=null;
 await expect(page.getByRole('button',{name:'Actualizar panel'})).toBeEnabled();state.fail=true;await page.getByRole('button',{name:'Actualizar panel'}).click();await expect(page.getByRole('alert')).toContainText('pendiente de activación');await expect(page.locator('.dashboard-results tbody tr')).toHaveCount(0);
});
test('cuenta sin administración no tiene pestaña ni consulta datos del panel',async({page,context})=>{
 const state=await setup(page,context,false);await expect(page.getByRole('button',{name:'Gestión de Inspecciones',exact:true})).toHaveCount(0);expect(state.paths.some(path=>path.includes('berry_admin_'))).toBe(false);
});

test('administrador corrige un informe abierto con código y autor intactos, conserva el original ante un fallo y reintenta la misma edición',async({page,context})=>{
 test.setTimeout(90000);const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 const state=await setup(page,context);state.editing=true;await panel(page);
 await page.locator('.dashboard-results tbody tr').filter({hasText:'IH-2026-001'}).getByRole('button',{name:'Revisar',exact:true}).click();
 await page.getByRole('button',{name:'Editar inspección',exact:true}).click();
 const editor=page.locator('.admin-inspection-editor');await expect(editor.getByRole('heading',{name:'Editar inspección',exact:true})).toBeVisible();
 await expect(editor.getByLabel('Responsable de la inspección')).toHaveAttribute('readonly','');
 await editor.getByRole('button',{name:'Actualizar sede y zona'}).click();
 await selectLocation(editor, 'Sede', 'Fundo');await selectLocation(editor, 'Zona de inspección', 'Armonía II');await editor.getByLabel('Área inspeccionada').fill('Taller de Maquinaria');
 await editor.locator('.responsibles').getByRole('combobox',{name:/Nombre completo/}).first().fill('Nueva');await page.getByRole('option',{name:/nueva@example.invalid/}).click();
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:test.info().outputPath('editar-telefono.png'),fullPage:true});expect(await page.evaluate(()=>Array.from(document.querySelectorAll('main *')).filter(node=>node.getBoundingClientRect().right>innerWidth+1).map(node=>({tag:node.tagName,cls:node.className,right:node.getBoundingClientRect().right})).slice(0,15))).toEqual([]);
 await editor.getByRole('tab',{name:'Observaciones',exact:true}).click();await editor.getByLabel('Descripción').fill('Descripción corregida por administración');
 await editor.getByRole('tab',{name:'Cierre',exact:true}).click();await editor.getByRole('textbox',{name:'CONCLUSIONES Y RECOMENDACIONES',exact:true}).fill('Nuevo seguimiento verificado.');
 state.failEdit=true;await editor.getByRole('button',{name:'Guardar cambios',exact:true}).click();await expect(editor.getByRole('alert')).toContainText('El informe anterior se conserva');
 expect(state.rows[0].data.area).toBe('Maquinaria - Armonía 2');expect(state.rows[0].data.responsibles[0].personId).toBe(actor);
 expect(state.paths.filter(p=>p.endsWith('berry_prepare_admin_edit'))).toHaveLength(1);
 state.failEdit=false;await editor.getByRole('button',{name:'Reintentar guardado',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Fundo – Armonía II – Taller de Maquinaria',exact:true})).toBeVisible();
 expect(state.editCalls).toBe(2);expect(state.paths.filter(p=>p.endsWith('berry_prepare_admin_edit'))).toHaveLength(1);
 expect(state.rows[0].code).toBe('IH-2026-001');expect(state.rows[0].author_id).toBe(other);expect(state.rows[0].data.inspector).toBe('Ana Torres');expect(state.rows[0].data.responsibles[0].name).toBe('Nueva Responsable');
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Descargar Excel',exact:true}).click();const book=new ExcelJS.Workbook();await book.xlsx.readFile((await (await download).path())!);const sheet=book.worksheets[0];expect(sheet.getCell('B5').text).toBe('IH-2026-001');expect(sheet.getCell('B11').text).toContain('Fundo – Armonía II – Taller de Maquinaria');
 expect(errors).toEqual([]);
});
test('edición cancelada no escribe y un informe cerrado no ofrece editar',async({page,context})=>{
 const state=await setup(page,context);state.editing=true;await panel(page);
 await page.locator('.dashboard-results tbody tr').filter({hasText:'IH-2026-001'}).getByRole('button',{name:'Revisar',exact:true}).click();await page.getByRole('button',{name:'Editar inspección',exact:true}).click();
 await page.locator('.admin-inspection-editor').getByLabel('Área inspeccionada').fill('Edición descartada');
 await page.locator('.admin-inspection-editor').getByRole('button',{name:'Cancelar',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Volver al informe',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Maquinaria - Armonía 2',exact:true})).toBeVisible();expect(state.paths.some(p=>p.endsWith('berry_prepare_admin_edit'))).toBe(false);
 await page.getByRole('button',{name:'Volver',exact:true}).click();await page.locator('.dashboard-results tbody tr').filter({hasText:'IH-2026-003'}).getByRole('button',{name:'Revisar',exact:true}).click();await expect(page.getByRole('button',{name:'Editar inspección',exact:true})).toHaveCount(0);expect(state.editCalls).toBe(0);
});

test('eliminar desde la última columna confirma, conserva los otros códigos y actualiza estadísticas, filtros y caché',async({page,context})=>{
 const state=await setup(page,context);await panel(page);await expect(page.getByText('Consolidado en Excel (.xlsx), sin imágenes.',{exact:true})).toHaveCount(0);
 expect(await page.locator('.dashboard-results th').allTextContents()).toEqual(['Código / Fecha','Área inspeccionada','Inspector','Responsable del área','Estado','Descargas','Eliminar']);
 const first=page.locator('.dashboard-results tbody tr').filter({hasText:'IH-2026-002'});await first.getByRole('button',{name:'Eliminar inspección IH-2026-002',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Eliminar inspección',exact:true});await expect(dialog).toContainText('Su número permanecerá reservado');await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();expect(state.deletes).toHaveLength(0);
 await first.getByRole('button',{name:'Eliminar inspección IH-2026-002',exact:true}).click();state.deleteFailure=true;await dialog.getByRole('button',{name:'Eliminar inspección',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('Actualiza el panel');await expect(first).toHaveCount(1);
 state.deleteFailure=false;await dialog.getByRole('button',{name:'Eliminar inspección',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(page.locator('.dashboard-results tbody tr')).toHaveCount(2);await expect(page.getByRole('status')).toContainText('IH-2026-002 eliminada');
 expect(state.rows.map(r=>r.code)).toEqual(['IH-2026-001','IH-2026-003']);await expect(page.getByRole('button',{name:'Filtrar mes 2026-12: 1 inspecciones',exact:true})).toHaveCount(0);
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Descargar consolidado'}).click();const book=new ExcelJS.Workbook();await book.xlsx.readFile((await (await download).path())!);expect(book.getWorksheet('Inspecciones')!.getColumn(1).values.filter(Boolean)).toEqual(['Código','IH-2026-001','IH-2026-003']);
 await page.getByRole('button',{name:'Mi perfil',exact:true}).click();await page.getByRole('button',{name:'Gestión de Inspecciones',exact:true}).click();await expect(page.locator('.dashboard-results tbody tr')).toHaveCount(2);await expect(page.getByText('IH-2026-002',{exact:true})).toHaveCount(0);
});


test('filtros con búsqueda y varias personas usan las áreas de cada responsable, combinan criterios y funcionan con teclado en móvil',async({page,context})=>{
 const state=await setup(page,context);
 state.rows[0].data.responsibles.push({id:'juan',name:'Juan López',email:'juan@example.invalid',area:'SS.GG'},{id:'maria',name:'María de Recursos Humanos',email:'maria@example.invalid',area:'Recursos Humanos'});
 state.rows[2].data.responsibles[0]={...state.rows[2].data.responsibles[0],name:'Rocío Producción',email:'rocio@example.invalid'};
 await panel(page);const rows=page.locator('.dashboard-results tbody tr');
 const areaChart=page.locator('.dashboard-chart').filter({has:page.getByRole('heading',{name:'Inspecciones por área responsable',exact:true})});
 await expect(areaChart.getByRole('button',{name:'Filtrar área SS.GG',exact:true})).toContainText('1');
 await expect(areaChart.getByRole('button',{name:'Filtrar área Recursos Humanos',exact:true})).toContainText('2');
 await page.getByLabel('Inspector',{exact:true}).click();const search=page.getByRole('searchbox',{name:'Buscar inspectores',exact:true});
 await search.fill('adicion');await page.getByRole('option',{name:/Inspectora adicional/}).click();await expect(rows).toHaveCount(1);
 await search.fill('luis');await page.getByRole('option',{name:/Luis Pérez/}).click();await expect(rows).toHaveCount(2);await page.getByRole('button',{name:'Listo',exact:true}).click();
 await page.getByLabel('Responsable del área',{exact:true}).click();const responsibleSearch=page.getByRole('searchbox',{name:'Buscar responsables',exact:true});
 await responsibleSearch.fill('juan lopez');await page.getByRole('option',{name:/Juan López/}).click();await expect(rows).toHaveCount(1);
 await responsibleSearch.fill('rocio');await page.getByRole('option',{name:/Rocío Producción/}).click();await expect(rows).toHaveCount(2);await page.getByRole('button',{name:'Listo',exact:true}).click();
 await selectValue(page.getByLabel('Área',{exact:true}),'ss.gg');await expect(rows).toHaveCount(1);await expect(rows).toContainText('IH-2026-001');
 await selectValue(page.getByLabel('Área',{exact:true}),'recursos humanos');await expect(rows).toHaveCount(0);
 await page.getByLabel('Responsable del área',{exact:true}).click();await page.getByRole('button',{name:'Limpiar selección',exact:true}).click();await page.getByRole('button',{name:'Listo',exact:true}).click();await expect(rows).toHaveCount(1);
 await page.getByRole('button',{name:'Limpiar filtros',exact:true}).click();await expect(rows).toHaveCount(3);
 await page.getByLabel('Área',{exact:true}).click();expect(await page.getByRole('option').allTextContents()).not.toContain('Maquinaria - Armonía 2');await page.getByRole('searchbox',{name:'Buscar áreas',exact:true}).press('Escape');
 await page.setViewportSize({width:390,height:844});await page.getByLabel('Inspector',{exact:true}).click();await search.fill('adicional');await search.press('Enter');
 await expect(page.getByRole('option',{name:/Inspectora adicional/})).toHaveAttribute('aria-selected','true');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:test.info().outputPath('filtro-inspectores-movil.png'),fullPage:true});await search.press('Escape');await expect(page.getByLabel('Inspector',{exact:true})).toBeFocused();await expect(rows).toHaveCount(1);
 await rows.getByRole('button',{name:'Eliminar inspección IH-2026-001',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Eliminar inspección',exact:true}).click();await expect(rows).toHaveCount(0);
 await expect(page.getByLabel('Inspector',{exact:true})).toHaveText('adicional@example.invalid');await page.getByLabel('Inspector',{exact:true}).click();await page.getByRole('button',{name:'Limpiar selección',exact:true}).click();await page.getByRole('button',{name:'Listo',exact:true}).click();await expect(rows).toHaveCount(2);
});

test('el consolidado conserva la medida correctiva y excluye los textos internos del levantamiento y del revisor',async({page,context})=>{
 const state=await setup(page,context);const report=state.rows[0];const observation=report.data.observations[0];
 report.data.delivery.corrections[observation.id]={responsibleName:'Responsable',action:'Texto privado de la acción realizada.',note:'Mensaje privado de revisión.',date:'2026-11-11',state:'Ejecutado',decision:'approved',photos:[]};
 await panel(page);const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Descargar consolidado',exact:true}).click();const file=await pending;
 const book=new ExcelJS.Workbook();await book.xlsx.readFile((await file.path())!);const sheet=book.getWorksheet('Observaciones')!,text=JSON.stringify(sheet.getSheetValues());
 expect(text).toContain(observation.correctiveAction);for(const value of ['Texto privado de la acción realizada.','Mensaje privado de revisión.','Acción realizada','Comentario del revisor'])expect(text).not.toContain(value);
 expect(report.data.delivery.corrections[observation.id].action).toBe('Texto privado de la acción realizada.');
});
