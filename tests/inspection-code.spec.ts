import { test, expect } from '@playwright/test';
import { formatInspectionCode, pendingCodeExample, pendingCodeLabel, submissionYear } from '../src/inspection-code';

test('formato IH, año Lima, secuencia de tres dígitos mínimos y sin vuelta a cero', () => {
  expect(formatInspectionCode(2026, 1)).toBe('IH-2026-001');
  expect(formatInspectionCode(2026, 2)).toBe('IH-2026-002');
  expect(formatInspectionCode(2027, 1)).toBe('IH-2027-001');
  expect(formatInspectionCode(2026, 1000)).toBe('IH-2026-1000');
  expect(submissionYear(new Date('2027-01-01T04:59:59Z'))).toBe(2026);
  expect(submissionYear(new Date('2027-01-01T05:00:00Z'))).toBe(2027);
  expect(pendingCodeExample(new Date('2026-11-04T17:00:00Z'))).toBe('IH-2026-001');
  expect(pendingCodeLabel(new Date('2026-11-04T17:00:00Z'))).toBe('IH-2026-001');
  expect(() => formatInspectionCode(2026, 0)).toThrow();
  expect(() => formatInspectionCode(2026, 1.5)).toThrow();
});

test('código no editable en dos navegadores; borradores no consumen correlativos', async ({ browser }) => {
  const first = await browser.newContext({ baseURL: test.info().project.use.baseURL }), second = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  try {
    for (const context of [first, second]) {
      const page = await context.newPage(); await page.goto('./');
      await expect(page.getByLabel('Código de inspección')).toHaveAttribute('readonly', '');
      await expect(page.getByLabel('Código de inspección')).toHaveValue(/^IH-\d{4}-001$/);
      await expect(page.getByText(/El código es tentativo y puede variar según quién envíe primero/)).toBeVisible();
    }
  } finally { await first.close(); await second.close(); }
});
