import { expectAccessible } from './accessibility-fixture';
import AxeBuilder from '@axe-core/playwright';
import { test,expect } from './test-fixture';
import { mockDirectory } from './directory-fixture';
import { mockSafety,enterSafety } from './safety-fixture';
for(const width of [1440,375])test(`formulario y acceso tienen contraste, etiquetas y estructura accesibles (${width}px)`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:'reduce'});await mockDirectory(page);await page.goto('./');
 const audit=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect(audit.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))).toEqual([]);
 await page.screenshot({path:test.info().outputPath(`inspeccion-${width}.png`),fullPage:true});
 await page.goto('./?acceso=cuenta');await expect(page.getByRole('heading',{name:'Inicia sesión',exact:true})).toBeVisible();expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))).toEqual([]);
});
test('documentos permite usar el formulario con teclado, contraste y zoom de texto',async({page,context})=>{
 await mockSafety(context);await page.setViewportSize({width:375,height:900});await page.emulateMedia({reducedMotion:'reduce'});await enterSafety(page);await expect(page.getByLabel('Tipo de documento')).toBeEnabled();
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
