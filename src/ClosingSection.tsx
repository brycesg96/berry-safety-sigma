import { FileText, Search } from 'lucide-react';
import { Field, SectionTitle } from './components';
import { PerformersSection } from './PerformersSection';
import type { Inspection } from './model';
import type { RegistrationDetails } from './registration';
import { CLOSING_LIMIT, closingRemarksOf } from './registration';
export function ClosingSection({ draft, errors, patch, onRegistrationChange }: { draft: Inspection; errors: Record<string, string>; patch: <K extends keyof Inspection>(key: K, value: Inspection[K]) => void; onRegistrationChange: (id: string, data: RegistrationDetails) => void }) {
  return <div className="form-body closing-body">
    {([{ key: 'unfavorableCause', title: 'DESCRIPCIÓN DE LA CAUSA ANTE RESULTADOS DESFAVORABLES DE LA INSPECCIÓN', icon: <Search size={19}/>, value: draft.unfavorableCause || '', placeholder: 'Describe las causas de los resultados desfavorables. Si no corresponde, indica No aplica.', required: false }, { key: 'closingRemarks', title: 'CONCLUSIONES Y RECOMENDACIONES', icon: <FileText size={19}/>, value: closingRemarksOf(draft), placeholder: 'Resume las conclusiones y las recomendaciones de la inspección.', required: true }] as const).map((field, i) => <div key={field.key}>{i > 0 && <div className="section-divider"/>}<section className="closing-entry"><SectionTitle title={field.title} icon={field.icon}/><div className="objective-field"><Field className="objective-input" label={field.title} required={field.required} error={errors[field.key]}>{props => <textarea {...props} spellCheck lang="es-PE" rows={2} maxLength={CLOSING_LIMIT} value={field.value} placeholder={field.placeholder} onChange={e => patch(field.key, e.target.value)}/>}</Field><span className="character-count">{field.value.length} / {CLOSING_LIMIT}</span></div></section></div>)}
    <div className="section-divider"/><PerformersSection draft={draft} errors={errors} onChange={people => patch('registrationParticipants', people)} onRegistrationChange={onRegistrationChange}/>
  </div>;
}
