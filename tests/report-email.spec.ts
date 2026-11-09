import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import ExcelJS from 'exceljs';
import { readFile } from 'node:fs/promises';
import { reportFilename } from '../shared/report-filename.mjs';
async function prepare(page:Page, withTeam=false) {
 await page.route('**/api/people?*',r=>r.fulfill({json:{people:[]}}));
 await page.goto('./');
 await page.evaluate(async()=>{
  const {readAccounts,editAccount,supervisorEmails}=await import('/src/accounts.ts');
  const person=readAccounts().find(account=>account.id==='demo-inspector')!;
  editAccount('demo-admin',person.id,{...person,supervisorEmails:supervisorEmails('JEFE@example.com, jefe@example.com, gerente@example.com, bcespedes@hortifrut.com')});
 });
 await page.reload();
 await page.getByLabel('Área inspeccionada').fill('Taller - Armonía 2');
  await page.getByRole('combobox', { name: 'Sede', exact: true }).selectOption('Fundo'); await page.getByRole('combobox', { name: 'Zona de inspección', exact: true }).selectOption('Armonía II');
 await page.getByLabel('Hora de inspección').fill('07:30');await page.getByLabel('AM o PM').selectOption('AM');
 await page.getByRole('radio',{name:'Planeada',exact:true}).check();
 await page.getByRole('textbox',{name:'Objetivo de la inspección interna',exact:true}).fill('Revisar condiciones seguras.');
 await page.getByRole('combobox',{name:/Nombre completo/}).fill('Bryan');
 await page.getByRole('listbox').getByRole('option',{name:/bcespedes@hortifrut.com/}).click();
 await page.getByRole('button',{name:'Continuar',exact:true}).click();
 await page.getByRole('button',{name:'Añadir observación',exact:true}).click();
 await page.getByLabel('Descripción').fill('Falta señalización.');
 await page.getByLabel('Acción a tomar').fill('Instalar señalización.');
 await page.getByLabel('Fecha de Cierre').fill('2026-12-01');
 await page.getByRole('button',{name:'Continuar',exact:true}).click();await page.getByRole('button',{name:'Continuar',exact:true}).click();
 await page.getByRole('textbox',{name:'CONCLUSIONES Y RECOMENDACIONES',exact:true}).fill('Se requiere corregir el hallazgo.');
 await page.getByRole('button',{name:'Continuar',exact:true}).click();
 if(withTeam){
  await page.getByRole('button',{name:'Guardar y salir',exact:true}).click();
  await page.evaluate(async()=>{
   const {loadInspections,persistInspection}=await import('/src/model.ts');
   const draft=(await loadInspections()).find(d=>d.area==='Fundo – Armonía II – Taller - Armonía 2')!;
   await persistInspection({...draft,additionalInspectors:[{id:'ana',personId:'ana',name:'Ana Torres',email:'ana@example.com'},{id:'jose',personId:'jose',name:'José Rojas',email:'jose@example.com'}]});
  });
  await page.reload();
 }
 await page.getByRole('button',{name:'Enviar inspección',exact:true}).click();
}
test('envío sin claves adjunta Excel, responsables y CC de jefes y conserva el recibo',async({page})=>{
 let captured:any;
 await page.route('**/api/inspections/send',async route=>{
  const data=route.request().postDataJSON();
  if(data.action==='inspection.defaults')return route.fulfill({json:{ok:true,defaults:null}});
  if(data.action==='inspection.check')return route.fulfill({json:{ok:true,enabled:true}});
  expect(route.request().headers().authorization).toBeUndefined();
  captured=data;
  await route.fulfill({json:{ok:true,receipt:'http_accepted',request_id:data.inspection.id,email_requested:true,upstream_status:200,outlook_status:'not_confirmed'}});
 });
 await prepare(page,true);
 const dialog=page.getByRole('dialog');await expect(dialog).toContainText('jefe@example.com, gerente@example.com');
 await expect(dialog.getByRole('textbox')).toHaveCount(0);
 await dialog.getByRole('button',{name:'Enviar informe por correo',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Fundo – Armonía II – Taller - Armonía 2',exact:true})).toBeVisible();
 expect(captured.inspection.responsibles).toEqual([{name:'Bryan',email:'bcespedes@hortifrut.com'}]);
 expect(captured.inspection.cc).toEqual(['jefe@example.com','gerente@example.com']);
 expect(captured.inspection.inspectors).toEqual([captured.inspection.inspector,{name:'Ana Torres',email:'ana@example.com'},{name:'José Rojas',email:'jose@example.com'}]);
 const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(Buffer.from(captured.attachment.contentBase64,'base64') as any);
 expect(JSON.stringify(workbook.getWorksheet('V.01')!.getSheetValues())).toContain('Falta señalización.');
 const downloadEvent=page.waitForEvent('download');
 await page.getByRole('button',{name:'Descargar Excel',exact:true}).click();
 const download=await downloadEvent;
 expect(download.suggestedFilename()).toBe(reportFilename(captured.inspection.area,captured.inspection.date));
 expect(await readFile((await download.path())!)).toEqual(Buffer.from(captured.attachment.contentBase64,'base64'));
 expect(await page.evaluate(()=>JSON.stringify(sessionStorage))).not.toContain('berry-mail-session');
 await page.reload();await page.getByRole('button',{name:'Mis inspecciones',exact:true}).click();await page.getByRole('button',{name:'Revisar informe',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Fundo – Armonía II – Taller - Armonía 2',exact:true})).toBeVisible();
 const receipt=await page.evaluate(async()=>{
  const {loadInspections}=await import('/src/model.ts');
  return (await loadInspections()).find(d=>d.delivery)?.emailDelivery;
 });
 expect(receipt).toMatchObject({state:'accepted',requestId:captured.inspection.id,upstreamStatus:200});
 await expect(page.getByRole('heading',{name:'Envío del informe por correo',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Enviar informe por correo',exact:true})).toHaveCount(0);
});
test('servidor desactivado conserva el borrador y no registra ni envía el informe',async({page})=>{
 let sends=0;
 await page.route('**/api/inspections/send',r=>{if(r.request().postDataJSON().action==='inspection.send')sends++;return r.fulfill({status:503,json:{ok:false,code:'REPORTS_DISABLED'}});});
 await prepare(page);
 await page.getByRole('button',{name:'Enviar informe por correo',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('MAKE_REPORTS_ENABLED=true');expect(sends).toBe(0);
 await page.getByRole('button',{name:'Cerrar ventana',exact:true}).click();await page.getByRole('button',{name:'Mis inspecciones',exact:true}).click();
 await expect(page.getByRole('button',{name:'Continuar',exact:true})).toBeVisible();
});

test('backend anterior muestra cómo actualizar sin bloquear el botón ni pedir clave',async({page})=>{
 let sends=0;
 await page.route('**/api/inspections/send',route=>{if(route.request().postDataJSON().action==='inspection.send')sends++;return route.fulfill({status:401,json:{ok:false,code:'UNAUTHORIZED'}});});
 await prepare(page);
 await page.getByRole('button',{name:'Enviar informe por correo',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('Actualiza el backend');
 await expect(page.getByRole('dialog').getByRole('textbox')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Enviar informe por correo',exact:true})).toBeEnabled();
 expect(sends).toBe(0);
 await page.getByRole('button',{name:'Cerrar ventana',exact:true}).click();
 await page.getByRole('button',{name:'Administración',exact:true}).click();
 await page.getByRole('button',{name:'Integraciones',exact:true}).click();
 await expect(page.getByRole('textbox')).toHaveCount(0);
});
