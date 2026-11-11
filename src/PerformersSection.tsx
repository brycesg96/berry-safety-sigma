import { Info, Plus, Trash2, UserRound } from 'lucide-react';
import { Field, LockedEmailField, SectionTitle } from './components';
import { ResponsiblePicker } from './ResponsiblePicker';
import type { Inspection } from './model';
import { RegistrationFields } from './RegistrationFields';
import type { RegistrationDetails } from './registration';
import { registrationParticipantsOf } from './registration';
import { newResponsible } from './model';

export function PerformersSection({ draft, errors, onChange, onRegistrationChange, onRegistrationBusy }: { draft: Inspection; errors: Record<string, string>; onChange: (people: Inspection['additionalInspectors']) => void; onRegistrationChange: (id: string, data: RegistrationDetails) => void; onRegistrationBusy?: (id: string, busy: boolean) => void }) {
  const participants = registrationParticipantsOf(draft);
  return <section className="performers-section" aria-label="RESPONSABLE DEL REGISTRO">
    <div className="responsible-heading"><SectionTitle icon={<UserRound size={19}/>} title="RESPONSABLE DEL REGISTRO" subtitle="Nombre, puesto, fecha y firma de hasta cuatro responsables."/>{participants.length < 3 && <button className="text-button" onClick={() => onChange([...participants, newResponsible()])}><Plus size={16}/>Añadir responsable</button>}</div>
    <div className="responsible-row primary-inspector"><span className="responsible-number">1</span><div className="field-grid"><Field label="Nombre completo" required error={errors.inspector}>{props => <input {...props} value={draft.inspector} readOnly/>}</Field><LockedEmailField label="Correo del responsable" value={draft.inspectorEmail} required error={errors.inspectorEmail}/></div></div>
    <RegistrationFields draft={draft} personId={draft.ownerId} email={draft.inspectorEmail} onChange={onRegistrationChange} onBusyChange={onRegistrationBusy}/>
    <AdditionalInspectors draft={draft} errors={errors} onChange={onChange} onRegistrationChange={onRegistrationChange} onRegistrationBusy={onRegistrationBusy} registration/>
    <div className="inline-note"><Info size={15}/>Estos datos se incluirán en el informe de inspección.</div>
  </section>;
}

export function AdditionalInspectors({ draft, errors, onChange, onRegistrationChange, onRegistrationBusy, registration = false }: { registration?: boolean; draft: Inspection; errors: Record<string, string>; onChange: (people: Inspection['additionalInspectors']) => void; onRegistrationChange?: (id: string, data: RegistrationDetails) => void; onRegistrationBusy?: (id: string, busy: boolean) => void }) {
  const people = registration ? registrationParticipantsOf(draft) : draft.additionalInspectors;
  const key = registration ? 'registrationParticipants' : 'additionalInspectors';
  return <>
    {people.map((p, i) => <div className="inspector-entry" key={p.id}><div className="responsible-row additional-inspector"><span className="responsible-number">{i + 2}</span><ResponsiblePicker purpose="inspect" showEmail={registration} value={p} emailLabel={registration ? 'Correo del responsable' : 'Correo del inspector'} error={errors[`${registration ? 'registrant' : 'inspector'}-${p.id}`]} excludedIds={[draft.ownerId, ...people.filter(other => other.id !== p.id && other.personId).map(other => other.personId!)]} excludedEmails={[draft.inspectorEmail, ...people.filter(other => other.id !== p.id).map(other => other.email)]} onChange={changes => onChange(people.map(other => other.id === p.id ? { ...other, ...changes } : other))}/><button className="icon-button delete-button" aria-label={`Eliminar ${registration ? 'responsable' : 'inspector'} ${i + 2}`} onClick={() => onChange(people.filter(other => other.id !== p.id))}><Trash2 size={16}/></button></div>{onRegistrationChange && p.personId && <RegistrationFields draft={draft} personId={p.personId} email={p.email} fallbackJobTitle={p.jobTitle} onChange={onRegistrationChange} onBusyChange={onRegistrationBusy}/>}</div>)}
    {errors[key] && <p className="error-message" role="alert">{errors[key]}</p>}
  </>;
}
