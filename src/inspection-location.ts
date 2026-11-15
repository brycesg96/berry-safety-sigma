import { locationCatalogState, locationNodeActive } from './location-catalog';
import { organizationErrors } from './organization';
export { INSPECTION_LOCATIONS } from './location-seed';
import { INSPECTION_LOCATIONS } from './location-seed';
export type InspectionLocation = { site: string; zone: string; detail: string; management?: string; department?: string; departmentNomenclature?: string; textOrder?: 'site-zone-area'; source?: 'catalog'; siteId?: string; zoneId?: string; installationId?: string; installationPending?: boolean; departmentDisplay?: string };
export const locationText = (value: InspectionLocation) => {
  const area = value.departmentDisplay?.trim() || value.departmentNomenclature?.trim() || value.department?.trim();
  // Unversioned locations retain the order of their historical reports.
  return [value.site, ...(value.source === 'catalog' || value.textOrder === 'site-zone-area' ? [value.zone, area] : [area, value.zone]), value.detail.trim()].filter(Boolean).join(' – ');
};
export function locationErrors(value: InspectionLocation, historical = false): Record<string, string> {
  const errors: Record<string, string> = !historical && ('management' in value || 'department' in value) ? organizationErrors(value.management || '', value.department || '') : {};
  if (value.source === 'catalog') {
    const catalog = locationCatalogState(), nodes = catalog.nodes;
    if (!historical) {
      const site = nodes.find(node => node.id === value.siteId && node.kind === 'site' && locationNodeActive(node, nodes));
      const zone = nodes.find(node => node.id === value.zoneId && node.kind === 'zone' && node.parent_id === site?.id && locationNodeActive(node, nodes));
      if (catalog.error || catalog.loading || catalog.mode === 'legacy') errors.site = 'El catálogo de sedes y zonas no está disponible. Actualízalo antes de continuar.';
      if (!site) errors.site = 'Selecciona una sede.';
      if (!zone) errors.zone = 'Selecciona una zona de inspección.';
      if (catalog.installationsReady && !nodes.some(node => node.id === value.installationId && node.kind === 'installation' && node.parent_id === zone?.id && locationNodeActive(node, nodes))) errors.installation = 'Selecciona una instalación de la zona elegida.';
    } else if (!value.site.trim() || !value.zone.trim() || !value.installationPending && !value.detail.trim()) errors.area = 'La ubicación inspeccionada está incompleta.';
  } else {
    if (!Object.hasOwn(INSPECTION_LOCATIONS, value.site)) errors.site = 'Selecciona una sede.';
    if (!INSPECTION_LOCATIONS[value.site]?.includes(value.zone)) errors.zone = 'Selecciona una zona de inspección.';
    if (!value.detail.trim()) errors.area = 'Indica la instalación o actividad inspeccionada.';
  }
  if (value.detail.length > 250) errors.area = 'Se permiten hasta 250 caracteres.';
  if (locationText(value).length > 500) errors.area = 'La combinación de sede, zona, área e instalación admite hasta 500 caracteres.';
  return errors;
}
