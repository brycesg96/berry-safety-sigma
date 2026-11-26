import { useCallback, useState } from 'react';
import { Building2, MapPin, Network } from 'lucide-react';
import { WorkspacePageHeader } from './WorkspaceUI';
import { AreaCatalog } from './CloudOrganization';
import { CloudLocations } from './CloudLocations';
import './organization-admin.css';

export function CloudOrganization({ isCurrent, onBusyChange }: { isCurrent: () => boolean; onBusyChange: (busy: boolean) => void }) {
  const [tab, setTab] = useState<'areas' | 'locations'>('areas');
  const [locked, setLocked] = useState(false);
  const childBusy = useCallback((busy: boolean) => { setLocked(busy); onBusyChange(busy); }, [onBusyChange]);
  return <section className="organization-admin" aria-label="Gestión De Áreas E Instalaciones">
    <WorkspacePageHeader title="Gestión De Áreas E Instalaciones" description="Organiza la estructura del equipo y sus lugares de trabajo." eyebrow="ADMINISTRACIÓN / CATÁLOGOS" icon={<Building2/>}/>
    <nav className="admin-tabs" aria-label="Catálogos de áreas e instalaciones"><button type="button" aria-current={tab === 'areas' ? 'page' : undefined} disabled={locked} onClick={() => setTab('areas')}><Network size={16} aria-hidden="true"/>Áreas</button><button type="button" aria-current={tab === 'locations' ? 'page' : undefined} disabled={locked} onClick={() => setTab('locations')}><MapPin size={16} aria-hidden="true"/>Instalaciones</button></nav>
    {tab === 'areas' ? <AreaCatalog isCurrent={isCurrent} onBusyChange={childBusy}/> : <CloudLocations isCurrent={isCurrent} onBusyChange={childBusy}/>}
  </section>;
}
