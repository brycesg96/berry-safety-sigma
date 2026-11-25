import { test, expect } from './test-fixture';
import type { Page } from '@playwright/test';
import type { Inspection } from '../src/model';
import { expectAccessible } from './accessibility-fixture';

const png = { name: 'evidencia-pendiente.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64') };

async function openReport(page: Page, options: { recipientView?: boolean; inspectors?: number; count?: number; executedFirst?: boolean } = {}) {
  await page.goto('./');
  const id = await page.evaluate(async options => {
    const { newInspection, newObservation, persistInspection } = await import('/src/model.ts');
    const { readAccounts, addAccount } = await import('/src/accounts.ts');
    const { blankCorrection } = await import('/src/follow-up.ts');
    const owner = readAccounts().find(account => account.id === (options.recipientView ? 'demo-inspector' : 'demo-admin'))!;
    const recipient = readAccounts().find(account => account.id === (options.recipientView ? 'demo-admin' : 'demo-inspector'))!;
    const colleague = addAccount('demo-admin', { name: 'María Fernanda Rojas del Valle', email: 'colega@example.invalid', role: 'inspector' }).find(account => account.email === 'colega@example.invalid')!;
    const extraInspector = (options.inspectors || 1) > 1 ? addAccount('demo-admin', { name: 'Gabriel Alejandro Torres de la Vega', email: 'otro-inspector@example.invalid', role: 'inspector' }).find(account => account.email === 'otro-inspector@example.invalid')! : null;
    const draft = newInspection({ name: owner.name, email: owner.email, accountId: owner.id });
    const report: Inspection = {
      ...draft, area: 'Fundo – Armonía II – Taller de Mantenimiento', status: 'ready', type: 'Planeada',
      objective: 'Verificar las condiciones de seguridad de equipos y rutas de evacuación.',
      unfavorableCause: 'Los controles preventivos requieren seguimiento y verificación.',
      closingRemarks: 'Corregir las condiciones identificadas y verificar las medidas de control.',
      responsibles: [recipient, colleague].map(person => ({ id: crypto.randomUUID(), personId: person.id, name: person.name, email: person.email, jobTitle: 'Asistente de Seguridad y Salud en el Trabajo', area: 'SIGMA' })),
      additionalInspectors: extraInspector ? [{ id: crypto.randomUUID(), personId: extraInspector.id, name: extraInspector.name, email: extraInspector.email, jobTitle: 'Supervisor de Seguridad', area: 'SIGMA' }] : [],
      registrationDetails: { ...draft.registrationDetails, [owner.id]: { ...draft.registrationDetails[owner.id], jobTitle: 'Supervisor de Seguridad', date: draft.date } },
      observations: Array.from({ length: options.count || 12 }, (_, index) => ({ ...newObservation(draft.date), description: `Hallazgo ${index + 1}: mejorar las condiciones del área de trabajo.`, correctiveAction: `Aplicar y verificar la medida correctiva ${index + 1}.` })),
      delivery: { sentAt: new Date().toISOString(), recipientIds: [recipient.id, colleague.id], revision: 1, corrections: {} },
    };
    if (options.executedFirst) report.delivery!.corrections[report.observations[0].id] = { ...blankCorrection(report, report.observations[0].id, recipient), action: 'Corrección ejecutada y verificada.', state: 'Ejecutado', proposedState: 'Ejecutado', decision: 'approved', note: '' };
    await persistInspection(report); return report.id;
  }, options);
  await page.reload();
  await openExistingReport(page, !!options.recipientView);
  return id;
}

