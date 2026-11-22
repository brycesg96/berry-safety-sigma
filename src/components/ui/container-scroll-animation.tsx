import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import './container-scroll-animation.css';

const ScrollMotion = lazy(() => import('./container-scroll-motion').catch(() => ({ default: () => null })));

/** Adapted from the supplied ContainerScroll: bounded, read-only visual content, with native scrolling. */
export function ContainerScroll({ titleComponent, children, variant = 'message' }: {
  titleComponent?: ReactNode; children: ReactNode; variant?: 'message' | 'illustration';
}) {
  const container = useRef<HTMLDivElement>(null), card = useRef<HTMLDivElement>(null), header = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    let visible = false;
    const update = () => setEnabled(visible && !preference.matches);
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; update(); }, { rootMargin: '120px' });
    if (container.current) observer.observe(container.current);
    preference.addEventListener('change', update);
    return () => { observer.disconnect(); preference.removeEventListener('change', update); };
  }, []);
  return <div ref={container} className={`container-scroll container-scroll-${variant}`} data-scroll-container="true">
    <div className="container-scroll-perspective">
      <div ref={card} className="container-scroll-frame" aria-hidden="true"><div className="container-scroll-content">{children}</div></div>
    </div>
    <div ref={header} className="container-scroll-header">{titleComponent}</div>
    {enabled && <Suspense fallback={null}><ScrollMotion container={container} card={card} header={header}/></Suspense>}
  </div>;
}
