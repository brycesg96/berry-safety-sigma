import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, LoaderCircle, Plus, UsersRound } from 'lucide-react';
import { Field, SectionTitle } from './components';
import { cloudAccounts, createCloudAccount } from './cloud-account';
import type { CloudProfile } from './cloud-account';
import { supervisorEmails } from './accounts';
import { TEMPORARY_PASSWORD } from '../shared/account-rules.mjs';

const initial = () => ({ full_name: '', email: '', area: '', job_title: '', role: 'inspector', copies: '' });
export function CloudAdministration({ actor, isCurrent }: { actor: CloudProfile; isCurrent: () => boolean }) {
  const [accounts, setAccounts] = useState<CloudProfile[]>([]);
  const [form, setForm] = useState(initial);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [retry, setRetry] = useState(0);
  const request = useRef<{ signature: string; id: string } | null>(null);
  const current = useRef(isCurrent); current.current = isCurrent;
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => { live.current = false; };
  }, []);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    void cloudAccounts().then(next => { if (active && current.current()) setAccounts(next); })
      .catch(problem => { if (active && current.current()) setError(problem instanceof Error ? problem.message : 'No pudimos consultar las cuentas.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [actor.id, retry]);
  if (actor.role !== 'admin' || !actor.enabled || actor.must_change_password) return <p role="alert">Esta sección requiere una cuenta administradora habilitada.</p>;
  const submit = async () => {
    if (busy) return;
    setError(''); setMessage('');
    try {
      const values = { full_name: form.full_name.trim(), email: form.email.trim().toLowerCase(), area: form.area.trim(), job_title: form.job_title.trim(), role: form.role, supervisor_emails: supervisorEmails(form.copies) };
      if (!values.full_name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) throw new Error('Completa el nombre y un correo válido.');
      const signature = JSON.stringify(values);
      if (request.current?.signature !== signature) request.current = { signature, id: crypto.randomUUID() };
      setBusy(true);
      const created = await createCloudAccount(values, request.current.id);
      if (!live.current || !current.current()) return;
      setAccounts(items => [...items.filter(item => item.id !== created.id), created]);
      setMessage(created.must_change_password ? `Cuenta creada para ${created.email}. Contraseña temporal: ${TEMPORARY_PASSWORD}. Deberá cambiarla al entrar.` : `La cuenta ${created.email} ya estaba creada y conserva su contraseña personal.`);
      setForm(initial()); request.current = null; setShowPassword(false);
    } catch (problem) { if (live.current && current.current()) setError(problem instanceof Error ? problem.message : 'No pudimos crear la cuenta.'); }
    finally { if (live.current) setBusy(false); }
  };
  const field = (key: keyof ReturnType<typeof initial>, value: string) => { setForm(previous => ({ ...previous, [key]: value })); setMessage(''); };
  return <section className="cloud-administration" aria-label="Administración de usuarios">
    <div className="page-heading"><div><h1>Administración</h1><p>Gestiona las cuentas de Berry Safety.</p></div></div>
    <div className="form-card"><div className="form-body"><SectionTitle icon={<UsersRound size={20}/>} title="Añadir usuario" subtitle="El usuario actualizará su contraseña temporal al entrar por primera vez."/>
      <form onSubmit={event => { event.preventDefault(); void submit(); }}>
        <div className="field-grid"><Field label="Nombres y apellidos" required>{props => <input {...props} required autoComplete="off" maxLength={250} disabled={busy} value={form.full_name} onChange={event => field('full_name', event.target.value)}/>}</Field><Field label="Correo del usuario" required>{props => <input {...props} required type="email" autoComplete="off" maxLength={254} disabled={busy} value={form.email} onChange={event => field('email', event.target.value)}/>}</Field></div>
        <div className="field-grid"><Field label="Área">{props => <input {...props} maxLength={250} disabled={busy} value={form.area} onChange={event => field('area', event.target.value)}/>}</Field><Field label="Cargo">{props => <input {...props} maxLength={250} disabled={busy} value={form.job_title} onChange={event => field('job_title', event.target.value)}/>}</Field></div>
        <div className="field-grid"><Field label="Rol">{props => <select {...props} disabled={busy} value={form.role} onChange={event => field('role', event.target.value)}><option value="inspector">Inspecciones</option><option value="admin">Administración</option></select>}</Field><Field label="Contraseña temporal" hint="Obligatorio cambiarla al iniciar sesión.">{props => <div className="cloud-password"><input {...props} type={showPassword ? 'text' : 'password'} autoComplete="off" readOnly value={TEMPORARY_PASSWORD}/><button className="icon-button" type="button" aria-label={showPassword ? 'Ocultar contraseña temporal' : 'Mostrar contraseña temporal'} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div>}</Field></div>
        <Field label="Correos de jefes y gerentes (CC)">{props => <textarea {...props} rows={2} maxLength={13000} disabled={busy} value={form.copies} onChange={event => field('copies', event.target.value)} placeholder="jefe@empresa.com, gerente@empresa.com"/>}</Field>
        {error && <p role="alert" className="error-message cloud-message">{error}</p>}{message && <p role="status" className="account-success cloud-message">{message}</p>}
        <div className="admin-form-actions"><button type="submit" className="button button-primary" disabled={busy || loading}>{busy ? <LoaderCircle className="spin" size={18}/> : <Plus size={18}/>} {busy ? 'Creando cuenta…' : 'Crear usuario'}</button></div>
      </form>
    </div></div>
    <div className="account-table-card"><h2>Usuarios <span>{accounts.length}</span></h2>{loading ? <p role="status" className="cloud-loading"><LoaderCircle className="spin" size={18}/>Consultando cuentas…</p> : <><div className="account-table">{accounts.map(account => <div className="account-row" key={account.id}><div className="account-row-person"><strong>{account.full_name || account.email}</strong><span>{account.email}</span><small>{[account.area, account.job_title].filter(Boolean).join(' · ')}</small></div><span className="account-role">{account.role === 'admin' ? 'Administración' : 'Inspecciones'}</span><span className={`account-enabled ${!account.enabled ? 'account-disabled' : ''}`}>{!account.enabled ? 'Deshabilitada' : account.must_change_password ? 'Contraseña temporal' : 'Habilitada'}</span></div>)}</div><button type="button" className="button button-outline cloud-refresh" disabled={busy} onClick={() => setRetry(value => value + 1)}>Actualizar lista</button></>}</div>
  </section>;
}