async function openExistingReport(page: Page, recipientView = false) {
  const menu = page.getByRole('button', { name: 'Abrir menú', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.locator('.sidebar-nav').getByRole('button', { name: recipientView ? 'Buzón de Inspecciones' : 'Mis inspecciones', exact: true }).click();
  await page.getByRole('button', { name: recipientView ? 'Revisar inspección' : 'Revisar informe', exact: true }).click();
  await page.getByRole('tab', { name: 'Observación 1', exact: true }).waitFor();
  await page.evaluate(() => document.fonts.ready);
}

for (const width of [1440, 768, 390]) test(`resumen compacto y observaciones por estado sin desborde (${width}px)`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const inspectors = width === 1440 ? 2 : 1;
  await openReport(page, { inspectors, count: 24, executedFirst: true });
  await expect(page.getByRole('region', { name: inspectors === 1 ? 'Responsable de la Inspección' : 'Responsables de la Inspección', exact: true })).toBeVisible();
  await expect(page.locator('.followup-people-grid')).not.toContainText('@');
  const self = page.locator('.followup-person').filter({ has: page.locator('.followup-person-self') });
  await expect(self).toHaveCount(1);
  await expect(self.locator('.followup-person-self')).toHaveText('(Tu)');
  await expect(page.getByRole('region', { name: inspectors === 1 ? 'Responsable de la Inspección' : 'Responsables de la Inspección', exact: true }).locator('.followup-person-self')).toHaveCount(1);
  await expect(page.getByRole('region', { name: 'Responsables del Levantamiento', exact: true })).toBeVisible();
  const details = page.locator('.followup-report-details');
  await expect(details).toHaveJSProperty('open', false);
  await expect(details.getByText('Verificar las condiciones de seguridad de equipos y rutas de evacuación.', { exact: true })).toBeHidden();
  const tabs = page.getByRole('tablist', { name: 'Observaciones de la inspección', exact: true });
  await expect(tabs.getByRole('tab')).toHaveCount(24);
  const executed = tabs.getByRole('tab', { name: 'Observación 1', exact: true });
  const pending = tabs.getByRole('tab', { name: 'Observación 2', exact: true });
  await expect(executed).toHaveAccessibleDescription('Ejecutado');
  await expect(pending).toHaveAccessibleDescription('Pendiente');
  const executedTone = await executed.evaluate(element => getComputedStyle(element).backgroundColor);
  const pendingTone = await pending.evaluate(element => getComputedStyle(element).backgroundColor);
  expect(executedTone).not.toBe(pendingTone);
  const riskTone = await page.getByRole('tabpanel').locator('.severity-badge').evaluate(element => getComputedStyle(element).backgroundColor);
  expect(executedTone).not.toBe(riskTone); expect(pendingTone).not.toBe(riskTone);
  await expect(page.getByRole('tabpanel').getByLabel('Estado', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('tabpanel').getByRole('region', { name: 'Estado del levantamiento', exact: true })).toContainText('Levantamiento aprobado.');
  await expect(page.getByRole('tabpanel').getByRole('region', { name: 'Estado del levantamiento', exact: true })).not.toContainText(/Ejecutado|Pendiente/);
  await expect(page.getByRole('tabpanel').locator('.observation-heading .list-status')).toHaveCSS('background-color', executedTone);
  await expect(page.getByRole('tabpanel').getByRole('region', { name: 'Conversación y seguimiento', exact: true })).toHaveCount(0);
  await pending.click();
  await expect(pending).toHaveAttribute('aria-selected', 'true');
  await expect(pending).toHaveCSS('background-color', pendingTone);
  await expect(page.getByRole('tabpanel')).toHaveCount(1);
  await expect(page.getByRole('tabpanel', { name: 'Observación 2', exact: true }).locator('.observation-heading .list-status')).toHaveCSS('background-color', pendingTone);
  const box = await pending.boundingBox(); expect(box).toBeTruthy();
  expect(box!.width).toBeGreaterThanOrEqual(44); expect(box!.width).toBeLessThanOrEqual(52); expect(box!.height).toBeGreaterThanOrEqual(44);
  await expect(page.getByText('Los comentarios de ambas partes aparecerán aquí.', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Se actualiza al aprobar el inspector.', { exact: true })).toHaveCount(0);
  const panel = page.getByRole('tabpanel');
  await expect(panel.getByRole('heading', { name: 'Tienes dudas, conversa con el inspector', exact: true })).toBeVisible();
  const gap = await panel.evaluate(element => element.querySelector('.correction-conversation')!.getBoundingClientRect().top - element.querySelector('.correction-layout')!.getBoundingClientRect().bottom);
  expect(gap).toBeGreaterThanOrEqual(16);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expectAccessible(page);
  await page.screenshot({ path: test.info().outputPath(`seguimiento-compacto-${width}.png`), fullPage: true });
  await details.locator('summary').click();
  await expect(details).toHaveJSProperty('open', true);
  await expect(details.getByRole('heading', { name: 'Conclusiones y Recomendaciones', exact: true })).toBeVisible();
  await expectAccessible(page);
  await details.screenshot({ path: test.info().outputPath(`detalles-inspeccion-${width}.png`) });
  await details.locator('summary').click(); await expect(details).toHaveJSProperty('open', false);
  await page.evaluate(async () => { document.documentElement.style.zoom = '150%'; await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('los números admiten teclado y conservan acciones, fotos y mensajes pendientes entre observaciones', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const id = await openReport(page, { recipientView: true, count: 24 });
  await expect(page.getByRole('region', { name: 'Responsables del Levantamiento', exact: true }).locator('.followup-person-self')).toHaveCount(1);
  await expect(page.getByRole('region', { name: 'Responsable de la Inspección', exact: true }).locator('.followup-person-self')).toHaveCount(0);
  await expect(page.getByLabel('Responsable del Levantamiento')).toHaveCount(0);
  const first = page.getByRole('tab', { name: 'Observación 1', exact: true });
  const last = page.getByRole('tab', { name: 'Observación 24', exact: true });
  let panel = page.getByRole('tabpanel', { name: 'Observación 1', exact: true });
  await panel.getByRole('textbox', { name: 'Acción realizada', exact: true }).fill('Avance de la primera observación sin perder.');
  await panel.getByRole('textbox', { name: 'Escribir comentario', exact: true }).fill('Consulta todavía sin enviar.');
  await panel.getByLabel('Añadir evidencias del levantamiento', { exact: true }).setInputFiles(png);
  await expect(panel.locator('.followup-evidence img')).toHaveCount(1);
  await first.focus(); await first.press('End');
  await expect(last).toBeFocused(); await expect(last).toHaveAttribute('aria-selected', 'true');
  await expect(last).toBeInViewport();
  await expect(page.getByRole('tabpanel')).toHaveCount(1);
  panel = page.getByRole('tabpanel', { name: 'Observación 24', exact: true });
  await panel.getByRole('textbox', { name: 'Acción realizada', exact: true }).fill('Avance de la última observación.');
  await last.focus(); await last.press('Home');
  await expect(first).toBeFocused();
  panel = page.getByRole('tabpanel', { name: 'Observación 1', exact: true });
  await expect(panel.getByRole('textbox', { name: 'Acción realizada', exact: true })).toHaveValue('Avance de la primera observación sin perder.');
  await expect(panel.getByRole('textbox', { name: 'Escribir comentario', exact: true })).toHaveValue('Consulta todavía sin enviar.');
  await expect(panel.locator('.followup-evidence img')).toHaveCount(1);
  await page.getByRole('button', { name: 'Volver', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Hay cambios sin guardar.');
  await panel.getByRole('button', { name: 'Guardar Avance', exact: true }).click();
  await expect(panel.getByText('Avance guardado.', { exact: true })).toBeVisible();
  await first.focus(); await first.press('ArrowLeft'); await expect(last).toBeFocused();
  panel = page.getByRole('tabpanel', { name: 'Observación 24', exact: true });
  await expect(panel.getByRole('textbox', { name: 'Acción realizada', exact: true })).toHaveValue('Avance de la última observación.');
  await panel.getByRole('button', { name: 'Guardar Avance', exact: true }).click();
  await expect(panel.getByText('Avance guardado.', { exact: true })).toBeVisible();
  await last.focus(); await last.press('ArrowRight'); await expect(first).toBeFocused();
  panel = page.getByRole('tabpanel', { name: 'Observación 1', exact: true });
  await expect(panel.getByRole('textbox', { name: 'Escribir comentario', exact: true })).toHaveValue('Consulta todavía sin enviar.');
  await panel.getByRole('button', { name: 'Enviar comentario', exact: true }).click();
  await expect(panel.getByRole('textbox', { name: 'Escribir comentario', exact: true })).toHaveValue('');
  const stored = await page.evaluate(async id => {
    const { loadInspections } = await import('/src/model.ts');
    const report = (await loadInspections()).find(inspection => inspection.id === id)!;
    const { hasPendingChanges } = await import('/src/manual-save.ts');
    return { first: report.delivery!.corrections[report.observations[0].id], last: report.delivery!.corrections[report.observations[23].id], comment: report.delivery!.timeline?.find(event => event.action === 'comment')?.body, pending: hasPendingChanges() };
  }, id);
  expect(stored.first.action).toBe('Avance de la primera observación sin perder.');
  expect(stored.first.actorId).toBe('demo-admin'); expect(stored.last.actorId).toBe('demo-admin');
  expect(stored.first.responsibleName).not.toContain('(Tu)');
  expect(stored.first.photos).toHaveLength(1); expect(stored.last.action).toBe('Avance de la última observación.');
  expect(stored.comment).toBe('Consulta todavía sin enviar.'); expect(stored.pending).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('aprobar archiva solo los mensajes de esa observación y no muestra una conversación vacía', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const id = await openReport(page, { count: 3 });
  const result = await page.evaluate(async id => {
    const { loadInspections } = await import('/src/model.ts');
    const { readAccounts } = await import('/src/accounts.ts');
    const { addLocalComment, blankCorrection, saveCorrection, reviewCorrection } = await import('/src/follow-up.ts');
    let report = (await loadInspections()).find(inspection => inspection.id === id)!;
    const recipient = readAccounts().find(account => account.id === report.delivery!.recipientIds[0])!;
    const first = report.observations[0], second = report.observations[1];
    const operation = crypto.randomUUID();
    report = await addLocalComment(report, first.id, recipient.id, 'Consulta privada de la primera observación.', operation);
    report = await addLocalComment(report, first.id, report.ownerId, 'Respuesta del inspector a la primera observación.', crypto.randomUUID());
    for (const observation of [first, second]) {
      report = await saveCorrection(report, observation.id, recipient.id, { ...blankCorrection(report, observation.id, recipient), action: 'Acción realizada y verificada.' }, true);
      report = await reviewCorrection(report, observation.id, report.ownerId, true, '');
    }
    const count = report.delivery!.timeline!.length;
    const blocked = [];
    for (const actor of [recipient.id, report.ownerId]) {
      try { await addLocalComment(report, first.id, actor, 'Mensaje posterior no permitido.', crypto.randomUUID()); blocked.push(false); }
      catch (error) { blocked.push(error instanceof Error && error.message.includes('La conversación es de solo lectura')); }
    }
    const replay = await addLocalComment(report, first.id, recipient.id, 'Consulta privada de la primera observación.', operation);
    return { blocked, count, replayCount: replay.delivery!.timeline!.length };
  }, id);
  expect(result.blocked).toEqual([true, true]); expect(result.replayCount).toBe(result.count);
  await page.reload(); await openExistingReport(page);
  let panel = page.getByRole('tabpanel', { name: 'Observación 1', exact: true });
  const history = panel.getByRole('region', { name: 'Conversación y seguimiento', exact: true });
  await expect(history.getByRole('heading', { name: 'Conversación registrada', exact: true })).toBeVisible();
  await expect(history).toContainText('Consulta privada de la primera observación.');
  await expect(history).toContainText('Respuesta del inspector a la primera observación.');
  await expect(history.locator('.correction-review-message > p')).toHaveText(['Consulta privada de la primera observación.', 'Respuesta del inspector a la primera observación.']);
  await expect(history.getByRole('textbox')).toHaveCount(0);
  await expect(history.getByRole('button', { name: 'Enviar comentario', exact: true })).toHaveCount(0);
  await history.screenshot({ path: test.info().outputPath('conversacion-registrada.png') });
  await page.getByRole('tab', { name: 'Observación 2', exact: true }).click();
  panel = page.getByRole('tabpanel', { name: 'Observación 2', exact: true });
  await expect(panel.getByRole('region', { name: 'Conversación y seguimiento', exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Observación 3', exact: true }).click();
  panel = page.getByRole('tabpanel', { name: 'Observación 3', exact: true });
  await expect(panel.getByRole('textbox', { name: 'Escribir comentario', exact: true })).toBeVisible();
  await expect(panel.getByRole('region', { name: 'Conversación y seguimiento', exact: true })).not.toContainText('Consulta privada de la primera observación.');
  await expect(page.getByRole('tab', { name: 'Observación 1', exact: true })).toHaveAttribute('data-state', 'executed');
  await expect(page.getByRole('tab', { name: 'Observación 3', exact: true })).toHaveAttribute('data-state', 'pending');
});
