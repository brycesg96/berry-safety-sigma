import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, LoaderCircle, Plus, Search, UsersRound, Trash2, X } from 'lucide-react';
import { Field, Modal, SectionTitle } from './components';
import { cloudAccounts, createCloudAccount, manageCloudAccount } from './cloud-account';
import type { CloudProfile, AccountPermissions } from './cloud-account';
import { supervisorEmails } from './accounts';
import { TEMPORARY_PASSWORD } from '../shared/account-rules.mjs';
import { AccessSwitches } from './AccessSwitches';

const searchText = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('es').trim();
const initial = () => ({ full_name: '', email: '', area: '', job_title: '', role: 'inspector' as CloudProfile['role'], copies: '', can_create_inspections: false, can_receive_inspections: false });
const accessOf = (account: CloudProfile): AccountPermissions => ({ enabled: account.enabled, role: account.role, can_create_inspections: account.role === 'admin' || account.can_create_inspections === true, can_receive_inspections: account.role === 'admin' || account.can_receive_inspections === true });
export type CloudAdministrationCache = { actorId: string; accounts: CloudProfile[] | null; tab?: 'add' | 'users' };
type Confirmation = { account: CloudProfile; remove: boolean };
export function CloudAdministration({ actor, isCurrent, onSelfChange, cache, onBusyChange }: { actor: CloudProfile; isCurrent: () => boolean; onSelfChange?: (profile: CloudProfile) => void; cache?: { current: CloudAdministrationCache | null }; onBusyChange?: (busy: boolean) => void }) {
  const previous = cache?.current?.actorId === actor.id ? cache.current : null;
  const [accounts, setAccounts] = useState<CloudProfile[]>(() => previous?.accounts || []);
  const [query, setQuery] = useState('');
  const searchInput = useRef<HTMLInputElement>(null);
  const searchTerms = searchText(query).split(/\s+/).filter(Boolean);
  const visibleAccounts = accounts.filter(account => { const text = searchText([account.full_name, account.job_title, account.area].join(' ')); return searchTerms.every(term => text.includes(term)); });
  const [tab, setTab] = useState<'add' | 'users'>(previous?.tab || 'add');
  const tabRef = useRef(tab); tabRef.current = tab;
  const cacheAccounts = (value: CloudProfile[] | null) => {
    if (cache) cache.current = { actorId: actor.id, accounts: value, tab: tabRef.current };
  };
  useEffect(() => { if (cache) cache.current = { actorId: actor.id, accounts: cache.current?.actorId === actor.id ? cache.current.accounts : null, tab }; }, [actor.id, cache, tab]);
  const [form, setForm] = useState(initial);
  const [loading, setLoading] = useState(!previous?.accounts), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [message, setMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false), [retry, setRetry] = useState(0);
  const [editing, setEditing] = useState<CloudProfile | null>(null), [permissions, setPermissions] = useState<AccountPermissions>({ enabled: true, role: 'inspector', can_create_inspections: false, can_receive_inspections: false });
  const [editingCopies, setEditingCopies] = useState<CloudProfile | null>(null), [copies, setCopies] = useState('');
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const ready = typeof actor.can_create_inspections === 'boolean' && typeof actor.can_receive_inspections === 'boolean';
  const request = useRef<{ signature: string; id: string } | null>(null), current = useRef(isCurrent), live = useRef(true); current.current = isCurrent;
  useEffect(() => { onBusyChange?.(busy); return () => onBusyChange?.(false); }, [busy, onBusyChange]);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  useEffect(() => {
    let active = true; setLoading(!cache?.current?.accounts || cache.current.actorId !== actor.id); setError('');
    void cloudAccounts().then(next => { if (active && current.current()) { setAccounts(next); cacheAccounts(next); const own = next.find(item => item.id === actor.id); if (own && (own.access_revision !== actor.access_revision || own.can_create_inspections !== actor.can_create_inspections || own.can_receive_inspections !== actor.can_receive_inspections)) onSelfChange?.(own); } }).catch(problem => { if (active && current.current()) { setAccounts([]); cacheAccounts(null); setError(problem instanceof Error ? problem.message : 'No pudimos consultar las cuentas.'); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [actor.id, retry]);
  if (actor.role !== 'admin' || !actor.enabled || actor.must_change_password || actor.deleted_at) return <p role="alert">Esta sección requiere una cuenta administradora habilitada.</p>;
  const remember = (profile: CloudProfile) => {
    setAccounts(items => { const next = profile.deleted_at ? items.filter(item => item.id !== profile.id) : [...items.filter(item => item.id !== profile.id), profile]; cacheAccounts(next); return next; });
    if (profile.id === actor.id) onSelfChange?.(profile);
  };
  const submit = async () => {
    if (busy || !ready) return; setError(''); setMessage('');
    try {
      const values = { full_name: form.full_name.trim(), email: form.email.trim().toLowerCase(), area: form.area.trim(), job_title: form.job_title.trim(), role: form.role, supervisor_emails: supervisorEmails(form.copies), can_create_inspections: form.can_create_inspections, can_receive_inspections: form.can_receive_inspections };
      if (!values.full_name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) throw new Error('Completa el nombre y un correo válido.');
      const signature = JSON.stringify(values); if (request.current?.signature !== signature) request.current = { signature, id: crypto.randomUUID() };
      setBusy(true); const created = await createCloudAccount(values, request.current.id);
      if (!live.current || !current.current()) return; remember(created);
      setMessage(created.must_change_password ? `Cuenta creada para ${created.email}. Contraseña temporal: ${TEMPORARY_PASSWORD}. Deberá cambiarla al entrar.` : `La cuenta ${created.email} ya estaba creada y conserva su contraseña personal.`);
      setForm(initial()); request.current = null; setShowPassword(false);
    } catch (problem) { if (live.current && current.current()) setError(problem instanceof Error ? problem.message : 'No pudimos crear la cuenta.'); }
    finally { if (live.current) setBusy(false); }
  };
  const act = async (action: () => Promise<void>) => {
    if (busy) return; setBusy(true); setError(''); setMessage('');
    try { await action(); if (live.current && current.current()) { setEditing(null); setEditingCopies(null); setConfirmation(null); } }
    catch (problem) { if (live.current && current.current()) setError(problem instanceof Error ? problem.message : 'No se pudo completar la operación.'); }
    finally { if (live.current) setBusy(false); }
  };
  const field = <K extends keyof ReturnType<typeof initial>>(key: K, value: ReturnType<typeof initial>[K]) => { setForm(previous => ({ ...previous, [key]: value })); setMessage(''); };
  return <section className="cloud-administration" aria-label="Gestión de Cuentas">
    <div className="page-heading"><div><h1>Gestión de Cuentas</h1><p>Cuenta administradora: {actor.email}</p></div></div>
    <nav className="admin-tabs" aria-label="Gestión administrativa"><button type="button" aria-current={tab === 'add' ? 'page' : undefined} disabled={busy} onClick={() => { setError(''); setMessage(''); setTab('add'); }}>Agregar Usuario</button><button type="button" aria-current={tab === 'users' ? 'page' : undefined} disabled={busy} onClick={() => { setError(''); setMessage(''); setTab('users'); }}>Gestión de Usuarios</button></nav>
    {!ready && <p className="notice">La gestión de cuentas está pendiente de activación. Solicita al administrador que complete la configuración.</p>}
    {error && !editing && !editingCopies && !confirmation && <p role="alert" className="error-message cloud-message">{error}</p>}{message && <p role="status" className="account-success cloud-message">{message}</p>}
    {tab === 'add' ? <>
      <div className="form-card"><div className="form-body"><SectionTitle icon={<UsersRound size={20}/>} title="Agregar Usuario" subtitle="El usuario actualizará su contraseña temporal al entrar por primera vez."/>
        <form onSubmit={event => { event.preventDefault(); void submit(); }}>
          <div className="field-grid"><Field label="Nombres y apellidos" required hint="Escribe nombres y apellidos con sus iniciales en mayúscula.">{props => <input {...props} required autoComplete="off" autoCapitalize="words" maxLength={250} disabled={busy} value={form.full_name} onChange={event => field('full_name', event.target.value)}/>}</Field><Field label="Correo del usuario" required>{props => <input {...props} required type="email" autoComplete="off" maxLength={254} disabled={busy} value={form.email} onChange={event => field('email', event.target.value)}/>}</Field></div>
          <div className="field-grid"><Field label="Área" hint="Usa el nombre formal del área, con mayúscula inicial y respetando las siglas.">{props => <input {...props} maxLength={250} disabled={busy} autoCapitalize="sentences" value={form.area} onChange={event => field('area', event.target.value)}/>}</Field><Field label="Puesto" hint="Usa el nombre formal del puesto, con mayúscula inicial y respetando las siglas.">{props => <input {...props} maxLength={250} disabled={busy} autoCapitalize="sentences" value={form.job_title} onChange={event => field('job_title', event.target.value)}/>}</Field></div>
          <AccessSwitches value={{ ...form, enabled: true }} disabled={busy || !ready} onChange={next => setForm(previous => ({ ...previous, role: next.role, can_create_inspections: next.can_create_inspections, can_receive_inspections: next.can_receive_inspections }))}/>
          <Field label="Contraseña temporal" hint="Obligatorio cambiarla al iniciar sesión.">{props => <div className="cloud-password"><input {...props} type={showPassword ? 'text' : 'password'} autoComplete="off" readOnly value={TEMPORARY_PASSWORD}/><button className="icon-button" type="button" aria-label={showPassword ? 'Ocultar contraseña temporal' : 'Mostrar contraseña temporal'} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div>}</Field>
          <Field label="Administradores (CC)">{props => <textarea {...props} rows={2} maxLength={13000} disabled={busy} value={form.copies} onChange={event => field('copies', event.target.value)} placeholder="administrador@empresa.com, admin2@empresa.com"/>}</Field>
          <div className="admin-form-actions"><button type="submit" className="button button-primary" disabled={busy || loading || !ready}>{busy ? <LoaderCircle className="spin" size={18}/> : <Plus size={18}/>} {busy ? 'Creando cuenta…' : 'Crear usuario'}</button></div>
        </form>
      </div></div>
    </> : <div className="account-table-card"><div className="account-users-heading"><h2>Usuarios <span aria-live="polite" aria-atomic="true">{searchTerms.length ? `${visibleAccounts.length} de ${accounts.length}` : accounts.length}</span></h2><div className="account-user-search"><Search size={18} aria-hidden="true"/><input ref={searchInput} type="search" aria-label="Buscar usuarios por nombre, cargo o área" placeholder="Buscar por nombre, cargo o área" autoComplete="off" value={query} onChange={event => setQuery(event.target.value)}/>{query && <button type="button" className="icon-button" aria-label="Limpiar búsqueda de usuarios" onClick={() => { setQuery(''); searchInput.current?.focus(); }}><X size={16} aria-hidden="true"/></button>}</div></div>{loading ? <p role="status" className="cloud-loading"><LoaderCircle className="spin" size={18}/>Consultando cuentas…</p> : <><div className="account-table">{visibleAccounts.map(account => <div className="account-row cloud-managed-row" key={account.id}><div className="account-row-person"><strong>{account.full_name || account.email}</strong><span>{account.email}</span><small>{[account.area, account.job_title].filter(Boolean).join(' · ')}</small><small>{[account.role === 'admin' ? 'Administrador' : '', account.can_create_inspections && account.can_receive_inspections ? 'Inspecciones' : account.can_create_inspections ? 'Solo realizar inspecciones' : account.can_receive_inspections ? 'Solo recibir inspecciones' : ''].filter(Boolean).join(' · ') || 'Sin módulos habilitados'}</small></div><span className={`account-enabled ${!account.enabled ? 'account-disabled' : ''}`}>{!account.enabled ? 'Inhabilitada' : account.must_change_password ? 'Contraseña temporal' : 'Habilitada'}</span><div className="account-management-actions"><button type="button" className="button button-outline" disabled={busy || !ready || account.access_revision === undefined} onClick={() => { setError(''); setEditing(account); setPermissions(accessOf(account)); }}>Editar permisos</button><button type="button" className="button button-outline" disabled={busy || !ready || account.access_revision === undefined} onClick={() => { setError(''); setEditingCopies(account); setCopies((account.supervisor_emails || []).join(', ')); }}>Editar CC</button><button type="button" className="text-button" disabled={busy || !ready || account.id === actor.id} onClick={() => { setError(''); setConfirmation({ account, remove: false }); }}>{account.enabled ? 'Desactivar' : 'Reactivar'}</button><button type="button" className="button button-outline delete-button" aria-label={`Eliminar cuenta ${account.email}`} disabled={busy || !ready || account.id === actor.id} onClick={() => { setError(''); setConfirmation({ account, remove: true }); }}><Trash2 size={17}/>Eliminar</button></div></div>)}</div>{!visibleAccounts.length && !error && <p className="account-users-empty">{accounts.length ? 'No hay usuarios que coincidan con tu búsqueda.' : 'No hay usuarios registrados.'}</p>}<button type="button" className="button button-outline cloud-refresh" disabled={busy} onClick={() => setRetry(value => value + 1)}>Actualizar lista</button></>}</div>
    }
    {editing && <Modal title={`Permisos de ${editing.full_name || editing.email}`} onClose={() => !busy && setEditing(null)}><AccessSwitches value={permissions} disabled={busy} onChange={setPermissions}/>{error && <p role="alert" className="error-message cloud-message">{error}</p>}<div className="modal-actions"><button className="button button-outline" disabled={busy} onClick={() => setEditing(null)}>Cancelar</button><button className="button button-primary" disabled={busy} onClick={() => void act(async () => { const saved = await manageCloudAccount(editing, permissions); if (current.current()) { remember(saved); setMessage('Permisos actualizados.'); } })}>Guardar permisos</button></div></Modal>}
    {editingCopies && <Modal title="Administradores (CC)" onClose={() => !busy && setEditingCopies(null)}><p className="modal-description"><strong>{editingCopies.full_name || editingCopies.email}</strong><br/>{editingCopies.email}</p><form onSubmit={event => { event.preventDefault(); void act(async () => { const saved = await manageCloudAccount(editingCopies, { ...accessOf(editingCopies), supervisor_emails: supervisorEmails(copies) }); if (current.current()) { remember(saved); setMessage('Administradores (CC) actualizados.'); } }); }}><Field label="Administradores (CC)" hint="Separa los correos con comas. Recibirán copia en los próximos envíos dirigidos a este usuario.">{props => <textarea {...props} autoComplete="off" rows={3} maxLength={13000} disabled={busy} value={copies} onChange={event => setCopies(event.target.value)} placeholder="administrador@empresa.com, admin2@empresa.com"/>}</Field>{error && <p role="alert" className="error-message cloud-message">{error}</p>}<div className="modal-actions"><button type="button" className="button button-outline" disabled={busy} onClick={() => setEditingCopies(null)}>Cancelar</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar CC'}</button></div></form></Modal>}
    {confirmation && <Modal title={confirmation.remove ? 'Eliminar cuenta' : confirmation.account.enabled ? 'Desactivar cuenta' : 'Reactivar cuenta'} onClose={() => !busy && setConfirmation(null)}><p className="modal-description">{confirmation.remove ? `La cuenta ${confirmation.account.email} perderá el acceso y se retirará de la lista. La autoría de sus registros se conserva.` : `Se ${confirmation.account.enabled ? 'desactivará' : 'reactivará'} el acceso de ${confirmation.account.email}.`}</p>{error && <p role="alert" className="error-message cloud-message">{error}</p>}<div className="modal-actions"><button className="button button-outline" disabled={busy} onClick={() => setConfirmation(null)}>Cancelar</button><button className="button button-danger" disabled={busy} onClick={() => void act(async () => { const next = { ...accessOf(confirmation.account), enabled: !confirmation.account.enabled }; const saved = await manageCloudAccount(confirmation.account, next, confirmation.remove ? 'delete' : 'update'); if (current.current()) { remember(saved); setMessage(confirmation.remove ? 'Cuenta eliminada.' : 'Acceso actualizado.'); } })}>{confirmation.remove ? 'Eliminar' : confirmation.account.enabled ? 'Desactivar' : 'Reactivar'}</button></div></Modal>}
  </section>;
}
