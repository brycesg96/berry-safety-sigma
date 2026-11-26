import { test, expect } from './test-fixture';
import { mockSafety } from './safety-fixture';
import { expectAccessible } from './accessibility-fixture';

for (const [width, height] of [[1440, 1000], [768, 1000], [375, 900], [667, 375]]) test(`la nueva bienvenida conserva los dos accesos y la lectura con zoom (${width}px)`, async ({ page, context }) => {
  await mockSafety(context); await page.setViewportSize({ width, height }); await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./?acceso=cuenta'); await expect(page.getByRole('heading', { name: 'Inicia sesión', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ir a Yo Seguro', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Ingresar sin cuenta', exact: true })).toHaveCount(0);
  await expectAccessible(page); await page.evaluate(() => document.documentElement.style.zoom = '150%');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => { document.documentElement.style.zoom = '100%'; window.scrollTo({ top: 0, behavior: 'instant' }); });
  await page.screenshot({ path: test.info().outputPath(`bienvenida-${width}.png`), fullPage: true, animations: 'disabled' });
  const guest = page.getByRole('button', { name: 'Ir a Yo Seguro', exact: true }); await guest.focus(); await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/acceso=sin-cuenta/); await page.getByRole('button', { name: 'Comenzar ahora', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Nombres y apellidos', exact: true })).toBeFocused();
  const question = page.locator('summary').filter({ hasText: '¿Puedo adjuntar varios documentos?' }); await question.focus(); await page.keyboard.press('Enter');
  await expect(question.locator('..')).toHaveAttribute('open', ''); await expect(question.locator('..')).toContainText('50 archivos por envío');
});

test('la tarjeta conserva los campos estables, cancela su efecto al reducir movimiento y permite entrar con Enter', async ({page,context}) => {
  await mockSafety(context); await page.setViewportSize({width:1440,height:1000}); await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto('./?acceso=cuenta'); const heading=page.getByRole('heading',{name:'Inicia sesión',exact:true}); await expect(heading).toBeVisible();
  const card=page.locator('.sign-in-card-2'), aura=page.locator('.sign-in-card-aura'), email=page.getByRole('textbox',{name:'Correo electrónico',exact:true}), password=page.getByLabel(/^Contraseña/);
  const box=(await card.boundingBox())!, initial=(await email.boundingBox())!;
  const flat=()=>aura.evaluate(element=>new DOMMatrix(getComputedStyle(element).transform).isIdentity);
  await page.mouse.move(box.x+box.width-12,box.y+12); await expect.poll(flat).toBe(false);
  expect(await email.boundingBox()).toEqual(initial);
  await page.emulateMedia({reducedMotion:'reduce'}); await expect.poll(flat).toBe(true);
  await expect.poll(()=>page.locator('.sign-in-card-edge').evaluate(element=>element.getAnimations({subtree:true}).filter(animation=>animation.playState==='running').length)).toBe(0);
  await page.emulateMedia({reducedMotion:'no-preference'}); await page.mouse.move(box.x+15,box.y+15); await expect.poll(flat).toBe(false);
  await email.fill('seguridad@example.invalid'); await password.fill('Fictitious!47'); await expect.poll(flat).toBe(true);
  await card.dispatchEvent('pointermove',{pointerType:'touch',clientX:box.x+10,clientY:box.y+10}); await expect.poll(flat).toBe(true);
  expect(await email.boundingBox()).toEqual(initial); await expectAccessible(page);
  await page.screenshot({path:test.info().outputPath('acceso-cristal-con-datos.png'),fullPage:true,animations:'disabled'});
  await password.focus(); await page.keyboard.press('Enter'); await expect(page.getByRole('heading',{name:'Yo Seguro',exact:true})).toBeVisible();
  await expect(page.locator('.berry-sign-in-page')).toHaveCount(0);
});

test('cambiar movimiento reducido limpia la perspectiva y una animación indisponible conserva el acceso', async ({ page, context }) => {
  await mockSafety(context); await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto('./?acceso=cuenta');
  const scene = page.locator('.safety-scene'); await expect(scene).toHaveAttribute('data-scene-motion', 'ready');
  await page.emulateMedia({ reducedMotion: 'reduce' }); await expect(scene).not.toHaveAttribute('data-scene-motion', 'ready'); await expect(scene.locator('.safety-scene-frame')).toHaveCSS('transform', 'none');
  await page.route('**/src/safety-scene-motion.ts*', route => route.abort()); await page.reload();
  await expect(page.getByRole('heading', { name: 'Inicia sesión', exact: true })).toBeVisible(); await expect(page.getByRole('button', { name: 'Ir a Yo Seguro', exact: true })).toBeEnabled();
  await page.getByRole('textbox', { name: 'Correo electrónico', exact: true }).fill('persona@example.invalid'); await expect(page.getByRole('textbox', { name: 'Correo electrónico', exact: true })).toHaveValue('persona@example.invalid');
});
