import type { AccountPermissions } from './cloud-account';

export function AccessSwitches({ value, onChange, disabled = false }: { value: AccountPermissions; onChange: (value: AccountPermissions) => void; disabled?: boolean }) {
  const options = [
    { label: 'Hacer inspecciones', active: value.can_create_inspections, change: () => onChange({ ...value, can_create_inspections: !value.can_create_inspections }) },
    { label: 'Recibir inspecciones', active: value.can_receive_inspections, change: () => onChange({ ...value, can_receive_inspections: !value.can_receive_inspections }) },
    { label: 'Administrador', active: value.role === 'admin', change: () => onChange({ ...value, role: value.role === 'admin' ? 'inspector' : 'admin' }) },
  ];
  return <fieldset className="access-switches"><legend>Accesos</legend><div className="access-switch-grid">{options.map(option => <div className="access-control" key={option.label}><span>{option.label}</span><button type="button" role="switch" aria-label={option.label} aria-checked={option.active} disabled={disabled} className={`access-toggle ${option.active ? 'access-on' : 'access-off'}`} onClick={option.change}><span/></button><small>{option.active ? 'Activado' : 'Desactivado'}</small></div>)}</div></fieldset>;
}
