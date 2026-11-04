import { useId, useState } from 'react';
import { Info } from 'lucide-react';
import type { Inspection } from './model';
import { confirmedInspectionCode, pendingCodeLabel } from './inspection-code';

export function InspectionCodeBadge({ draft }: { draft: Inspection }) {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();
  const confirmed = confirmedInspectionCode(draft);
  const hint = confirmed ? 'Código definitivo del informe registrado.' : 'El código es tentativo y puede variar según quién envíe primero un informe. El código definitivo aparecerá en Mis inspecciones.';
  return <div className="inspection-code-badge">
    <input aria-label="Código de inspección" value={confirmed || pendingCodeLabel()} readOnly/>
    <div className="inspection-code-help" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" aria-label="Información del código de inspección" aria-expanded={open} aria-describedby={open ? tooltipId : undefined} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onClick={() => setOpen(true)} onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}><Info size={16}/></button>
      <span id={tooltipId} role="tooltip" hidden={!open}>{hint}</span>
    </div>
  </div>;
}
