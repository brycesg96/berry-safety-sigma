import type { ButtonHTMLAttributes } from 'react';
import { Check, CircleAlert, LoaderCircle, Save } from 'lucide-react';

export type SavePhase = 'idle' | 'pending' | 'success' | 'error';

export function SaveButton({ phase = 'idle', label = 'Guardar', className = 'button button-outline', ...props }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & { phase?: SavePhase; label?: string }) {
  const Icon = phase === 'pending' ? LoaderCircle : phase === 'success' ? Check : phase === 'error' ? CircleAlert : Save;
  return <button type="button" {...props} className={`${className} save-feedback`} data-save-phase={phase} aria-busy={phase === 'pending'}>
    <Icon key={phase} size={16} className={phase === 'pending' ? 'spin' : 'save-feedback-icon'} aria-hidden="true"/>
    <span className="save-feedback-label"><span className="save-feedback-reserve" aria-hidden="true">{label}</span><span className="save-feedback-reserve" aria-hidden="true">Guardando…</span><span>{phase === 'pending' ? 'Guardando…' : label}</span></span>
  </button>;
}
