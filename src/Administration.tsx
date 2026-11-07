import { MakeIntegration } from './MakeIntegration';
import { useState } from 'react';
import { Check, Pencil, Plus, ShieldCheck, UsersRound, X } from 'lucide-react';
import { Field, SectionTitle } from './components';
import { ADMIN_ID, INSPECTOR_ID, addAccount, editAccount, supervisorEmails } from './accounts';
import type { AccountRole, DemoAccount } from './accounts';

export function MicrosoftAccess() {
  return <div className="microsoft-access"><div className="microsoft-description"><strong>Inicio de sesión con Microsoft</strong><p>Desactivado durante las pruebas.</p></div><button className="button button-outline" disabled aria-label="Continuar con Microsoft, desactivado en pruebas"><span className="microsoft-mark" aria-hidden="true"><i/><i/><i/><i/></span>Continuar con Microsoft</button></div>;
}
export function Administration({ accounts, actor, onAccounts, onCloudAccess }: { accounts: DemoAccount[]; actor: DemoAccount; onAccounts: (accounts: DemoAccount[]) => void; onCloudAccess: () => void }) {
  const [tab, setTab] = useState<'users' | 'access' | 'permissions' | 'integrations'>('users');
  const [name, setName] = useState(''), [email, setEmail] = useState('');
  const [supervisors, setSupervisors] = useState('');
  const [role, setRole] = useState<AccountRole>('inspector');
  const [editing, setEditing] = useState<DemoAccount | null>(null);
  const [error, setError] = useState(''), [message, setMessage] = useState('');
  if (actor.role !== 'admin' || !actor.enabled) return <p role="alert">Esta sección requiere la cuenta administradora.</p>;
  const submit = () => {
    setError(''); setMessage('');
    try {
      if (editing) onAccounts(editAccount(actor.id, editing.id, { name, role, enabled: editing.enabled, supervisorEmails: supervisorEmails(supervisors) }));
      else onAccounts(addAccount(actor.id, { name, email, role, supervisorEmails: supervisorEmails(supervisors) }));
      setMessage(editing ? 'Cuenta actualizada.' : 'Cuenta añadida al directorio de pruebas. No se ha enviado ninguna invitación.');
      setEditing(null); setSupervisors(''); setName(''); setEmail(''); setRole('inspector');
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar la cuenta.'); }
  };
  return <>
    <div className="page-heading"><div><div className="eyebrow"><span/>GESTIÓN DEL ESPACIO DE TRABAJO</div><h1>Administración</h1><p>Gestiona las cuentas y prepara las opciones de acceso.</p></div><span className="demo-badge">Modo de prueba</span></div>
    <nav className="admin-tabs" aria-label="Secciones de administración">{([['users', 'Cuentas permitidas'], ['access', 'Inicio de sesión'], ['permissions', 'Funciones y permisos'], ['integrations', 'Integraciones']] as const).map(([id, label]) => <button key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => { setTab(id); setError(''); setMessage(''); }}>{label}</button>)}</nav>
    {tab === 'users' && <>
      <div className="notice"><ShieldCheck size={18}/><div><strong>Usuarios con acceso desde cualquier dispositivo</strong><p>Las altas reales se gestionan con tu sesión administradora.</p><button type="button" className="button button-primary" onClick={onCloudAccess}>Administrar usuarios</button></div></div>
      <div className="form-card admin-form"><div className="form-body"><SectionTitle icon={<UsersRound size={19}/>} title={editing ? 'Editar cuenta' : 'Añadir cuenta permitida'} subtitle="Nombre y correo son los datos mínimos para habilitar una cuenta."/>
        <form onSubmit={e => { e.preventDefault(); submit(); }}><div className="field-grid"><Field label="Nombre de la cuenta" required>{p => <input {...p} autoComplete="off" maxLength={250} value={name} onChange={e => setName(e.target.value)} placeholder="Nombres y apellidos"/>}</Field><Field label="Correo de la cuenta" required>{p => <input {...p} type="email" autoComplete="off" maxLength={250} value={email} readOnly={!!editing} onChange={e => setEmail(e.target.value)} placeholder="persona@empresa.com"/>}</Field></div><Field label="Rol">{p => <select {...p} value={role} disabled={!!editing && [ADMIN_ID, INSPECTOR_ID].includes(editing.id)} onChange={e => setRole(e.target.value as AccountRole)}><option value="inspector">Inspecciones</option><option value="admin">Administración</option></select>}</Field>
        <Field label="Correos de jefes y gerentes (CC)" hint="Se añadirán en copia cuando esta persona sea destinataria de una inspección. No crean cuentas ni otorgan acceso. Separa los correos con comas.">{p => <textarea {...p} rows={2} value={supervisors} maxLength={13000} onChange={e => setSupervisors(e.target.value)} placeholder="jefe@empresa.com, gerente@empresa.com"/>}</Field>
        {error && <p className="error-message" role="alert">{error}</p>}{message && <p className="account-success" role="status">{message}</p>}
        <div className="admin-form-actions">{editing && <button className="button button-outline" type="button" onClick={() => { setEditing(null); setSupervisors(''); setName(''); setEmail(''); setRole('inspector'); setError(''); }}><X size={16}/>Cancelar</button>}<button className="button button-primary" type="submit">{editing ? <Check size={16}/> : <Plus size={16}/>}{editing ? 'Guardar cuenta' : 'Añadir cuenta'}</button></div></form>
        <p className="local-admin-note">Durante las pruebas, las cuentas añadidas se guardan solo en este navegador. No se envían invitaciones ni se verifica la identidad.</p>
      </div></div>
      <div className="account-table-card"><h2>Cuentas permitidas <span>{accounts.length}</span></h2><div className="account-table">{accounts.map(a => <div className="account-row" key={a.id}><div className="account-row-person"><strong>{a.name}</strong><span>{a.email}</span>{!!a.supervisorEmails?.length && <small>CC: {a.supervisorEmails.join(', ')}</small>}</div><span className="account-role">{a.role === 'admin' ? 'Administrador' : 'Inspecciones'}</span><span className={`account-enabled ${!a.enabled ? 'account-disabled' : ''}`}>{a.enabled ? 'Habilitada' : 'Desactivada'}</span><button className="icon-button" aria-label={`Editar cuenta ${a.email}`} onClick={() => { setEditing(a); setSupervisors((a.supervisorEmails || []).join(', ')); setName(a.name); setEmail(a.email); setRole(a.role); setError(''); setMessage(''); window.scrollTo({ top: 0, behavior: 'smooth' }); }}><Pencil size={16}/></button><button className="text-button" disabled={a.id === ADMIN_ID || a.id === actor.id} onClick={() => { try { onAccounts(editAccount(actor.id, a.id, { name: a.name, role: a.role, enabled: !a.enabled })); setError(''); } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo actualizar el acceso.'); } }}>{a.enabled ? 'Desactivar' : 'Activar'}</button></div>)}</div></div>
    </>}
    {tab === 'access' && <div className="form-card"><div className="form-body"><SectionTitle icon={<ShieldCheck size={19}/>} title="Tu cuenta de Berry Safety" subtitle="Accede con correo y contraseña y completa tu perfil para usarlo desde otros dispositivos."/><button type="button" className="button button-primary" onClick={onCloudAccess}>Iniciar sesión con correo</button><MicrosoftAccess/><p className="local-admin-note">Las cuentas de este espacio de pruebas siguen siendo locales. El acceso con correo utiliza las cuentas habilitadas en Supabase.</p></div></div>}
    {tab === 'integrations' && <MakeIntegration/>}
    {tab === 'permissions' && <div className="form-card"><div className="form-body"><SectionTitle icon={<ShieldCheck size={19}/>} title="Funciones y permisos" subtitle="Los permisos adicionales se definirán en próximos avances."/><div className="permission-overview"><div><strong>Administración</strong><p>Inspecciones y gestión de cuentas de prueba.</p></div><div><strong>Inspecciones</strong><p>Crear y revisar inspecciones propias y completar el perfil.</p></div></div><p className="local-admin-note">Los roles permiten revisar el comportamiento de las pantallas. Mientras Microsoft esté desactivado, no constituyen una restricción real de acceso.</p></div></div>}
  </>;
}
