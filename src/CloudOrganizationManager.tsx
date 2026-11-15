import { useCallback, useState } from 'react';
import { AreaCatalog } from './CloudOrganization';
import { CloudLocations } from './CloudLocations';
import './organization-admin.css';

export function CloudOrganization({ isCurrent, onBusyChange }: { isCurrent: () => boolean; onBusyChange: (busy: boolean) => void }) {
  const [tab, setTab] = useState<'areas' | 'locations'>('areas');
  const [locked, setLocked] = useState(false);
  const childBusy = useCallback((busy: boolean) => { setLocked(busy); onBusyChange(busy); }, [onBusyChange]);
  return <section className="organization-admin" aria-label="Gestión De Áreas E Instalaciones">
    <div className="organization-heading"><div><h1>Gestión De Áreas E Instalaciones</h1><p>Administra la estructura de la organización y los lugares donde se realizan las inspecciones.</p></div></div>
    <nav className="admin-tabs" aria-label="Catálogos de áreas e instalaciones"><button type="button" aria-current={tab === 'areas' ? 'page' : undefined} disabled={locked} onClick={() => setTab('areas')}>Áreas</button><button type="button" aria-current={tab === 'locations' ? 'page' : undefined} disabled={locked} onClick={() => setTab('locations')}>Instalaciones</button></nav>
    {tab === 'areas' ? <AreaCatalog isCurrent={isCurrent} onBusyChange={childBusy}/> : <CloudLocations isCurrent={isCurrent} onBusyChange={childBusy}/>}
  </section>;
}
