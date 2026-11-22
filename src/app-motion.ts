import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

// Animate presentation only. Scrolling, focus, form state and navigation remain native.
const surfaces = [
  '.page-heading', '.organization-heading', '.cloud-account-card', '.admin-tabs',
  '.stepper', '.form-card', '.list-card', '.inspection-stat', '.context-card',
  '.registration-card', '.tip-card', '.organization-column', '.account-table-card',
  '.followup-context', '.followup-card', '.observation-card', '.review-observation',
  '.closing-entry', '.final-section', '.compliance-panel', '.dashboard-heading',
  '.dashboard-metric', '.dashboard-filters', '.dashboard-chart', '.dashboard-results',
  '.yo-intro', '.yo-library-hero', '.inspection-list-row', '.correction-review-message', '.safety-document-row', '.safety-upload-card', '.safety-library',
].join(',');
type Entrance = { tween?: gsap.core.Tween; trigger?: ScrollTrigger };

export function installAppMotion(root: HTMLElement, progress: HTMLElement) {
  gsap.registerPlugin(ScrollTrigger);
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  let dispose = () => {};
  const start = () => {
    dispose();
    if (preference.matches) return;

    const seen = new WeakSet<HTMLElement>();
    const entrances = new Map<HTMLElement, Entrance>();
    const pending = new Set<HTMLElement>();
    let frame = 0, refreshTimer = 0, disposed = false;
    root.dataset.motion = 'ready';

    const finish = (element: HTMLElement) => {
      const entrance = entrances.get(element);
      entrance?.trigger?.kill(); entrance?.tween?.kill();
      if (entrance) gsap.set(element, { clearProps: 'transform,opacity' });
      entrances.delete(element);
    };
    const reveal = (element: HTMLElement, delay = 0) => {
      if (!element.isConnected || element.contains(document.activeElement)) return;
      const entrance: Entrance = {};
      entrances.set(element, entrance);
      const movable = !element.matches('button') && !element.querySelector('button,input,textarea,select,a,[tabindex],canvas');
      entrance.tween = gsap.fromTo(element,
        { ...(movable ? { y: 14 } : {}), opacity: 0.45 },
        { ...(movable ? { y: 0 } : {}), opacity: 1, duration: element.matches('.form-card[data-motion-key]') ? .22 : .48, delay, ease: 'power2.out',
          overwrite: 'auto', onComplete: () => {
            gsap.set(element, { clearProps: 'transform,opacity' });
            entrances.delete(element);
          } });
    };
    const refresh = () => {
      clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => { if (!disposed) ScrollTrigger.refresh(); }, 120);
    };
    const flush = () => {
      frame = 0;
      for (const element of entrances.keys()) if (!root.contains(element)) finish(element);
      let stagger = 0;
      for (const element of pending) {
        if (!root.contains(element) || seen.has(element)) continue;
        seen.add(element);
        // Leave interactive overlays and nested scrolling lists to their own components.
        if (element.closest('[role="dialog"], [role="listbox"], .organization-node-list, .dashboard-table-scroll')) continue;
        let ancestor = element.parentElement, nested = false;
        while (ancestor && ancestor !== root) {
          if (entrances.has(ancestor)) { nested = true; break; }
          ancestor = ancestor.parentElement;
        }
        if (nested) continue;
        const bounds = element.getBoundingClientRect();
        if (!bounds.width || !bounds.height || bounds.bottom <= 0) continue;
        if (bounds.top < innerHeight * 0.96) reveal(element, Math.min(stagger++ * 0.045, 0.18));
        else {
          const entrance: Entrance = {};
          entrances.set(element, entrance);
          // Keep content visible while waiting. Keyboard jumps and failed animation cannot hide it.
          entrance.trigger = ScrollTrigger.create({ trigger: element, start: 'top 96%', once: true,
            onEnter: () => { entrance.trigger?.kill(); entrances.delete(element); reveal(element); } });
        }
      }
      pending.clear();
      refresh();
    };
    const collect = (element: HTMLElement) => {
      if (element.matches(surfaces)) pending.add(element);
      element.querySelectorAll<HTMLElement>(surfaces).forEach(child => pending.add(child));
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(flush); };
    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.target instanceof HTMLElement) {
          const element = mutation.target;
          finish(element); seen.delete(element); pending.add(element);
        } else mutation.addedNodes.forEach(child => { if (child instanceof HTMLElement) collect(child); });
      }
      // Text changes (typing, counts and autosave feedback) never restart entrances.
      if (pending.size || [...entrances.keys()].some(element => !root.contains(element))) schedule();
    });
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-motion-key'] });

    const focus = (event: Event) => {
      if (!(event.target instanceof Node)) return;
      for (const element of entrances.keys()) if (element.contains(event.target)) finish(element);
    };
    root.addEventListener('focusin', focus);
    root.addEventListener('pointerdown', focus, true);

    const setProgress = gsap.quickSetter(progress, 'scaleX');
    const scroll = ScrollTrigger.create({ start: 0, end: 'max',
      onUpdate: self => setProgress(self.progress), onRefresh: self => setProgress(self.progress) });
    const resize = new ResizeObserver(refresh);
    resize.observe(document.body);
    collect(root); schedule();

    dispose = () => {
      disposed = true;
      observer.disconnect(); resize.disconnect(); scroll.kill();
      cancelAnimationFrame(frame); clearTimeout(refreshTimer);
      root.removeEventListener('focusin', focus);
      root.removeEventListener('pointerdown', focus, true);
      for (const element of entrances.keys()) finish(element);
      gsap.set(progress, { clearProps: 'transform' });
      delete root.dataset.motion;
    };
  };
  start();
  preference.addEventListener('change', start);
  return () => { preference.removeEventListener('change', start); dispose(); };
}
