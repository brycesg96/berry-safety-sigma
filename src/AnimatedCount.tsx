import { useEffect, useRef } from 'react';

/** Actual metrics only. CSS reserves the number column; no layout animation. */
export function AnimatedCount({ value }: { value: number }) {
  const element = useRef<HTMLElement>(null), shown = useRef(0);
  useEffect(() => {
    const node = element.current;
    if (!node) return;
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    const finish = () => { cancelAnimationFrame(frame); shown.current = value; node.textContent = String(value); };
    const preference = () => { if (media.matches) finish(); };
    if (media.matches || shown.current === value) finish();
    else {
      const from = shown.current, start = performance.now();
      const draw = (now: number) => {
        const progress = Math.min(1, (now - start) / 420);
        shown.current = Math.round(from + (value - from) * (1 - Math.pow(1 - progress, 3)));
        node.textContent = String(shown.current);
        if (progress < 1) frame = requestAnimationFrame(draw); else finish();
      };
      frame = requestAnimationFrame(draw);
    }
    media.addEventListener('change', preference);
    return () => { cancelAnimationFrame(frame); media.removeEventListener('change', preference); };
  }, [value]);
  return <strong ref={element} aria-live="off">{value}</strong>;
}
