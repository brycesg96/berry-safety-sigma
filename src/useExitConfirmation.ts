import { useEffect, useRef, useState } from 'react';

const KEY = 'berryExitGuard';
type Marker = { id: string; position: 'base' | 'guard'; hasPrevious: boolean };
function marker(state: unknown): Marker | undefined {
  if (!state || typeof state !== 'object') return;
  const value = (state as Record<string, Marker>)[KEY];
  if (value && typeof value.id === 'string' && typeof value.hasPrevious === 'boolean' && ['base', 'guard'].includes(value.position)) return value;
}

export function useExitConfirmation() {
  const [requested, setRequested] = useState(false);
  const allowLeave = useRef(false);
  const current = useRef<Marker | undefined>(undefined);
  const currentUrl = useRef(location.href);
  currentUrl.current = location.href;

  useEffect(() => {
    const originalScrollRestoration = history.scrollRestoration;
    history.scrollRestoration = 'manual';
    const previous = marker(history.state);
    const base: Marker = previous ? { ...previous, position: 'base' } : { id: crypto.randomUUID(), position: 'base', hasPrevious: history.length > 1 };
    const guard: Marker = { ...base, position: 'guard' };
    current.current = guard;
    const state = history.state && typeof history.state === 'object' ? history.state : {};
    // Reuse our pair after reloads, StrictMode and return visits. Cancelling
    // Back replaces the forward guard rather than growing the history stack.
    if (previous?.position !== 'guard') {
      history.replaceState({ ...state, [KEY]: base }, '');
      history.pushState({ ...state, [KEY]: guard }, '');
    }
    const back = (event: PopStateEvent) => {
      const destination = marker(event.state);
      if (allowLeave.current || destination?.id !== base.id || destination.position !== 'base') return;
      history.pushState({ ...event.state, [KEY]: guard }, '', currentUrl.current);
      setRequested(true);
    };
    const unload = (event: BeforeUnloadEvent) => {
      if (allowLeave.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    const show = () => {
      allowLeave.current = false; setRequested(false);
      history.scrollRestoration = 'manual';
      const restored = marker(history.state);
      if (restored?.id === base.id && restored.position === 'base') history.pushState({ ...history.state, [KEY]: guard }, '');
    };
    window.addEventListener('popstate', back);
    window.addEventListener('beforeunload', unload);
    window.addEventListener('pageshow', show);
    return () => {
      window.removeEventListener('popstate', back);
      window.removeEventListener('beforeunload', unload);
      window.removeEventListener('pageshow', show);
      history.scrollRestoration = originalScrollRestoration;
    };
  }, []);

  return {
    requested,
    cancel: () => setRequested(false),
    leave: () => {
      allowLeave.current = true;
      setRequested(false);
      history.scrollRestoration = 'auto';
      if (current.current?.hasPrevious) history.go(-2);
      else location.assign('about:blank');
    },
  };
}

export type ExitConfirmation = ReturnType<typeof useExitConfirmation>;
