import { useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ArrowLeft, Check, Eye, EyeOff, LoaderCircle, LockKeyhole, LogOut, ShieldCheck } from 'lucide-react';
import { Brand, Field, LockedEmailField, Modal } from './components';
import { changeCloudPassword, loadCloudProfile, markProfileSetup, saveCloudProfile } from './cloud-account';
import type { CloudProfile } from './cloud-account';
import { supabaseClient } from './supabase';
import type { ExitConfirmation } from './useExitConfirmation';
import './cloud-account.css';
import { InspectionDashboard } from './InspectionDashboard';
import type { DashboardCache } from './dashboard';
import { CloudAdministration } from './CloudAdministration';
import type { CloudAdministrationCache } from './CloudAdministration';
import { clearCloudRuntime } from './cloud-store';
import { AccountSupport } from './AccountSupport';
import { newPasswordError } from '../shared/account-rules.mjs';
import { CloudWorkspace } from './CloudWorkspace';
import { supabaseFoundationStatus } from './supabase';

type ProfileForm = { full_name: string; area: string; job_title: string };
const rememberedKey = 'berry-remembered-email';
function rememberedEmail() { try { return localStorage.getItem(rememberedKey) || ''; } catch { return ''; } }
function rememberEmail(email: string) { try { if (email) localStorage.setItem(rememberedKey, email); else localStorage.removeItem(rememberedKey); } catch { /* Browser storage is optional. */ } }
const blank = (): ProfileForm => ({ full_name: '', area: '', job_title: '' });
const fieldsOf = (profile: CloudProfile): ProfileForm => ({ full_name: profile.full_name, area: profile.area, job_title: profile.job_title });

