import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import './location-fields.css';

type Props = {
  id: string; value: string; options: readonly string[]; placeholder: string; disabled?: boolean;
  'aria-invalid': boolean; 'aria-required'?: boolean; 'aria-describedby'?: string;
  icon: ReactNode; onChange: (value: string) => void;
};
const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');

/** Select-only combobox: the trigger retains keyboard focus while the list opens. */
export function LocationSelect({ value, options, placeholder, disabled, icon, onChange, ...field }: Props) {
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const listId = useId(), choices = [placeholder, ...options];
  const selected = Math.max(0, options.indexOf(value) + 1);
  const [open, setOpen] = useState(false), [active, setActive] = useState(selected);
  const [placement, setPlacement] = useState({ above: false, height: 280 });
  const search = useRef({ text: '', at: 0 });
  const blocked = disabled || !options.length;
  const show = (index = selected) => { if (!blocked && !trigger.current?.matches(':disabled')) { setActive(index); setOpen(true); search.current = { text: '', at: 0 }; } };
  const choose = (index: number) => { const next = index === 0 ? '' : options[index - 1]; if (next !== value) onChange(next); setOpen(false); };
  useEffect(() => { setOpen(false); }, [disabled, options.join('\u0000')]);
  useLayoutEffect(() => {
    if (!open) return;
    const position = () => {
      const rect = root.current!.getBoundingClientRect(), viewport = window.visualViewport;
      const bottom = (viewport?.offsetTop || 0) + (viewport?.height || innerHeight), top = viewport?.offsetTop || 0;
      const below = bottom - rect.bottom - 12, above = rect.top - top - 12;
      const upwards = below < Math.min(210, choices.length * 42 + 12) && above > below;
      setPlacement({ above: upwards, height: Math.max(80, Math.min(280, upwards ? above : below)) });
    };
    position(); window.addEventListener('resize', position); window.visualViewport?.addEventListener('resize', position);
    return () => { window.removeEventListener('resize', position); window.visualViewport?.removeEventListener('resize', position); };
  }, [open, choices.length]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  useEffect(() => {
    if (open) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active, listId, placement.height]);
  function keydown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'Tab') { if (open) choose(active); return; }
    if (event.key === 'Escape') { if (open) { event.preventDefault(); event.stopPropagation(); setOpen(false); } return; }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(event.key)) {
      event.preventDefault();
      if (event.key === 'Enter' || event.key === ' ') { if (open) choose(active); else show(); }
      else if (event.key === 'Home') { if (!open) show(0); else setActive(0); }
      else if (event.key === 'End') { if (!open) show(choices.length - 1); else setActive(choices.length - 1); }
      else if (!open) show(selected || (event.key === 'ArrowUp' ? choices.length - 1 : 1));
      else setActive(index => Math.max(0, Math.min(choices.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1))));
      return;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault();
      const time = Date.now(), typed = (time - search.current.at < 700 ? search.current.text : '') + event.key;
      const repeated = [...typed].every(char => normalize(char) === normalize(typed[0]));
      const query = normalize(repeated ? event.key : typed);
      const start = repeated ? (open ? active : selected) + 1 : 0;
      const index = choices.map((_, offset) => (start + offset) % choices.length).find(i => normalize(choices[i]).startsWith(query));
      if (!open) show(index ?? selected); else if (index !== undefined) setActive(index);
      search.current = { text: typed, at: time };
    }
  }
  return <div className="location-select" ref={root} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <button {...field} ref={trigger} type="button" role="combobox" className={`location-select-trigger ${value ? 'has-value' : ''}`} disabled={blocked} aria-expanded={open} aria-haspopup="listbox" aria-controls={open ? listId : undefined} aria-activedescendant={open ? `${listId}-${active}` : undefined} onClick={() => open ? setOpen(false) : show()} onKeyDown={keydown}>
      <span className="location-select-icon" aria-hidden="true">{icon}</span><span className="location-select-value">{value || placeholder}</span><ChevronDown size={17} className="location-select-chevron" aria-hidden="true"/>
    </button>
    {open && <div id={listId} role="listbox" aria-labelledby={field.id} className={`location-select-menu ${placement.above ? 'opens-above' : ''}`} style={{ maxHeight: placement.height }}>
      {choices.map((label, index) => <button type="button" role="option" tabIndex={-1} key={label} id={`${listId}-${index}`} aria-selected={selected === index} className={`location-select-option ${index === active ? 'is-active' : ''} ${index === 0 ? 'is-placeholder' : ''}`} onMouseEnter={() => setActive(index)} onPointerDown={event => event.preventDefault()} onClick={() => { choose(index); trigger.current?.focus(); }}><span>{label}</span>{selected === index && index > 0 && <Check size={16} aria-hidden="true"/>}</button>)}
    </div>}
  </div>;
}
