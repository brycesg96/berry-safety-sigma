import { useContext, useId } from 'react';
import { ChevronDown, ClipboardCheck, FileText, UsersRound } from 'lucide-react';
import { AccountDirectory } from './AccountDirectory';
import { readAccounts } from './accounts';
import type { DemoAccount } from './accounts';
import { LiquidGlassSurface } from './components/ui/liquid-glass';
import type { Inspection } from './model';
import { initials } from './model';
import { areaDisplayName } from './organization';
import { organizationLabel } from './organization-label';
import { closingRemarksOf } from './registration';

type SummaryPerson = { id: string; personId?: string; name: string; jobTitle?: string; area?: string; management?: string };

export function FollowUpSummary({ inspection }: { inspection: Inspection }) {
  const directory = useContext(AccountDirectory) || readAccounts();
  const inspectors = [...new Map<string, SummaryPerson>([
    { id: inspection.ownerId, personId: inspection.ownerId, name: inspection.inspector },
    ...(inspection.additionalInspectors || []),
  ].map(person => [person.personId || person.id, person] as const)).values()];
  return <div className="followup-context liquid-glass-card">
    <LiquidGlassSurface/>
    <div className="followup-people-grid">
      <PeopleGroup label={inspectors.length === 1 ? 'Responsable de la Inspección' : 'Responsables de la Inspección'} people={inspectors} directory={directory} inspection={inspection} kind="inspection"/>
      <PeopleGroup label={inspection.responsibles.length === 1 ? 'Responsable del Levantamiento' : 'Responsables del Levantamiento'} people={inspection.responsibles} directory={directory} inspection={inspection} kind="correction"/>
    </div>
    <details className="followup-report-details" key={inspection.id}>
      <summary><FileText size={16} aria-hidden="true"/><span>Detalles de la Inspección</span><small aria-hidden="true">Objetivo, Causa y Conclusiones</small><ChevronDown size={16} className="followup-details-chevron" aria-hidden="true"/></summary>
      <div className="followup-report-texts">
        <section><h3>Objetivo</h3><p>{inspection.objective || 'Sin indicar'}</p></section>
        <section><h3>Descripción de la Causa</h3><p>{inspection.unfavorableCause || 'Sin indicar'}</p></section>
        <section><h3>Conclusiones y Recomendaciones</h3><p>{closingRemarksOf(inspection)}</p></section>
      </div>
    </details>
  </div>;
}

function PeopleGroup({ label, people, directory, inspection, kind }: { label: string; people: SummaryPerson[]; directory: DemoAccount[]; inspection: Inspection; kind: 'inspection' | 'correction' }) {
  const headingId = useId();
  const Icon = kind === 'inspection' ? ClipboardCheck : UsersRound;
  return <section className="followup-people-section" aria-labelledby={headingId}>
    <h2 id={headingId} className="followup-people-role"><Icon size={16} aria-hidden="true"/><span>{label}</span><small aria-hidden="true">{people.length}</small></h2>
    <ul className="followup-people-list">
      {people.map(person => <li className="followup-person" key={person.personId || person.id}>
        <span className="followup-person-avatar" aria-hidden="true">{initials(person.name)}</span>
        <div className="followup-person-info"><strong>{person.name || 'Sin nombre registrado'}</strong><span>{personRoleDetails(person, directory, inspection)}</span></div>
      </li>)}
    </ul>
  </section>;
}

function personRoleDetails(person: SummaryPerson, directory: DemoAccount[], inspection: Inspection) {
  const current = directory.find(account => account.id === (person.personId || person.id));
  const job = inspection.registrationDetails?.[person.personId || person.id]?.jobTitle || person.jobTitle || current?.jobTitle;
  const area = areaDisplayName(person.area ? person : current || {});
  return [organizationLabel(job), area].filter(Boolean).join(' - ') || 'Puesto y área no registrados';
}