export function CloudAccess({ exit, onReturn, onSessionChange, initialSection = 'workspace' }: { exit: ExitConfirmation; onReturn?: () => void; onSessionChange?: (authenticated: boolean) => void; initialSection?: 'profile' | 'admin' | 'dashboard' | 'workspace' }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<CloudProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [retry, setRetry] = useState(0);
  const [email, setEmail] = useState(rememberedEmail);
  const [rememberAccount, setRememberAccount] = useState(() => !!rememberedEmail());
  const sessionChange = useRef(onSessionChange); sessionChange.current = onSessionChange;
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState(() => new URLSearchParams(location.hash.slice(1)).has('error') ? 'El enlace de recuperación venció o no es válido. Solicita uno nuevo.' : '');
  const [recoveryRequest, setRecoveryRequest] = useState(false);
  const [passwordRecovery, setPasswordRecovery] = useState(() => new URL(location.href).searchParams.get('recuperar') === '1');
  const [recoveryNotice, setRecoveryNotice] = useState('');
  const [form, setForm] = useState<ProfileForm>(blank);
  const [formError, setFormError] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState<'login' | 'save' | 'logout' | 'password' | 'recovery' | null>(null);
  const [section, setSection] = useState<'profile' | 'admin' | 'dashboard' | 'workspace'>(initialSection);
  const [workspaceReady, setWorkspaceReady] = useState(false), [workspaceChecked, setWorkspaceChecked] = useState(false);
  const [workspaceError, setWorkspaceError] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [loginNotice, setLoginNotice] = useState('');
  const [confirmLeave, setConfirmLeave] = useState<'return' | 'logout' | null>(null);
  const dashboardCache = useRef<DashboardCache | null>(null);
  const [reportBusy, setReportBusy] = useState(false);
  const reportWorking = useRef(false); reportWorking.current = reportBusy;
  useEffect(() => {
    if (section !== 'dashboard') return;
    return exit.setBeforeLeave(async () => { if (reportWorking.current) throw new Error('Termina la operación o guarda o cancela la edición antes de cerrar sesión.'); });
  }, [section, exit.setBeforeLeave]);
  const administrationCache = useRef<CloudAdministrationCache | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const generation = useRef(0);
  const userId = session?.user.id;
  const ownProfile = profile?.id === userId ? profile : null;
  const completingProfile = !!ownProfile?.enabled && !ownProfile.must_change_password && !passwordRecovery && ownProfile.profile_setup_required === true;
  const dirty = !!ownProfile && JSON.stringify(form) !== JSON.stringify(fieldsOf(ownProfile));
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    document.title = section === 'workspace' && userId ? 'Berry Safety · Espacio de trabajo' : 'Tu cuenta · Berry Safety';
    return () => { document.title = 'Berry Safety · Espacio de trabajo'; };
  }, [section, userId]);

  useEffect(() => {
    let active = true;
    let authEvent = false;
    const accept = (next: Session | null) => {
      if (!active) return;
      if (next?.user.id !== sessionRef.current?.user.id) {
        generation.current++; administrationCache.current = null; dashboardCache.current = null; clearCloudRuntime();
        setProfile(null); setProfileError(''); setForm(blank()); setFormError(''); setSaved(false); setPassword('');
        setShowPassword(false);
        setNewPassword(''); setRepeatPassword(''); setPasswordError('');
        const target = new URL(location.href).searchParams.get('seccion');
        setSection(next ? target === 'usuarios' ? 'admin' : target === 'panel' ? 'dashboard' : target === 'perfil' ? 'profile' : 'workspace' : 'workspace');
        if (!next) { setEmail(rememberedEmail()); setRecoveryRequest(false); }
      }
      sessionRef.current = next;
      sessionChange.current?.(!!next);
      setSession(next); setReady(true);
    };
    // Keep Auth callbacks synchronous: querying from them can block the SDK's
    // session lock. Profile requests run in the separate effect below.
    const { data: { subscription } } = supabaseClient().auth.onAuthStateChange((event, next) => {
      authEvent = true;
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
      if (event === 'SIGNED_OUT') {
        setPasswordRecovery(false); setRecoveryRequest(false);
        const url = new URL(location.href); url.searchParams.delete('recuperar'); url.searchParams.delete('seccion'); url.hash = ''; history.replaceState(history.state, '', url);
      }
      accept(next);
    });
    void supabaseClient().auth.getSession().then(({ data, error }) => {
      if (!active || authEvent) return;
      if (error) setLoginError('No pudimos recuperar tu sesión. Vuelve a iniciar sesión.');
      accept(data.session);
    }).catch(() => { if (active) { setLoginError('No pudimos recuperar tu sesión. Vuelve a intentarlo.'); accept(null); } });
    return () => { active = false; generation.current++; subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!userId) { setProfile(null); setProfileLoading(false); return; }
    let active = true;
    const requestGeneration = generation.current;
    setProfileLoading(true); setProfileError(''); setProfile(null); setSaved(false);
    void loadCloudProfile(userId, () => active && generation.current === requestGeneration).then(next => {
      if (!active || generation.current !== requestGeneration) return;
      if (!next.enabled || next.deleted_at) clearCloudRuntime();
      if (!next.enabled || next.deleted_at || next.role !== 'admin') { administrationCache.current = null; dashboardCache.current = null; }
      setProfile(next); setForm(fieldsOf(next)); setFormError('');
    }).catch(error => {
      if (active && generation.current === requestGeneration) setProfileError(error instanceof Error ? error.message : 'No pudimos consultar tu perfil.');
    }).finally(() => { if (active) setProfileLoading(false); });
    return () => { active = false; };
  }, [userId, retry]);

  useEffect(() => { if (ready) heading.current?.focus({ preventScroll: true }); }, [ready, userId, ownProfile?.enabled]);
  useEffect(() => {
    let active = true;
    setWorkspaceChecked(false); setWorkspaceError('');
    if (!ownProfile?.enabled || ownProfile.must_change_password) { setWorkspaceReady(false); return; }
    void supabaseFoundationStatus().then(status => { if (active) { setWorkspaceReady(status.sync_ready); setWorkspaceChecked(true); } }).catch(() => { if (active) { setWorkspaceReady(false); setWorkspaceChecked(true); setWorkspaceError('No pudimos abrir tu espacio de trabajo. Revisa tu conexión y vuelve a intentarlo.'); } });
    return () => { active = false; };
  }, [ownProfile?.id, ownProfile?.enabled, ownProfile?.must_change_password]);

  useEffect(() => {
    if (!ownProfile?.enabled || ownProfile.must_change_password || passwordRecovery) return;
    const url = new URL(location.href);
    if (section === 'workspace') url.searchParams.delete('seccion');
    else url.searchParams.set('seccion', section === 'admin' ? 'usuarios' : section === 'dashboard' ? 'panel' : 'perfil');
    history.replaceState(history.state, '', url);
  }, [section, ownProfile?.id, ownProfile?.enabled, ownProfile?.must_change_password, passwordRecovery]);

  const login = async () => {
    if (busy) return;
    setLoginError(''); setLoginNotice(''); setBusy('login');
    try {
      const { error } = await supabaseClient().auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (error) {
        if (error.code === 'invalid_credentials' || error.status === 400 && error.message === 'Invalid login credentials') throw new Error('El correo o la contraseña no son correctos.');
        if (error.code === 'email_not_confirmed' || error.message === 'Email not confirmed') throw new Error('Confirma el correo de tu cuenta antes de iniciar sesión.');
        if (error.status === 429) throw new Error('Hubo varios intentos seguidos. Espera un momento y vuelve a intentarlo.');
        throw new Error('No pudimos iniciar sesión. Revisa tu conexión y vuelve a intentarlo.');
      }
      rememberEmail(rememberAccount ? email.trim().toLowerCase() : '');
    } catch (error) { setLoginError(error instanceof Error ? error.message : 'No pudimos iniciar sesión.'); }
    finally { setPassword(''); setBusy(null); }
  };
  const requestRecovery = async () => {
    if (busy) return;
    setBusy('recovery'); setLoginError(''); setRecoveryNotice('');
    try {
      const target = new URL(location.href);
      target.search = '?acceso=cuenta&recuperar=1'; target.hash = '';
      const { error } = await supabaseClient().auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: target.href });
      if (error) throw new Error(error.status === 429 ? 'Se alcanzó el límite temporal de correos de recuperación. Si usas el correo integrado de Supabase, permite hasta 2 envíos por hora; vuelve a intentarlo cuando se libere el límite.' : 'No pudimos solicitar el enlace. Revisa tu conexión y vuelve a intentarlo.');
      setRecoveryNotice('Si el correo corresponde a una cuenta, recibirás un enlace para elegir una nueva contraseña. Ábrelo en este navegador.');
    } catch (error) { setLoginError(error instanceof Error ? error.message : 'No pudimos solicitar el enlace.'); }
    finally { setBusy(null); }
  };
  const save = async () => {
    if (!userId || !ownProfile?.enabled || busy) return;
    if (completingProfile && !form.job_title.trim()) { setFormError('Completa tu cargo para continuar.'); return; }
    const requestGeneration = generation.current;
    setBusy('save'); setFormError(''); setSaved(false);
    try {
      const next = await saveCloudProfile(userId, form, () => generation.current === requestGeneration && sessionRef.current?.user.id === userId);
      if (completingProfile) await markProfileSetup(userId, 'completed', () => generation.current === requestGeneration && sessionRef.current?.user.id === userId);
      if (generation.current === requestGeneration) { setProfile({ ...next, profile_setup_required: false }); setForm(fieldsOf(next)); setSaved(true); if (completingProfile) setSection('workspace'); }
    } catch (error) { if (generation.current === requestGeneration) setFormError(error instanceof Error ? error.message : 'No se guardó el perfil.'); }
    finally { setBusy(null); }
  };
  const logout = async () => {
    if (busy || reportWorking.current) return;
    setBusy('logout'); setFormError(''); setProfileError('');
    try {
      const { error } = await supabaseClient().auth.signOut({ scope: 'local' });
      if (error) throw error;
      setEmail(rememberedEmail());
    } catch { setFormError('No pudimos cerrar la sesión. Revisa tu conexión y vuelve a intentarlo.'); }
    finally { setBusy(null); }
  };
  const updatePassword = async () => {
    if (!userId || busy) return;
    const invalid = newPasswordError(newPassword);
    if (invalid || newPassword !== repeatPassword) { setPasswordError(invalid || 'Las contraseñas no coinciden.'); return; }
    const requestGeneration = generation.current;
    setPasswordError(''); setBusy('password');
    try {
      if (ownProfile?.must_change_password) await markProfileSetup(userId, 'required', () => generation.current === requestGeneration && sessionRef.current?.user.id === userId);
      await changeCloudPassword(newPassword);
      if (generation.current !== requestGeneration) return;
      setNewPassword(''); setRepeatPassword('');
      const url = new URL(location.href); url.searchParams.delete('recuperar'); url.hash = ''; history.replaceState(history.state, '', url);
      const { error } = await supabaseClient().auth.signOut({ scope: 'local' });
      if (error) throw new Error('La contraseña se actualizó. Cierra la sesión y entra con tu nueva contraseña.');
      // JWT issue times use whole seconds. A fresh sign-in must fall after
      // the database's credential cutoff, including with instant autofill.
      await new Promise(resolve => window.setTimeout(resolve, 1100));
      setLoginNotice('Contraseña actualizada. Inicia sesión con tu nueva contraseña.');
    } catch (error) { if (generation.current === requestGeneration) setPasswordError(error instanceof Error ? error.message : 'No pudimos actualizar la contraseña.'); }
    finally { setBusy(null); }
  };
  const changeField = (key: keyof ProfileForm, value: string) => { setForm(current => ({ ...current, [key]: value })); setFormError(''); setSaved(false); };

  const hasModules = !!ownProfile && (ownProfile.role === 'admin' || ownProfile.can_create_inspections !== false || ownProfile.can_receive_inspections !== false);
  const showAdmin = !!ownProfile?.enabled && !ownProfile.must_change_password && !passwordRecovery && !completingProfile && ownProfile.role === 'admin' && section === 'admin';
  const showDashboard = !!ownProfile?.enabled && !ownProfile.must_change_password && !passwordRecovery && !completingProfile && ownProfile.role === 'admin' && section === 'dashboard';
  if (section === 'workspace' && workspaceReady && hasModules && ownProfile?.enabled && !ownProfile.must_change_password && !passwordRecovery && !completingProfile) return <CloudWorkspace profile={ownProfile} exit={exit} onAccount={target => { setSection(target || 'profile'); setRetry(value => value + 1); }}/>;
  return <div className="cloud-account-page" spellCheck={false}>
    <header className="cloud-account-header"><Brand/>{onReturn && !ownProfile?.must_change_password && !passwordRecovery && <button type="button" className="cloud-return" disabled={!!busy || reportBusy} onClick={() => dirty ? setConfirmLeave('return') : onReturn()}><ArrowLeft size={17}/>Espacio de pruebas</button>}</header>
    <main className={`cloud-account-main ${showDashboard ? 'cloud-account-dashboard-main' : showAdmin ? 'cloud-account-admin-main' : ''}`}>
      {(section !== 'workspace' || workspaceChecked && !workspaceReady && !workspaceError) && ownProfile?.enabled && !ownProfile.must_change_password && !passwordRecovery && ownProfile.role === 'admin' && !completingProfile && <nav className="admin-tabs" aria-label="Cuenta y administración"><button type="button" aria-current={section === 'profile' ? 'page' : undefined} disabled={!!busy || reportBusy} onClick={() => setSection('profile')}>Mi perfil</button><button type="button" aria-current={section === 'admin' ? 'page' : undefined} disabled={!!busy || dirty || reportBusy} onClick={() => setSection('admin')}>Gestión de Cuentas</button><button type="button" aria-current={section === 'dashboard' ? 'page' : undefined} disabled={!!busy || dirty || reportBusy} onClick={() => setSection('dashboard')}>Gestión de Inspecciones</button></nav>}
      {showDashboard ? <><InspectionDashboard actor={ownProfile!} cache={dashboardCache} isCurrent={() => sessionRef.current?.user.id === ownProfile!.id} onBusyChange={setReportBusy}/><button type="button" className="cloud-logout" disabled={!!busy || reportBusy} onClick={() => void logout()}><LogOut size={17}/>Cerrar sesión en este dispositivo</button></> : showAdmin ? <><CloudAdministration key={ownProfile!.id} actor={ownProfile!} cache={administrationCache} onBusyChange={setReportBusy} isCurrent={() => sessionRef.current?.user.id === ownProfile!.id} onSelfChange={next => { setProfile(next); setForm(fieldsOf(next)); if (next.role !== 'admin') { administrationCache.current = null; dashboardCache.current = null; setSection('profile'); } }}/><button type="button" className="cloud-logout" disabled={!!busy || reportBusy} onClick={() => void logout()}><LogOut size={17}/>Cerrar sesión en este dispositivo</button>{formError && <p role="alert" className="error-message cloud-message">{formError}</p>}</> : <section className="cloud-account-card" aria-busy={!ready || profileLoading || !!busy}>
        <div className="cloud-account-icon"><ShieldCheck size={27}/></div>
        {!ready ? <><h1 ref={heading} tabIndex={-1}>Tu cuenta</h1><p className="cloud-loading" role="status"><LoaderCircle size={18} className="spin"/>Comprobando tu sesión…</p></> : !session && recoveryRequest ? <>
          <h1 ref={heading} tabIndex={-1}>Recupera tu contraseña</h1><p className="cloud-account-intro">Recibe un enlace en el correo de tu cuenta.</p>
          <form onSubmit={event => { event.preventDefault(); void requestRecovery(); }}><Field label="Correo electrónico" required>{props => <input {...props} type="email" autoComplete="username" autoCapitalize="none" required maxLength={254} disabled={!!busy} value={email} onChange={event => setEmail(event.target.value)}/>}</Field>{loginError && <p role="alert" className="error-message cloud-message">{loginError}</p>}{recoveryNotice && <p role="status" className="cloud-saved">{recoveryNotice}</p>}<button type="submit" className="button button-primary full-width" disabled={!!busy}>{busy === 'recovery' ? <LoaderCircle size={17} className="spin"/> : <LockKeyhole size={17}/>}Enviar enlace de recuperación</button></form>
          <button type="button" className="cloud-logout" disabled={!!busy} onClick={() => { setRecoveryRequest(false); setLoginError(''); }}>Volver a iniciar sesión</button>
        </> : !session ? <>
          <div className="eyebrow">TU ESPACIO DE SEGURIDAD</div>
          <h1 ref={heading} tabIndex={-1}>Inicia sesión</h1>
          <p className="cloud-account-intro">Accede con tu cuenta de Berry Safety.</p>
          <form onSubmit={event => { event.preventDefault(); void login(); }}>
            <Field label="Correo electrónico" required>{props => <input {...props} type="email" autoComplete="username" autoCapitalize="none" required maxLength={254} value={email} disabled={!!busy} onChange={event => { setEmail(event.target.value); setLoginError(''); }}/>}</Field>
            <Field label="Contraseña" required>{props => <div className="cloud-password"><input {...props} type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={password} disabled={!!busy} onChange={event => { setPassword(event.target.value); setLoginError(''); }}/><button type="button" className="icon-button" aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div>}</Field>
            <label className="cloud-remember"><input type="checkbox" checked={rememberAccount} disabled={!!busy} onChange={event => { setRememberAccount(event.target.checked); if (!event.target.checked) rememberEmail(''); }}/>Recordar mi cuenta en este dispositivo</label>
            {loginError && <p role="alert" className="error-message cloud-message">{loginError}</p>}
            {loginNotice && <p role="status" className="cloud-saved">{loginNotice}</p>}
            <button type="submit" className="button button-primary full-width" disabled={!!busy}>{busy === 'login' ? <LoaderCircle className="spin" size={17}/> : <LockKeyhole size={17}/>} {busy === 'login' ? 'Iniciando sesión…' : 'Iniciar sesión'}</button>
          </form>
          <p className="cloud-account-hint">Utiliza el correo y la contraseña de tu cuenta habilitada.</p>
          <button type="button" className="cloud-logout" disabled={!!busy} onClick={() => { setRecoveryRequest(true); setPassword(''); setLoginError(''); setRecoveryNotice(''); }}>Olvidé mi contraseña</button>
        </> : profileLoading || !ownProfile && !profileError ? <>
          <h1 ref={heading} tabIndex={-1}>Tu cuenta</h1><p className="cloud-loading" role="status"><LoaderCircle size={18} className="spin"/>Consultando tu perfil…</p>
        </> : ownProfile && !ownProfile.enabled ? <>
          <h1 ref={heading} tabIndex={-1}>{ownProfile.deleted_at ? 'Cuenta eliminada' : 'Cuenta inhabilitada'}</h1>
          <p className="cloud-account-intro">{ownProfile.deleted_at ? 'Esta cuenta fue retirada y ya no puede acceder a la aplicación.' : 'Tu cuenta se encuentra inhabilitada. Contacta a un administrador para solicitar su reactivación.'}</p>
          <p className="cloud-account-email">{ownProfile.email}</p>
          <>{!ownProfile.deleted_at && <><AccountSupport key={ownProfile.id} accountId={ownProfile.id}/><button type="button" className="button button-primary full-width" disabled={!!busy} onClick={() => setRetry(value => value + 1)}>Comprobar acceso</button></>}</>
        </> : ownProfile?.must_change_password || passwordRecovery && ownProfile?.enabled ? <>
          <h1 ref={heading} tabIndex={-1}>{passwordRecovery ? 'Crea una nueva contraseña' : 'Actualiza tu contraseña'}</h1>
          <p className="cloud-account-intro">{passwordRecovery ? 'Elige una contraseña personal para volver a entrar a tu cuenta.' : 'Estás usando una contraseña temporal. Crea una contraseña personal para continuar.'}</p>
          <p className="cloud-account-email">{ownProfile.email}</p>
          <form onSubmit={event => { event.preventDefault(); void updatePassword(); }}>
            <Field label="Nueva contraseña" required hint="Al menos 10 caracteres, distinta de la temporal.">{props => <div className="cloud-password"><input {...props} required type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={10} value={newPassword} disabled={!!busy} onChange={event => { setNewPassword(event.target.value); setPasswordError(''); }}/><button type="button" className="icon-button" aria-label={showPassword ? 'Ocultar nueva contraseña' : 'Mostrar nueva contraseña'} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div>}</Field>
            <Field label="Repite la nueva contraseña" required>{props => <input {...props} required type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={10} value={repeatPassword} disabled={!!busy} onChange={event => { setRepeatPassword(event.target.value); setPasswordError(''); }}/>}</Field>
            {passwordError && <p role="alert" className="error-message cloud-message">{passwordError}</p>}
            <button type="submit" className="button button-primary full-width" disabled={!!busy}>{busy === 'password' ? <LoaderCircle size={17} className="spin"/> : <LockKeyhole size={17}/>} {busy === 'password' ? 'Actualizando…' : 'Actualizar contraseña'}</button>
          </form>
        </> : section === 'workspace' && hasModules && !completingProfile && !workspaceChecked ? <><h1>Tu espacio de trabajo</h1><p className="cloud-loading" role="status"><LoaderCircle size={18} className="spin"/>Abriendo tus inspecciones…</p></> : section === 'workspace' && hasModules && !completingProfile && workspaceError ? <><h1>Tu espacio de trabajo</h1><p className="error-message cloud-message" role="alert">{workspaceError}</p><button type="button" className="button button-primary full-width" onClick={() => setRetry(value => value + 1)}>Reintentar</button></> : ownProfile ? <>
          <div className="cloud-profile-heading"><h1 ref={heading} tabIndex={-1}>Mi perfil</h1><span className="account-enabled">{ownProfile.role === 'admin' ? 'Administrador' : 'Usuario'}</span></div>
          <p className="cloud-account-intro">{completingProfile ? 'Completa tu área y cargo para comenzar. Este paso se solicita una sola vez; al guardar entrarás a tu espacio de trabajo.' : 'Estos datos identificarán tu participación en las inspecciones.'}</p>
          <form onSubmit={event => { event.preventDefault(); void save(); }}>
            <LockedEmailField label="Correo de tu cuenta" value={ownProfile.email}/>
            <Field label="Nombres y apellidos" required hint="Escribe nombres y apellidos con sus iniciales en mayúscula.">{props => <input {...props} autoComplete="name" autoCapitalize="words" required maxLength={250} disabled={!!busy} value={form.full_name} onChange={event => changeField('full_name', event.target.value)}/>}</Field>
            <Field label="Área" required hint="Usa el nombre formal del área, con mayúscula inicial y respetando las siglas.">{props => <input {...props} required maxLength={250} disabled={!!busy} autoCapitalize="sentences" value={form.area} onChange={event => changeField('area', event.target.value)}/>}</Field>
            <Field label="Puesto" required={completingProfile} hint="Usa el nombre formal del puesto, con mayúscula inicial y respetando las siglas.">{props => <input {...props} required={completingProfile} autoComplete="organization-title" maxLength={250} disabled={!!busy} autoCapitalize="sentences" value={form.job_title} onChange={event => changeField('job_title', event.target.value)}/>}</Field>
            {formError && <p role="alert" className="error-message cloud-message">{formError}</p>}
            {saved && <p role="status" className="cloud-saved"><Check size={16}/>Perfil guardado en tu cuenta.</p>}
            <button type="submit" className="button button-primary full-width" disabled={!!busy || !dirty && !completingProfile}>{busy === 'save' ? <LoaderCircle className="spin" size={17}/> : <Check size={17}/>} {busy === 'save' ? 'Guardando…' : 'Guardar perfil'}</button>
          </form>
          {workspaceReady && hasModules && !completingProfile && <button type="button" className="button button-outline full-width cloud-enter-workspace" disabled={!!busy || dirty || !form.full_name.trim() || !form.area.trim()} onClick={() => setSection('workspace')}>Entrar al espacio de trabajo</button>}
          {!hasModules && <p className="cloud-account-hint">El administrador debe asignarte los permisos que utilizarás.</p>}
        </> : <>
          <h1 ref={heading} tabIndex={-1}>No pudimos abrir tu perfil</h1>
          <p role="alert" className="error-message cloud-message">{profileError}</p>
          <button type="button" className="button button-primary full-width" disabled={!!busy} onClick={() => setRetry(value => value + 1)}>Reintentar</button>
        </>}
        {session && <><button type="button" className="cloud-logout" disabled={!!busy} onClick={() => dirty ? setConfirmLeave('logout') : void logout()}>{busy === 'logout' ? <LoaderCircle className="spin" size={17}/> : <LogOut size={17}/>}Cerrar sesión en este dispositivo</button>{formError && !ownProfile?.enabled && <p role="alert" className="error-message cloud-message">{formError}</p>}</>}
      </section>}
    </main>
    {confirmLeave && <Modal title={confirmLeave === 'return' ? '¿Volver al espacio de pruebas?' : '¿Cerrar sesión?'} onClose={() => setConfirmLeave(null)}><p className="modal-description">Tienes cambios sin guardar en tu perfil.</p><div className="modal-actions"><button className="button button-outline" onClick={() => setConfirmLeave(null)}>Seguir editando</button><button className="button button-primary" onClick={() => { const target = confirmLeave; setConfirmLeave(null); if (target === 'return') onReturn?.(); else void logout(); }}>{confirmLeave === 'return' ? 'Volver sin guardar' : 'Cerrar sesión sin guardar'}</button></div></Modal>}
    {exit.requested && <Modal title="¿Estás seguro de salir?" onClose={exit.cancel}><p className="modal-description">{dirty ? 'Tienes cambios sin guardar en tu perfil.' : 'Se cerrará tu sesión en este dispositivo y volverás al inicio de sesión.'}</p>{exit.error && <p className="error-message" role="alert">{exit.error}</p>}<div className="modal-actions"><button className="button button-outline" disabled={exit.leaving} onClick={exit.cancel}>Seguir en la aplicación</button><button className="button button-primary" disabled={exit.leaving || !!busy} onClick={() => void exit.leave()}>{exit.leaving ? 'Cerrando sesión…' : 'Salir'}</button></div></Modal>}
  </div>;
}
