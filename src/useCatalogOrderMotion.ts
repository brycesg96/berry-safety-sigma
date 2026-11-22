import { useEffect, useLayoutEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { CatalogOrderMotion } from './catalog-order-motion';

/** Capture only after the server accepts an order; animation never changes data. */
export function useCatalogOrderMotion(root: RefObject<HTMLDivElement | null>, enabled: boolean) {
  const motion = useRef<CatalogOrderMotion | null>(null);
  const pending = useRef(false);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void import('./catalog-order-motion').then(({ installCatalogOrderMotion }) => {
      if (active && root.current) motion.current = installCatalogOrderMotion(root.current);
    }).catch(() => {});
    return () => { active = false; pending.current = false; motion.current?.dispose(); motion.current = null; };
  }, [root, enabled]);
  useLayoutEffect(() => {
    if (pending.current) { pending.current = false; motion.current?.play(); }
  });
  return () => { motion.current?.capture(); pending.current = true; };
}
