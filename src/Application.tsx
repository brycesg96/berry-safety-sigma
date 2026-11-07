import { useState } from 'react';
import App from './App';
import { CloudAccess } from './CloudAccess';
import { useExitConfirmation } from './useExitConfirmation';

export default function Application() {
  const exit = useExitConfirmation();
  const [accountView, setAccountView] = useState(() => new URL(location.href).searchParams.get('acceso') === 'cuenta');
  const navigate = (cloud: boolean) => {
    const url = new URL(location.href);
    if (cloud) url.searchParams.set('acceso', 'cuenta'); else url.searchParams.delete('acceso');
    // Keep the single exit guard across both views. Opening the account portal
    // is internal navigation and never initializes or imports local records.
    history.replaceState(history.state, '', url);
    setAccountView(cloud);
    window.scrollTo({ top: 0 });
  };
  return accountView
    ? <CloudAccess exit={exit} onReturn={() => navigate(false)}/>
    : <App exit={exit} onCloudAccess={() => navigate(true)}/>;
}
