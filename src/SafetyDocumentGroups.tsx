import { Building2, ChevronDown, FolderOpen } from 'lucide-react';
import { SafetySubmissionCard } from './SafetySubmissionCard';
import { safetySubmissionKey } from './safety-documents';
import type { SafetyDocument } from './safety-documents';
import { organizationLabel } from './organization-label';
import type { YoManagement } from './yo-seguro';

type AreaGroup = { id: string; name: string; submissions: SafetyDocument[][] };
type ManagementGroup = { id: string; name: string; areas: Map<string, AreaGroup> };

export function SafetyDocumentGroups({ submissions, catalog, admin, busy, onOpen, onRemove }: {
  submissions: SafetyDocument[][]; catalog: YoManagement[]; admin: boolean; busy: boolean;
  onOpen: (document: SafetyDocument, download?: boolean) => void;
  onRemove: (document: SafetyDocument) => void;
}) {
  const groups = new Map<string, ManagementGroup>();
  for (const documents of submissions) {
    const first = documents[0], managementId = first.management_id || `legacy:${first.management_name || ''}`, areaId = first.area_id || `legacy:${first.area_name || ''}`;
    const current = catalog.find(item => item.id === first.management_id);
    if (!groups.has(managementId)) groups.set(managementId, { id: managementId, name: organizationLabel(current?.name || first.management_name) || 'Sin gerencia asignada', areas: new Map() });
    const group = groups.get(managementId)!;
    if (!group.areas.has(areaId)) group.areas.set(areaId, { id: areaId, name: organizationLabel(current?.areas.find(item => item.id === first.area_id)?.name || first.area_name) || 'Sin área asignada', submissions: [] });
    group.areas.get(areaId)!.submissions.push(documents);
  }
  const position = (items: { id: string }[], id: string) => { const index = items.findIndex(item => item.id === id); return index < 0 ? Infinity : index; };
  return <div className="yo-management-groups">{[...groups.values()].sort((a,b) => position(catalog,a.id)-position(catalog,b.id) || a.name.localeCompare(b.name,'es')).map(group => {
    const areas = [...group.areas.values()], current = catalog.find(item => item.id === group.id);
    areas.sort((a,b) => position(current?.areas || [],a.id)-position(current?.areas || [],b.id) || a.name.localeCompare(b.name,'es'));
    const count = areas.reduce((total, area) => total + area.submissions.length, 0);
    return <details className="yo-management-group" key={group.id} data-management-id={group.id}>
      <summary className="yo-group-summary"><span className="yo-area-symbol"><Building2 size={21} aria-hidden="true"/></span><div><small>Gerencia</small><h3>{group.name}</h3></div><span className="yo-group-count">{count} {count === 1 ? 'envío' : 'envíos'} · {areas.length} {areas.length === 1 ? 'área' : 'áreas'}</span><ChevronDown className="yo-group-chevron" size={19} aria-hidden="true"/></summary>
      <div className="yo-management-areas">{areas.map(area => <details className="yo-area-group" key={area.id} data-area-id={area.id}>
        <summary className="yo-group-summary"><span className="yo-area-symbol"><FolderOpen size={19} aria-hidden="true"/></span><div><small>Área</small><h4>{area.name}</h4></div><span className="yo-group-count">{area.submissions.length} {area.submissions.length === 1 ? 'envío' : 'envíos'}</span><ChevronDown className="yo-group-chevron" size={18} aria-hidden="true"/></summary>
        <div className="yo-area-submissions">{area.submissions.map(documents => <SafetySubmissionCard key={safetySubmissionKey(documents[0])} documents={documents} admin={admin} busy={busy} onOpen={onOpen} onRemove={onRemove}/>)}</div>
      </details>)}</div>
    </details>;
  })}</div>;
}
