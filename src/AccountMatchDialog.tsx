import { useState } from 'react';
import { Check, LoaderCircle } from 'lucide-react';
import { Modal } from './components';
import type { AccountMatch, AccountResolutionMode } from './cloud-account';

const dateOf = (value: string) => new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', dateStyle: 'medium' }).format(new Date(value));
export function AccountMatchDialog({ matches, email, busy, error, onCancel, onResolve }: { matches: AccountMatch[]; email: string; busy: boolean; error: string; onCancel: () => void; onResolve: (match: AccountMatch, mode: AccountResolutionMode) => void }) {
  const pendingMatch = matches.find(item => item.pending);
  const [selected, setSelected] = useState(pendingMatch?.id || matches.find(item => item.owns_email)?.id || matches[0].id);
  const [mode, setMode] = useState<AccountResolutionMode | null>(null);
  const match = matches.find(item => item.id === selected)!;
  const chosenMode = match.pending?.mode || mode;
  const emailInUse = matches.some(item => !item.deleted_at && item.same_email);
  const emailBelongsToAnother = matches.some(item => item.owns_email && item.id !== selected);
  const canCreate = !emailInUse && !emailBelongsToAnother;
  const options: { value: AccountResolutionMode; label: string; description: string; enabled: boolean }[] = [
    { value: 'rehire', label: 'Es la misma persona que regresa', description: 'Tendrá un acceso nuevo, sin inspecciones anteriores. Su historial se agrupará como una sola persona en los filtros.', enabled: canCreate && match.can_rehire },
    { value: 'new_person', label: 'Es otra persona', description: 'Se creará una identidad independiente, sin vínculo ni acceso al historial de la persona anterior.', enabled: canCreate },
    { value: 'restore', label: 'Restablecer una eliminación por error', description: match.can_restore && match.restore_until ? `Disponible hasta el ${dateOf(match.restore_until)}. Recuperará las inspecciones que estaban pendientes al eliminarla, con una contraseña temporal nueva.` : 'Disponible durante los tres meses posteriores a la eliminación, mientras la cuenta no haya sido reemplazada.', enabled: match.can_restore && !emailInUse && !emailBelongsToAnother },
  ];
  return <Modal title="Encontramos una cuenta con datos coincidentes" onClose={() => !busy && onCancel()} wide>
    <p className="modal-description">{pendingMatch ? `Hay una operación pendiente para ${pendingMatch.pending!.input.full_name} (${pendingMatch.pending!.input.email}). Se retomará con los mismos datos y la misma opción, sin crear cuentas duplicadas.` : 'El nombre o el correo ya figura en Berry Safety. Indica si se trata de la misma persona o de alguien diferente antes de continuar.'}</p>
    <div className="account-match-candidates" aria-label="Cuentas coincidentes">{matches.map(item => <button type="button" key={item.id} disabled={busy || !!pendingMatch} aria-pressed={selected === item.id} onClick={() => { setSelected(item.id); setMode(null); }}><strong>{item.full_name}</strong><span>{item.email}</span><small>{[item.management, item.area, item.job_title].filter(Boolean).join(' · ')}</small><small>{item.deleted_at ? `Eliminada el ${dateOf(item.deleted_at)}` : 'Cuenta vigente'}</small></button>)}</div>
    {emailInUse && !pendingMatch && <p className="error-message cloud-message" role="status">El correo {email} pertenece a una cuenta vigente. Usa esa cuenta o indica otro correo para una persona distinta.</p>}
    {emailBelongsToAnother && !emailInUse && !pendingMatch && <p className="error-message cloud-message" role="status">Selecciona la cuenta eliminada que utiliza este correo para poder continuar.</p>}
    <fieldset className="account-resolution-options"><legend>¿Cómo deseas continuar?</legend>{options.map(option => <label key={option.value} className={chosenMode === option.value ? 'account-resolution-selected' : ''}><input type="radio" name="account-resolution" value={option.value} checked={chosenMode === option.value} disabled={busy || (pendingMatch ? option.value !== chosenMode : !option.enabled)} onChange={() => setMode(option.value)}/><span><strong>{option.label}</strong><small>{option.description}</small></span></label>)}</fieldset>
    {error && <p role="alert" className="error-message cloud-message">{error}</p>}
    <div className="modal-actions"><button type="button" className="button button-outline" disabled={busy} onClick={onCancel}>Cancelar</button><button type="button" className="button button-primary" disabled={busy || !chosenMode || !pendingMatch && !options.find(option => option.value === chosenMode)?.enabled} onClick={() => chosenMode && onResolve(match, chosenMode)}>{busy ? <LoaderCircle size={16} className="spin"/> : <Check size={16}/>} {busy ? 'Confirmando…' : pendingMatch ? 'Retomar operación' : chosenMode === 'restore' ? 'Restablecer cuenta' : 'Crear acceso'}</button></div>
  </Modal>;
}
