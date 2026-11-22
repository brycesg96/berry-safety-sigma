import { useLayoutEffect } from 'react';
import type { RefObject } from 'react';
import { useScroll, useMotionValueEvent } from 'framer-motion';

type SurfaceRef = RefObject<HTMLDivElement | null>;

export default function ContainerScrollMotion({ container, card, header }: { container: SurfaceRef; card: SurfaceRef; header: SurfaceRef }) {
  const { scrollYProgress } = useScroll({ target: container, offset: ['start end', 'end start'] });
  const mobile = matchMedia('(max-width: 768px)');
  const draw = (value: number) => {
    const progress = Math.max(0, Math.min(1, value));
    // Transform the decorative frame only; form controls and list rows never move.
    const rotation = 18 * (1 - progress), initialScale = mobile.matches ? .94 : .98;
    const scale = initialScale + (1 - initialScale) * progress;
    if (card.current) card.current.style.transform = `rotateX(${rotation}deg) scale(${scale})`;
    if (header.current) header.current.style.transform = `translateY(${-6 * progress}px)`;
  };
  useMotionValueEvent(scrollYProgress, 'change', draw);
  useLayoutEffect(() => {
    const surface = container.current, frame = card.current, title = header.current;
    if (!surface || !frame) return;
    const refresh = () => draw(scrollYProgress.get());
    refresh(); surface.dataset.scrollAnimation = 'ready';
    mobile.addEventListener('change', refresh);
    return () => {
      mobile.removeEventListener('change', refresh);
      frame.style.removeProperty('transform'); title?.style.removeProperty('transform');
      delete surface.dataset.scrollAnimation;
    };
  }, [container, card, header, scrollYProgress]);
  return null;
}
