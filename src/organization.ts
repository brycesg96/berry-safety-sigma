import { ORGANIZATION_CATALOG } from './organization-catalog';
import type { OrganizationEntry } from './organization-catalog';
import type { SelectOption } from './Select';

export function organizationOptions(management: string, area: string, catalog: readonly OrganizationEntry[] = ORGANIZATION_CATALOG) {
  const includeCurrent = (values: readonly string[], current: string): SelectOption[] => [...new Set([...values, ...(current && !values.includes(current) ? [current] : [])])].map(value => ({ value, label: value }));
  return {
    managements: includeCurrent(catalog.map(entry => entry.management), management),
    areas: includeCurrent(catalog.find(entry => entry.management === management)?.areas || [], area),
  };
}
export function organizationErrors(management: string, area: string, catalog: readonly OrganizationEntry[] = ORGANIZATION_CATALOG) {
  const errors: Record<string, string> = {};
  if (!catalog.length) return errors;
  const entry = catalog.find(item => item.management === management);
  if (!entry) errors.management = 'Selecciona una gerencia.';
  if (!entry?.areas.includes(area)) errors.department = 'Selecciona un área de la gerencia elegida.';
  return errors;
}
export const organizationDetails = (person: { management?: string; area?: string; jobTitle?: string }) => [person.management, person.area, person.jobTitle].map(value => value?.trim()).filter(Boolean).join(' — ');
