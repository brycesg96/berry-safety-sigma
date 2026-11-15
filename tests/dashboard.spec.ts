import { organizationLabel } from '../src/organization-label';
import { selectSecondResponsible } from './responsible-fixture';
import { selectValue } from './select-fixture';
import { selectLocation } from './location-fixture';
import { createHash } from 'node:crypto';
import { test, expect } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import type { OrganizationEntry } from '../src/organization-catalog';

const project='https://rwacygoxhkxxxkvushmb.supabase.co', actor='66000000-0000-4000-8000-000000000001', other='66000000-0000-4000-8000-000000000002';
async function setup(page:Page,context:BrowserContext,admin=true,catalog?:OrganizationEntry[]) {
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
  if(path==='/rest/v1/rpc/berry_schema_status')return route.fulfill({json:{schema_version:'202611070001',stage:'reports',sync_ready:true,...(catalog?{organization_catalog_version:'202611150014'}:{})}});
  if(path==='/rest/v1/rpc/berry_organization_catalog')return route.fulfill({json:catalog});
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
test('panel filtra estadísticas y consolidado por fecha, número de registro, área, inspector adicional y responsable; Excel sin imágenes',async({page,context})=>{
 const state=await setup(page,context);await panel(page);
 await expect(page.getByRole('heading',{name:'Observaciones por nivel de riesgo',exact:true})).toHaveCount(0);
 await selectValue(page.getByLabel('Inspector',{exact:true}), 'adicional@example.invalid');await expect(page.locator('.dashboard-results tbody tr')).toHaveCount(1);
 await page.getByRole('button',{name:'Limpiar filtros'}).click();await page.getByLabel('Desde',{exact:true}).fill('2026-11-01');await page.getByLabel('Hasta',{exact:true}).fill('2026-11-30');await expect(page.locator('.dashboard-results tbody tr')).toHaveCount(2);
 await selectValue(page.getByLabel('Área',{exact:true}), 'ss.gg');await expect(page.locator('.dashboard-results tbody tr')).toHaveCount(1);
 await selectValue(page.getByLabel('Responsable del área',{exact:true}), 'responsable@example.invalid');
 await page.getByLabel('Número de registro').fill('001');
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Descargar consolidado'}).click();const file=await download,path=(await file.path())!;
 const book=new ExcelJS.Workbook();await book.xlsx.readFile(path);const sheet=book.getWorksheet('Inspecciones')!;
 expect(sheet.rowCount).toBe(7);expect(sheet.getCell('A7').value).toBe('IH-2026-001');expect(JSON.stringify(book.getWorksheet('Participantes')!.getSheetValues())).toContain('Inspectora adicional');expect(book.getWorksheet('Observaciones')!.rowCount).toBe(7);
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

test('administrador corrige un informe abierto con número de registro y autor intactos, conserva el original ante un fallo y reintenta la misma edición',async({page,context})=>{
 test.setTimeout(90000);const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 const state=await setup(page,context);state.editing=true;await panel(page);
 await page.locator('.dashboard-results tbody tr').filter({hasText:'IH-2026-001'}).getByRole('button',{name:'Revisar',exact:true}).click();
 await page.getByRole('button',{name:'Editar inspección',exact:true}).click();
 const editor=page.locator('.admin-inspection-editor');await expect(editor.getByRole('heading',{name:'Editar inspección',exact:true})).toBeVisible();
 await expect(editor.getByLabel('Responsable de la inspección')).toHaveAttribute('readonly','');
 await editor.getByLabel('Fecha de inspección').fill('2026-11-12');
 await editor.getByRole('button',{name:'Seleccionar sede y zona'}).click();
 await selectLocation(editor, 'Sede', 'Fundo');await selectLocation(editor, 'Zona de inspección', 'Armonía II');await editor.getByLabel('Área e instalación inspeccionada').fill('Taller de Maquinaria');
 await editor.locator('.responsibles').getByRole('combobox',{name:/Nombre completo/}).first().fill('Nueva');await page.getByRole('option',{name:/nueva@example.invalid/}).click();await selectSecondResponsible(page,'admin@example.invalid');
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:test.info().outputPath('editar-telefono.png'),fullPage:true});expect(await page.evaluate(()=>Array.from(document.querySelectorAll('main *')).filter(node=>node.getBoundingClientRect().right>innerWidth+1).map(node=>({tag:node.tagName,cls:node.className,right:node.getBoundingClientRect().right})).slice(0,15))).toEqual([]);
 await editor.getByRole('tab',{name:'Observaciones',exact:true}).click();await editor.getByLabel('Descripción').fill('Descripción corregida por administración');
 await editor.getByRole('tab',{name:'Cierre',exact:true}).click();await editor.getByRole('textbox',{name:'CONCLUSIONES Y RECOMENDACIONES',exact:true}).fill('Nuevo seguimiento verificado.');
 await expect(editor.getByLabel('Fecha', { exact: true })).toHaveValue('2026-11-12');await expect(editor.getByLabel('Fecha', { exact: true })).not.toBeEditable();
 state.failEdit=true;await editor.getByRole('button',{name:'Guardar cambios',exact:true}).click();await expect(editor.getByRole('alert')).toContainText('El informe anterior se conserva');
 expect(state.rows[0].data.area).toBe('Maquinaria - Armonía 2');expect(state.rows[0].data.responsibles[0].personId).toBe(actor);
 expect(state.paths.filter(p=>p.endsWith('berry_prepare_admin_edit'))).toHaveLength(1);
 state.failEdit=false;await editor.getByRole('button',{name:'Reintentar guardado',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Fundo – Armonía II – Taller de Maquinaria',exact:true})).toBeVisible();
 expect(state.editCalls).toBe(2);expect(state.paths.filter(p=>p.endsWith('berry_prepare_admin_edit'))).toHaveLength(1);
 expect(state.rows[0].code).toBe('IH-2026-001');expect(state.rows[0].author_id).toBe(other);expect(state.rows[0].data.inspector).toBe('Ana Torres');expect(state.rows[0].data.responsibles[0].name).toBe('Nueva Responsable');
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Descargar Excel',exact:true}).click();const book=new ExcelJS.Workbook();await book.xlsx.readFile((await (await download).path())!);const sheet=book.worksheets[0];expect(sheet.getCell('B5').text).toBe('IH-2026-001');expect(sheet.getCell('B11').text).toContain('Fundo – Armonía II – Taller de Maquinaria');
 expect(errors).toEqual([]);
 expect(sheet.getCell('D11').text).toBe('12/11/2026');expect(sheet.getCell('H34').text).toBe('Fecha: 12/11/2026');
});
test('edición cancelada no escribe y un informe cerrado no ofrece editar',async({page,context})=>{
 const state=await setup(page,context);state.editing=true;await panel(page);
 await page.locator('.dashboard-results tbody tr').filter({hasText:'IH-2026-001'}).getByRole('button',{name:'Revisar',exact:true}).click();await page.getByRole('button',{name:'Editar inspección',exact:true}).click();
 await page.locator('.admin-inspection-editor').getByRole('textbox',{name:'Objetivo de la inspección interna',exact:true}).fill('Edición descartada');
 await page.locator('.admin-inspection-editor').getByRole('button',{name:'Cancelar',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Volver al informe',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Maquinaria - Armonía 2',exact:true})).toBeVisible();expect(state.paths.some(p=>p.endsWith('berry_prepare_admin_edit'))).toBe(false);
 await page.getByRole('button',{name:'Volver',exact:true}).click();await page.locator('.dashboard-results tbody tr').filter({hasText:'IH-2026-003'}).getByRole('button',{name:'Revisar',exact:true}).click();await expect(page.getByRole('button',{name:'Editar inspección',exact:true})).toHaveCount(0);expect(state.editCalls).toBe(0);
});

test('eliminar desde la última columna confirma, conserva los otros números de registro y actualiza estadísticas, filtros y caché',async({page,context})=>{
 const state=await setup(page,context);await panel(page);await expect(page.getByText('Consolidado en Excel (.xlsx), sin imágenes.',{exact:true})).toHaveCount(0);
 expect(await page.locator('.dashboard-results th').allTextContents()).toEqual(['Número de registro / Fecha','Área e instalación inspeccionada','Inspector','Responsable del área','Estado','Descargas','Eliminar']);
 const first=page.locator('.dashboard-results tbody tr').filter({hasText:'IH-2026-002'});await first.getByRole('button',{name:'Eliminar inspección IH-2026-002',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Eliminar inspección',exact:true});await expect(dialog).toContainText('Su número permanecerá reservado');await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();expect(state.deletes).toHaveLength(0);
 await first.getByRole('button',{name:'Eliminar inspección IH-2026-002',exact:true}).click();state.deleteFailure=true;await dialog.getByRole('button',{name:'Eliminar inspección',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('Actualiza el panel');await expect(first).toHaveCount(1);
 state.deleteFailure=false;await dialog.getByRole('button',{name:'Eliminar inspección',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(page.locator('.dashboard-results tbody tr')).toHaveCount(2);await expect(page.getByRole('status')).toContainText('IH-2026-002 eliminada');
 expect(state.rows.map(r=>r.code)).toEqual(['IH-2026-001','IH-2026-003']);await expect(page.getByRole('button',{name:'Filtrar mes 2026-12: 1 inspecciones',exact:true})).toHaveCount(0);
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Descargar consolidado'}).click();const book=new ExcelJS.Workbook();await book.xlsx.readFile((await (await download).path())!);expect(book.getWorksheet('Inspecciones')!.getColumn(1).values.filter(value=>typeof value==='string'&&/^IH-/.test(value))).toEqual(['IH-2026-001','IH-2026-003']);
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

test('el consolidado conserva la medida correctiva e incluye las acciones y los comentarios en Seguimiento',async({page,context})=>{
 const state=await setup(page,context);const report=state.rows[0];const observation=report.data.observations[0];
 report.data.delivery.corrections[observation.id]={responsibleName:'Responsable',action:'Texto privado de la acción realizada.',note:'Mensaje privado de revisión.',date:'2026-11-11',state:'Ejecutado',decision:'approved',photos:[]};
 await panel(page);const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Descargar consolidado',exact:true}).click();const file=await pending;
 const book=new ExcelJS.Workbook();await book.xlsx.readFile((await file.path())!);const sheet=book.getWorksheet('Observaciones')!,text=JSON.stringify(sheet.getSheetValues());
 expect(text).toContain(observation.correctiveAction);const follow=JSON.stringify(book.getWorksheet('Seguimiento')!.getSheetValues());for(const value of ['Texto privado de la acción realizada.','Mensaje privado de revisión.','Acción realizada','Comentario del revisor'])expect(follow).toContain(value);
 expect(report.data.delivery.corrections[observation.id].action).toBe('Texto privado de la acción realizada.');
});

for (const width of [1366,390]) test(`gerencias combinan filtros y estadísticas, sin duplicar una inspección por sus responsables (${width}px)`,async({page,context})=>{
 await page.setViewportSize({width,height:900});const state=await setup(page,context);
 state.rows[0].data.areaLocation={site:'Fundo',zone:'Armonía II',detail:'Taller',management:'Gerencia de prueba A'};
 state.rows[0].data.responsibles[0].management='Gerencia anterior del responsable';
 state.rows[1].data.responsibles[0].management='Gerencia de prueba A';
 state.rows[1].data.responsibles.push({id:'second',name:'Segunda persona',email:'segunda@example.invalid',area:'Recursos Humanos',management:'Gerencia de prueba A'},{id:'third',name:'Tercera persona',email:'tercera@example.invalid',area:'Área exclusiva B',management:'Gerencia de prueba B'});
 await panel(page);const rows=page.locator('.dashboard-results tbody tr'),chart=page.locator('.dashboard-chart').filter({has:page.getByRole('heading',{name:'Inspecciones por gerencia',exact:true})});
 await expect(chart.getByRole('button',{name:'Filtrar gerencia ' + organizationLabel('Gerencia de prueba A'),exact:true})).toContainText('2');
 await expect(chart.getByRole('button',{name:'Filtrar gerencia ' + organizationLabel('Gerencia de prueba B'),exact:true})).toContainText('1');
 await expect(chart.getByRole('button',{name:'Filtrar gerencia ' + 'Sin gerencia registrada',exact:true})).toContainText('1');
 await expect(chart.getByRole('button',{name:'Filtrar gerencia ' + organizationLabel('Gerencia anterior del responsable'),exact:true})).toHaveCount(0);
 await page.getByLabel('Gerencia',{exact:true}).click();await page.getByRole('searchbox',{name:'Buscar gerencias',exact:true}).fill('prueba a');await page.getByRole('option',{name:organizationLabel('Gerencia de prueba A'),exact:true}).click();await expect(rows).toHaveCount(2);
 await selectValue(page.getByLabel('Área',{exact:true}),'area exclusiva b');await expect(rows).toHaveCount(0);
 await selectValue(page.getByLabel('Gerencia',{exact:true}),'gerencia de prueba b');await expect(rows).toHaveCount(1);await expect(rows).toContainText('IH-2026-002');
 await page.getByRole('button',{name:'Limpiar filtros',exact:true}).click();await chart.getByRole('button',{name:'Filtrar gerencia ' + 'Sin gerencia registrada',exact:true}).click();await expect(rows).toHaveCount(1);await expect(rows).toContainText('IH-2026-003');
 await page.getByRole('button',{name:'Limpiar filtros',exact:true}).click();await chart.getByRole('button',{name:'Filtrar gerencia ' + organizationLabel('Gerencia de prueba A'),exact:true}).click();await page.getByLabel('Desde',{exact:true}).fill('2026-12-01');await page.getByLabel('Hasta',{exact:true}).fill('2026-12-31');await expect(rows).toHaveCount(1);
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Descargar consolidado',exact:true}).click();const book=new ExcelJS.Workbook();await book.xlsx.readFile((await (await download).path())!);expect(book.getWorksheet('Inspecciones')!.rowCount).toBe(7);expect(book.getWorksheet('Inspecciones')!.getCell('A7').text).toBe('IH-2026-002');
 await page.getByRole('button',{name:'Limpiar filtros',exact:true}).click();await page.locator('.dashboard-charts').screenshot({path:test.info().outputPath(`gerencias-${width}.png`)});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

for (const width of [1366,390]) test(`la tabla muestra ocho filas completas y permite recorrer el resto sin limitar el consolidado (${width}px)`,async({page,context})=>{
 await page.setViewportSize({width,height:900});const state=await setup(page,context);const original=state.rows[0];
 state.rows=Array.from({length:12},(_,n)=>{const row=structuredClone(original);row.id=`67000000-0000-4000-8000-${String(n+1).padStart(12,'0')}`;row.code=`IH-2026-${String(n+1).padStart(3,'0')}`;row.data.id=row.id;row.data.serverRegistration={...row.data.serverRegistration,inspectionId:row.id,code:row.code};row.data.inspector=n%2?'Inspectora con nombres y apellidos de varias líneas para comprobar la altura de cada fila':'Ana Torres';return row;});
 await page.getByRole('button',{name:'Gestión de Inspecciones',exact:true}).click();await expect(page.locator('.dashboard-results tbody tr')).toHaveCount(12);
 const region=page.getByRole('region',{name:'Lista de inspecciones registradas',exact:true});
 const dimensions=()=>region.evaluate(el=>{const rows=el.querySelectorAll('tbody tr'),top=el.getBoundingClientRect().top;return{overflow:el.scrollHeight>el.clientHeight,eighthBottom:rows[7]?.getBoundingClientRect().bottom-top,ninthTop:rows[8]?.getBoundingClientRect().top-top,height:el.clientHeight,scroll:el.scrollTop};});
 await expect.poll(async()=>{const d=await dimensions();return d.overflow&&d.eighthBottom<=d.height+1&&d.ninthTop>=d.height-1;}).toBe(true);
 await region.focus();await region.press('End');await expect.poll(async()=>(await dimensions()).scroll).toBeGreaterThan(0);
 expect(await region.evaluate(el=>Math.abs(el.querySelector('th')!.getBoundingClientRect().top-el.getBoundingClientRect().top))).toBeLessThan(2);
 await expect.poll(()=>region.evaluate(el=>el.querySelector('tbody tr:last-child')!.getBoundingClientRect().bottom-el.getBoundingClientRect().top<=el.clientHeight+1)).toBe(true);
 await page.getByLabel('Número de registro').fill('IH-2026-001');await expect(page.locator('.dashboard-results tbody tr')).toHaveCount(1);await expect.poll(()=>region.evaluate(el=>el.scrollHeight<=el.clientHeight+1)).toBe(true);
 await page.getByRole('button',{name:'Limpiar filtros',exact:true}).click();await expect(page.locator('.dashboard-results tbody tr')).toHaveCount(12);
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Descargar consolidado',exact:true}).click();const book=new ExcelJS.Workbook();await book.xlsx.readFile((await (await download).path())!);expect(book.getWorksheet('Inspecciones')!.rowCount).toBe(18);
 await region.evaluate(el=>{el.scrollTop=0;});await region.screenshot({path:test.info().outputPath(`ocho-inspecciones-${width}.png`)});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

for (const width of [1366,390]) test(`los filtros agrupan el regreso de la misma persona y distinguen otra identidad con nombre y correo iguales (${width}px)`,async({page,context})=>{
 await page.setViewportSize({width,height:900});const state=await setup(page,context);
 const accounts=['65000000-0000-4000-8000-000000000001','65000000-0000-4000-8000-000000000002','65000000-0000-4000-8000-000000000003'];
 const persons=['64000000-0000-4000-8000-000000000001','64000000-0000-4000-8000-000000000001','64000000-0000-4000-8000-000000000002'];
 state.rows.forEach((row,n)=>{row.author_id=accounts[n];row.data.ownerId=accounts[n];row.data.inspector='Persona Coincidente';row.data.inspectorEmail='misma@example.invalid';row.data.additionalInspectors=[];row.data.responsibles=[{id:accounts[n],personId:accounts[n],name:'Persona Coincidente',email:'misma@example.invalid',area:'Área de prueba'}];row.identityLinks={[accounts[n]]:{personId:persons[n],name:'Persona Coincidente',email:'misma@example.invalid',management:'Gerencia de prueba',area:'Área de prueba',current:n===2,createdAt:'2026-11-01T12:00:00Z'}};});
 await panel(page);await page.getByRole('combobox',{name:'Inspector',exact:true}).click();const options=page.getByRole('option');await expect(options).toHaveCount(2);const labels=await options.allTextContents();expect(new Set(labels).size).toBe(2);expect(labels.some(label=>label.includes('cuenta actual'))).toBe(true);expect(labels.some(label=>label.includes('registro anterior'))).toBe(true);expect(labels.some(label=>persons.some(id=>label.includes(id)))).toBe(false);
 await page.getByRole('option').filter({hasText:'registro anterior'}).click();await page.getByRole('button',{name:'Listo',exact:true}).click();await expect(page.locator('.dashboard-results tbody tr')).toHaveCount(2);await expect(page.locator('.dashboard-results tbody')).not.toContainText('IH-2026-003');
 await selectValue(page.getByRole('combobox',{name:'Responsable del área',exact:true}),persons[2]);await expect(page.locator('.dashboard-results tbody tr')).toHaveCount(0);
 await page.getByRole('combobox',{name:'Inspector',exact:true}).click();await page.getByRole('button',{name:'Limpiar selección',exact:true}).click();await page.getByRole('button',{name:'Listo',exact:true}).click();await expect(page.locator('.dashboard-results tbody tr')).toHaveCount(1);await expect(page.locator('.dashboard-results tbody')).toContainText('IH-2026-003');
 await page.locator('.dashboard-filters').screenshot({path:test.info().outputPath(`identidades-${width}.png`)});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('los filtros de gerencia y área siguen el orden administrativo y conservan las opciones históricas',async({page,context})=>{
 const catalog=[
  {management:'Gerencia Zeta',areas:['Producción'],positions:{'Producción':['Jefa de Producción']}},
  {management:'Gerencia Alfa',areas:['Recursos Humanos'],positions:{'Recursos Humanos':['Jefa de Recursos Humanos']}},
 ];
 const state=await setup(page,context,true,catalog);
 state.rows[0].data.areaLocation={management:'Gerencia Alfa'};
 state.rows[1].data.areaLocation={management:'Gerencia Alfa'};
 state.rows[2].data.areaLocation={management:'Gerencia Zeta'};
 await panel(page);await page.getByRole('combobox',{name:'Gerencia',exact:true}).click();
 await expect(page.getByRole('listbox').locator('[role="option"]:not([data-value=""])')).toHaveText(['Gerencia Zeta','Gerencia Alfa']);
 await page.keyboard.press('Escape');await page.getByRole('combobox',{name:'Área',exact:true}).click();
 await expect(page.getByRole('listbox').locator('[role="option"]:not([data-value=""])')).toHaveText(['Producción','Recursos Humanos','SS.GG']);
 await page.keyboard.press('Escape');catalog.reverse();await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await page.getByRole('combobox',{name:'Gerencia',exact:true}).click();
 await expect(page.getByRole('listbox').locator('[role="option"]:not([data-value=""])')).toHaveText(['Gerencia Alfa','Gerencia Zeta']);
});

test('el nuevo consolidado corporativo incluye los parámetros y el seguimiento sin imágenes y conserva los datos fuente',async({page,context})=>{
 const state=await setup(page,context),report=state.rows[0],data=report.data,observation=data.observations[0];
 data.areaLocation={site:'Fundo',zone:'Armonía II',management:'GERENCIA DE PRODUCCION',department:'PRODUCCION ARANDANOS',departmentNomenclature:'PROD',detail:'Taller de Maquinaria',source:'catalog',textOrder:'site-zone-area',installationPending:false};
 data.area='Fundo – Armonía II – PROD – Taller de Maquinaria';data.type='Otro';data.otherType='Inspección de seguimiento';data.facility='Unidad operativa de prueba';
 data.responsibles[0]={...data.responsibles[0],management:'GERENCIA DE RECURSOS HUMANOS',area:'SEGURIDAD INDUSTRIAL Y GESTION MEDIO AMBIENTAL',areaNomenclature:'SIGMA',jobTitle:'SUPERVISOR SIGMA'};
 data.registrationDetails={[other]:{jobTitle:'Supervisor de Seguridad',date:'2026-11-08',signature:{id:'sign',name:'Firma',data:'IMAGEN_NO_EXPORTAR'}}};
 data.registrationParticipants=[{id:'registrant',personId:'registrant',name:'Registrante de Prueba',email:'registro@example.invalid',management:'GERENCIA DE PRODUCCION',area:'PRODUCCION ARANDANOS',jobTitle:'Jefa de Producción'}];
 data.observations.push({...observation,id:'second-observation',description:'Segunda observación sin avance.',severity:'baja',correctiveAction:'Verificar la condición.',dueDate:'2026-11-20',photos:[]});
 data.observations[0].photos=[{id:'photo',name:'Evidencia',data:'IMAGEN_NO_EXPORTAR'}];
 data.delivery.corrections[observation.id]={actorId:actor,responsibleName:'Responsable del área',action:'Se señalizó y se corrigió la condición.',note:'Confirmar la verificación final.',date:'2026-11-10',state:'Ejecutado',proposedState:'Ejecutado',decision:'review',photos:[{id:'evidence',name:'Avance',data:'IMAGEN_NO_EXPORTAR'}]};
 data.emailCc=['jefatura@example.invalid'];data.emailDelivery={state:'accepted',requestId:report.id,updatedAt:'2026-11-15T01:30:00Z',message:'Solicitud aceptada.'};
 report.closed_at=null;
 const original=JSON.stringify(state.rows);
 const file=await page.evaluate(async(rows)=>{
  const {buildConsolidated}=await import('/src/dashboard.ts');
  const result=await buildConsolidated(rows,{generatedAt:new Date('2026-11-15T02:00:00Z'),example:true});
  let text='';for(let i=0;i<result.bytes.length;i+=32768)text+=String.fromCharCode(...result.bytes.subarray(i,i+32768));
  return{name:result.name,encoded:btoa(text)};
 },state.rows);
 expect(JSON.stringify(state.rows)).toBe(original);expect(file.name).toBe('CONSOLIDADO_INSPECCIONES_2026-11-14.xlsx');
 const bytes=Buffer.from(file.encoded,'base64'),book=new ExcelJS.Workbook();await book.xlsx.load(bytes as any);
 expect(book.worksheets.map(s=>s.name)).toEqual(['Resumen','Inspecciones','Fichas','Observaciones','Seguimiento','Participantes','Notificaciones']);
 const summary=book.getWorksheet('Resumen')!,inspections=book.getWorksheet('Inspecciones')!,findings=book.getWorksheet('Observaciones')!,follow=book.getWorksheet('Seguimiento')!;
 expect(summary.getCell('A10').value).toBe(3);expect(summary.getCell('D10').value).toBe(4);expect(summary.getCell('G10').value).toBe(2);expect(summary.getCell('J10').value).toBe(1);
 expect(inspections.getCell('A7').value).toBe('IH-2026-001');expect(inspections.getCell('B7').value).toBeInstanceOf(Date);expect(inspections.getCell('B7').numFmt).toBe('dd/mm/yyyy');expect(inspections.getCell('F7').value).toBe('Gerencia de Producción');expect(inspections.getCell('H7').value).toBe('PROD');expect(inspections.getCell('I7').value).toBe('Taller de Maquinaria');expect(inspections.getCell('J7').value).toBe(data.area);
 expect(inspections.views[0]).toMatchObject({state:'frozen',ySplit:6,xSplit:2,showGridLines:false});expect(inspections.autoFilter).toBe('A6:Q9');expect(inspections.getCell('A6').fill).toMatchObject({fgColor:{argb:'FF27674F'}});expect(inspections.getCell('P7').numFmt).toBe('0%');
 expect(findings.rowCount).toBe(10);expect(findings.getCell('E7').value).toBe(observation.description);expect(findings.getCell('G7').value).toBe(observation.correctiveAction);expect(follow.getCell('E7').value).toBe('Se señalizó y se corrigió la condición.');expect(follow.getCell('J7').value).toBe('Confirmar la verificación final.');
 const fichas=JSON.stringify(book.getWorksheet('Fichas')!.getSheetValues());for(const text of [data.objective,data.unfavorableCause,data.closingRemarks,data.otherType,data.company,data.ruc])expect(fichas).toContain(text);
 const people=JSON.stringify(book.getWorksheet('Participantes')!.getSheetValues());for(const text of ['Registrante de Prueba','Supervisor SIGMA','SIGMA','Compañero SIGMA','Responsable del registro'])expect(people).toContain(text);
 const notifications=book.getWorksheet('Notificaciones')!;expect(notifications.getCell('C7').text).toContain(data.inspectorEmail);expect(notifications.getCell('C7').text).toContain(data.responsibles[0].email);expect(notifications.getCell('D7').text).toBe('jefatura@example.invalid');expect(notifications.getCell('G7').text).toMatch(/14\/11\/2026.*20:30/);
 const zip=await JSZip.loadAsync(bytes);expect(Object.keys(zip.files).some(name=>/^xl\/(media|drawings)\//.test(name))).toBe(false);expect((await zip.file('xl/sharedStrings.xml')!.async('string'))).not.toContain('IMAGEN_NO_EXPORTAR');
 await (await import('node:fs/promises')).writeFile(test.info().outputPath('CONSOLIDADO_EJEMPLO.xlsx'),bytes);
});

test('el consolidado guarda el texto que empieza con signo igual como texto y admite informes sin hallazgos',async({page,context})=>{
 const state=await setup(page,context);state.rows[0].data.objective='=HYPERLINK("https://example.invalid","Texto registrado")';state.rows[0].data.observations=[];
 const encoded=await page.evaluate(async(rows)=>{const {buildConsolidated}=await import('/src/dashboard.ts');const result=await buildConsolidated(rows);let text='';for(let i=0;i<result.bytes.length;i+=32768)text+=String.fromCharCode(...result.bytes.subarray(i,i+32768));return btoa(text);},[state.rows[0]]);
 const book=new ExcelJS.Workbook();await book.xlsx.load(Buffer.from(encoded,'base64') as any);
 const fichas=book.getWorksheet('Fichas')!;let objective:ExcelJS.Cell|undefined;fichas.eachRow(row=>{if(row.getCell(1).text==='Objetivo')objective=row.getCell(4);});
 expect(objective!.value).toBe(state.rows[0].data.objective);expect(objective!.type).toBe(ExcelJS.ValueType.String);expect(book.getWorksheet('Inspecciones')!.getCell('P7').value).toBe(0);expect(book.getWorksheet('Observaciones')!.rowCount).toBe(6);
});
