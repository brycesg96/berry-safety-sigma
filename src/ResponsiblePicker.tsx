import { useContext, useEffect, useId, useState } from 'react';
import { LoaderCircle, Search } from 'lucide-react';
import { Field, LockedEmailField } from './components';
import { searchDirectory } from './directory';
import type { DirectoryPerson } from './directory';
import { readAccounts } from './accounts';
import type { Responsible } from './model';
import { AccountDirectory } from './AccountDirectory';

export function ResponsiblePicker({ value, onChange, error, excludedIds, excludedEmails = [], emailLabel = 'Correo electrónico', purpose = 'receive' }: { value: Responsible; onChange: (changes: Partial<Responsible>) => void; error?: string; excludedIds: string[]; excludedEmails?: string[]; emailLabel?: string; purpose?: 'receive' | 'inspect' }) {
  const listId = useId();
  const directory = useContext(AccountDirectory);
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
      const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const search = directory ? Promise.resolve({ status: 'ready' as const, people: directory.filter(person => person.enabled && (purpose === 'inspect' ? person.canCreateInspections !== false : person.canReceiveInspections !== false) && normalize(`${person.name} ${person.email}`).includes(normalize(value.name))).slice(0, 20) }) : searchDirectory(value.name, controller.signal);
      search.then(result => {
        if (controller.signal.aborted) return;
        setPeople(result.people); setState(result.status);
      }).catch(() => { if (!controller.signal.aborted) setState('error'); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [value.name, searching, retry, directory, purpose]);
  const available = people.filter(p => !excludedIds.includes(p.id) && !excludedEmails.some(email => email.trim().toLowerCase() === p.email.trim().toLowerCase()));
  const choose = (person: DirectoryPerson) => {
    onChange({ personId: person.id, name: person.name, email: person.email, area: person.area || '', jobTitle: person.jobTitle || '' });
    setOpen(false); setActive(-1);
  };
  const currentPerson = value.personId ? (directory || readAccounts()).find(a => a.id === value.personId || a.email.toLowerCase() === value.email.toLowerCase()) : undefined;
  const selectedDetails = [currentPerson ? currentPerson.area : value.area, currentPerson ? currentPerson.jobTitle : value.jobTitle].map(text => text?.trim()).filter(Boolean).join(' — ');
  return <div className="field-grid picker-grid">
    <Field label="Nombre completo" required error={error} hint={value.personId ? selectedDetails || 'Área y puesto por completar.' : 'Escribe al menos dos letras y selecciona una persona.'}>{props => <div className="person-picker" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
      <div className="input-icon"><Search size={16} /><input {...props} role="combobox" autoComplete="off" aria-autocomplete="list" aria-expanded={searching} aria-controls={searching ? listId : undefined} aria-activedescendant={active >= 0 && active < available.length ? `${listId}-${active}` : undefined} value={value.name} placeholder="Buscar persona por nombre" maxLength={250} onFocus={() => setOpen(true)} onChange={e => { onChange({ name: e.target.value, email: '', personId: undefined, area: '', jobTitle: '' }); setOpen(true); setActive(-1); }} onKeyDown={event => {
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
    <LockedEmailField label={emailLabel} value={value.email}/>
  </div>;
}
