import { useId } from 'react';
import type { AccountPermissions } from './cloud-account';

export function AccessSwitches({ value, onChange, disabled = false }: { value: AccountPermissions; onChange: (value: AccountPermissions) => void; disabled?: boolean }) {
  const hintId = useId();
  const administrator = value.role === 'admin';
  const inspections = administrator || value.can_create_inspections && value.can_receive_inspections;
  const partial = !administrator && value.can_create_inspections !== value.can_receive_inspections;
  const options = [
    { label: 'Administrador', description: 'Gestionar cuentas, accesos e inspecciones.', active: administrator, locked: false, state: administrator ? 'Activado' : 'Desactivado', change: () => onChange({ ...value, role: administrator ? 'inspector' : 'admin', can_create_inspections: true, can_receive_inspections: true }) },
    { label: 'Inspecciones', description: administrator ? 'Incluido en Administrador: realizar y recibir inspecciones.' : 'Realizar y recibir inspecciones.', active: inspections, locked: administrator, state: partial ? value.can_create_inspections ? 'Actualmente solo puede realizar inspecciones.' : 'Actualmente solo puede recibir inspecciones.' : inspections ? 'Activado' : 'Desactivado', change: () => onChange({ ...value, can_create_inspections: !inspections, can_receive_inspections: !inspections }) },
  ];
  return <fieldset className="access-switches"><legend>Accesos</legend><div className="access-switch-grid">{options.map((option, index) => <div className="access-control" key={option.label}><span>{option.label}</span><button type="button" role="switch" aria-label={option.label} aria-describedby={`${hintId}-${index}`} aria-checked={option.active} disabled={disabled || option.locked} className={`access-toggle ${option.active ? 'access-on' : 'access-off'}`} onClick={option.change}><span/></button><small id={`${hintId}-${index}`}>{option.description}</small><small>{option.state}</small></div>)}</div></fieldset>;
}
