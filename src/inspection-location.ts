// Operational locations supplied by the organization. Retired sites are omitted.
export const INSPECTION_LOCATIONS: Record<string, readonly string[]> = {
  Fundo: ['Armonía I', 'Armonía II', 'Armonía III', 'Armonía IV', 'Esperanza I', 'Esperanza II', 'Esperanza III', 'Ilusión I', 'Ilusión II', 'Remanso I', 'Remanso II', 'San Luis', 'Tumi'],
  Exteriores: ['Chao', 'Otros', 'Semillero'],
  'Packing Chao': ['Packing Chao'],
  'Packing Salaverry': ['Packing Salaverry'],
  Trujillo: ['Quintanas'],
};
export type InspectionLocation = { site: string; zone: string; detail: string };
export const locationText = (value: InspectionLocation) => [value.site, value.zone, value.detail.trim()].filter(Boolean).join(' – ');
export function locationErrors(value: InspectionLocation): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!Object.hasOwn(INSPECTION_LOCATIONS, value.site)) errors.site = 'Selecciona una sede.';
  if (!INSPECTION_LOCATIONS[value.site]?.includes(value.zone)) errors.zone = 'Selecciona una zona de inspección.';
  if (!value.detail.trim()) errors.area = 'Indica la instalación o actividad inspeccionada.';
  if (value.detail.length > 250) errors.area = 'Se permiten hasta 250 caracteres.';
  return errors;
}
