import { FileText, Search } from 'lucide-react';
import { Field, SectionTitle } from './components';
import { PerformersSection } from './PerformersSection';
import type { Inspection } from './model';
import type { RegistrationDetails } from './registration';
import { CLOSING_LIMIT, closingRemarksOf, NO_UNFAVORABLE_RESULTS } from './registration';

export function ClosingSection({ draft, errors, patch, onRegistrationChange, onRegistrationBusy }: { draft: Inspection; errors: Record<string, string>; patch: <K extends keyof Inspection>(key: K, value: Inspection[K]) => void; onRegistrationChange: (id: string, data: RegistrationDetails) => void; onRegistrationBusy?: (id: string, busy: boolean) => void }) {
  const fields = [
    { key: 'unfavorableCause', title: 'Descripción de la causa ante resultados desfavorables de la inspección', icon: <Search size={19}/>, value: draft.unfavorableCause || '', placeholder: `Debes consignar el origen o motivo raíz por el cual existe el acto o condición subestándar que detectaste en el campo. Recuerda que no se trata de volver a describir el problema, sino de responder ¿por qué ocurrió o por qué está presente ese hallazgo?\n\nSi no hubo hallazgos desfavorables, indica únicamente: ${NO_UNFAVORABLE_RESULTS}.` },
    { key: 'closingRemarks', title: 'Conclusiones y recomendaciones', icon: <FileText size={19}/>, value: closingRemarksOf(draft), placeholder: 'Lo que describas en las causas debe tener una solución directa y clara.\nPor ejemplo, si la causa fue falta de capacitación, la recomendación debe ser programar capacitación.' },
  ] as const;

  return <div className="form-body closing-body">
    {fields.map((field, i) => <div key={field.key}>
      {i > 0 && <div className="section-divider"/>}
      <section className="closing-entry">
        <SectionTitle title={field.title} icon={field.icon}/>
        <div className={`objective-field closing-text-field closing-text-${field.key}`}>
          <Field className="objective-input" label={field.title} required error={errors[field.key]}>{props => <textarea {...props}
            spellCheck lang="es-PE" rows={2} maxLength={CLOSING_LIMIT} value={field.value} placeholder={field.placeholder}
            onChange={e => patch(field.key, e.target.value)}
            onBlur={e => { if (field.key === 'unfavorableCause' && !e.target.value.trim()) patch(field.key, NO_UNFAVORABLE_RESULTS); }}/>}</Field>
          <span className="character-count">{field.value.length} / {CLOSING_LIMIT}</span>
        </div>
      </section>
    </div>)}
    <div className="section-divider"/>
    <PerformersSection draft={draft} errors={errors} onChange={people => patch('registrationParticipants', people)} onRegistrationChange={onRegistrationChange} onRegistrationBusy={onRegistrationBusy}/>
  </div>;
}
