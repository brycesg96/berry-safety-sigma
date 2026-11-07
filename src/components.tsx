import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { X, ShieldCheck, Check, ChevronDown, LockKeyhole } from 'lucide-react';

export function Brand({ dark = false }: { dark?: boolean }) {
  return <div className={`brand ${dark ? 'brand-dark' : ''}`}><div className="brand-symbol"><ShieldCheck size={25} strokeWidth={1.6} /></div><div><span>berry<span className="brand-dot">.</span></span><small>SAFETY WORKSPACE</small></div></div>;
}
export function Field({ label, required, error, hint, children, className = '' }: { label: string; required?: boolean; error?: string; hint?: string; children: (props: { id: string; 'aria-invalid': boolean; 'aria-required'?: boolean; 'aria-describedby'?: string }) => ReactNode; className?: string }) {
  const id = useId();
  return <div className={`field ${className} ${error ? 'field-error' : ''}`}><label htmlFor={id}>{label}{required && <span className="required" aria-hidden="true">*</span>}</label>{children({ id, 'aria-invalid': !!error, 'aria-required': required || undefined, 'aria-describedby': error || hint ? `${id}-hint` : undefined })}{(error || hint) && <span id={`${id}-hint`} className={error ? 'error-message' : 'field-hint'}>{error || hint}</span>}</div>;
}
export function LockedEmailField({ label, value, required, error }: { label: string; value: string; required?: boolean; error?: string }) {
  return <Field label={label} required={required} error={error}>{props => <div className="input-icon locked-email-control"><LockKeyhole size={16} aria-hidden="true"/><input {...props} type="email" value={value} readOnly aria-readonly="true" title="Correo del responsable. No se puede editar." placeholder="Se completa al seleccionar"/></div>}</Field>;
}
export function SectionTitle({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle?: string }) {
  return <div className="section-title"><div className="section-icon">{icon}</div><div><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}</div></div>;
}
export function Badge({ severity }: { severity: 'alta' | 'media' | 'baja' }) {
  return <span className={`severity-badge severity-${severity}`}><span />{severity === 'alta' ? 'Alta' : severity === 'media' ? 'Media' : 'Baja'}</span>;
}
export function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus({ preventScroll: true });
    function keydown(e: KeyboardEvent) {
      const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
      if (dialogs[dialogs.length - 1] !== ref.current) return;
      if (e.key === 'Escape') closeRef.current();
      if (e.key === 'Tab') {
        const focusable = ref.current?.querySelectorAll<HTMLElement>('button, input, textarea, a[href], [tabindex="0"]');
        if (!focusable?.length) return;
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', keydown);
    return () => { document.body.style.overflow = oldOverflow; document.removeEventListener('keydown', keydown); previous?.focus({ preventScroll: true }); };
  }, []);
  return <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}><div ref={ref} tabIndex={-1} className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId}><div className="modal-header"><h2 id={titleId}>{title}</h2><button className="icon-button" aria-label="Cerrar ventana" onClick={onClose}><X size={20} /></button></div>{children}</div></div>;
}
export function Stepper({ step, names, onStep }: { step: number; names: string[]; onStep: (index: number) => void }) {
  return <nav className="stepper" aria-label="Pasos de la inspección">{names.map((name, i) => <button key={name} onClick={() => onStep(i)} className={`step ${step === i ? 'step-active' : ''} ${i < step ? 'step-complete' : ''}`} aria-current={step === i ? 'step' : undefined}><span className="step-number">{i < step ? <Check size={15} strokeWidth={2.5} /> : `0${i + 1}`}</span><span className="step-label">{name}</span>{i === step && <ChevronDown className="step-chevron" size={13} />}</button>)}</nav>;
}
