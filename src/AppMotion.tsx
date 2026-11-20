import { useEffect, useRef } from 'react';
import './app-motion.css';

export function AppMotion() {
  const progress = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let cancelled = false, dispose: (() => void) | undefined;
    // Load after the initial render; all screens remain usable without the animation bundle.
    void import('./app-motion').then(({ installAppMotion }) => {
      const root = document.getElementById('root');
      if (!cancelled && root && progress.current) dispose = installAppMotion(root, progress.current);
    }).catch(() => {});
    return () => { cancelled = true; dispose?.(); };
  }, []);
  return <div className="app-scroll-progress" aria-hidden="true"><span ref={progress}/></div>;
}
