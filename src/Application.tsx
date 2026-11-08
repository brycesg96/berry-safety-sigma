import { useState } from 'react';
import App from './App';
import { CloudAccess } from './CloudAccess';
import { useExitConfirmation } from './useExitConfirmation';

export default function Application() {
  const exit = useExitConfirmation();
  const [accountSection, setAccountSection] = useState<'profile' | 'admin'>(() => new URL(location.href).searchParams.get('seccion') === 'usuarios' ? 'admin' : 'profile');
  const [accountView, setAccountView] = useState(() => {
    const url = new URL(location.href);
    if (new URLSearchParams(url.hash.slice(1)).get('type') === 'recovery') {
      url.searchParams.set('acceso', 'cuenta'); url.searchParams.set('recuperar', '1');
      history.replaceState(history.state, '', url);
    }
    return url.searchParams.get('acceso') === 'cuenta' || url.searchParams.get('recuperar') === '1';
  });
  const navigate = (cloud: boolean, section: 'profile' | 'admin' = 'profile') => {
    const url = new URL(location.href);
    if (cloud) url.searchParams.set('acceso', 'cuenta'); else url.searchParams.delete('acceso');
    if (cloud && section === 'admin') url.searchParams.set('seccion', 'usuarios'); else url.searchParams.delete('seccion');
    // Keep the single exit guard across both views. Opening the account portal
    // is internal navigation and never initializes or imports local records.
    history.replaceState(history.state, '', url);
    setAccountView(cloud);
    setAccountSection(section);
    window.scrollTo({ top: 0 });
  };
  return accountView
    ? <CloudAccess exit={exit} onReturn={() => navigate(false)} initialSection={accountSection}/>
    : <App exit={exit} onCloudAccess={section => navigate(true, section)}/>;
}
