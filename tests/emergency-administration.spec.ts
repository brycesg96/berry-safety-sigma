import { test, expect } from './test-fixture';
import type { Page } from '@playwright/test';
import ExcelJS from 'exceljs';
import { mockEmergency, equipment } from './emergency-fixture';
import { safetyArea, safetyManagement } from './safety-fixture';
import type { EmergencyInspection } from '../src/emergency-equipment';
import { expectAccessible } from './accessibility-fixture';
const origin='https://rwacygoxhkxxxkvushmb.supabase.co';
type State=Awaited<ReturnType<typeof mockEmergency>>;
function review(state:State,id:string,date='2026-11-25',patch:Partial<EmergencyInspection>={}):EmergencyInspection{
 return {id,equipment_id:state.equipment[0].id,management_id:safetyManagement,area_id:safetyArea,inspector_id:null,worker_name:'Camila Revisora',employee_code:'0007',submission_source:'guest',inspection_date:date,state:'operational',notes:'=Dato de prueba',equipment_snapshot:equipment({serial_number:'SERIE-ANTES',location:'Ubicación capturada'}),signature_path:'private/no-download.png',photos:[],created_at:date+'T15:00:00Z',...patch};
}
async function prepare(context:Parameters<typeof mockEmergency>[0],admin=true){
 const state=await mockEmergency(context,admin,true);
 await context.route(origin+'/rest/v1/rpc/berry_admin_organization',route=>route.fulfill({json:state.safety.catalog.flatMap(m=>[{id:m.id,name:m.name},...m.areas])}));
 return state;
}
async function open(page:Page){
 await page.goto('./?acceso=cuenta&seccion=extintores');
 await page.getByLabel(/^Correo electrónico/).fill('seguridad@example.invalid');await page.getByLabel(/^Contraseña/).fill('Fictitious!47');await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
}
function cell(sheet:ExcelJS.Worksheet,row:number,label:string){
 let column=0;sheet.getRow(5).eachCell((value,index)=>{if(value.text===label)column=index;});expect(column,label).toBeGreaterThan(0);return sheet.getCell(row,column);
}
function seed(state:State){
 const owner=state.safety.catalog[1];
 state.equipment[0]=equipment({code:'LGC-100',serial_number:'000637',owner_management_id:owner.id,owner_name:owner.name,last_hydro_date:null,next_hydro_date:null,last_hydro_year:2022,next_hydro_year:2027,revision:1});
 state.equipment.push(equipment({id:'ed000000-0000-4000-8000-000000000002',code:'EXT-200',enabled:false}));
 state.legacy.push({id:'ee000000-0000-4000-8000-000000000001',equipment_id:state.equipment[0].id,source_row:100,official_date:'2026-10-06',previous_date:'2026-09-10',state_original:'OPERATIVO',notes:'Nota de origen',inspector_code:'OLD-007',months:{Noviembre:'2026-10-06',Enero:'12 enero 2025'},original:{'N° DE EXTINTOR':'LGC-100','N° SERIE':'000637','FECHA DE INSPECCIÓN':'2026-10-06T00:00:00','Noviembre':'2026-10-06T00:00:00','Enero':'12 enero 2025'},imported_at:'2026-11-27T15:00:00Z'});
 state.inspections.push(review(state,'eb000000-0000-4000-8000-000000000001','2025-12-31'),review(state,'eb000000-0000-4000-8000-000000000002','2026-11-10'),review(state,'eb000000-0000-4000-8000-000000000003'));
}
for(const width of [1440,768,390])test('Administración descarga una base anual real sin cargar el inventario ni Excel al entrar ('+width+'px)',async({page,context})=>{
 const state=await prepare(context);seed(state);await page.setViewportSize({width,height:1000});await page.emulateMedia({reducedMotion:'reduce'});
 await page.addInitScript(()=>{const NativeWorker=window.Worker;(window as any).exportWorkers=0;window.Worker=class extends NativeWorker{constructor(url:string|URL,options?:WorkerOptions){super(url,options);(window as any).exportWorkers++;}};});
 await open(page);await expect(page.getByRole('heading',{name:'Gestión de Extintores',exact:true})).toBeVisible();
 const button=page.getByRole('button',{name:'Descargar base en Excel',exact:true});await expect(button).toBeEnabled();
 expect(state.requests.filter(r=>r.path.endsWith('berry_emergency_equipment')||r.path.endsWith('berry_emergency_legacy_records')||r.path.endsWith('berry_emergency_inspections'))).toHaveLength(0);expect(await page.evaluate(()=>(window as any).exportWorkers)).toBe(0);
 await expectAccessible(page);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:test.info().outputPath('administracion-extintores-'+width+'.png'),fullPage:true});
 const downloaded=page.waitForEvent('download');await button.click();const file=await downloaded;expect(file.suggestedFilename()).toBe('BASE_EXTINTORES_BERRY_2026.xlsx');
 const book=new ExcelJS.Workbook();await book.xlsx.readFile((await file.path())!);
 expect(book.worksheets.map(s=>s.name)).toEqual(['Resumen','Inventario 2026','Inspecciones Berry','Antecedentes Migrados']);
 const inventory=book.getWorksheet('Inventario 2026')!;expect(inventory.rowCount).toBe(7);
 expect(cell(inventory,6,'N° de Extintor').text).toBe('EXT-200');expect(cell(inventory,6,'Estado del Catálogo').text).toBe('Retirado / Deshabilitado');
 const row=7;expect(cell(inventory,row,'N° de Serie').value).toBe('000637');expect(cell(inventory,row,'Gerencia Responsable').text).toBe('ADMINISTRACION');expect(cell(inventory,row,'Gerencia Usuaria').text).toBe('OPERACIONES');
 expect(cell(inventory,row,'Última Prueba Hidrostática').value).toBe(2022);expect(cell(inventory,row,'Próxima Prueba Hidrostática').value).toBe(2027);
 expect((cell(inventory,row,'Fecha de Última Inspección').value as Date).toISOString().slice(0,10)).toBe('2026-11-25');expect(cell(inventory,row,'Responsable de la Última Inspección').text).toBe('Camila Revisora');
 expect((cell(inventory,row,'Octubre').value as Date).toISOString().slice(0,10)).toBe('2026-10-06');expect((cell(inventory,row,'Noviembre').value as Date).toISOString().slice(0,10)).toBe('2026-11-25');expect(cell(inventory,row,'Enero').text).toBe('');
 const details=book.getWorksheet('Inspecciones Berry')!;expect(details.rowCount).toBe(7);expect(cell(details,6,'Serie Registrada').text).toBe('SERIE-ANTES');expect(cell(details,6,'Legajo').value).toBe('0007');expect(cell(details,6,'Observaciones').type).toBe(ExcelJS.ValueType.String);
 expect(JSON.stringify(book.getWorksheet('Antecedentes Migrados')!.getSheetValues())).toContain('12 enero 2025');
 expect(await page.evaluate(()=>(window as any).exportWorkers)).toBe(1);expect(state.requests.some(r=>r.path.includes('/storage/'))).toBe(false);
 expect(state.requests.every(r=>!r.body||r.path.includes('/rpc/'))).toBe(true);await expect(page.getByRole('status')).toContainText('2 equipos y 2 inspecciones');
 await expect(page.getByRole('link',{name:/Volver a descargar/})).toBeVisible();await expectAccessible(page);
});
test('la base incluye más de mil equipos y revisiones mediante páginas estables',async({page,context})=>{
 const state=await prepare(context);state.equipment=[];
 for(let index=1;index<=1003;index++){
  const id='ed000000-0000-4000-8000-'+String(index).padStart(12,'0'),item=equipment({id,code:'EXT-'+String(index).padStart(4,'0'),serial_number:'00'+index});state.equipment.push(item);
  state.inspections.push(review(state,'eb000000-0000-4000-8000-'+String(index).padStart(12,'0'),'2026-11-25',{equipment_id:id,equipment_snapshot:item,notes:''}));
 }
 await open(page);const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'Descargar base en Excel',exact:true}).click();const book=new ExcelJS.Workbook();await book.xlsx.readFile((await (await downloaded).path())!);
 expect(book.getWorksheet('Inventario 2026')!.rowCount).toBe(1008);expect(book.getWorksheet('Inspecciones Berry')!.rowCount).toBe(1008);
 expect(state.requests.filter(r=>r.path.endsWith('berry_emergency_equipment')&&new URLSearchParams(r.query).has('id')).length).toBeGreaterThanOrEqual(8);
 expect(state.requests.filter(r=>r.path.endsWith('berry_emergency_inspections')&&new URLSearchParams(r.query).get('select')?.includes('notes')&&new URLSearchParams(r.query).get('id')?.startsWith('gt.')).length).toBe(4);
 expect(state.requests.some(r=>r.path.includes('/storage/'))).toBe(false);
});
test('elegir otro año conserva la ficha actual y exporta solo las inspecciones de ese año',async({page,context})=>{
 const state=await prepare(context);seed(state);await open(page);await page.getByRole('spinbutton',{name:'Año del consolidado',exact:true}).fill('2025');
 const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'Descargar base en Excel',exact:true}).click();const file=await downloaded;expect(file.suggestedFilename()).toBe('BASE_EXTINTORES_BERRY_2025.xlsx');
 const book=new ExcelJS.Workbook();await book.xlsx.readFile((await file.path())!);
 expect(book.getWorksheet('Inspecciones Berry')!.rowCount).toBe(6);expect((cell(book.getWorksheet('Inventario 2025')!,7,'Fecha de Última Inspección').value as Date).toISOString().slice(0,10)).toBe('2026-11-25');
 expect(state.requests.some(r=>r.path.endsWith('berry_emergency_inspections')&&new URLSearchParams(r.query).get('id')?.startsWith('in.'))).toBe(true);
});
test('un fallo de consulta permite reintentar y no descarga una base incompleta',async({page,context})=>{
 const state=await prepare(context);seed(state);let fail=true,downloads=0;page.on('download',()=>downloads++);
 await context.route(origin+'/rest/v1/rpc/berry_admin_organization',route=>fail?route.fulfill({status:503,json:{message:'Fallo de prueba'}}):route.fallback());
 await open(page);await page.getByRole('button',{name:'Descargar base en Excel',exact:true}).click();await expect(page.getByRole('alert')).toContainText('No pudimos completar');expect(downloads).toBe(0);
 fail=false;const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'Descargar base en Excel',exact:true}).click();await downloaded;expect(downloads).toBe(1);
});
test('revocar Administración durante la generación impide la descarga',async({page,context})=>{
 const state=await prepare(context);seed(state);let checks=0,downloads=0;page.on('download',()=>downloads++);
 await context.route(origin+'/rest/v1/rpc/berry_yo_seguro_scope',route=>route.fulfill({json:{version:'202611220025',admin:++checks<3,management_id:safetyManagement,management_name:'OPERACIONES'}}));
 await open(page);await page.getByRole('button',{name:'Descargar base en Excel',exact:true}).click();await expect(page.getByRole('alert')).toContainText('disponible para Administración');expect(downloads).toBe(0);
});
test('solo Administración ve la sección y puede registrar una ficha desde ella',async({page,context})=>{
 const state=await prepare(context);await open(page);await page.getByRole('button',{name:'Registrar extintor',exact:true}).click();
 const modal=page.getByRole('dialog',{name:'Registrar extintor',exact:true});await modal.getByRole('textbox',{name:'Código',exact:true}).fill('NEW-100');await modal.getByRole('textbox',{name:'Ubicación (edificio, piso o área)',exact:true}).fill('Almacén 1');await modal.getByRole('button',{name:'Guardar ficha',exact:true}).click();
 await expect(modal).toHaveCount(0);expect(state.equipment.some(row=>row.code==='NEW-100')).toBe(true);await expect(page.getByRole('status')).toContainText('NEW-100 registrado');
});
test('una cuenta normal no accede a la exportación mediante el enlace de Administración',async({page,context})=>{
 const state=await prepare(context,false);await open(page);await expect(page.getByRole('heading',{name:'Mi perfil',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Descargar base en Excel',exact:true})).toHaveCount(0);expect(state.requests.some(r=>r.path.endsWith('berry_emergency_equipment'))).toBe(false);
});

test('si una ficha cambia durante la descarga, solicita generar una base actualizada',async({page,context})=>{
 const state=await prepare(context);seed(state);let downloads=0;page.on('download',()=>downloads++);
 await context.route(origin+'/rest/v1/berry_emergency_equipment?**',async route=>{
  if(new URL(route.request().url()).searchParams.get('select')==='id,revision')state.equipment[0].revision++;
  await route.fallback();
 });
 await open(page);await page.getByRole('button',{name:'Descargar base en Excel',exact:true}).click();await expect(page.getByRole('alert')).toContainText('inventario cambió');expect(downloads).toBe(0);
});
