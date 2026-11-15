import { useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

/** Keep eight complete records visible even when names wrap onto several lines. */
export function DashboardTableScroll({ count, children }: { count: number; children: ReactNode }) {
  const container = useRef<HTMLDivElement>(null);
  const [maxHeight, setMaxHeight] = useState<number>();
  useLayoutEffect(() => {
    const element = container.current;
    const table = element?.querySelector('table');
    if (!element || !table || count <= 8) { setMaxHeight(undefined); return; }
    const measure = () => {
      const eighth = table.tBodies[0]?.rows[7];
      if (!eighth) return;
      const horizontalScrollbar = element.offsetHeight - element.clientHeight;
      setMaxHeight(Math.ceil(eighth.getBoundingClientRect().bottom - table.getBoundingClientRect().top) + horizontalScrollbar);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(table);
    return () => observer.disconnect();
  }, [count, children]);
  return <div ref={container} className="dashboard-table-scroll" role="region" aria-label="Lista de inspecciones registradas" tabIndex={0} style={{ maxHeight }}>{children}</div>;
}
