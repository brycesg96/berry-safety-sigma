import { ORGANIZATION_CATALOG, organizationCatalogState } from './organization-catalog';
import type { OrganizationEntry } from './organization-catalog';
import type { SelectOption } from './Select';
import { organizationLabel } from './organization-label';

export function organizationOptions(management: string, area: string, catalog: readonly OrganizationEntry[] = ORGANIZATION_CATALOG, jobTitle = '') {
  const includeCurrent = (values: readonly string[], current: string): SelectOption[] => [...new Set([...values, ...(current && !values.includes(current) ? [current] : [])])].map(value => ({ value, label: organizationLabel(value) }));
  return {
    managements: includeCurrent(catalog.map(entry => entry.management), management),
    areas: includeCurrent(catalog.find(entry => entry.management === management)?.areas || [], area).map(option => ({ ...option, label: areaDisplayName({ management, area: option.value }, catalog), description: areaNomenclature({ management, area: option.value }, catalog) ? option.label : undefined })),
    positions: includeCurrent(catalog.find(entry => entry.management === management)?.positions?.[area] || [], jobTitle),
  };
}
export const organizationCatalogReady = (catalog: readonly OrganizationEntry[] = ORGANIZATION_CATALOG) => catalog.length > 0 && catalog.every(entry => entry.areas.length > 0 && entry.areas.every(area => (entry.positions?.[area]?.length || 0) > 0));
export function profileOrganizationErrors(management: string, area: string, jobTitle: string, required = false, catalog: readonly OrganizationEntry[] = ORGANIZATION_CATALOG) {
  if (required && !organizationCatalogReady(catalog)) return { organization: 'La lista de gerencias, áreas y puestos está pendiente de configuración. Contacta a un administrador para completar tu perfil.' };
  const errors: Record<string, string> = organizationErrors(management, area, catalog);
  if (catalog.length && !catalog.find(entry => entry.management === management)?.positions?.[area]?.includes(jobTitle)) errors.job_title = 'Selecciona un puesto del área elegida.';
  return errors;
}
export function organizationErrors(management: string, area: string, catalog: readonly OrganizationEntry[] = ORGANIZATION_CATALOG) {
  const errors: Record<string, string> = {};
  if (!catalog.length) {
    if (catalog === ORGANIZATION_CATALOG && organizationCatalogState().mode === 'cloud') errors.management = 'El catálogo de áreas no está disponible. Actualízalo antes de continuar.';
    return errors;
  }
  const entry = catalog.find(item => item.management === management);
  if (!entry) errors.management = 'Selecciona una gerencia.';
  if (!entry?.areas.includes(area)) errors.department = 'Selecciona un área de la gerencia elegida.';
  return errors;
}
type AreaIdentity = { management?: string; area?: string; areaNomenclature?: string };
export function areaNomenclature(person: AreaIdentity, catalog: readonly OrganizationEntry[] = ORGANIZATION_CATALOG): string {
  const entries = person.management ? catalog.filter(entry => entry.management === person.management) : catalog.filter(entry => entry.areas.includes(person.area || ''));
  const aliases = entries.length === 1 ? entries[0].areaNomenclatures : undefined;
  return aliases && Object.hasOwn(aliases, person.area || '') ? aliases[person.area || ''].trim() : person.areaNomenclature?.trim() || '';
}
export const areaDisplayName = (person: AreaIdentity, catalog: readonly OrganizationEntry[] = ORGANIZATION_CATALOG) => areaNomenclature(person, catalog) || organizationLabel(person.area);
export const organizationDetails = (person: AreaIdentity & { jobTitle?: string }) => [organizationLabel(person.management), areaDisplayName(person), organizationLabel(person.jobTitle)].filter(Boolean).join(' — ');
