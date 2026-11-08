import { useState } from 'react';
import App from './App';
import { CloudAccess } from './CloudAccess';
import { useExitConfirmation } from './useExitConfirmation';
import { supabaseClient } from './supabase';

export default function Application() {
  const allowLegacy = new URL(location.href).searchParams.get('modo') === 'prueba' || import.meta.env.DEV && import.meta.env.VITE_LEGACY_DEMO_START === 'true';
  const [accountSection, setAccountSection] = useState<'profile' | 'admin'>(() => new URL(location.href).searchParams.get('seccion') === 'usuarios' ? 'admin' : 'profile');
  const [accountView, setAccountView] = useState(() => {
    const url = new URL(location.href);
    if (new URLSearchParams(url.hash.slice(1)).get('type') === 'recovery') {
      url.searchParams.set('acceso', 'cuenta'); url.searchParams.set('recuperar', '1');
      history.replaceState(history.state, '', url);
    }
    return !allowLegacy || url.searchParams.get('acceso') === 'cuenta' || url.searchParams.get('recuperar') === '1';
  });
  const [authenticated, setAuthenticated] = useState(false);
  const [leaving, setLeaving] = useState(false), [exitError, setExitError] = useState('');
  const guard = useExitConfirmation(!accountView || authenticated);
  const navigate = (cloud: boolean, section: 'profile' | 'admin' = 'profile') => {
    const url = new URL(location.href);
    if (cloud) url.searchParams.set('acceso', 'cuenta'); else url.searchParams.delete('acceso');
    if (cloud && section === 'admin') url.searchParams.set('seccion', 'usuarios'); else url.searchParams.delete('seccion');
    history.replaceState(history.state, '', url);
    setAccountView(cloud); setAccountSection(section);
    window.scrollTo({ top: 0 });
  };
  const leave = async () => {
    if (leaving) return;
    setLeaving(true); setExitError('');
    try {
      await guard.prepareLeave();
      const { error } = await supabaseClient().auth.signOut({ scope: 'local' });
      if (error) throw new Error('No pudimos cerrar la sesión. Revisa tu conexión y vuelve a intentarlo.');
      guard.cancel(); navigate(true);
    } catch (problem) { setExitError(problem instanceof Error ? problem.message : 'No pudimos cerrar la sesión. Vuelve a intentarlo.'); }
    finally { setLeaving(false); }
  };
  const exit = accountView ? { ...guard, leave, leaving, error: exitError, request: () => { setExitError(''); guard.request(); } } : guard;
  return accountView
    ? <CloudAccess exit={exit} onSessionChange={setAuthenticated} onReturn={allowLegacy ? () => navigate(false) : undefined} initialSection={accountSection}/>
    : <App exit={exit} onCloudAccess={section => navigate(true, section)}/>;
}
