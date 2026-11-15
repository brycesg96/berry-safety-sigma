import { useId, useState } from 'react';
import { Info } from 'lucide-react';
import type { RegistrationPreview } from './useNextRegistration';
import type { Inspection } from './model';
import { confirmedInspectionCode, pendingCodeLabel } from './inspection-code';

export function InspectionCodeBadge({ draft, preview }: { draft: Inspection; preview?: RegistrationPreview }) {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();
  const codeId = useId();
  const confirmed = confirmedInspectionCode(draft);
  const hint = confirmed ? 'Número de registro definitivo del informe registrado.' : preview?.unavailable ? 'No se pudo consultar el siguiente número. Se confirmará al enviar el informe; vuelve a conectar para actualizar esta vista.' : 'El número de registro es tentativo y puede variar según quién envíe primero un informe. El número de registro definitivo aparecerá en Mis inspecciones.';
  return <div className="inspection-register"><label htmlFor={codeId}>N° REGISTRO:</label><div className="inspection-code-badge">
    <input id={codeId} aria-label="Número de registro" value={confirmed || (preview ? preview.code || (preview.loading ? 'Consultando…' : 'Por confirmar') : pendingCodeLabel())} aria-busy={!confirmed && preview?.loading || undefined} readOnly/>
    <div className="inspection-code-help" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" aria-label="Información del número de registro" aria-expanded={open} aria-describedby={open ? tooltipId : undefined} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onClick={() => setOpen(true)} onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}><Info size={16}/></button>
      <span id={tooltipId} role="tooltip" hidden={!open}>{hint}</span>
    </div>
  </div></div>;
}
