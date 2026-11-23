import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

// Adapted from the uploaded Teal Treasury reference. This module owns only
// decorative scene nodes; AppMotion owns page entrances and forms stay native.
export function installSafetySceneMotion(root: HTMLElement) {
  gsap.registerPlugin(ScrollTrigger);
  const media = gsap.matchMedia();
  media.add('(prefers-reduced-motion: no-preference) and (min-width: 851px)', () => {
    const frame = root.querySelector<HTMLElement>('.safety-scene-frame');
    const notes = root.querySelectorAll<HTMLElement>('.safety-scene-note');
    if (!frame) return;
    const context = gsap.context(() => {
      gsap.fromTo(frame, { y: 16, opacity: .5 }, { y: 0, opacity: 1, duration: .65, ease: 'power3.out', clearProps: 'opacity' });
      gsap.fromTo(notes, { opacity: .4 }, { opacity: 1, duration: .6, stagger: .09, ease: 'power2.out', clearProps: 'opacity' });
    }, root);
    const wide = gsap.matchMedia();
    wide.add('(min-width: 900px)', () => {
      gsap.fromTo(frame, { rotateX: 10, rotateY: -4, scale: .98 }, { rotateX: 0, rotateY: 0, scale: 1, ease: 'none', scrollTrigger: { trigger: root, start: 'top 90%', end: 'bottom 15%', scrub: .6 } });
      gsap.to(notes, { y: index => index ? -14 : 10, ease: 'none', scrollTrigger: { trigger: root, start: 'top 75%', end: 'bottom top', scrub: .5 } });
    });
    root.dataset.sceneMotion = 'ready';
    return () => { wide.revert(); context.revert(); delete root.dataset.sceneMotion; };
  });
  return () => media.revert();
}
