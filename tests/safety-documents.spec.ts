import { selectValue } from './select-fixture';
import { test,expect } from './test-fixture';
import { mockSafety,enterSafety } from './safety-fixture';
const pdf={name:'ats.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\nDocumento de prueba\n%%EOF')};

for(const width of [1440,375])test(`un trabajador sin permisos de inspección carga y descarga su ATS privado (${width}px)`,async({page,context})=>{
 await page.setViewportSize({width,height:900});const state=await mockSafety(context);await enterSafety(page);
 await expect(page.getByRole('button',{name:'Nueva inspección',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Administración',exact:true})).toHaveCount(0);
 await page.getByLabel('Nombre o actividad').fill('ATS de mantenimiento');const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Seleccionar archivo',exact:true}).click();await(await chooser).setFiles(pdf);await page.getByRole('button',{name:'Subir documento',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'ATS registrado'})).toContainText('ATS registrado');await expect(page.locator('.safety-document-row')).toContainText('ATS de mantenimiento');expect(state.rows.length).toBe(1);expect(state.uploads).toBe(1);
 await expect(page.getByRole('button',{name:'Revisar',exact:true})).toHaveCount(0);await expect(page.getByLabel('Nombre o actividad')).toHaveValue('');
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Descargar ATS de mantenimiento',exact:true}).click();expect((await download).suggestedFilename()).toBe('ats.pdf');
 await page.getByRole('button',{name:'Ver archivo',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await expect(page.locator('.safety-preview')).toHaveAttribute('src',/^blob:/);await page.getByRole('button',{name:'Cerrar',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:test.info().outputPath(`documentos-${width}.png`),fullPage:true,animations:'disabled'});
});
test('una respuesta perdida permite reintentar el registro sin duplicar el documento ni subir otra copia',async({page,context})=>{
 const state=await mockSafety(context);state.failReceipt=true;await enterSafety(page);await page.getByLabel('Nombre o actividad').fill('ATS sin duplicados');await page.getByLabel('Archivo del documento').setInputFiles(pdf);await page.getByRole('button',{name:'Subir documento',exact:true}).click();await expect(page.getByRole('alert')).toContainText('No pudimos confirmar');
 await expect(page.getByLabel('Nombre o actividad')).toHaveValue('ATS sin duplicados');await expect(page.getByLabel('Nombre o actividad')).toHaveAttribute('readonly','');
 await page.getByRole('button',{name:'Reintentar envío',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'ATS registrado'})).toContainText('ATS registrado');expect(state.submits).toBe(2);expect(state.uploads).toBe(1);expect(state.rows.length).toBe(1);
});
test('rechaza un archivo disfrazado y ofrece un estado claro cuando no se ha activado el módulo',async({page,context})=>{
 const state=await mockSafety(context);await enterSafety(page);await page.getByLabel('Archivo del documento').setInputFiles({...pdf,buffer:Buffer.from('<html>archivo no válido</html>')});await expect(page.getByRole('alert')).toContainText('PDF o una foto');expect(state.uploads).toBe(0);
 state.ready=false;await page.getByRole('button',{name:'Actualizar lista',exact:true}).click();await expect(page.getByRole('heading',{name:'Este apartado está en preparación'})).toBeVisible();await expect(page.getByLabel('Archivo del documento')).toHaveCount(0);
});
test('administración revisa con control de versiones y el trabajador conserva su comentario',async({page,context})=>{
 const state=await mockSafety(context,true);await enterSafety(page,true);await selectValue(page.getByLabel('Tipo de documento'),'PETAR');await page.getByLabel('Nombre o actividad').fill('PETAR de pruebas');await page.getByLabel('Archivo del documento').setInputFiles(pdf);await page.getByRole('button',{name:'Subir documento',exact:true}).click();await expect(page.locator('.safety-document-row')).toHaveCount(1);
 expect(state.rows[0].kind).toBe('PETAR');
 await page.getByRole('button',{name:'Revisar',exact:true}).click();await expect(page.getByRole('button',{name:'Solicitar Correcciones',exact:true})).toBeDisabled();await page.getByLabel('Comentario de revisión').fill('Completar las firmas.');state.conflict=true;await page.getByRole('button',{name:'Solicitar Correcciones',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('cambió en otra sesión');await expect(page.getByLabel('Comentario de revisión')).toHaveValue('Completar las firmas.');state.conflict=false;
 await page.getByRole('button',{name:'Solicitar Correcciones',exact:true}).click();await expect(page.locator('.safety-document-row')).toContainText('Requiere correcciones');await expect(page.locator('.safety-document-row')).toContainText('Completar las firmas.');
 await page.getByRole('button',{name:'Revisar',exact:true}).click();await page.getByRole('button',{name:'Aprobar documento',exact:true}).click();await expect(page.locator('.safety-status')).toHaveText(/Aprobado/);
});
