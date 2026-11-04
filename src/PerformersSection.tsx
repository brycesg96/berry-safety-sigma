import { Info, Plus, Trash2, UserRound } from 'lucide-react';
import { Field, SectionTitle } from './components';
import { ResponsiblePicker } from './ResponsiblePicker';
import type { Inspection } from './model';
import { newResponsible } from './model';

export function PerformersSection({ draft, errors, onChange }: { draft: Inspection; errors: Record<string, string>; onChange: (people: Inspection['additionalInspectors']) => void }) {
  return <section className="performers-section" aria-label="Realizado por">
    <div className="responsible-heading"><SectionTitle icon={<UserRound size={19}/>} title="Realizado por" subtitle="Hasta tres personas que realizaron la inspección."/>{draft.additionalInspectors.length < 2 && <button className="text-button" onClick={() => onChange([...draft.additionalInspectors, newResponsible()])}><Plus size={16}/>Añadir inspector</button>}</div>
    <div className="responsible-row primary-inspector"><span className="responsible-number">1</span><div className="field-grid"><Field label="Nombre completo" required error={errors.inspector}>{props => <input {...props} value={draft.inspector} readOnly/>}</Field><Field label="Correo del inspector" required error={errors.inspectorEmail}>{props => <input {...props} type="email" value={draft.inspectorEmail} readOnly/>}</Field></div></div>
    <AdditionalInspectors draft={draft} errors={errors} onChange={onChange}/>
    <div className="inline-note"><Info size={15}/>Estos datos se incluirán en el informe de inspección.</div>
  </section>;
}

export function AdditionalInspectors({ draft, errors, onChange }: { draft: Inspection; errors: Record<string, string>; onChange: (people: Inspection['additionalInspectors']) => void }) {
  return <>
    {draft.additionalInspectors.map((p, i) => <div className="responsible-row additional-inspector" key={p.id}><span className="responsible-number">{i + 2}</span><ResponsiblePicker value={p} emailLabel="Correo del inspector" error={errors[`inspector-${p.id}`]} excludedIds={[draft.ownerId, ...draft.additionalInspectors.filter(other => other.id !== p.id && other.personId).map(other => other.personId!)]} excludedEmails={[draft.inspectorEmail, ...draft.additionalInspectors.filter(other => other.id !== p.id).map(other => other.email)]} onChange={changes => onChange(draft.additionalInspectors.map(other => other.id === p.id ? { ...other, ...changes } : other))}/><button className="icon-button delete-button" aria-label={`Eliminar inspector ${i + 2}`} onClick={() => onChange(draft.additionalInspectors.filter(other => other.id !== p.id))}><Trash2 size={16}/></button></div>)}
    {errors.additionalInspectors && <p className="error-message" role="alert">{errors.additionalInspectors}</p>}
  </>;
}
