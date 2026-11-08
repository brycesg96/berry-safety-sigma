import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, LoaderCircle, Plus, UsersRound, Trash2 } from 'lucide-react';
import { Field, Modal, SectionTitle } from './components';
import { cloudAccounts, createCloudAccount, manageCloudAccount, cloudAdminInspections, deleteCloudAdminInspection } from './cloud-account';
import type { CloudProfile, AccountPermissions, AdminInspection } from './cloud-account';
import { supervisorEmails } from './accounts';
import { TEMPORARY_PASSWORD } from '../shared/account-rules.mjs';
import { AccessSwitches } from './AccessSwitches';

const initial = () => ({ full_name: '', email: '', area: '', job_title: '', role: 'inspector' as CloudProfile['role'], copies: '', can_create_inspections: false, can_receive_inspections: false });
const accessOf = (account: CloudProfile): AccountPermissions => ({ enabled: account.enabled, role: account.role, can_create_inspections: account.role === 'admin' || account.can_create_inspections === true, can_receive_inspections: account.role === 'admin' || account.can_receive_inspections === true });
export type CloudAdministrationCache = { actorId: string; accounts: CloudProfile[] | null; inspections: AdminInspection[] | null };
type Confirmation = { type: 'account'; account: CloudProfile; remove: boolean } | { type: 'inspection'; inspection: AdminInspection };
export function CloudAdministration({ actor, isCurrent, onSelfChange, cache }: { actor: CloudProfile; isCurrent: () => boolean; onSelfChange?: (profile: CloudProfile) => void; cache?: { current: CloudAdministrationCache | null } }) {
  const previous = cache?.current?.actorId === actor.id ? cache.current : null;
  const [accounts, setAccounts] = useState<CloudProfile[]>(() => previous?.accounts || []), [inspections, setInspections] = useState<AdminInspection[]>(() => previous?.inspections || []);
  const cacheList = (key: 'accounts' | 'inspections', value: CloudProfile[] | AdminInspection[] | null) => {
    if (!cache) return;
    const stored = cache.current?.actorId === actor.id ? cache.current : { actorId: actor.id, accounts: null, inspections: null };
    cache.current = { ...stored, [key]: value };
  };
  const [tab, setTab] = useState<'users' | 'inspections'>('users');
  const [form, setForm] = useState(initial);
  const [loading, setLoading] = useState(!previous?.accounts), [reportsLoading, setReportsLoading] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [query, setQuery] = useState('');
  const [showPassword, setShowPassword] = useState(false), [retry, setRetry] = useState(0);
  const [editing, setEditing] = useState<CloudProfile | null>(null), [permissions, setPermissions] = useState<AccountPermissions>({ enabled: true, role: 'inspector', can_create_inspections: false, can_receive_inspections: false });
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const ready = typeof actor.can_create_inspections === 'boolean' && typeof actor.can_receive_inspections === 'boolean';
  const request = useRef<{ signature: string; id: string } | null>(null), current = useRef(isCurrent), live = useRef(true); current.current = isCurrent;
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  useEffect(() => {
    let active = true; setLoading(!cache?.current?.accounts || cache.current.actorId !== actor.id); setError('');
    void cloudAccounts().then(next => { if (active && current.current()) { setAccounts(next); cacheList('accounts', next); const own = next.find(item => item.id === actor.id); if (own && (own.access_revision !== actor.access_revision || own.can_create_inspections !== actor.can_create_inspections || own.can_receive_inspections !== actor.can_receive_inspections)) onSelfChange?.(own); } }).catch(problem => { if (active && current.current()) { setAccounts([]); cacheList('accounts', null); setError(problem instanceof Error ? problem.message : 'No pudimos consultar las cuentas.'); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [actor.id, retry]);
  useEffect(() => {
    if (tab !== 'inspections' || !ready) return;
    let active = true; setReportsLoading(!cache?.current?.inspections || cache.current.actorId !== actor.id); setError('');
    void cloudAdminInspections().then(next => { if (active && current.current()) { setInspections(next); cacheList('inspections', next); } }).catch(problem => { if (active && current.current()) { setInspections([]); cacheList('inspections', null); setError(problem instanceof Error ? problem.message : 'No pudimos consultar las inspecciones.'); } }).finally(() => { if (active) setReportsLoading(false); });
    return () => { active = false; };
  }, [actor.id, tab, retry, ready]);
  if (actor.role !== 'admin' || !actor.enabled || actor.must_change_password || actor.deleted_at) return <p role="alert">Esta sección requiere una cuenta administradora habilitada.</p>;
  const remember = (profile: CloudProfile) => {
    setAccounts(items => { const next = profile.deleted_at ? items.filter(item => item.id !== profile.id) : [...items.filter(item => item.id !== profile.id), profile]; cacheList('accounts', next); return next; });
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
    try { await action(); if (live.current && current.current()) { setEditing(null); setConfirmation(null); } }
    catch (problem) { if (live.current && current.current()) setError(problem instanceof Error ? problem.message : 'No se pudo completar la operación.'); }
    finally { if (live.current) setBusy(false); }
  };
  const field = <K extends keyof ReturnType<typeof initial>>(key: K, value: ReturnType<typeof initial>[K]) => { setForm(previous => ({ ...previous, [key]: value })); setMessage(''); };
  return <section className="cloud-administration" aria-label="Gestión de Cuentas">
    <div className="page-heading"><div><h1>Gestión de Cuentas</h1><p>Cuenta administradora: {actor.email}</p></div></div>
    <nav className="admin-tabs" aria-label="Gestión administrativa"><button type="button" aria-current={tab === 'users' ? 'page' : undefined} onClick={() => setTab('users')}>Usuarios</button><button type="button" aria-current={tab === 'inspections' ? 'page' : undefined} onClick={() => setTab('inspections')}>Todas las inspecciones</button></nav>
    {!ready && <p className="notice">La gestión de cuentas está pendiente de activación. Solicita al administrador que complete la configuración.</p>}
    {error && !editing && !confirmation && <p role="alert" className="error-message cloud-message">{error}</p>}{message && <p role="status" className="account-success cloud-message">{message}</p>}
    {tab === 'users' ? <>
      <div className="form-card"><div className="form-body"><SectionTitle icon={<UsersRound size={20}/>} title="Añadir usuario" subtitle="El usuario actualizará su contraseña temporal al entrar por primera vez."/>
        <form onSubmit={event => { event.preventDefault(); void submit(); }}>
          <div className="field-grid"><Field label="Nombres y apellidos" required hint="Escribe nombres y apellidos con sus iniciales en mayúscula.">{props => <input {...props} required autoComplete="off" autoCapitalize="words" maxLength={250} disabled={busy} value={form.full_name} onChange={event => field('full_name', event.target.value)}/>}</Field><Field label="Correo del usuario" required>{props => <input {...props} required type="email" autoComplete="off" maxLength={254} disabled={busy} value={form.email} onChange={event => field('email', event.target.value)}/>}</Field></div>
          <div className="field-grid"><Field label="Área" hint="Usa el nombre formal del área, con mayúscula inicial y respetando las siglas.">{props => <input {...props} maxLength={250} disabled={busy} autoCapitalize="sentences" value={form.area} onChange={event => field('area', event.target.value)}/>}</Field><Field label="Puesto" hint="Usa el nombre formal del puesto, con mayúscula inicial y respetando las siglas.">{props => <input {...props} maxLength={250} disabled={busy} autoCapitalize="sentences" value={form.job_title} onChange={event => field('job_title', event.target.value)}/>}</Field></div>
          <AccessSwitches value={{ ...form, enabled: true }} disabled={busy || !ready} onChange={next => setForm(previous => ({ ...previous, role: next.role, can_create_inspections: next.can_create_inspections, can_receive_inspections: next.can_receive_inspections }))}/>
          <Field label="Contraseña temporal" hint="Obligatorio cambiarla al iniciar sesión.">{props => <div className="cloud-password"><input {...props} type={showPassword ? 'text' : 'password'} autoComplete="off" readOnly value={TEMPORARY_PASSWORD}/><button className="icon-button" type="button" aria-label={showPassword ? 'Ocultar contraseña temporal' : 'Mostrar contraseña temporal'} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div>}</Field>
          <Field label="Administradores (CC)">{props => <textarea {...props} rows={2} maxLength={13000} disabled={busy} value={form.copies} onChange={event => field('copies', event.target.value)} placeholder="administrador@empresa.com, admin2@empresa.com"/>}</Field>
          <div className="admin-form-actions"><button type="submit" className="button button-primary" disabled={busy || loading || !ready}>{busy ? <LoaderCircle className="spin" size={18}/> : <Plus size={18}/>} {busy ? 'Creando cuenta…' : 'Crear usuario'}</button></div>
        </form>
      </div></div>
      <div className="account-table-card"><h2>Usuarios <span>{accounts.length}</span></h2>{loading ? <p role="status" className="cloud-loading"><LoaderCircle className="spin" size={18}/>Consultando cuentas…</p> : <><div className="account-table">{accounts.map(account => <div className="account-row cloud-managed-row" key={account.id}><div className="account-row-person"><strong>{account.full_name || account.email}</strong><span>{account.email}</span><small>{[account.area, account.job_title].filter(Boolean).join(' · ')}</small><small>{[account.role === 'admin' ? 'Administrador' : '', account.can_create_inspections && account.can_receive_inspections ? 'Inspecciones' : account.can_create_inspections ? 'Solo realizar inspecciones' : account.can_receive_inspections ? 'Solo recibir inspecciones' : ''].filter(Boolean).join(' · ') || 'Sin módulos habilitados'}</small></div><span className={`account-enabled ${!account.enabled ? 'account-disabled' : ''}`}>{!account.enabled ? 'Inhabilitada' : account.must_change_password ? 'Contraseña temporal' : 'Habilitada'}</span><div className="account-management-actions"><button type="button" className="button button-outline" disabled={busy || !ready || account.access_revision === undefined} onClick={() => { setError(''); setEditing(account); setPermissions(accessOf(account)); }}>Editar permisos</button><button type="button" className="text-button" disabled={busy || !ready || account.id === actor.id} onClick={() => { setError(''); setConfirmation({ type: 'account', account, remove: false }); }}>{account.enabled ? 'Desactivar' : 'Reactivar'}</button><button type="button" className="button button-outline delete-button" aria-label={`Eliminar cuenta ${account.email}`} disabled={busy || !ready || account.id === actor.id} onClick={() => { setError(''); setConfirmation({ type: 'account', account, remove: true }); }}><Trash2 size={17}/>Eliminar</button></div></div>)}</div><button type="button" className="button button-outline cloud-refresh" disabled={busy} onClick={() => setRetry(value => value + 1)}>Actualizar lista</button></>}</div>
    </> : <div className="account-table-card"><h2>Todas las inspecciones <span>{inspections.length}</span></h2><div className="admin-report-search"><Field label="Buscar inspecciones">{props => <input {...props} value={query} maxLength={250} onChange={event => setQuery(event.target.value)} placeholder="Buscar por código, área o responsable"/>}</Field></div>{reportsLoading ? <p className="cloud-loading" role="status"><LoaderCircle size={18} className="spin"/>Consultando inspecciones…</p> : <div className="account-table">{inspections.filter(item => `${item.code || ''} ${item.area} ${item.author} ${item.email}`.toLocaleLowerCase('es').includes(query.toLocaleLowerCase('es'))).map(item => <div className="account-row cloud-managed-row" key={item.id}><div className="account-row-person"><strong>{item.code || 'Borrador'} · {item.area || 'Sin área'}</strong><span>{item.author} · {item.email}</span><small>{item.date} · {item.observation_count} observaciones · {item.workflow === 'closed' ? 'Cerrada' : item.workflow === 'draft' ? 'Borrador' : 'En levantamiento'}</small></div><button type="button" className="icon-button delete-button" aria-label={`Eliminar inspección ${item.code || item.area}`} disabled={busy || !ready} onClick={() => { setError(''); setConfirmation({ type: 'inspection', inspection: item }); }}><Trash2 size={17}/></button></div>)}{!inspections.length && !reportsLoading && <p className="modal-description">No hay inspecciones registradas.</p>}</div>}<button type="button" className="button button-outline cloud-refresh" disabled={busy} onClick={() => setRetry(value => value + 1)}>Actualizar inspecciones</button></div>}
    {editing && <Modal title={`Permisos de ${editing.full_name || editing.email}`} onClose={() => !busy && setEditing(null)}><AccessSwitches value={permissions} disabled={busy} onChange={setPermissions}/>{error && <p role="alert" className="error-message cloud-message">{error}</p>}<div className="modal-actions"><button className="button button-outline" disabled={busy} onClick={() => setEditing(null)}>Cancelar</button><button className="button button-primary" disabled={busy} onClick={() => void act(async () => { const saved = await manageCloudAccount(editing, permissions); if (current.current()) { remember(saved); setMessage('Permisos actualizados.'); } })}>Guardar permisos</button></div></Modal>}
    {confirmation && <Modal title={confirmation.type === 'inspection' ? 'Eliminar inspección' : confirmation.remove ? 'Eliminar cuenta' : confirmation.account.enabled ? 'Desactivar cuenta' : 'Reactivar cuenta'} onClose={() => !busy && setConfirmation(null)}><p className="modal-description">{confirmation.type === 'inspection' ? `Se retirará «${confirmation.inspection.code || confirmation.inspection.area}» de las listas. Su número permanecerá reservado y no se reutilizará.` : confirmation.remove ? `La cuenta ${confirmation.account.email} perderá el acceso y se retirará de la lista. La autoría de sus registros se conserva.` : `Se ${confirmation.account.enabled ? 'desactivará' : 'reactivará'} el acceso de ${confirmation.account.email}.`}</p>{error && <p role="alert" className="error-message cloud-message">{error}</p>}<div className="modal-actions"><button className="button button-outline" disabled={busy} onClick={() => setConfirmation(null)}>Cancelar</button><button className="button button-danger" disabled={busy} onClick={() => void act(async () => { if (confirmation.type === 'inspection') { await deleteCloudAdminInspection(confirmation.inspection); if (current.current()) { setInspections(items => { const next = items.filter(item => item.id !== confirmation.inspection.id); cacheList('inspections', next); return next; }); setMessage('Inspección eliminada. Su número permanece reservado.'); } } else { const next = { ...accessOf(confirmation.account), enabled: !confirmation.account.enabled }; const saved = await manageCloudAccount(confirmation.account, next, confirmation.remove ? 'delete' : 'update'); if (current.current()) { remember(saved); setMessage(confirmation.remove ? 'Cuenta eliminada.' : 'Acceso actualizado.'); } } })}>{confirmation.type === 'inspection' || confirmation.remove ? 'Eliminar' : confirmation.account.enabled ? 'Desactivar' : 'Reactivar'}</button></div></Modal>}
  </section>;
}
