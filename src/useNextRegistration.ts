import { useEffect, useState } from 'react';
import { supabaseClient } from './supabase';
import { formatInspectionCode } from './inspection-code';

export type RegistrationPreview = { code: string | null; loading: boolean; unavailable: boolean };
/** This read never reserves a number or writes to the draft. */
export function useNextRegistration(actor: string | undefined, enabled: boolean): RegistrationPreview {
  const [state, setState] = useState<RegistrationPreview & { actor?: string }>({ actor, code: null, loading: true, unavailable: false });
  useEffect(() => {
    setState({ actor, code: null, loading: true, unavailable: false });
    if (!actor || !enabled) return;
    let active = true, running = false, failures = 0, nextAttempt = 0;
    const refresh = async (event?: Event) => {
      if (event?.type === 'online' || event?.type === 'berry-cloud-inspections-changed') nextAttempt = 0;
      if (!active || running || document.visibilityState === 'hidden' || Date.now() < nextAttempt) return;
      running = true;
      try {
        const client = supabaseClient(), { data: { session } } = await client.auth.getSession();
        if (session?.user.id !== actor) throw new Error('SESSION_CHANGED');
        const { data, error } = await client.rpc('berry_next_registration').abortSignal(AbortSignal.timeout(8000));
        if (error || !data || formatInspectionCode(data.year, data.sequence) !== data.code) throw new Error('CODE_UNAVAILABLE');
        failures = 0; nextAttempt = 0;
        if (active) setState({ actor, code: data.code, loading: false, unavailable: false });
      } catch {
        nextAttempt = Date.now() + Math.min(60000, 15000 * 2 ** failures); failures++;
        if (active) setState({ actor, code: null, loading: false, unavailable: true });
      } finally { running = false; }
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 5000);
    window.addEventListener('focus', refresh); window.addEventListener('online', refresh);
    window.addEventListener('berry-cloud-inspections-changed', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { active = false; window.clearInterval(interval); window.removeEventListener('focus', refresh); window.removeEventListener('online', refresh); window.removeEventListener('berry-cloud-inspections-changed', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [actor, enabled]);
  return state.actor === actor ? state : { code: null, loading: true, unavailable: false };
}
