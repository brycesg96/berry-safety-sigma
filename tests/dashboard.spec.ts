import { test, expect } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';

const project='https://rwacygoxhkxxxkvushmb.supabase.co', actor='66000000-0000-4000-8000-000000000001', other='66000000-0000-4000-8000-000000000002';
async function setup(page:Page,context:BrowserContext,admin=true) {
 const profile={id:actor,email:'admin@example.invalid',full_name:'Administradora',area:'Seguridad',job_title:'Supervisora',role:admin?'admin':'inspector',enabled:true,must_change_password:false,can_create_inspections:true,can_receive_inspections:true,access_revision:1};
 const user={id:actor,aud:'authenticated',role:'authenticated',email:profile.email,app_metadata:{provider:'email'},user_metadata:{},identities:[],created_at:new Date().toISOString()};
 const token=`eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({sub:actor,iat:100,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url')}.fictitious`;
 const state={rows:[] as any[],paths:[] as string[],fail:false,delay:null as Promise<void>|null};
 await context.route(`${project}/**`,async route=>{
  const req=route.request(),path=new URL(req.url()).pathname;state.paths.push(path);
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'}});
  if(path==='/auth/v1/token')return route.fulfill({json:{access_token:token,token_type:'bearer',expires_in:3600,refresh_token:'fictitious',user}});
  if(path==='/auth/v1/user')return route.fulfill({json:user});
  if(path==='/auth/v1/logout')return route.fulfill({status:204});
  if(path==='/rest/v1/rpc/berry_schema_status')return route.fulfill({json:{schema_version:'202611070001',stage:'reports',sync_ready:true}});
  if(path==='/rest/v1/berry_profiles')return route.fulfill({json:profile});
  if(path==='/rest/v1/rpc/berry_admin_dashboard'){
   expect(admin).toBe(true);if(state.delay)await state.delay;
   return route.fulfill({status:state.fail?404:200,json:state.fail?{code:'PGRST202'}:state.rows.map(row=>({...row,data:{...row.data,registrationDetails:{},observations:row.data.observations.map((o:any)=>({...o,photos:[]}))}}))});
  }
  if(path==='/rest/v1/rpc/berry_admin_inspection')return route.fulfill({json:state.rows.find(row=>row.id===req.postDataJSON().p_id)});
  throw new Error(`Unexpected operation: ${req.method()} ${path}`);
 });
 await context.route('**/api/**',route=>{throw new Error('Dashboard must not write: '+route.request().url());});
 await page.goto('./?acceso=cuenta');
 state.rows=await page.evaluate(async({actor,other})=>{
  const {newInspection,newObservation}=await import('/src/model.ts');
  return [0,1,2].map((n)=>{
   const id=`67000000-0000-4000-8000-${String(n+1).padStart(12,'0')}`,observation=newObservation(),code=`IH-2026-00${n+1}`;
   const data={...newInspection({name:n===2?'Luis Pérez':'Ana Torres',email:n===2?'luis@example.invalid':'ana@example.invalid',accountId:other}),id,ownerId:other,area:n===2?'Almacén':'Maquinaria - Armonía 2',date:n===0?'2026-11-08':n===1?'2026-12-02':'2026-11-15',type:'Planeada',facility:'Armonía',objective:'Verificar las condiciones de seguridad.',unfavorableCause:'Condición insegura.',closingRemarks:'Realizar seguimiento.',inspectionTime:'09:30',inspectionPeriod:'AM',responsibles:[{id:'responsible',personId:actor,name:'Responsable del área',email:'responsable@example.invalid'}],additionalInspectors:n===0?[{id:'assistant',personId:'assistant',name:'Inspectora adicional',email:'adicional@example.invalid'}]:[],status:'ready',observations:[{...observation,description:'Hallazgo de prueba',correctiveAction:'Aplicar la medida.',dueDate:'2026-11-01',severity:n===2?'alta':'media',photos:[]}],serverRegistration:{inspectionId:id,code,acceptedAt:'2026-11-08T12:00:00Z'},delivery:{sentAt:'2026-11-08T12:00:00Z',recipientIds:[actor],revision:3,corrections:n===2?{[observation.id]:{actorId:actor,responsibleName:'Responsable',action:'Se corrigió.',date:'2026-11-08',photos:[],proposedState:'Ejecutado',state:'Ejecutado',decision:'approved',note:''}}:{}}};
   return{id,author_id:other,code,workflow:n===2?'closed':'sent',revision:3,updated_at:'2026-11-08T12:00:00Z',data};
  });
 },{actor,other});
 await page.getByLabel(/^Correo electrónico/).fill(profile.email);await page.getByLabel(/^Contraseña/).fill('Fictitious!47');await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Tu perfil',exact:true})).toBeVisible();
 return state;
}
async function panel(page:Page){await page.getByRole('button',{name:'Panel de inspecciones',exact:true}).click();await expect(page.locator('.dashboard-results tbody tr')).toHaveCount(3);}
test('panel filtra estadísticas y consolidado por fecha, código, área, inspector adicional y responsable; Excel sin imágenes',async({page,context})=>{
 const state=await setup(page,context);await panel(page);
 await page.getByLabel('Inspector',{exact:true}).selectOption('adicional@example.invalid');await expect(page.locator('.dashboard-results tbody tr')).toHaveCount(1);
 await page.getByRole('button',{name:'Limpiar filtros'}).click();await page.getByLabel('Desde',{exact:true}).fill('2026-11-01');await page.getByLabel('Hasta',{exact:true}).fill('2026-11-30');await expect(page.locator('.dashboard-results tbody tr')).toHaveCount(2);
 await page.getByLabel('Área inspeccionada',{exact:true}).selectOption('maquinaria - armonia 2');await expect(page.locator('.dashboard-results tbody tr')).toHaveCount(1);
 await page.getByLabel('Responsable del área',{exact:true}).selectOption('responsable@example.invalid');
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
 const state=await setup(page,context);await panel(page);await page.getByRole('button',{name:'Tu perfil',exact:true}).click();
 let resume!:()=>void;state.delay=new Promise<void>(resolve=>{resume=resolve;});await page.getByRole('button',{name:'Panel de inspecciones',exact:true}).click();await expect(page.locator('.dashboard-results tbody tr')).toHaveCount(3);resume();state.delay=null;
 await expect(page.getByRole('button',{name:'Actualizar panel'})).toBeEnabled();state.fail=true;await page.getByRole('button',{name:'Actualizar panel'}).click();await expect(page.getByRole('alert')).toContainText('pendiente de activación');await expect(page.locator('.dashboard-results tbody tr')).toHaveCount(0);
});
test('cuenta sin administración no tiene pestaña ni consulta datos del panel',async({page,context})=>{
 const state=await setup(page,context,false);await expect(page.getByRole('button',{name:'Panel de inspecciones',exact:true})).toHaveCount(0);expect(state.paths.some(path=>path.includes('berry_admin_'))).toBe(false);
});
