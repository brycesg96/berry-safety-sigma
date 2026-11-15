import { Field } from './components';
import { Select } from './Select';
import { ORGANIZATION_CATALOG } from './organization-catalog';
import { organizationOptions } from './organization';

export function OrganizationFields({ management, area, onChange, disabled = false, supported = true, legacyArea = true, errors = {} }: {
  management: string; area: string; onChange: (value: { management: string; area: string }) => void;
  disabled?: boolean; supported?: boolean; legacyArea?: boolean; errors?: Record<string, string>;
}) {
  const available = supported && ORGANIZATION_CATALOG.length > 0;
  const options = organizationOptions(management, area);
  return <div className="field-grid organization-fields">
    <Field label="Gerencia" required={available} error={errors.management}>{props => <Select {...props} searchable searchLabel="Buscar gerencias" disabled={disabled || !available} options={options.managements} placeholder="Selecciona una gerencia" value={management} onChange={value => onChange({ management: value, area: value === management ? area : '' })}/>}</Field>
    <Field label="Área" required={available || legacyArea} error={errors.department} hint={!available && legacyArea ? 'Usa el nombre formal del área, con mayúscula inicial y respetando las siglas.' : undefined}>{props => available || !legacyArea ? <Select {...props} searchable searchLabel="Buscar áreas" disabled={disabled || !available || !management} options={options.areas} placeholder="Selecciona un área" value={area} onChange={value => onChange({ management, area: value })}/> : <input {...props} required maxLength={250} disabled={disabled} autoCapitalize="sentences" value={area} onChange={event => onChange({ management, area: event.target.value })}/>}</Field>
  </div>;
}
