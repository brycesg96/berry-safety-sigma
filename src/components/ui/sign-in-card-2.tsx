import { useEffect, useSyncExternalStore } from 'react';
import type { ReactNode, PointerEvent } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { LiquidGlassSurface } from './liquid-glass';
import './sign-in-card-2.css';

const subscribeReduced = (changed: () => void) => {
  const query = matchMedia('(prefers-reduced-motion: reduce)');
  query.addEventListener('change', changed);
  return () => query.removeEventListener('change', changed);
};
const reducedSnapshot = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const useAccessReducedMotion = () => useSyncExternalStore(subscribeReduced, reducedSnapshot, () => true);

/** Adaptation of the supplied sign-in-card-2. The caller owns authentication and form state. */
export function SignInBackdrop() {
  const reduced = useAccessReducedMotion();
  return <motion.div className="sign-in-backdrop" aria-hidden="true" initial={false} animate={{ opacity: 1 }}>
    <motion.span className="sign-in-glow sign-in-glow-top" initial={false} animate={{ opacity: reduced ? .7 : 1 }} transition={{ duration: reduced ? 0 : .6 }}/>
    <span className="sign-in-glow sign-in-glow-bottom"/><span className="sign-in-texture"/>
  </motion.div>;
}

export function SignInCard({ active, busy, children }: { active: boolean; busy?: boolean; children: ReactNode }) {
  const reduced = useAccessReducedMotion(), x = useMotionValue(0), y = useMotionValue(0);
  const smoothX = useSpring(x, { stiffness: 180, damping: 28 }), smoothY = useSpring(y, { stiffness: 180, damping: 28 });
  const rotateX = useTransform(smoothY, [-.5, .5], [4, -4]), rotateY = useTransform(smoothX, [-.5, .5], [-4, 4]);
  const reset = () => { x.set(0); y.set(0); };
  useEffect(() => {
    const fine = matchMedia('(hover: hover) and (pointer: fine)');
    const clear = () => { x.jump(0); y.jump(0); smoothX.jump(0); smoothY.jump(0); };
    clear(); fine.addEventListener('change', clear); window.addEventListener('blur', clear);
    return () => { fine.removeEventListener('change', clear); window.removeEventListener('blur', clear); };
  }, [active, reduced, busy, x, y, smoothX, smoothY]);
  const move = (event: PointerEvent<HTMLElement>) => {
    if (!active || reduced || busy || event.pointerType !== 'mouse' || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    if (event.currentTarget.contains(document.activeElement) && document.activeElement?.matches('input,button,textarea,select')) { reset(); return; }
    const box = event.currentTarget.getBoundingClientRect();
    x.set(Math.max(-.5, Math.min(.5, (event.clientX - box.left) / box.width - .5)));
    y.set(Math.max(-.5, Math.min(.5, (event.clientY - box.top) / box.height - .5)));
  };
  return <section className={`cloud-account-card${active ? ' sign-in-card-2' : ' liquid-glass-card'}`} aria-busy={busy}
    onPointerMove={move} onPointerLeave={reset} onFocusCapture={reset}>
    {active ? <>
      <motion.div className="sign-in-card-aura" aria-hidden="true" style={{ rotateX: reduced ? 0 : rotateX, rotateY: reduced ? 0 : rotateY }}/>
      <div className="sign-in-card-edge" aria-hidden="true"><span/></div>
    </> : <LiquidGlassSurface/>}
    {active ? <div className="sign-in-card-content">{children}</div> : children}
  </section>;
}
