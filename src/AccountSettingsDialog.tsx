import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronRight, Mail, AtSign, ShieldCheck, Building2 } from 'lucide-react';
import { Field, Modal } from './components';
import { Select } from './Select';
import { yoSeguroCatalog, yoSeguroAccountAccess } from './yo-seguro';
import type { YoManagement } from './yo-seguro';
import { AccessSwitches } from './AccessSwitches';
import type { AccountPermissions, CloudProfile } from './cloud-account';

type View = 'menu' | 'permissions' | 'copies' | 'email' | 'yo-seguro';
export function AccountSettingsDialog({ account, initialPermissions, busy, error, onClose, onNavigate, onSavePermissions, onSaveCopies, onSaveEmail, onSaveYoSeguro }: {
  account: CloudProfile; initialPermissions: AccountPermissions; busy: boolean; error: string;
  onClose: () => void; onNavigate: () => void;
  onSavePermissions: (value: AccountPermissions) => void; onSaveCopies: (value: string) => void; onSaveEmail: (value: string) => void; onSaveYoSeguro: (value: string | null, expected: string | null) => void;
}) {
  const [view, setView] = useState<View>('menu');
  const [permissions, setPermissions] = useState(initialPermissions);
  const [copies, setCopies] = useState((account.supervisor_emails || []).join(', '));
  const [email, setEmail] = useState(account.email);
  const [yoManagement,setYoManagement] = useState(account.yo_seguro_management_id || '');
  const [yoCatalog,setYoCatalog] = useState<YoManagement[]>([]),[yoLoading,setYoLoading] = useState(false),[yoError,setYoError] = useState(''),[yoRetry,setYoRetry] = useState(0);
  const [yoExpected,setYoExpected] = useState<string|null>(null),[yoLoaded,setYoLoaded] = useState(false);
  useEffect(()=>{if(view!=='yo-seguro')return;let active=true;setYoLoading(true);setYoLoaded(false);setYoError('');void Promise.all([yoSeguroCatalog(),yoSeguroAccountAccess(account.id)]).then(([rows,assigned])=>{if(active){setYoCatalog(rows);setYoManagement(assigned||'');setYoExpected(assigned);setYoLoaded(true);}}).catch(problem=>{if(active)setYoError(problem instanceof Error?problem.message:'No pudimos cargar las gerencias.');}).finally(()=>{if(active)setYoLoading(false);});return()=>{active=false;};},[view,yoRetry,account.id]);
  const back = useRef<HTMLButtonElement>(null);
  const options = useRef<Partial<Record<View, HTMLButtonElement | null>>>({});
  const previous = useRef<View>('menu');
  useEffect(() => {
    if (previous.current !== view) {
      if (view === 'menu') options.current[previous.current]?.focus(); else back.current?.focus();
      previous.current = view;
    }
  }, [view]);
  const navigate = (next: View) => { onNavigate(); setView(next); };
  const name = account.full_name || account.email;
  return <Modal title={view === 'permissions' ? `Permisos de ${name}` : view === 'copies' ? 'Responde a (CC)' : view === 'email' ? 'Modificar correo' : view === 'yo-seguro' ? 'Acceso a Yo Seguro' : 'Editar usuario'} onClose={() => !busy && onClose()}>
    {view !== 'menu' && <button ref={back} type="button" className="text-button account-settings-back" disabled={busy} onClick={() => navigate('menu')}><ArrowLeft size={16}/>Volver a opciones</button>}
    <p className="modal-description account-settings-person"><strong>{name}</strong><br/>{account.email}</p>
    {view === 'menu' ? <div className="account-settings-options">{([
      ['permissions', 'Permisos', 'Define los módulos y las funciones disponibles para este usuario.', ShieldCheck],
      ['copies', 'Responde a (CC)', 'Administra los correos que recibirán una copia de sus notificaciones.', Mail],
      ['yo-seguro', 'Yo Seguro', 'Autoriza la consulta de documentos de una gerencia y sus áreas.', Building2],
      ['email', 'Modificar correo', 'Actualiza el correo de acceso y de las próximas notificaciones.', AtSign],
    ] as const).map(([key, label, description, Icon]) => <button key={key} ref={element => { options.current[key] = element; }} type="button" className="account-settings-option" aria-label={label} disabled={busy} onClick={() => navigate(key)}><span className="account-settings-icon"><Icon size={20}/></span><span><strong>{label}</strong><small>{description}</small></span><ChevronRight size={17}/></button>)}</div> : view === 'permissions' ? <>
      <AccessSwitches value={permissions} disabled={busy} onChange={setPermissions}/>
      {error && <p role="alert" className="error-message cloud-message">{error}</p>}
      <div className="modal-actions"><button type="button" className="button button-outline" disabled={busy} onClick={onClose}>Cancelar</button><button type="button" className="button button-primary" disabled={busy} onClick={() => onSavePermissions(permissions)}>{busy ? 'Guardando…' : 'Guardar permisos'}</button></div>
    </> : view === 'yo-seguro' ? <>
      <p className="modal-description">Esta cuenta podrá consultar los documentos de todas las áreas de la gerencia autorizada. Editar su perfil no cambia este permiso. Las cuentas administradoras conservan la vista general.</p>
      {yoLoading?<p role="status">Consultando gerencias…</p>:yoError?<><p className="error-message" role="alert">{yoError}</p><button type="button" className="text-button" onClick={()=>setYoRetry(n=>n+1)}>Reintentar</button></>:<Field label="Gerencia autorizada para Yo Seguro">{props=><Select {...props} searchable disabled={busy} value={yoManagement} onChange={setYoManagement} options={[{value:'',label:'Sin gerencia autorizada'},...yoCatalog.map(m=>({value:m.id,label:m.name}))]}/>}</Field>}
      {error&&<p role="alert" className="error-message cloud-message">{error}</p>}
      <div className="modal-actions"><button type="button" className="button button-outline" disabled={busy} onClick={onClose}>Cancelar</button><button type="button" className="button button-primary" disabled={busy||yoLoading||!!yoError||!yoLoaded} onClick={()=>onSaveYoSeguro(yoManagement||null,yoExpected)}>{busy?'Guardando…':'Guardar acceso'}</button></div>
    </> : <form onSubmit={event => { event.preventDefault(); if (view === 'copies') onSaveCopies(copies); else onSaveEmail(email); }}>
      {view === 'copies' ? <Field label="Responde a (CC):" hint="Separa los correos con comas. Las personas indicadas recibirán una copia de las próximas notificaciones dirigidas a este usuario.">{props => <textarea {...props} autoComplete="off" rows={3} maxLength={13000} disabled={busy} value={copies} onChange={event => setCopies(event.target.value)} placeholder="persona1@hortifrut.com, persona2@hortifrut.com"/>}</Field> : <Field label="Nuevo correo electrónico" required hint="El usuario iniciará sesión con este correo y conservará su contraseña, sus permisos y sus inspecciones.">{props => <input {...props} type="email" required autoComplete="off" maxLength={254} disabled={busy} value={email} onChange={event => setEmail(event.target.value)} placeholder="nombre@hortifrut.com"/>}</Field>}
      {error && <p role="alert" className="error-message cloud-message">{error}</p>}
      <div className="modal-actions"><button type="button" className="button button-outline" disabled={busy} onClick={onClose}>Cancelar</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? 'Guardando…' : view === 'copies' ? 'Guardar CC' : 'Guardar correo'}</button></div>
    </form>}
  </Modal>;
}
