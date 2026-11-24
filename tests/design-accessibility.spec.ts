import { expectAccessible } from './accessibility-fixture';
import AxeBuilder from '@axe-core/playwright';
import { test,expect } from './test-fixture';
import { mockDirectory } from './directory-fixture';
import { mockSafety,enterSafety } from './safety-fixture';
for(const width of [1440,375])test(`formulario y acceso tienen contraste, etiquetas y estructura accesibles (${width}px)`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:'reduce'});await mockDirectory(page);await page.goto('./');
 await page.evaluate(()=>document.fonts.ready);
 const checkTextZoom=async()=>{
  await page.evaluate(async()=>{document.documentElement.style.zoom='150%';await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));});
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.evaluate(()=>document.documentElement.style.zoom='100%');
 };
 const audit=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect(audit.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))).toEqual([]);
 await page.screenshot({path:test.info().outputPath(`inspeccion-${width}.png`),fullPage:true});
 await checkTextZoom();
 await page.evaluate(async()=>{
  const {newInspection,newObservation,persistInspection}=await import('/src/model.ts');
  for(const [owner,area] of [['demo-admin','Fundo – Armonía II – Oficina SIGMA'],['demo-inspector','Fundo – Armonía I – Taller de mantenimiento']]){
   const draft=newInspection({name:owner==='demo-admin'?'Ana Inspectora':'José Inspector',email:'inspector@example.invalid',accountId:owner});
   await persistInspection({...draft,area,objective:'Verificar las condiciones de trabajo y las rutas de evacuación.',status:'ready',observations:[{...newObservation(draft.date),description:'Mejorar la señalización del área.',correctiveAction:'Instalar y verificar las señales.'}],delivery:{sentAt:new Date().toISOString(),recipientIds:['demo-admin'],revision:1,corrections:{}}});
  }
 });
 for(const [name,file] of [['Mis inspecciones','mis-inspecciones'],['Buzón de Inspecciones','buzon'],['Administración','administracion']]){
  const menu=page.getByRole('button',{name:'Abrir menú',exact:true});if(await menu.isVisible())await menu.click();
  await page.locator('.sidebar-nav').getByRole('button',{name,exact:true}).click();
  await expect(page.getByRole('heading',{name,exact:true})).toBeVisible();await expectAccessible(page);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:test.info().outputPath(`${file}-${width}.png`),fullPage:true,animations:'disabled'});
  await checkTextZoom();
 }
 await page.goto('./?acceso=cuenta');await expect(page.getByRole('heading',{name:'Inicia sesión',exact:true})).toBeVisible();expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))).toEqual([]);
});
test('documentos permite usar el formulario con teclado, contraste y zoom de texto',async({page,context})=>{
 await mockSafety(context);await page.setViewportSize({width:375,height:900});await page.emulateMedia({reducedMotion:'reduce'});await enterSafety(page);await expect(page.getByRole('combobox',{name:'Área',exact:true})).toBeEnabled();
 expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))).toEqual([]);
 await page.evaluate(()=>document.documentElement.style.zoom='150%');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('los errores enlazan a sus campos y permiten corregirlos con teclado',async({page})=>{
 await mockDirectory(page);await page.goto('./');await page.getByRole('button',{name:'Continuar',exact:true}).click();
 const summary=page.getByRole('alert',{name:'Campos por completar'});await expect(summary).toBeVisible();await summary.getByRole('link',{name:'Sede',exact:true}).click();await expect(page.getByRole('combobox',{name:'Sede',exact:true})).toBeFocused();
 await page.keyboard.press('Enter');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');await expect(page.getByRole('combobox',{name:'Sede',exact:true})).toHaveAttribute('data-value',/.+/);
});
test('gestión de usuarios tiene formularios y estados legibles',async({page,context})=>{
 await mockSafety(context,true);await enterSafety(page,true);await page.getByRole('button',{name:'Administración',exact:true}).click();await expect(page.getByRole('button',{name:'Crear usuario',exact:true})).toBeVisible();await expectAccessible(page);await page.screenshot({path:test.info().outputPath('usuarios-renovados.png'),fullPage:true});
});
