import { useCallback, useEffect, useRef, useState } from 'react';

const KEY = 'berryExitGuard';
type Marker = { id: string; position: 'base' | 'guard'; hasPrevious: boolean };
function marker(state: unknown): Marker | undefined {
  if (!state || typeof state !== 'object') return;
  const value = (state as Record<string, Marker>)[KEY];
  if (value && typeof value.id === 'string' && typeof value.hasPrevious === 'boolean' && ['base', 'guard'].includes(value.position)) return value;
}

export function useExitConfirmation(enabled = true) {
  const [requested, setRequested] = useState(false);
  const currentUrl = useRef(location.href);
  const beforeLeave = useRef<(() => Promise<void>) | undefined>(undefined);
  const setBeforeLeave = useCallback((handler: () => Promise<void>) => {
    beforeLeave.current = handler;
    return () => { if (beforeLeave.current === handler) beforeLeave.current = undefined; };
  }, []);
  currentUrl.current = location.href;

  useEffect(() => {
    if (!enabled) { setRequested(false); return; }
    const originalScrollRestoration = history.scrollRestoration;
    history.scrollRestoration = 'manual';
    const previous = marker(history.state);
    const base: Marker = previous ? { ...previous, position: 'base' } : { id: crypto.randomUUID(), position: 'base', hasPrevious: history.length > 1 };
    const guard: Marker = { ...base, position: 'guard' };
    const state = history.state && typeof history.state === 'object' ? history.state : {};
    // Reuse our pair after reloads, StrictMode and return visits. Cancelling
    // Back replaces the forward guard rather than growing the history stack.
    if (previous?.position !== 'guard') {
      history.replaceState({ ...state, [KEY]: base }, '');
      history.pushState({ ...state, [KEY]: guard }, '');
    }
    const back = (event: PopStateEvent) => {
      const destination = marker(event.state);
      if (destination?.id !== base.id || destination.position !== 'base') return;
      history.pushState({ ...event.state, [KEY]: guard }, '', currentUrl.current);
      setRequested(true);
    };
    const unload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    const show = () => {
      setRequested(false);
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
  }, [enabled]);

  return {
    requested,
    request: () => setRequested(true),
    cancel: () => setRequested(false),
    setBeforeLeave,
    prepareLeave: async () => { await beforeLeave.current?.(); },
  };
}

export type ExitConfirmation = ReturnType<typeof useExitConfirmation> & { leave: () => void | Promise<void>; leaving?: boolean; error?: string };
