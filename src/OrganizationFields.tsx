import { Field } from './components';
import { Select } from './Select';
import { ORGANIZATION_CATALOG } from './organization-catalog';
import { organizationOptions } from './organization';
import { useOrganizationCatalog } from './useOrganizationCatalog';

export function OrganizationFields({ management, area, onChange, disabled = false, supported = true, legacyArea = true, required = false, errors = {} }: {
  management: string; area: string; onChange: (value: { management: string; area: string }) => void;
  disabled?: boolean; supported?: boolean; legacyArea?: boolean; required?: boolean; errors?: Record<string, string>;
}) {
  const catalogState = useOrganizationCatalog();
  const available = supported && ORGANIZATION_CATALOG.length > 0 && !catalogState.loading && !catalogState.error;
  const options = organizationOptions(management, area);
  return <div className="field-grid organization-fields">
    <Field label="Gerencia" required={available || required} error={errors.management}>{props => <Select {...props} searchable searchLabel="Buscar gerencias" disabled={disabled || !available} options={options.managements} placeholder="Selecciona una gerencia" value={management} onChange={value => onChange({ management: value, area: value === management ? area : '' })}/>}</Field>
    <Field label="Área" required={available || legacyArea || required} error={errors.department} hint={!available && legacyArea && catalogState.mode !== 'cloud' ? 'Usa el nombre formal del área, con mayúscula inicial y respetando las siglas.' : undefined}>{props => available || !legacyArea || catalogState.mode === 'cloud' ? <Select {...props} searchable searchLabel="Buscar áreas" disabled={disabled || !available || !management} options={options.areas} placeholder="Selecciona un área" value={area} onChange={value => onChange({ management, area: value })}/> : <input {...props} required maxLength={250} disabled={disabled} autoCapitalize="sentences" value={area} onChange={event => onChange({ management, area: event.target.value })}/>}</Field>
  </div>;
}

export function ProfileOrganizationFields({ management, area, jobTitle, onChange, disabled = false, supported = true, required = false }: {
  management: string; area: string; jobTitle: string; onChange: (value: { management: string; area: string; jobTitle: string }) => void;
  disabled?: boolean; supported?: boolean; required?: boolean;
}) {
  const catalogState = useOrganizationCatalog();
  const available = supported && ORGANIZATION_CATALOG.length > 0 && !catalogState.loading && !catalogState.error;
  const options = organizationOptions(management, area, ORGANIZATION_CATALOG, jobTitle);
  return <>
    <OrganizationFields management={management} area={area} supported={supported} disabled={disabled} required={required} legacyArea={!required} onChange={value => onChange({ ...value, jobTitle: !available || value.management === management && value.area === area ? jobTitle : '' })}/>
    <Field label="Puesto" required={required || available} hint={!required && !available && catalogState.mode !== 'cloud' ? 'Usa el nombre formal del puesto, con mayúscula inicial y respetando las siglas.' : undefined}>{props => available || required || catalogState.mode === 'cloud' ? <Select {...props} searchable searchLabel="Buscar puestos" disabled={disabled || !available || !management || !area} options={options.positions} placeholder="Selecciona un puesto" value={jobTitle} onChange={value => onChange({ management, area, jobTitle: value })}/> : <input {...props} autoComplete="organization-title" maxLength={250} disabled={disabled} autoCapitalize="sentences" value={jobTitle} onChange={event => onChange({ management, area, jobTitle: event.target.value })}/>}</Field>
  </>;
}
