import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type { KineticNavigationController } from './kinetic-navigation-motion';
import './kinetic-navigation.css';

// Adaptation of the supplied Sterling Gate navigation: existing Berry Safety
// actions, permissions and focus management remain owned by the workspace.
export const KineticSidebar = forwardRef<HTMLElement, { open: boolean; mobile: boolean; onClose: () => void; children: ReactNode }>(function KineticSidebar({ open, mobile, onClose, children }, ref) {
  const sidebar = useRef<HTMLElement>(null), layers = useRef<HTMLDivElement>(null);
  const controller = useRef<KineticNavigationController | null>(null);
  const current = useRef({ open, mobile }); current.current = { open, mobile };
  useImperativeHandle(ref, () => sidebar.current!, []);
  useEffect(() => {
    let cancelled = false;
    void import('./kinetic-navigation-motion').then(({ installKineticNavigation }) => {
      if (cancelled || !sidebar.current || !layers.current) return;
      controller.current = installKineticNavigation(sidebar.current, layers.current);
      controller.current.update(current.current, false);
    }).catch(() => {}); // The existing CSS drawer works when animation cannot load.
    return () => { cancelled = true; controller.current?.dispose(); controller.current = null; };
  }, []);
  useLayoutEffect(() => { controller.current?.update({ open, mobile }, true); }, [open, mobile]);
  const phase = mobile ? open ? 'open' : 'closed' : 'desktop';
  return <>
    <div className="sidebar-scrim kinetic-scrim" data-open={mobile && open} aria-hidden="true" onClick={onClose}/>
    <div ref={layers} className="kinetic-menu-layers" data-phase={phase} aria-hidden="true"><span/><span/><span/></div>
    <aside ref={sidebar} id="berry-workspace-navigation" className={`sidebar kinetic-sidebar ${open ? 'sidebar-open' : ''}`} data-phase={phase} aria-label="Menú principal" role={mobile && open ? 'dialog' : undefined} aria-modal={mobile && open ? true : undefined} aria-hidden={mobile && !open ? true : undefined} inert={mobile && !open ? true : undefined}>
      <div className="kinetic-ambient" aria-hidden="true">
        <svg viewBox="0 0 400 400" data-kinetic-shape="0"><circle cx="90" cy="110" r="44"/><circle cx="300" cy="95" r="64"/><circle cx="200" cy="300" r="85"/></svg>
        <svg viewBox="0 0 400 400" data-kinetic-shape="1"><path d="M-20 150 Q90 55 200 150 T420 150"/><path d="M-20 260 Q90 165 200 260 T420 260"/></svg>
        <svg viewBox="0 0 400 400" data-kinetic-shape="2">{[80, 200, 320].flatMap(x => [85, 205, 325].map(y => <circle key={`${x}-${y}`} cx={x} cy={y} r="13"/>))}</svg>
        <svg viewBox="0 0 400 400" data-kinetic-shape="3"><path d="M-20 100 300 420"/><path d="M100-20 420 300"/><path d="M240-20 420 160"/></svg>
      </div>
      {children}
    </aside>
  </>;
});
