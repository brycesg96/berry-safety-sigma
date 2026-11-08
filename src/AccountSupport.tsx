import { useEffect, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { cloudAccountAdministrators } from './cloud-account';
import type { AccountAdministrator } from './cloud-account';

export function AccountSupport({ accountId }: { accountId: string }) {
  const [people, setPeople] = useState<AccountAdministrator[]>([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true, running = false;
    const refresh = async () => {
      if (running) return;
      running = true; setLoading(true); setError(''); setPeople([]);
      try { const next = await cloudAccountAdministrators(); if (active) setPeople(next); }
      catch (problem) { if (active) setError(problem instanceof Error ? problem.message : 'No pudimos consultar los contactos. Vuelve a intentarlo.'); }
      finally { running = false; if (active) setLoading(false); }
    };
    void refresh(); window.addEventListener('focus', refresh);
    return () => { active = false; window.removeEventListener('focus', refresh); };
  }, [accountId, retry]);
  return <section className="account-support" aria-label="Administradores de contacto">
    <h2>Contacta a un administrador</h2>
    {loading ? <p className="cloud-loading" role="status"><LoaderCircle className="spin" size={16}/>Consultando administradores…</p> : error ? <><p className="error-message cloud-message" role="alert">{error}</p><button type="button" className="text-button" onClick={() => setRetry(value => value + 1)}>Reintentar contactos</button></> : people.length ? <ul>{people.map(person => <li key={person.id}><strong>{person.full_name || 'Administrador'}</strong><a href={`mailto:${encodeURIComponent(person.email)}`}>{person.email}</a></li>)}</ul> : <p className="cloud-account-hint">No hay administradores disponibles para contacto. Vuelve a intentarlo más tarde.</p>}
  </section>;
}
