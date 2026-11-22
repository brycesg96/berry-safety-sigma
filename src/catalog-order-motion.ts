import { gsap } from 'gsap';

export type CatalogOrderMotion = { capture: () => void; play: () => void; dispose: () => void };

export function installCatalogOrderMotion(root: HTMLElement): CatalogOrderMotion {
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  const positions = new Map<HTMLElement, number>();
  const tweens = new Map<HTMLElement, gsap.core.Tween>();
  const rows = () => root.querySelectorAll<HTMLElement>('[data-catalog-node]');
  // Coordinates within each scrollable list survive page scrolling and anchoring.
  const top = (row: HTMLElement) => row.getBoundingClientRect().top - row.parentElement!.getBoundingClientRect().top + row.parentElement!.scrollTop;
  const stop = () => {
    for (const [row, tween] of tweens) { tween.kill(); gsap.set(row, { clearProps: 'transform' }); }
    tweens.clear();
  };
  const reset = () => { stop(); positions.clear(); };
  preference.addEventListener('change', reset);
  return {
    capture() {
      positions.clear();
      if (!preference.matches) rows().forEach(row => positions.set(row, top(row)));
      stop();
    },
    play() {
      if (preference.matches) { reset(); return; }
      // Read every destination before writing transforms, avoiding layout thrashing.
      const moves = Array.from(rows(), row => ({ row, previous: positions.get(row), destination: top(row) }));
      moves.forEach(({ row, previous, destination }) => {
        if (previous === undefined) return;
        const delta = previous - destination;
        if (Math.abs(delta) < 1) return;
        tweens.set(row, gsap.fromTo(row, { y: delta }, { y: 0, duration: .22, ease: 'power2.out', overwrite: true,
          onComplete: () => { gsap.set(row, { clearProps: 'transform' }); tweens.delete(row); } }));
      });
      positions.clear();
    },
    dispose() { preference.removeEventListener('change', reset); reset(); },
  };
}
