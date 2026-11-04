import { useEffect, useId, useState } from 'react';
import { LoaderCircle, Mail, Search } from 'lucide-react';
import { Field } from './components';
import { searchDirectory } from './directory';
import type { DirectoryPerson } from './directory';
import type { Responsible } from './model';

export function ResponsiblePicker({ value, onChange, error, excludedIds }: { value: Responsible; onChange: (changes: Partial<Responsible>) => void; error?: string; excludedIds: string[] }) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [people, setPeople] = useState<DirectoryPerson[]>([]);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'unconfigured' | 'error'>('idle');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const refresh = () => setRetry(n => n + 1);
    window.addEventListener('berry-accounts-changed', refresh); window.addEventListener('storage', refresh);
    return () => { window.removeEventListener('berry-accounts-changed', refresh); window.removeEventListener('storage', refresh); };
  }, []);
  const searching = open && !value.personId && value.name.trim().length >= 2;
  useEffect(() => {
    setPeople([]); setActive(-1);
    if (!searching) { setState('idle'); return; }
    const controller = new AbortController();
    setState('loading');
    const timer = setTimeout(() => {
      searchDirectory(value.name, controller.signal).then(result => {
        if (controller.signal.aborted) return;
        setPeople(result.people); setState(result.status);
      }).catch(() => { if (!controller.signal.aborted) setState('error'); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [value.name, searching, retry]);
  const available = people.filter(p => !excludedIds.includes(p.id));
  const choose = (person: DirectoryPerson) => {
    onChange({ personId: person.id, name: person.name, email: person.email });
    setOpen(false); setActive(-1);
  };
  return <div className="field-grid picker-grid">
    <Field label="Nombre completo" required error={error} hint={value.personId ? 'Persona seleccionada del directorio.' : 'Escribe al menos dos letras y selecciona una persona.'}>{props => <div className="person-picker" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
      <div className="input-icon"><Search size={16} /><input {...props} role="combobox" autoComplete="off" aria-autocomplete="list" aria-expanded={searching} aria-controls={searching ? listId : undefined} aria-activedescendant={active >= 0 && active < available.length ? `${listId}-${active}` : undefined} value={value.name} placeholder="Buscar persona por nombre" maxLength={250} onFocus={() => setOpen(true)} onChange={e => { onChange({ name: e.target.value, email: '', personId: undefined }); setOpen(true); setActive(-1); }} onKeyDown={event => {
        if (event.key === 'Escape') { setOpen(false); setActive(-1); return; }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault(); setOpen(true);
          if (!available.length) return;
          setActive(i => event.key === 'ArrowDown' ? (i + 1) % available.length : (i <= 0 ? available.length - 1 : i - 1));
        }
        if (event.key === 'Enter' && active >= 0 && available[active]) { event.preventDefault(); choose(available[active]); }
      }} /></div>
      {searching && <div className="directory-dropdown"><div id={listId} role="listbox" aria-label="Personas del directorio" aria-busy={state === 'loading'}>{available.map((p, i) => <button type="button" tabIndex={-1} role="option" id={`${listId}-${i}`} aria-selected={active === i} key={p.id} onMouseDown={e => e.preventDefault()} onClick={() => choose(p)} className={active === i ? 'highlighted' : ''}><strong>{p.name}</strong><span>{p.email}</span></button>)}</div>
        {state === 'loading' && <p role="status"><LoaderCircle size={14} className="spin" />Buscando personas…</p>}
        {state === 'unconfigured' && <p role="status">El directorio de cuentas aún no está conectado. El administrador debe habilitarlo para seleccionar responsables.</p>}
        {state === 'ready' && !available.length && <p role="status">No hay personas disponibles con ese nombre.</p>}
        {state === 'error' && <p role="alert">No se pudo consultar el directorio. <button type="button" className="text-button" onMouseDown={e => e.preventDefault()} onClick={() => setRetry(n => n + 1)}>Reintentar</button></p>}
      </div>}
    </div>}</Field>
    <Field label="Correo electrónico">{props => <div className="input-icon"><Mail size={16} /><input {...props} type="email" value={value.email} readOnly aria-readonly="true" placeholder="Se completa al seleccionar" /></div>}</Field>
  </div>;
}
