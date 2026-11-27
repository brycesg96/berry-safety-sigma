import {test,expect} from './test-fixture';
import type {Page} from '@playwright/test';
import {mockEmergency,openPublicReview,equipment} from './emergency-fixture';
import {enterSafety,safetyArea,safetyActor} from './safety-fixture';
import {selectValue} from './select-fixture';
import {expectAccessible} from './accessibility-fixture';
const png={name:'evidencia.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64')};
async function loadEquipment(page:Page,code='EXT-001'){await page.getByRole('textbox',{name:'Código del equipo',exact:true}).fill(code);await expect(page.getByRole('region',{name:'Ficha del equipo',exact:true})).toContainText(code);}
async function fillReview(page:Page,name='Ana Trabajadora'){
 const worker=page.getByRole('textbox',{name:'Nombres y apellidos',exact:true});if(await worker.getAttribute('readonly')===null)await worker.fill(name);
 await page.getByRole('textbox',{name:'N° de legajo',exact:true}).fill('1234');await selectValue(page.getByRole('combobox',{name:'Estado del equipo',exact:true}),'attention');await page.getByRole('textbox',{name:'Observaciones',exact:true}).fill('Manómetro con lectura fuera del rango indicado.');
 await page.getByRole('button',{name:'Firmar en pantalla',exact:true}).click();const canvas=page.getByLabel('Área para registrar la firma'),box=(await canvas.boundingBox())!;
 await page.mouse.move(box.x+box.width*.1,box.y+box.height*.7);await page.mouse.down();await page.mouse.move(box.x+box.width*.3,box.y+box.height*.25,{steps:8});await page.mouse.move(box.x+box.width*.45,box.y+box.height*.75,{steps:8});await page.mouse.move(box.x+box.width*.7,box.y+box.height*.4,{steps:8});await page.mouse.up();await page.getByRole('button',{name:'Guardar firma',exact:true}).click();
 await expect(page.getByAltText('Firma que acompañará esta inspección')).toBeVisible();await page.getByLabel('Evidencias del equipo',{exact:true}).setInputFiles(png);await expect(page.locator('.er-photo-grid img')).toHaveCount(1);await expect(page.getByRole('button',{name:'Registrar inspección',exact:true})).toBeEnabled();
}
for(const width of [1440,768,390])test(`un trabajador sin cuenta inspecciona un extintor por código y conserva la privacidad (${width}px)`,async({page,context})=>{
 const state=await mockEmergency(context);await page.setViewportSize({width,height:1000});await page.emulateMedia({reducedMotion:'reduce'});await openPublicReview(page);await loadEquipment(page);
 await expect(page.getByRole('region',{name:'Ficha del equipo'})).toContainText('SERIE-001');await expect(page.getByRole('region',{name:'Ficha del equipo'})).toContainText('6 kg');await expect(page.getByRole('combobox',{name:'Estado del equipo',exact:true})).toHaveAttribute('data-value','');
 await expect(page.getByRole('region',{name:'Historial de inspecciones',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Registrar equipo',exact:true})).toHaveCount(0);
 await expectAccessible(page);await fillReview(page);await expectAccessible(page);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:test.info().outputPath(`yo-reviso-formulario-${width}.png`),fullPage:true});
 await page.getByRole('button',{name:'Registrar inspección',exact:true}).click();await expect(page.getByRole('region',{name:'Inspección registrada',exact:true})).toBeVisible();expect(state.inspections).toHaveLength(1);expect(state.inspections[0]).toMatchObject({worker_name:'Ana Trabajadora',inspector_id:null,submission_source:'guest',employee_code:'1234',state:'attention'});expect(state.files.size).toBe(2);
 expect(state.requests.filter(request=>request.path.includes('berry_emergency_inspections'))).toHaveLength(0);expect(state.requests.every(request=>!request.authorization.includes('.fixture'))).toBe(true);expect(state.safety.requests.filter(path=>path.startsWith('/auth/'))).toEqual([]);await expectAccessible(page);
});
test('respuesta de recepción perdida y subida parcial reintentan el mismo envío sin duplicar revisiones',async({page,context})=>{
 const state=await mockEmergency(context);state.failReceipt=true;await openPublicReview(page);await loadEquipment(page);await fillReview(page);await page.getByRole('button',{name:'Registrar inspección',exact:true}).click();await expect(page.getByRole('alert')).toContainText('confirmar');expect(state.inspections).toHaveLength(1);expect(state.uploads).toBe(2);await expect(page.getByRole('textbox',{name:'Código del equipo',exact:true})).toHaveAttribute('readonly','');await page.getByRole('button',{name:'Reintentar inspección',exact:true}).click();await expect(page.getByRole('heading',{name:'Inspección registrada',exact:true})).toBeVisible();expect(state.inspections).toHaveLength(1);expect(state.uploads).toBe(2);expect(state.begins).toBe(2);
});
test('una subida interrumpida conserva firma y fotos y un cambio de ficha exige preparar un envío nuevo',async({page,context})=>{
 const state=await mockEmergency(context);state.failUploadAt=2;await openPublicReview(page);await loadEquipment(page);await fillReview(page);await page.getByRole('button',{name:'Registrar inspección',exact:true}).click();await expect(page.getByRole('alert')).toBeVisible();expect(state.inspections).toHaveLength(0);expect(state.files.size).toBe(1);
 state.equipment[0].revision=2;state.equipment[0].serial_number='SERIE-NUEVA';await page.getByRole('button',{name:'Reintentar inspección',exact:true}).click();await expect(page.getByRole('alert')).toContainText('ficha');expect(state.inspections).toHaveLength(0);
 await page.getByRole('button',{name:'Actualizar ficha y preparar nuevo envío',exact:true}).click();await expect(page.getByRole('region',{name:'Ficha del equipo'})).toContainText('SERIE-NUEVA');await expect(page.getByRole('textbox',{name:'Observaciones',exact:true})).toHaveValue('Manómetro con lectura fuera del rango indicado.');await expect(page.getByAltText('Firma que acompañará esta inspección')).toBeVisible();await expect(page.getByRole('button',{name:'Registrar inspección',exact:true})).toBeEnabled();await page.getByRole('button',{name:'Registrar inspección',exact:true}).click();await expect(page.getByRole('heading',{name:'Inspección registrada',exact:true})).toBeVisible();expect(state.inspections).toHaveLength(1);expect(state.inspections[0].equipment_snapshot.serial_number).toBe('SERIE-NUEVA');
});
test('no confunde respuestas de códigos distintos y protege los datos al cambiar de equipo',async({page,context})=>{
 const state=await mockEmergency(context);state.equipment.push(equipment({id:'ed000000-0000-4000-8000-000000000002',code:'EXT-002',serial_number:'SEGUNDO'}));state.delays.set('EXT-001',1100);await openPublicReview(page);const search=page.getByRole('textbox',{name:'Código del equipo',exact:true});await search.fill('EXT-001');await expect.poll(()=>state.requests.some(request=>request.body?.p_code==='EXT-001')).toBe(true);await search.fill('EXT-002');await expect(page.getByRole('region',{name:'Ficha del equipo'})).toContainText('SEGUNDO');await expect.poll(()=>state.settled).toBe(2);await expect(page.getByRole('region',{name:'Ficha del equipo'})).toContainText('EXT-002');
 await page.getByRole('textbox',{name:'Nombres y apellidos',exact:true}).fill('Ana');await page.getByRole('button',{name:'Lavaojos',exact:true}).click();await expect(page.getByRole('dialog',{name:'Tienes una inspección en curso',exact:true})).toBeVisible();await page.getByRole('button',{name:'Seguir revisando',exact:true}).click();await expect(page.getByRole('textbox',{name:'Nombres y apellidos',exact:true})).toHaveValue('Ana');await page.getByRole('button',{name:'Cambiar equipo',exact:true}).click();await page.getByRole('button',{name:'Descartar y continuar',exact:true}).click();await expect(search).toHaveValue('');
});
test('lavaojos y duchas tienen su acceso identificado sin formularios ni inspecciones inventadas',async({page,context})=>{
 const state=await mockEmergency(context);await openPublicReview(page);for(const name of ['Lavaojos','Duchas lavaojos']){await page.getByRole('button',{name,exact:true}).click();await expect(page.getByRole('heading',{name,exact:true})).toBeVisible();await expect(page.getByText('Formato pendiente',{exact:true})).toHaveCount(3);await expect(page.getByRole('textbox',{name:'Código del equipo',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Registrar inspección',exact:true})).toHaveCount(0);}expect(state.begins).toBe(0);await expectAccessible(page);
});
test('Administración registra la ficha real y una cuenta revisa firma y evidencias enviadas sin cuenta',async({page,context})=>{
 const state=await mockEmergency(context,true);state.equipment=[];await enterSafety(page,true);await page.getByRole('button',{name:/¡Yo Reviso!/}).click();await expect(page.getByRole('button',{name:'Registrar equipo',exact:true})).toBeEnabled();await page.getByRole('button',{name:'Registrar equipo',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Registrar extintor',exact:true});await dialog.getByRole('textbox',{name:'Código',exact:true}).fill('EXT-100');await selectValue(dialog.getByRole('combobox',{name:'Área del equipo',exact:true}),safetyArea);await dialog.getByRole('textbox',{name:'Ubicación (edificio, piso o área)',exact:true}).fill('Taller principal · Piso 1');await dialog.getByRole('textbox',{name:'N° de serie',exact:true}).fill('REAL-100');await dialog.getByRole('button',{name:'Guardar ficha',exact:true}).click();await expect(page.getByRole('region',{name:'Ficha del equipo'})).toContainText('REAL-100');
 const session=await page.evaluate(()=>localStorage.getItem('berry-supabase-auth-v1'));const worker=await context.newPage();await openPublicReview(worker);await loadEquipment(worker,'EXT-100');await fillReview(worker);await worker.getByRole('button',{name:'Registrar inspección',exact:true}).click();await expect(worker.getByRole('heading',{name:'Inspección registrada',exact:true})).toBeVisible();expect(await worker.evaluate(()=>localStorage.getItem('berry-supabase-auth-v1'))).toBe(session);const guestRequests=state.requests.filter(request=>request.path.endsWith('berry_begin_emergency_inspection'));expect(guestRequests[0].authorization).not.toContain('.fixture');
 await page.getByRole('button',{name:'Cambiar equipo',exact:true}).click();await loadEquipment(page,'EXT-100');await expect(page.getByRole('region',{name:'Historial de inspecciones'})).toContainText('Ana Trabajadora');await page.getByRole('button',{name:/Ver inspección de Ana Trabajadora/}).click();const detail=page.getByRole('dialog',{name:'Inspección · EXT-100',exact:true});await expect(detail).toContainText('1234');await expect(detail).toContainText('Manómetro');await expect(detail.locator('.er-detail-images img')).toHaveCount(2);await expectAccessible(page);await page.screenshot({path:test.info().outputPath('yo-reviso-detalle-privado.png'),fullPage:true});await worker.close();
});

test('una cuenta registra con su identidad y no muestra controles de catálogo para personal normal',async({page,context})=>{
 const state=await mockEmergency(context);await enterSafety(page);await page.getByRole('button',{name:/¡Yo Reviso!/}).click();await loadEquipment(page);
 const name=page.getByRole('textbox',{name:'Nombres y apellidos',exact:true});await expect(name).toHaveValue('Trabajador de Campo');await expect(name).toHaveAttribute('readonly','');await expect(page.getByRole('button',{name:'Registrar equipo',exact:true})).toHaveCount(0);
 await fillReview(page);await expectAccessible(page);await page.getByRole('button',{name:'Registrar inspección',exact:true}).click();await expect(page.getByRole('heading',{name:'Inspección registrada',exact:true})).toBeVisible();expect(state.inspections[0]).toMatchObject({submission_source:'account',inspector_id:safetyActor,worker_name:'Trabajador de Campo'});expect(state.requests.find(request=>request.path.endsWith('berry_begin_emergency_inspection'))?.authorization).toContain('.fixture');
});
test('una cuenta de otra gerencia solo obtiene la ficha pública del código, sin personas, firmas ni historial privado',async({page,context})=>{
 const state=await mockEmergency(context),other=state.safety.catalog[1];state.equipment[0]=equipment({management_id:other.id,area_id:other.areas[0].id,area_name:'Servicios',management_name:'Administración'});
 await enterSafety(page);await page.getByRole('button',{name:/¡Yo Reviso!/}).click();await loadEquipment(page);await expect(page.getByRole('region',{name:'Ficha del equipo'})).toContainText('Servicios');await expect(page.getByRole('region',{name:'Historial de inspecciones'})).toHaveCount(0);await expect(page.getByRole('button',{name:/Ver historial/})).toHaveCount(0);expect(state.requests.filter(request=>request.path.endsWith('berry_emergency_inspections'))).toHaveLength(0);
});

function importedFixture(state:Awaited<ReturnType<typeof mockEmergency>>,assigned=false){
 const owner=state.safety.catalog[1],user=state.safety.catalog[0];
 state.equipment[0]=equipment({code:'LGC-100',serial_number:'000637',area_id:assigned?user.areas[0].id:null,management_id:assigned?user.id:null,area_name:assigned?user.areas[0].name:undefined,management_name:assigned?user.name:undefined,owner_management_id:owner.id,owner_name:owner.name,owner_management_name:owner.name,manufacture_year:2017,last_hydro_date:null,next_hydro_date:null,last_hydro_year:2022,next_hydro_year:2027,legacy_available:true,classification:'FUNDO',placement_kind:'Instalación'});
 state.legacy.push({id:'ee000000-0000-4000-8000-000000000001',equipment_id:state.equipment[0].id,source_row:100,official_date:'2026-10-06',previous_date:'2026-09-10',state_original:'OPERATIVO',notes:'Observación privada de la base anterior.',inspector_code:'INSPECTOR-ANTERIOR',months:{Enero:'12 enero 2025',Octubre:'17 octubre 2026',Noviembre:'2026-10-06'},original:{'FECHA DE INSPECCIÓN':'2026-10-06','Noviembre':'2026-10-06','AÑO DE FABRICACIÓN':'2017'},imported_at:new Date().toISOString()});
 return {owner,user};
}

for(const width of [1440,768,390])test(`la ficha importada usa H y permite levantar la gerencia usuaria sin cambiar la responsable (${width}px)`,async({page,context})=>{
 const state=await mockEmergency(context,false,true),{owner,user}=importedFixture(state);await page.setViewportSize({width,height:1000});await page.emulateMedia({reducedMotion:'reduce'});
 await openPublicReview(page);await page.getByRole('textbox',{name:'Código del equipo',exact:true}).fill('lgc 100');
 const facts=page.getByRole('region',{name:'Ficha del equipo',exact:true});await expect(facts).toContainText('LGC-100');await expect(facts).toContainText('000637');
 await expect(facts.getByText('Por levantar en campo',{exact:true})).toBeVisible();
 await expect(facts.locator('dl>div').filter({hasText:'Última prueba hidrostática'}).locator('dd')).toHaveText('2022');
 await expect(page.getByText('Fecha oficial de la base anterior.',{exact:true})).toBeVisible();
 await expect(page.locator('.er-last-date')).toHaveText('06 oct. 2026');
 await expect(page.getByRole('region',{name:'Antecedentes de la base anterior'})).toHaveCount(0);
 await expect(page.getByText('INSPECTOR-ANTERIOR')).toHaveCount(0);
 const management=page.getByRole('combobox',{name:'Gerencia usuaria',exact:true});await management.click();
 await expect(page.getByRole('searchbox',{name:'Buscar opciones',exact:true})).not.toBeFocused();await page.keyboard.press('Escape');
 await selectValue(management,user.id);await selectValue(page.getByRole('combobox',{name:'Área usuaria',exact:true}),user.areas[0].id);
 await fillReview(page);await expectAccessible(page);expect(state.equipment[0].area_id).toBeNull();
 await page.screenshot({path:test.info().outputPath(`inventario-campo-${width}.png`),fullPage:true});
 await page.getByRole('button',{name:'Registrar inspección',exact:true}).click();await expect(page.getByRole('heading',{name:'Inspección registrada',exact:true})).toBeVisible();
 expect(state.equipment[0].area_id).toBe(user.areas[0].id);expect(state.equipment[0].management_id).toBe(user.id);expect(state.equipment[0].owner_management_id).toBe(owner.id);
 expect(state.inspections[0].equipment_snapshot.last_hydro_year).toBe(2022);expect(state.inspections[0].equipment_snapshot.last_hydro_date).toBeNull();expect(state.inspections[0].employee_code).toBe('1234');
 expect(state.legacy[0].inspector_code).toBe('INSPECTOR-ANTERIOR');expect(state.requests.filter(request=>request.path.endsWith('berry_emergency_legacy_records'))).toHaveLength(0);
 await expect(facts).toContainText('Mantenimiento');await page.getByRole('button',{name:'Registrar otra revisión de este equipo',exact:true}).click();await expect(page.getByRole('region',{name:'Ubicación usuaria del equipo'})).toHaveCount(0);
});

test('la ficha importada conserva la asignación ante una respuesta perdida y no repite evidencias ni inspecciones',async({page,context})=>{
 const state=await mockEmergency(context,false,true),{user}=importedFixture(state);state.failReceipt=true;await openPublicReview(page);await loadEquipment(page,'LGC-100');
 await selectValue(page.getByRole('combobox',{name:'Gerencia usuaria',exact:true}),user.id);await selectValue(page.getByRole('combobox',{name:'Área usuaria',exact:true}),user.areas[0].id);await fillReview(page);
 await page.getByRole('button',{name:'Registrar inspección',exact:true}).click();await expect(page.getByRole('alert')).toBeVisible();expect(state.inspections).toHaveLength(1);expect(state.equipment[0].revision).toBe(2);
 await page.getByRole('button',{name:'Reintentar inspección',exact:true}).click();await expect(page.getByRole('heading',{name:'Inspección registrada',exact:true})).toBeVisible();expect(state.inspections).toHaveLength(1);expect(state.uploads).toBe(2);expect(state.equipment[0].revision).toBe(2);
});

test('Administración consulta el antecedente H y edita años sin inventar fechas ni mezclar gerencias',async({page,context})=>{
 const state=await mockEmergency(context,true,true),{owner,user}=importedFixture(state);await page.setViewportSize({width:390,height:1000});await enterSafety(page,true);await page.getByRole('button',{name:/¡Yo Reviso!/}).click();await loadEquipment(page,'LGC-100');
 const history=page.getByRole('region',{name:'Antecedentes de la base anterior',exact:true});await expect(history.locator('details').first()).not.toHaveAttribute('open','');await history.locator('summary').first().click();
 await expect(history).toContainText('INSPECTOR-ANTERIOR');await expect(history).toContainText('Observación privada');
 await expect(history.locator('.er-legacy-months>div').filter({hasText:'Noviembre'}).locator('dd')).toHaveText('06 oct. 2026');
 await expect(history.locator('.er-legacy-months>div').filter({hasText:'Enero'}).locator('dd')).toHaveText('12 enero 2025');await expectAccessible(page);
 await page.getByRole('button',{name:'Editar ficha',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Editar ficha del extintor',exact:true});
 await expect(dialog.getByLabel('Última prueba hidrostática (año)',{exact:true})).toHaveValue('2022');await expect(dialog.getByLabel('Próxima prueba hidrostática (año)',{exact:true})).toHaveValue('2027');
 await selectValue(dialog.getByRole('combobox',{name:'Área usuaria',exact:true}),user.areas[0].id);await dialog.getByRole('button',{name:'Guardar ficha',exact:true}).click();
 await expect(dialog).toHaveCount(0);expect(state.equipment[0].owner_management_id).toBe(owner.id);expect(state.equipment[0].management_id).toBe(user.id);expect(state.equipment[0].last_hydro_date).toBeNull();expect(state.equipment[0].last_hydro_year).toBe(2022);
 await page.screenshot({path:test.info().outputPath('inventario-antecedentes-privados-390.png'),fullPage:true});
});

test('otra gerencia consulta solo la ficha pública importada sin descargar antecedentes ni identidades',async({page,context})=>{
 const state=await mockEmergency(context,false,true);importedFixture(state,true);const other=state.safety.catalog[1];Object.assign(state.equipment[0],{management_id:other.id,area_id:other.areas[0].id,area_name:other.areas[0].name,management_name:other.name});
 await enterSafety(page);await page.getByRole('button',{name:/¡Yo Reviso!/}).click();await loadEquipment(page,'LGC-100');await expect(page.getByRole('region',{name:'Antecedentes de la base anterior'})).toHaveCount(0);await expect(page.getByText('INSPECTOR-ANTERIOR')).toHaveCount(0);expect(state.requests.filter(request=>request.path.endsWith('berry_emergency_legacy_records'))).toHaveLength(0);
});
