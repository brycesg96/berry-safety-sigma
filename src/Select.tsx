import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import './location-fields.css';

export type SelectOption = { value: string; label: string; description?: string };
type Common = {
  id?: string; options: readonly SelectOption[]; placeholder?: string; disabled?: boolean; icon?: ReactNode;
  searchable?: boolean; searchLabel?: string; className?: string; 'aria-label'?: string;
  'aria-invalid'?: boolean; 'aria-required'?: boolean; 'aria-describedby'?: string;
};
type Props = Common & ({ multiple?: false; value: string; onChange: (value: string) => void } | { multiple: true; value: string[]; onChange: (value: string[]) => void });
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim();

/** Shared platform selector: location styling, keyboard navigation and optional searchable multiple selection. */
export function Select(props: Props) {
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), input = useRef<HTMLInputElement>(null);
  const generatedId = useId(), id = props.id || generatedId, listId = `${id}-options`, summaryId = `${id}-selection`;
  const values = props.multiple ? props.value : [props.value];
  const [open, setOpen] = useState(false), [active, setActive] = useState(0), [query, setQuery] = useState('');
  const [placement, setPlacement] = useState({ above: false, height: 280 });
  const typed = useRef({ text: '', at: 0 });
  const choices = props.options.filter(option => normalize(`${option.label} ${option.description || ''}`).includes(normalize(query)));
  const selected = props.options.filter(option => values.includes(option.value));
  const selectionLabels = values.filter(Boolean).map(value => props.options.find(option => option.value === value)?.label || value);
  const selectedIndex = Math.max(0, choices.findIndex(option => values.includes(option.value)));
  const blocked = props.disabled || (!props.options.length && !selectionLabels.length);
  const close = () => { setOpen(false); setQuery(''); };
  const show = (index = selectedIndex) => { if (!blocked) { setActive(index); setOpen(true); setQuery(''); typed.current = { text: '', at: 0 }; } };
  const choose = (index: number) => {
    const choice = choices[index]; if (!choice) return;
    if (props.multiple) props.onChange(values.includes(choice.value) ? values.filter(value => value !== choice.value) : [...values, choice.value]);
    else { if (choice.value !== props.value) props.onChange(choice.value); close(); trigger.current?.focus(); }
  };
  useEffect(() => { if (props.disabled) close(); }, [props.disabled]);
  useEffect(() => { if (open && props.searchable) input.current?.focus({ preventScroll: true }); }, [open, props.searchable]);
  useLayoutEffect(() => {
    if (!open) return;
    const position = () => {
      const rect = root.current!.getBoundingClientRect(), viewport = window.visualViewport;
      const top = viewport?.offsetTop || 0, bottom = top + (viewport?.height || innerHeight);
      const below = bottom - rect.bottom - 12, above = rect.top - top - 12;
      const desired = choices.length * 42 + 12 + (props.searchable ? 54 : 0) + (props.multiple ? 50 : 0);
      const upwards = below < Math.min(210, desired) && above > below;
      setPlacement({ above: upwards, height: Math.max(100, Math.min(320, upwards ? above : below)) });
    };
    position(); window.addEventListener('resize', position); window.visualViewport?.addEventListener('resize', position);
    return () => { window.removeEventListener('resize', position); window.visualViewport?.removeEventListener('resize', position); };
  }, [open, choices.length]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) close(); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const option = document.getElementById(`${listId}-${active}`), list = option?.parentElement;
    if (!option || !list) return;
    // Scroll only the options, keeping the search field, footer and page still.
    const item = option.getBoundingClientRect(), bounds = list.getBoundingClientRect();
    if (item.top < bounds.top) list.scrollTop -= bounds.top - item.top;
    else if (item.bottom > bounds.bottom) list.scrollTop += item.bottom - bounds.bottom;
  }, [open, active, listId, placement.height]);
  function keydown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close(); trigger.current?.focus(); return; }
    if (event.key === 'Tab') { if (open && !props.multiple && !props.searchable) choose(active); return; }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(event.key) && !(event.currentTarget === input.current && [' ', 'Home', 'End'].includes(event.key))) {
      event.preventDefault();
      if (event.key === 'Enter' || event.key === ' ') { if (open) choose(active); else show(); }
      else if (event.key === 'Home') { if (!open) show(0); else setActive(0); }
      else if (event.key === 'End') { if (!open) show(choices.length - 1); else setActive(choices.length - 1); }
      else if (!open) show(selectedIndex || (event.key === 'ArrowUp' ? choices.length - 1 : choices[0]?.value === '' ? 1 : 0));
      else setActive(index => Math.max(0, Math.min(choices.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1))));
      return;
    }
    if (event.currentTarget !== input.current && event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault(); const time = Date.now(), text = (time - typed.current.at < 700 ? typed.current.text : '') + event.key;
      const repeated = [...text].every(char => normalize(char) === normalize(text[0]));
      const start = repeated ? (open ? active : selectedIndex) + 1 : 0, search = normalize(repeated ? event.key : text);
      const index = choices.map((_, offset) => (start + offset) % choices.length).find(i => normalize(choices[i].label).startsWith(search));
      if (!open) show(index ?? selectedIndex); else if (index !== undefined) setActive(index);
      typed.current = { text, at: time };
    }
  }
  const label = props.multiple ? selectionLabels.length > 1 ? `${selectionLabels.length} seleccionados` : selectionLabels[0] || props.placeholder : selected[0]?.label || props.placeholder;
  return <div className={`location-select ${props.className || ''}`} ref={root} onKeyDown={event => { if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close(); trigger.current?.focus(); } }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) close(); }}>
    <button id={id} ref={trigger} type="button" role="combobox" className={`location-select-trigger ${values.some(Boolean) ? 'has-value' : ''}`} disabled={blocked} data-value={props.multiple ? JSON.stringify(props.value) : props.value} aria-label={props['aria-label']} aria-invalid={props['aria-invalid']} aria-required={props['aria-required']} aria-describedby={[props['aria-describedby'], props.multiple ? summaryId : ''].filter(Boolean).join(' ') || undefined} aria-expanded={open} aria-haspopup="listbox" aria-controls={open ? listId : undefined} aria-activedescendant={open && !props.searchable && choices.length ? `${listId}-${active}` : undefined} onClick={() => open ? close() : show()} onKeyDown={keydown}>
      {props.icon && <span className="location-select-icon" aria-hidden="true">{props.icon}</span>}<span className="location-select-value">{label}</span><ChevronDown size={17} className="location-select-chevron" aria-hidden="true"/>
    </button>
    {props.multiple && <span id={summaryId} className="sr-only">{selectionLabels.join(', ') || props.placeholder}</span>}
    {open && <div className={`location-select-menu platform-select-menu ${placement.above ? 'opens-above' : ''}`} style={{ maxHeight: placement.height }}>
      {props.searchable && <div className="platform-select-search"><Search size={16} aria-hidden="true"/><input ref={input} type="search" aria-label={props.searchLabel || 'Buscar opciones'} placeholder="Buscar…" value={query} autoComplete="off" aria-controls={listId} aria-activedescendant={choices.length ? `${listId}-${active}` : undefined} onChange={event => { setQuery(event.target.value); setActive(0); }} onKeyDown={keydown}/></div>}
      <div id={listId} role="listbox" aria-labelledby={id} aria-multiselectable={props.multiple || undefined} className="platform-select-options">
        {choices.map((option, index) => <button type="button" role="option" tabIndex={-1} key={option.value} data-value={option.value} id={`${listId}-${index}`} aria-selected={values.includes(option.value)} className={`location-select-option ${index === active ? 'is-active' : ''} ${!option.value ? 'is-placeholder' : ''}`} onMouseEnter={() => setActive(index)} onPointerDown={event => event.preventDefault()} onClick={() => choose(index)}><span>{option.label}{option.description && <small>{option.description}</small>}</span>{values.includes(option.value) && option.value && <Check size={16} aria-hidden="true"/>}</button>)}
      </div>
      {!choices.length && <p className="platform-select-empty" role="status">Sin resultados para esta búsqueda.</p>}
      {props.multiple && <div className="platform-select-footer"><button type="button" disabled={!props.value.length} onClick={() => { props.onChange([]); setQuery(''); input.current?.focus(); }}>Limpiar selección</button><button type="button" onClick={() => { close(); trigger.current?.focus(); }}>Listo</button></div>}
    </div>}
  </div>;
}
