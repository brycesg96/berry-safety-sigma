import { useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ArrowLeft, Check, Eye, EyeOff, LoaderCircle, LockKeyhole, LogOut, ShieldCheck } from 'lucide-react';
import { Brand, Field, LockedEmailField, Modal } from './components';
import { changeCloudPassword, loadCloudProfile, saveCloudProfile } from './cloud-account';
import type { CloudProfile } from './cloud-account';
import { supabaseClient } from './supabase';
import type { ExitConfirmation } from './useExitConfirmation';
import './cloud-account.css';
import { CloudAdministration } from './CloudAdministration';
import { newPasswordError } from '../shared/account-rules.mjs';
import { CloudWorkspace } from './CloudWorkspace';
import { supabaseFoundationStatus } from './supabase';

type ProfileForm = { full_name: string; area: string; job_title: string };
const blank = (): ProfileForm => ({ full_name: '', area: '', job_title: '' });
const fieldsOf = (profile: CloudProfile): ProfileForm => ({ full_name: profile.full_name, area: profile.area, job_title: profile.job_title });

export function CloudAccess({ exit, onReturn }: { exit: ExitConfirmation; onReturn: () => void }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<CloudProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [retry, setRetry] = useState(0);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [form, setForm] = useState<ProfileForm>(blank);
  const [formError, setFormError] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState<'login' | 'save' | 'logout' | 'password' | null>(null);
  const [section, setSection] = useState<'profile' | 'admin' | 'workspace'>('profile');
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [loginNotice, setLoginNotice] = useState('');
  const [confirmLeave, setConfirmLeave] = useState<'return' | 'logout' | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const generation = useRef(0);
  const userId = session?.user.id;
  const ownProfile = profile?.id === userId ? profile : null;
  const dirty = !!ownProfile && JSON.stringify(form) !== JSON.stringify(fieldsOf(ownProfile));
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    document.title = 'Tu cuenta · Berry Safety';
    return () => { document.title = 'Berry Safety · Espacio de trabajo'; };
  }, []);

  useEffect(() => {
    let active = true;
    let authEvent = false;
    const accept = (next: Session | null) => {
      if (!active) return;
      if (next?.user.id !== sessionRef.current?.user.id) {
        generation.current++;
        setProfile(null); setProfileError(''); setForm(blank()); setFormError(''); setSaved(false); setPassword('');
        setShowPassword(false);
        setNewPassword(''); setRepeatPassword(''); setPasswordError(''); setSection('profile');
        if (!next) setEmail('');
      }
      sessionRef.current = next;
      setSession(next); setReady(true);
    };
    // Keep Auth callbacks synchronous: querying from them can block the SDK's
    // session lock. Profile requests run in the separate effect below.
    const { data: { subscription } } = supabaseClient().auth.onAuthStateChange((_event, next) => { authEvent = true; accept(next); });
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
      setProfile(next); setForm(fieldsOf(next)); setFormError('');
    }).catch(error => {
      if (active && generation.current === requestGeneration) setProfileError(error instanceof Error ? error.message : 'No pudimos consultar tu perfil.');
    }).finally(() => { if (active) setProfileLoading(false); });
    return () => { active = false; };
  }, [userId, retry]);

  useEffect(() => { if (ready) heading.current?.focus({ preventScroll: true }); }, [ready, userId, ownProfile?.enabled]);
  useEffect(() => {
    let active = true;
    if (!ownProfile?.enabled || ownProfile.must_change_password) { setWorkspaceReady(false); return; }
    void supabaseFoundationStatus().then(status => { if (active) setWorkspaceReady(status.sync_ready); }).catch(() => { if (active) setWorkspaceReady(false); });
    return () => { active = false; };
  }, [ownProfile?.id, ownProfile?.enabled, ownProfile?.must_change_password]);

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
    } catch (error) { setLoginError(error instanceof Error ? error.message : 'No pudimos iniciar sesión.'); }
    finally { setPassword(''); setBusy(null); }
  };
  const save = async () => {
    if (!userId || !ownProfile?.enabled || busy) return;
    const requestGeneration = generation.current;
    setBusy('save'); setFormError(''); setSaved(false);
    try {
      const next = await saveCloudProfile(userId, form, () => generation.current === requestGeneration && sessionRef.current?.user.id === userId);
      if (generation.current === requestGeneration) { setProfile(next); setForm(fieldsOf(next)); setSaved(true); }
    } catch (error) { if (generation.current === requestGeneration) setFormError(error instanceof Error ? error.message : 'No se guardó el perfil.'); }
    finally { setBusy(null); }
  };
  const logout = async () => {
    if (busy) return;
    setBusy('logout'); setFormError(''); setProfileError('');
    try {
      const { error } = await supabaseClient().auth.signOut({ scope: 'local' });
      if (error) throw error;
      setEmail('');
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
      await changeCloudPassword(newPassword);
      if (generation.current !== requestGeneration) return;
      setNewPassword(''); setRepeatPassword('');
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

  const showAdmin = !!ownProfile?.enabled && !ownProfile.must_change_password && ownProfile.role === 'admin' && section === 'admin';
  if (section === 'workspace' && ownProfile?.enabled && !ownProfile.must_change_password) return <CloudWorkspace profile={ownProfile} exit={exit} onAccount={target => { setSection(target || 'profile'); setRetry(value => value + 1); }}/>;
  return <div className="cloud-account-page" spellCheck={false}>
    <header className="cloud-account-header"><Brand/>{!ownProfile?.must_change_password && <button type="button" className="cloud-return" disabled={!!busy} onClick={() => dirty ? setConfirmLeave('return') : onReturn()}><ArrowLeft size={17}/>Espacio de pruebas</button>}</header>
    <main className={`cloud-account-main ${showAdmin ? 'cloud-account-admin-main' : ''}`}>
      {ownProfile?.enabled && !ownProfile.must_change_password && ownProfile.role === 'admin' && <nav className="admin-tabs" aria-label="Cuenta y administración"><button type="button" aria-current={section === 'profile' ? 'page' : undefined} disabled={!!busy} onClick={() => setSection('profile')}>Tu perfil</button><button type="button" aria-current={section === 'admin' ? 'page' : undefined} disabled={!!busy || dirty} onClick={() => setSection('admin')}>Administración</button></nav>}
      {showAdmin ? <><CloudAdministration key={ownProfile!.id} actor={ownProfile!} isCurrent={() => sessionRef.current?.user.id === ownProfile!.id}/><button type="button" className="cloud-logout" disabled={!!busy} onClick={() => void logout()}><LogOut size={17}/>Cerrar sesión en este dispositivo</button>{formError && <p role="alert" className="error-message cloud-message">{formError}</p>}</> : <section className="cloud-account-card" aria-busy={!ready || profileLoading || !!busy}>
        <div className="cloud-account-icon"><ShieldCheck size={27}/></div>
        {!ready ? <><h1 ref={heading} tabIndex={-1}>Tu cuenta</h1><p className="cloud-loading" role="status"><LoaderCircle size={18} className="spin"/>Comprobando tu sesión…</p></> : !session ? <>
          <div className="eyebrow">TU ESPACIO DE SEGURIDAD</div>
          <h1 ref={heading} tabIndex={-1}>Inicia sesión</h1>
          <p className="cloud-account-intro">Accede con tu cuenta de Berry Safety.</p>
          <form onSubmit={event => { event.preventDefault(); void login(); }}>
            <Field label="Correo electrónico" required>{props => <input {...props} type="email" autoComplete="username" autoCapitalize="none" required maxLength={254} value={email} disabled={!!busy} onChange={event => { setEmail(event.target.value); setLoginError(''); }}/>}</Field>
            <Field label="Contraseña" required>{props => <div className="cloud-password"><input {...props} type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={password} disabled={!!busy} onChange={event => { setPassword(event.target.value); setLoginError(''); }}/><button type="button" className="icon-button" aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div>}</Field>
            {loginError && <p role="alert" className="error-message cloud-message">{loginError}</p>}
            {loginNotice && <p role="status" className="cloud-saved">{loginNotice}</p>}
            <button type="submit" className="button button-primary full-width" disabled={!!busy}>{busy === 'login' ? <LoaderCircle className="spin" size={17}/> : <LockKeyhole size={17}/>} {busy === 'login' ? 'Iniciando sesión…' : 'Iniciar sesión'}</button>
          </form>
          <p className="cloud-account-hint">Utiliza el correo y la contraseña de tu cuenta habilitada.</p>
        </> : profileLoading || !ownProfile && !profileError ? <>
          <h1 ref={heading} tabIndex={-1}>Tu cuenta</h1><p className="cloud-loading" role="status"><LoaderCircle size={18} className="spin"/>Consultando tu perfil…</p>
        </> : ownProfile && !ownProfile.enabled ? <>
          <h1 ref={heading} tabIndex={-1}>Cuenta pendiente de habilitación</h1>
          <p className="cloud-account-intro">Tu identidad está verificada. El administrador debe habilitar tu acceso antes de continuar.</p>
          <p className="cloud-account-email">{ownProfile.email}</p>
          <button type="button" className="button button-primary full-width" disabled={!!busy} onClick={() => setRetry(value => value + 1)}>Comprobar acceso</button>
        </> : ownProfile?.must_change_password ? <>
          <h1 ref={heading} tabIndex={-1}>Actualiza tu contraseña</h1>
          <p className="cloud-account-intro">Estás usando una contraseña temporal. Crea una contraseña personal para continuar.</p>
          <p className="cloud-account-email">{ownProfile.email}</p>
          <form onSubmit={event => { event.preventDefault(); void updatePassword(); }}>
            <Field label="Nueva contraseña" required hint="Al menos 10 caracteres, distinta de la temporal.">{props => <div className="cloud-password"><input {...props} required type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={10} value={newPassword} disabled={!!busy} onChange={event => { setNewPassword(event.target.value); setPasswordError(''); }}/><button type="button" className="icon-button" aria-label={showPassword ? 'Ocultar nueva contraseña' : 'Mostrar nueva contraseña'} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div>}</Field>
            <Field label="Repite la nueva contraseña" required>{props => <input {...props} required type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={10} value={repeatPassword} disabled={!!busy} onChange={event => { setRepeatPassword(event.target.value); setPasswordError(''); }}/>}</Field>
            {passwordError && <p role="alert" className="error-message cloud-message">{passwordError}</p>}
            <button type="submit" className="button button-primary full-width" disabled={!!busy}>{busy === 'password' ? <LoaderCircle size={17} className="spin"/> : <LockKeyhole size={17}/>} {busy === 'password' ? 'Actualizando…' : 'Actualizar contraseña'}</button>
          </form>
        </> : ownProfile ? <>
          <div className="cloud-profile-heading"><h1 ref={heading} tabIndex={-1}>Tu perfil</h1><span className="account-enabled">{ownProfile.role === 'admin' ? 'Administración' : 'Inspecciones'}</span></div>
          <p className="cloud-account-intro">Estos datos identificarán tu participación en las inspecciones.</p>
          <form onSubmit={event => { event.preventDefault(); void save(); }}>
            <LockedEmailField label="Correo de tu cuenta" value={ownProfile.email}/>
            <Field label="Nombres y apellidos" required>{props => <input {...props} autoComplete="name" required maxLength={250} disabled={!!busy} value={form.full_name} onChange={event => changeField('full_name', event.target.value)}/>}</Field>
            <Field label="Área" required>{props => <input {...props} required maxLength={250} disabled={!!busy} value={form.area} onChange={event => changeField('area', event.target.value)}/>}</Field>
            <Field label="Cargo">{props => <input {...props} autoComplete="organization-title" maxLength={250} disabled={!!busy} value={form.job_title} onChange={event => changeField('job_title', event.target.value)}/>}</Field>
            {formError && <p role="alert" className="error-message cloud-message">{formError}</p>}
            {saved && <p role="status" className="cloud-saved"><Check size={16}/>Perfil guardado en tu cuenta.</p>}
            <button type="submit" className="button button-primary full-width" disabled={!!busy || !dirty}>{busy === 'save' ? <LoaderCircle className="spin" size={17}/> : <Check size={17}/>} {busy === 'save' ? 'Guardando…' : 'Guardar perfil'}</button>
          </form>
          {workspaceReady && <button type="button" className="button button-outline full-width cloud-enter-workspace" disabled={!!busy || dirty || !form.full_name.trim() || !form.area.trim()} onClick={() => setSection('workspace')}>Entrar al espacio de trabajo</button>}
        </> : <>
          <h1 ref={heading} tabIndex={-1}>No pudimos abrir tu perfil</h1>
          <p role="alert" className="error-message cloud-message">{profileError}</p>
          <button type="button" className="button button-primary full-width" disabled={!!busy} onClick={() => setRetry(value => value + 1)}>Reintentar</button>
        </>}
        {session && <><button type="button" className="cloud-logout" disabled={!!busy} onClick={() => dirty ? setConfirmLeave('logout') : void logout()}>{busy === 'logout' ? <LoaderCircle className="spin" size={17}/> : <LogOut size={17}/>}Cerrar sesión en este dispositivo</button>{formError && !ownProfile?.enabled && <p role="alert" className="error-message cloud-message">{formError}</p>}</>}
      </section>}
      <p className="cloud-stage-note">{workspaceReady ? 'Las nuevas inspecciones se guardan en tu cuenta. Los registros anteriores del espacio de pruebas se conservan en el navegador donde se crearon.' : 'El acceso y el perfil ya se guardan en tu cuenta. Las inspecciones siguen en el espacio de pruebas mientras completamos su conexión.'}</p>
    </main>
    {confirmLeave && <Modal title={confirmLeave === 'return' ? '¿Volver al espacio de pruebas?' : '¿Cerrar sesión?'} onClose={() => setConfirmLeave(null)}><p className="modal-description">Tienes cambios sin guardar en tu perfil.</p><div className="modal-actions"><button className="button button-outline" onClick={() => setConfirmLeave(null)}>Seguir editando</button><button className="button button-primary" onClick={() => { const target = confirmLeave; setConfirmLeave(null); if (target === 'return') onReturn(); else void logout(); }}>{confirmLeave === 'return' ? 'Volver sin guardar' : 'Cerrar sesión sin guardar'}</button></div></Modal>}
    {exit.requested && <Modal title="¿Estás seguro de salir?" onClose={exit.cancel}><p className="modal-description">{dirty ? 'Tienes cambios sin guardar en tu perfil.' : 'Puedes seguir en la aplicación o salir de la página.'}</p><div className="modal-actions"><button className="button button-outline" onClick={exit.cancel}>Seguir en la aplicación</button><button className="button button-primary" onClick={exit.leave}>Salir</button></div></Modal>}
  </div>;
}
