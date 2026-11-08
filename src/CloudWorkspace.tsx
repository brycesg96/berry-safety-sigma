import { useEffect, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import App from './App';
import type { CloudProfile } from './cloud-account';
import type { DemoAccount } from './accounts';
import { supabaseClient } from './supabase';
import { clearCloudRuntime } from './cloud-store';
import type { ExitConfirmation } from './useExitConfirmation';
import { Modal } from './components';

export function CloudWorkspace({ profile, exit, onAccount }: { profile: CloudProfile; exit: ExitConfirmation; onAccount: (section?: 'profile' | 'admin') => void }) {
  const [accounts, setAccounts] = useState<DemoAccount[] | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const { data, error } = await supabaseClient().from('berry_profiles').select('*').eq('enabled', true);
      if (!active) return;
      if (error || !data?.some(row => row.id === profile.id)) { setError('No pudimos abrir tu espacio de trabajo. Revisa tu conexión y tu acceso.'); return; }
      setAccounts(data.map(row => ({ id: row.id, email: row.email, name: row.full_name || row.email, area: row.area, jobTitle: row.job_title, role: row.role, enabled: row.enabled, supervisorEmails: row.supervisor_emails || [], canCreateInspections: row.can_create_inspections, canReceiveInspections: row.can_receive_inspections })));
      setError('');
    };
    void refresh();
    window.addEventListener('focus', refresh);
    return () => { active = false; window.removeEventListener('focus', refresh); clearCloudRuntime(); };
  }, [profile.id, retry]);
  if (error || !accounts) return <div className="cloud-account-page"><main className="cloud-account-main">{error ? <><h1>Tu espacio de trabajo</h1><p className="error-message cloud-message" role="alert">{error}</p><button type="button" className="button button-primary" onClick={() => setRetry(value => value + 1)}>Reintentar</button><button type="button" className="button button-outline" onClick={() => onAccount('profile')}>Volver a tu cuenta</button></> : <p className="cloud-loading" role="status"><LoaderCircle size={18} className="spin"/>Abriendo tus inspecciones…</p>}</main>{exit.requested && <Modal title="¿Estás seguro de salir?" onClose={exit.cancel}><p className="modal-description">Se cerrará tu sesión en este dispositivo y volverás al inicio de sesión.</p><p className="error-message" role="alert">{exit.error}</p><div className="modal-actions"><button className="button button-outline" disabled={exit.leaving} onClick={exit.cancel}>Seguir en la aplicación</button><button className="button button-primary" disabled={exit.leaving} onClick={() => void exit.leave()}>{exit.leaving ? 'Cerrando sesión…' : 'Salir'}</button></div></Modal>}</div>;
  return <App key={profile.id} exit={exit} onCloudAccess={onAccount} cloud={{ actorId: profile.id, accounts }}/>;
}
