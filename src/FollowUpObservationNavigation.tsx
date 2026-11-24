import { useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { Check, Clock3 } from 'lucide-react';
import type { Inspection } from './model';

export function FollowUpObservationNavigation({ inspection, activeId, onSelect, idPrefix }: { inspection: Inspection; activeId: string; onSelect: (id: string) => void; idPrefix: string }) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const strip = useRef<HTMLDivElement>(null);
  const observations = inspection.observations;
  const activeIndex = Math.max(0, observations.findIndex(observation => observation.id === activeId));
  if (!observations.length) return null;

  function reveal(index: number) {
    const host = strip.current, button = buttons.current[index];
    if (!host || !button) return;
    if (button.offsetLeft < host.scrollLeft) host.scrollLeft = Math.max(0, button.offsetLeft - 4);
    else if (button.offsetLeft + button.offsetWidth > host.scrollLeft + host.clientWidth) host.scrollLeft = button.offsetLeft + button.offsetWidth - host.clientWidth + 4;
  }
  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    if (event.key === 'ArrowRight') next = (index + 1) % observations.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + observations.length) % observations.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = observations.length - 1;
    else return;
    event.preventDefault(); onSelect(observations[next].id);
    buttons.current[next]?.focus({ preventScroll: true }); reveal(next);
  }
  return <nav className="followup-observation-navigation" aria-label="Seleccionar observación">
    <div className="followup-observation-nav-title"><h2>Observaciones</h2><span>{activeIndex + 1} de {observations.length}</span></div>
    <div className="followup-observation-tabs" role="tablist" aria-label="Observaciones de la inspección" ref={strip}>
      {observations.map((observation, index) => {
        const executed = inspection.delivery?.corrections[observation.id]?.decision === 'approved';
        const status = executed ? 'Ejecutado' : 'Pendiente';
        const tabId = `${idPrefix}-tab-${observation.id}`;
        const Icon = executed ? Check : Clock3;
        return <button type="button" role="tab" className="followup-observation-tab" key={observation.id} id={tabId}
          ref={node => { buttons.current[index] = node; }} data-state={executed ? 'executed' : 'pending'}
          aria-selected={observation.id === activeId} aria-controls={`${idPrefix}-panel-${observation.id}`} aria-label={`Observación ${index + 1}`} aria-describedby={`${tabId}-status`}
          tabIndex={observation.id === activeId ? 0 : -1} title={`Observación ${index + 1} · ${status}`}
          onClick={() => { onSelect(observation.id); reveal(index); }} onKeyDown={event => navigate(event, index)}>
          <span>{index + 1}</span><Icon size={11} aria-hidden="true"/><span id={`${tabId}-status`} hidden>{status}</span>
        </button>;
      })}
    </div>
  </nav>;
}
