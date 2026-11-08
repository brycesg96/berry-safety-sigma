import { MakeIntegration } from './MakeIntegration';
import { useState } from 'react';
import { ShieldCheck, UsersRound } from 'lucide-react';
import { SectionTitle } from './components';
import type { DemoAccount } from './accounts';

export function Administration({ actor, onCloudAccess }: { actor: DemoAccount; onCloudAccess: () => void }) {
  const [tab, setTab] = useState<'users' | 'permissions' | 'integrations'>('users');
  if (actor.role !== 'admin' || !actor.enabled) return <p role="alert">Esta sección requiere la cuenta administradora.</p>;
  return <>
    <div className="page-heading"><div><div className="eyebrow"><span/>GESTIÓN DEL ESPACIO DE TRABAJO</div><h1>Administración</h1><p>Gestiona los usuarios y las opciones de tu espacio de trabajo.</p></div></div>
    <nav className="admin-tabs" aria-label="Secciones de administración">{([['users', 'Usuarios'], ['permissions', 'Funciones y permisos'], ['integrations', 'Integraciones']] as const).map(([id, label]) => <button key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>{label}</button>)}</nav>
    {tab === 'users' && <div className="form-card"><div className="form-body"><SectionTitle icon={<UsersRound size={19}/>} title="Usuarios de Berry Safety" subtitle="Crea usuarios y consulta sus accesos desde cualquier dispositivo."/><p className="modal-description">Inicia sesión con tu cuenta administradora para gestionar los usuarios.</p><button type="button" className="button button-primary" onClick={onCloudAccess}>Administrar usuarios</button></div></div>}
    {tab === 'integrations' && <MakeIntegration/>}
    {tab === 'permissions' && <div className="form-card"><div className="form-body"><SectionTitle icon={<ShieldCheck size={19}/>} title="Funciones y permisos" subtitle="Los permisos adicionales se definirán en próximos avances."/><div className="permission-overview"><div><strong>Administración</strong><p>Inspecciones y gestión de usuarios.</p></div><div><strong>Inspecciones</strong><p>Crear inspecciones, atender los informes asignados y completar el perfil.</p></div></div><p className="local-admin-note">Los accesos se comprueban con la cuenta que inicia sesión.</p></div></div>}
  </>;
}
