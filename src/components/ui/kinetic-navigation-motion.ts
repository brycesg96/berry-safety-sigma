import { gsap } from 'gsap';
import { CustomEase } from 'gsap/CustomEase';

type State = { open: boolean; mobile: boolean };
export type KineticNavigationController = { update: (state: State, animate: boolean) => void; dispose: () => void };

export function installKineticNavigation(sidebar: HTMLElement, layers: HTMLElement): KineticNavigationController {
  gsap.registerPlugin(CustomEase);
  const ease = CustomEase.create('berry-navigation', '0.65,0.01,0.05,0.99');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const panels = Array.from(layers.children);
  const shapes = Array.from(sidebar.querySelectorAll<SVGElement>('[data-kinetic-shape]'));
  const closeIcon = sidebar.querySelector('.mobile-close svg');
  let state: State = { open: false, mobile: false };
  let transition: gsap.core.Timeline | undefined, shapeTween: gsap.core.Tween | undefined;
  let selectedShape = -1;
  const labels = () => Array.from(sidebar.querySelectorAll('.kinetic-link-label>span'));
  const setPhase = (phase: string) => { sidebar.dataset.phase = phase; layers.dataset.phase = phase; };
  const showShape = (button: Element | null) => {
    if (!button || !sidebar.contains(button)) return;
    const index = Array.from(sidebar.querySelectorAll('.sidebar-nav>button')).indexOf(button);
    if (index < 0 || selectedShape === index) return;
    selectedShape = index;
    shapeTween?.kill();
    shapes.forEach((shape, i) => { shape.dataset.active = String(i === index); });
    const elements = shapes[index]?.children;
    if (!elements?.length || reduce.matches) return;
    shapeTween = gsap.fromTo(Array.from(elements), { scale: .7, rotation: -8, opacity: 0, transformOrigin: '50% 50%' },
      { scale: 1, rotation: 0, opacity: 1, duration: .48, stagger: .045, ease: 'power2.out', overwrite: 'auto' });
  };
  const activeShape = () => showShape(sidebar.querySelector('.sidebar-nav>button.active'));
  const enter = (event: Event) => { if (event.target instanceof Element) showShape(event.target.closest('.sidebar-nav>button')); };
  const leave = (event: Event) => {
    const next = (event as FocusEvent).relatedTarget;
    if (!(next instanceof Element) || !next.closest('.sidebar-nav>button')) activeShape();
  };
  const update = (next: State, animate: boolean) => {
    state = next; transition?.kill();
    sidebar.dataset.kinetic = 'ready';
    const text = labels();
    if (!next.mobile) {
      setPhase('desktop');
      gsap.set([sidebar, ...text, closeIcon].filter(Boolean), { clearProps: 'transform,opacity,visibility' });
      gsap.set(panels, { xPercent: -101 }); activeShape(); return;
    }
    if (!animate || reduce.matches) {
      setPhase(next.open ? 'open' : 'closed');
      gsap.set(sidebar, { x: 0, xPercent: next.open ? 0 : -100 });
      gsap.set(text, { clearProps: 'transform,opacity' });
      gsap.set(panels, { xPercent: -101 });
      gsap.set(closeIcon, { clearProps: 'transform' }); activeShape(); return;
    }
    if (next.open) {
      setPhase('opening');
      transition = gsap.timeline({ onComplete: () => { setPhase('open'); gsap.set(text, { clearProps: 'transform,opacity' }); } });
      transition.fromTo(panels, { xPercent: -101 }, { xPercent: 0, duration: .42, stagger: .055, ease })
        .fromTo(sidebar, { x: 0, xPercent: -100 }, { xPercent: 0, duration: .48, ease }, .1)
        .fromTo(text, { yPercent: 110, opacity: .3 }, { yPercent: 0, opacity: 1, duration: .36, stagger: .045, ease: 'power2.out' }, .27)
        .fromTo(closeIcon, { rotation: -90 }, { rotation: 0, duration: .45, ease: 'power2.out' }, .22);
    } else {
      setPhase('closing');
      transition = gsap.timeline({ onComplete: () => {
        setPhase('closed'); gsap.set(text, { clearProps: 'transform,opacity' });
      } });
      transition.to(sidebar, { x: 0, xPercent: -100, duration: .3, ease })
        .to(panels, { xPercent: -101, duration: .3, stagger: -.035, ease }, 0);
    }
    activeShape();
  };
  const preference = () => {
    shapeTween?.kill();
    shapes.forEach(shape => gsap.set(Array.from(shape.children), { clearProps: 'transform,opacity' }));
    update(state, false);
  };
  sidebar.addEventListener('pointerover', enter, { passive: true }); sidebar.addEventListener('pointerout', leave, { passive: true });
  sidebar.addEventListener('focusin', enter); sidebar.addEventListener('focusout', leave);
  reduce.addEventListener('change', preference);
  return { update, dispose: () => {
    transition?.kill(); shapeTween?.kill();
    sidebar.removeEventListener('pointerover', enter); sidebar.removeEventListener('pointerout', leave);
    sidebar.removeEventListener('focusin', enter); sidebar.removeEventListener('focusout', leave);
    reduce.removeEventListener('change', preference);
    gsap.set([sidebar, ...panels, ...labels(), closeIcon, ...shapes.flatMap(shape => Array.from(shape.children))].filter(Boolean), { clearProps: 'transform,opacity,visibility' });
    delete sidebar.dataset.kinetic;
  } };
}
