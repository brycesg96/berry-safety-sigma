import { lazy, Suspense, useState } from 'react';
import { LoadingState } from './LoadingState';
import App from './App';
import { CloudAccess } from './CloudAccess';
import { useExitConfirmation } from './useExitConfirmation';
import { supabaseClient } from './supabase';
const YoSeguroGuest = lazy(() => import('./YoSeguroGuest'));

export default function Application() {
  const allowLegacy = new URL(location.href).searchParams.get('modo') === 'prueba' || import.meta.env.DEV && import.meta.env.VITE_LEGACY_DEMO_START === 'true';
  const [accountSection, setAccountSection] = useState<'profile' | 'admin' | 'dashboard' | 'organization' | 'workspace'>(() => { const section = new URL(location.href).searchParams.get('seccion'); return section === 'usuarios' ? 'admin' : section === 'panel' ? 'dashboard' : section === 'areas' ? 'organization' : section === 'perfil' ? 'profile' : 'workspace'; });
  const [accountView, setAccountView] = useState(() => {
    const url = new URL(location.href);
    if (new URLSearchParams(url.hash.slice(1)).get('type') === 'recovery') {
      url.searchParams.set('acceso', 'cuenta'); url.searchParams.set('recuperar', '1');
      history.replaceState(history.state, '', url);
    }
    return !allowLegacy || url.searchParams.get('acceso') === 'cuenta' || url.searchParams.get('recuperar') === '1';
  });
  const [guestView, setGuestView] = useState(() => new URL(location.href).searchParams.get('acceso') === 'sin-cuenta' && !new URL(location.href).searchParams.has('recuperar'));
  const [authenticated, setAuthenticated] = useState(false);
  const [leaving, setLeaving] = useState(false), [exitError, setExitError] = useState('');
  const guard = useExitConfirmation(!guestView && (!accountView || authenticated));
  const navigate = (cloud: boolean, section: 'profile' | 'admin' | 'workspace' = 'profile') => {
    const url = new URL(location.href);
    if (cloud) url.searchParams.set('acceso', 'cuenta'); else url.searchParams.delete('acceso');
    if (cloud && section !== 'workspace') url.searchParams.set('seccion', section === 'admin' ? 'usuarios' : 'perfil'); else url.searchParams.delete('seccion');
    history.replaceState(history.state, '', url);
    setAccountView(cloud); setAccountSection(section);
    window.scrollTo({ top: 0 });
  };
  const showGuest = () => { const url = new URL(location.href); url.searchParams.set('acceso', 'sin-cuenta'); url.searchParams.delete('seccion'); url.searchParams.delete('recuperar'); url.hash = ''; history.replaceState(history.state, '', url); setGuestView(true); window.scrollTo({top:0}); };
  const leaveGuest = () => {setGuestView(false);navigate(true, 'workspace');};
  const leave = async () => {
    if (leaving) return;
    setLeaving(true); setExitError('');
    try {
      await guard.prepareLeave();
      const { error } = await supabaseClient().auth.signOut({ scope: 'local' });
      if (error) throw new Error('No pudimos cerrar la sesión. Revisa tu conexión y vuelve a intentarlo.');
      const url = new URL(location.href); url.searchParams.delete('recuperar'); url.searchParams.delete('modo'); url.hash = ''; history.replaceState(history.state, '', url);
      setAuthenticated(false); guard.cancel(); navigate(true, 'workspace');
    } catch (problem) { setExitError(problem instanceof Error ? problem.message : 'No pudimos cerrar la sesión. Vuelve a intentarlo.'); }
    finally { setLeaving(false); }
  };
  const exit = { ...guard, leave, leaving, error: exitError, request: () => { setExitError(''); guard.request(); } };
  if (guestView) return <Suspense fallback={<LoadingState label="Preparando Yo Seguro…"/>}><YoSeguroGuest onBack={leaveGuest}/></Suspense>;
  return accountView
    ? <CloudAccess onGuestAccess={showGuest} exit={exit} onSessionChange={setAuthenticated} onReturn={allowLegacy ? () => navigate(false) : undefined} initialSection={accountSection}/>
    : <App exit={exit} onCloudAccess={section => navigate(true, section)}/>;
}
