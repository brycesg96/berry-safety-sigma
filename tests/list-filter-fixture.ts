import type { Page } from '@playwright/test';

export const inspectionFilterLabels = { all: 'Todas tus inspecciones', draft: 'Borradores', pending: 'En espera de respuesta', review: 'Por validar / aprobar', closed: 'Cerradas' } as const;
export function inspectionFilterButton(page: Page, state: keyof typeof inspectionFilterLabels) {
  return page.getByRole('group', { name: 'Filtrar inspecciones por estado', exact: true }).getByRole('button', { name: new RegExp(`^${inspectionFilterLabels[state]}:`) });
}
export async function selectInspectionFilter(page: Page, state: keyof typeof inspectionFilterLabels) {
  await inspectionFilterButton(page, state).click();
}
