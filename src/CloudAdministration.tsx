import { LiquidGlassSurface } from './components/ui/liquid-glass';
import { areaDisplayName } from './organization';
import { organizationLabel } from './organization-label';
import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, LoaderCircle, Pencil, Plus, Search, UsersRound, Trash2, X } from 'lucide-react';
import { Field, Modal, SectionTitle } from './components';
import { cloudAccounts, createCloudAccount, manageCloudAccount, cloudAccountMatches, resolveCloudAccount, changeCloudAccountEmail } from './cloud-account';
import type { CloudProfile, AccountPermissions, AccountMatch, NewCloudAccount, AccountResolutionMode } from './cloud-account';
import { AccountMatchDialog } from './AccountMatchDialog';
import { supervisorEmails } from './accounts';
import { TEMPORARY_PASSWORD } from '../shared/account-rules.mjs';
import { AccountSettingsDialog } from './AccountSettingsDialog';
import { AccessSwitches } from './AccessSwitches';

const searchText = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('es').trim();
const initial = () => ({ full_name: '', email: '', role: 'inspector' as CloudProfile['role'], copies: '', can_create_inspections: false, can_receive_inspections: false });
const accessOf = (account: CloudProfile): AccountPermissions => ({ enabled: account.enabled, role: account.role, can_create_inspections: account.role === 'admin' || account.can_create_inspections === true, can_receive_inspections: account.role === 'admin' || account.can_receive_inspections === true });
export type CloudAdministrationCache = { actorId: string; accounts: CloudProfile[] | null; tab?: 'add' | 'users' };
type Confirmation = { account: CloudProfile; remove: boolean };
export function CloudAdministration({ actor, isCurrent, onSelfChange, cache, onBusyChange, identityReady = false }: { actor: CloudProfile; isCurrent: () => boolean; onSelfChange?: (profile: CloudProfile) => void; cache?: { current: CloudAdministrationCache | null }; onBusyChange?: (busy: boolean) => void; identityReady?: boolean }) {
  const previous = cache?.current?.actorId === actor.id ? cache.current : null;
  const [accounts, setAccounts] = useState<CloudProfile[]>(() => previous?.accounts || []);
  const [query, setQuery] = useState('');
  const searchInput = useRef<HTMLInputElement>(null);
  const searchTerms = searchText(query).split(/\s+/).filter(Boolean);
  const visibleAccounts = accounts.filter(account => { const text = searchText([account.full_name, account.management, account.job_title, account.area].join(' ')); return searchTerms.every(term => text.includes(term)); });
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
  const [settings, setSettings] = useState<CloudProfile | null>(null);
  const emailRequest = useRef<{ signature: string; id: string } | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [matching, setMatching] = useState<{ values: NewCloudAccount; matches: AccountMatch[] } | null>(null);
  const resolutionRequest = useRef<{ signature: string; id: string } | null>(null);
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
      const values = { full_name: form.full_name.trim(), email: form.email.trim().toLowerCase(), area: '', job_title: '', role: form.role, supervisor_emails: supervisorEmails(form.copies), can_create_inspections: form.can_create_inspections, can_receive_inspections: form.can_receive_inspections };
      if (!values.full_name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) throw new Error('Completa el nombre y un correo válido.');
      const signature = JSON.stringify(values); if (request.current?.signature !== signature) request.current = { signature, id: crypto.randomUUID() };
      setBusy(true);
      if (identityReady) {
        const matches = await cloudAccountMatches(values.email, values.full_name);
        if (!live.current || !current.current()) return;
        if (matches.length) { setMatching({ values: matches.find(match => match.pending)?.pending?.input || values, matches }); return; }
      }
      const created = await createCloudAccount(values, request.current.id);
      if (!live.current || !current.current()) return; remember(created);
      setMessage(created.must_change_password ? `Cuenta creada para ${created.email}. Contraseña temporal: ${TEMPORARY_PASSWORD}. Deberá cambiarla al entrar.` : `La cuenta ${created.email} ya estaba creada y conserva su contraseña personal.`);
      setForm(initial()); request.current = null; setShowPassword(false);
    } catch (problem) { if (live.current && current.current()) setError(problem instanceof Error ? problem.message : 'No pudimos crear la cuenta.'); }
    finally { if (live.current) setBusy(false); }
  };
  const resolve = async (match: AccountMatch, mode: AccountResolutionMode) => {
    if (busy || !matching) return;
    setBusy(true); setError(''); setMessage('');
    const values = mode === 'restore' ? { ...matching.values, email: match.email } : matching.values;
    const signature = JSON.stringify({ values, id: match.id, mode });
    if (resolutionRequest.current?.signature !== signature) resolutionRequest.current = { signature, id: crypto.randomUUID() };
    try {
      const saved = await resolveCloudAccount(values, match, mode, resolutionRequest.current.id);
      if (!live.current || !current.current()) return;
      remember(saved); setMatching(null); setForm(initial()); request.current = null; resolutionRequest.current = null;
      setMessage(saved.deleted_at ? 'La solicitud ya se había completado, pero la cuenta fue eliminada posteriormente. Actualiza la lista antes de registrar otra alta.' : !saved.enabled ? 'La solicitud ya se había completado. La cuenta está inhabilitada; revisa sus permisos para continuar.' : `${mode === 'restore' ? 'Cuenta restablecida' : 'Acceso creado'} para ${saved.email}. ${saved.must_change_password ? `Contraseña temporal: ${TEMPORARY_PASSWORD}. Deberá cambiarla al entrar.` : 'La cuenta conserva su contraseña personal.'}`);
    } catch (problem) { if (live.current && current.current()) { setError(problem instanceof Error ? problem.message : 'No pudimos confirmar la operación. Reintenta conservando los datos.'); try { const matches = await cloudAccountMatches(values.email, values.full_name); if (live.current && current.current() && matches.length) setMatching({ values: matches.find(item => item.pending)?.pending?.input || values, matches }); } catch { /* Preserve the existing choice while the service is unavailable. */ } } }
    finally { if (live.current) setBusy(false); }
  };
  const act = async (action: () => Promise<void>) => {
    if (busy) return; setBusy(true); setError(''); setMessage('');
    try { await action(); if (live.current && current.current()) { setSettings(null); setConfirmation(null); } }
    catch (problem) { if (live.current && current.current()) setError(problem instanceof Error ? problem.message : 'No se pudo completar la operación.'); }
    finally { if (live.current) setBusy(false); }
  };
  const field = <K extends keyof ReturnType<typeof initial>>(key: K, value: ReturnType<typeof initial>[K]) => { setForm(previous => ({ ...previous, [key]: value })); setMessage(''); };
  return <section className="cloud-administration" aria-label="Gestión de Usuarios">
    <div className="page-heading"><div><h1>Gestión de Usuarios</h1><p className="administration-actor"><span>{actor.full_name || actor.email}</span><span className="account-enabled">Administrador</span></p></div></div>
    <nav className="admin-tabs" aria-label="Gestión administrativa"><button type="button" aria-current={tab === 'add' ? 'page' : undefined} disabled={busy} onClick={() => { setError(''); setMessage(''); setTab('add'); }}>Agregar Usuario</button><button type="button" aria-current={tab === 'users' ? 'page' : undefined} disabled={busy} onClick={() => { setError(''); setMessage(''); setTab('users'); }}>Administrar usuarios</button></nav>
    {!ready && <p className="notice">La gestión de usuarios está pendiente de activación. Solicita al administrador que complete la configuración.</p>}
    {error && !settings && !confirmation && !matching && <p role="alert" className="error-message cloud-message">{error}</p>}{message && <p role="status" className="account-success cloud-message">{message}</p>}
    {tab === 'add' ? <>
      <div className="form-card liquid-glass-card"><LiquidGlassSurface/><div className="form-body"><SectionTitle icon={<UsersRound size={20}/>} title="Agregar Usuario" subtitle="En su primer ingreso, el usuario cambiará su contraseña temporal y completará su gerencia, área y puesto antes de acceder al espacio de trabajo."/>
        <form onSubmit={event => { event.preventDefault(); void submit(); }}>
          <div className="field-grid"><Field label="Nombres y apellidos" required hint="Escribe nombres y apellidos con sus iniciales en mayúscula.">{props => <input {...props} required autoComplete="off" autoCapitalize="words" maxLength={250} disabled={busy} value={form.full_name} onChange={event => field('full_name', event.target.value)}/>}</Field><Field label="Correo del usuario" required>{props => <input {...props} required type="email" autoComplete="off" maxLength={254} disabled={busy} value={form.email} onChange={event => field('email', event.target.value)}/>}</Field></div>
          <AccessSwitches value={{ ...form, enabled: true }} disabled={busy || !ready} onChange={next => setForm(previous => ({ ...previous, role: next.role, can_create_inspections: next.can_create_inspections, can_receive_inspections: next.can_receive_inspections }))}/>
          <Field label="Contraseña temporal" hint="Obligatorio cambiarla al iniciar sesión.">{props => <div className="cloud-password"><input {...props} type={showPassword ? 'text' : 'password'} autoComplete="off" readOnly value={TEMPORARY_PASSWORD}/><button className="icon-button" type="button" aria-label={showPassword ? 'Ocultar contraseña temporal' : 'Mostrar contraseña temporal'} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div>}</Field>
          <Field label="Responde a (CC):" hint="Separa los correos con comas. Las personas indicadas recibirán una copia de las próximas notificaciones dirigidas a este usuario.">{props => <textarea {...props} rows={2} maxLength={13000} disabled={busy} value={form.copies} onChange={event => field('copies', event.target.value)} placeholder="persona1@hortifrut.com, persona2@hortifrut.com"/>}</Field>
          <div className="admin-form-actions"><button type="submit" className="button button-primary" disabled={busy || loading || !ready}>{busy ? <LoaderCircle className="spin" size={18}/> : <Plus size={18}/>} {busy ? 'Creando cuenta…' : 'Crear usuario'}</button></div>
        </form>
      </div></div>
    </> : <div className="account-table-card liquid-glass-card"><LiquidGlassSurface/><div className="account-users-heading"><h2>Usuarios <span aria-live="polite" aria-atomic="true">{searchTerms.length ? `${visibleAccounts.length} de ${accounts.length}` : accounts.length}</span></h2><div className="account-user-search"><Search size={18} aria-hidden="true"/><input ref={searchInput} type="search" aria-label="Buscar usuarios por nombre, gerencia, área o cargo" placeholder="Buscar por nombre, gerencia, área o cargo" autoComplete="off" value={query} onChange={event => setQuery(event.target.value)}/>{query && <button type="button" className="icon-button" aria-label="Limpiar búsqueda de usuarios" onClick={() => { setQuery(''); searchInput.current?.focus(); }}><X size={16} aria-hidden="true"/></button>}</div></div>{loading ? <p role="status" className="cloud-loading"><LoaderCircle className="spin" size={18}/>Consultando cuentas…</p> : <><div className="account-table">{visibleAccounts.map(account => <div className="account-row cloud-managed-row" key={account.id}><div className="account-row-person"><strong>{account.full_name || account.email}</strong><span>{account.email}</span><small>{[organizationLabel(account.management), areaDisplayName(account), organizationLabel(account.job_title)].filter(Boolean).join(' · ')}</small><small>{[account.role === 'admin' ? 'Administrador' : '', account.can_create_inspections && account.can_receive_inspections ? 'Inspecciones' : account.can_create_inspections ? 'Solo realizar inspecciones' : account.can_receive_inspections ? 'Solo recibir inspecciones' : ''].filter(Boolean).join(' · ') || 'Sin módulos habilitados'}</small></div><span className={`account-enabled ${!account.enabled ? 'account-disabled' : ''}`}>{!account.enabled ? 'Inhabilitada' : account.must_change_password ? 'Contraseña temporal' : 'Habilitada'}</span><div className="account-management-actions"><button type="button" className="icon-button account-edit-button" aria-label={`Editar usuario ${account.full_name || account.email}`} title="Editar usuario" disabled={busy || !ready || account.access_revision === undefined} onClick={() => { setError(''); setSettings(account); emailRequest.current = null; }}><Pencil size={17}/></button><button type="button" className="text-button" disabled={busy || !ready || account.id === actor.id} onClick={() => { setError(''); setConfirmation({ account, remove: false }); }}>{account.enabled ? 'Desactivar' : 'Reactivar'}</button><button type="button" className="button button-outline delete-button" aria-label={`Eliminar cuenta ${account.email}`} disabled={busy || !ready || account.id === actor.id} onClick={() => { setError(''); setConfirmation({ account, remove: true }); }}><Trash2 size={17}/>Eliminar</button></div></div>)}</div>{!visibleAccounts.length && !error && <p className="account-users-empty">{accounts.length ? 'No hay usuarios que coincidan con tu búsqueda.' : 'No hay usuarios registrados.'}</p>}<button type="button" className="button button-outline cloud-refresh" disabled={busy} onClick={() => setRetry(value => value + 1)}>Actualizar lista</button></>}</div>
    }
    {matching && <AccountMatchDialog matches={matching.matches} email={matching.values.email} busy={busy} error={error} onCancel={() => { setMatching(null); setError(''); }} onResolve={(match, mode) => void resolve(match, mode)}/>}
    {settings && <AccountSettingsDialog key={settings.id} account={settings} initialPermissions={accessOf(settings)} busy={busy} error={error} onClose={() => setSettings(null)} onNavigate={() => setError('')} onSavePermissions={permissions => void act(async () => { const saved = await manageCloudAccount(settings, permissions); if (current.current()) { remember(saved); setMessage('Permisos actualizados.'); } })} onSaveCopies={copies => void act(async () => { const saved = await manageCloudAccount(settings, { ...accessOf(settings), supervisor_emails: supervisorEmails(copies) }); if (current.current()) { remember(saved); setMessage('Correos en copia actualizados.'); } })} onSaveEmail={email => void act(async () => {
      const signature = JSON.stringify({ id: settings.id, revision: settings.access_revision, email: email.trim().toLowerCase() });
      if (emailRequest.current?.signature !== signature) emailRequest.current = { signature, id: crypto.randomUUID() };
      const saved = await changeCloudAccountEmail(settings, email, emailRequest.current.id);
      if (current.current()) { remember(saved); setMessage(`Correo actualizado: ${saved.email}.`); }
    })}/>}
    {confirmation && <Modal title={confirmation.remove ? 'Eliminar cuenta' : confirmation.account.enabled ? 'Desactivar cuenta' : 'Reactivar cuenta'} onClose={() => !busy && setConfirmation(null)}><p className="modal-description">{confirmation.remove ? `La cuenta ${confirmation.account.email} perderá el acceso y se retirará de la lista. La autoría de sus registros se conserva.` : `Se ${confirmation.account.enabled ? 'desactivará' : 'reactivará'} el acceso de ${confirmation.account.email}.`}</p>{error && <p role="alert" className="error-message cloud-message">{error}</p>}<div className="modal-actions"><button className="button button-outline" disabled={busy} onClick={() => setConfirmation(null)}>Cancelar</button><button className="button button-danger" disabled={busy} onClick={() => void act(async () => { const next = { ...accessOf(confirmation.account), enabled: !confirmation.account.enabled }; const saved = await manageCloudAccount(confirmation.account, next, confirmation.remove ? 'delete' : 'update'); if (current.current()) { remember(saved); setMessage(confirmation.remove ? 'Cuenta eliminada.' : 'Acceso actualizado.'); } })}>{confirmation.remove ? 'Eliminar' : confirmation.account.enabled ? 'Desactivar' : 'Reactivar'}</button></div></Modal>}
  </section>;
}
