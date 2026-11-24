import { useOrganizationCatalog } from './useOrganizationCatalog';
import { ORGANIZATION_CATALOG } from './organization-catalog';
import { OrganizationFields } from './OrganizationFields';
import { areaDisplayName, areaNomenclature, organizationDetails } from './organization';
import { Select } from './Select';
import { INSPECTION_LOCATIONS, locationText } from './inspection-location';
import { LocationSelect } from './LocationSelect';
import { installationsReadyForZone, locationNodeActive, refreshLocationCatalog, useLocationCatalog } from './location-catalog';
import { useContext, useId } from 'react';
import { Building2, ChevronDown, ClipboardList, MapPin, Plus, Target, Trash2, UsersRound } from 'lucide-react';
import { Field, SectionTitle } from './components';
import { AdditionalInspectors } from './PerformersSection';
import { ResponsiblePicker } from './ResponsiblePicker';
import { EMPLOYER, OBJECTIVE_LIMIT } from './employer';
import { newResponsible } from './model';
import type { Inspection } from './model';
import { inspectionTimeInput } from './inspection-time';
import type { InspectionPeriod } from './inspection-time';
import { AccountDirectory } from './AccountDirectory';
import { readAccounts } from './accounts';

export function EmployerDetails() {
  return <section className="employer-details" aria-label="Datos del empleador"><dl className="details-grid"><div><dt>Razón social o denominación social</dt><dd>{EMPLOYER.name}</dd></div><div><dt>RUC</dt><dd>{EMPLOYER.ruc}</dd></div><div className="detail-full"><dt>Domicilio</dt><dd>{EMPLOYER.address}</dd></div><div><dt>Actividad económica</dt><dd>{EMPLOYER.activity}</dd></div><div><dt>N.º de trabajadores en el centro laboral</dt><dd>{EMPLOYER.workers}</dd></div></dl></section>;
}

export function GeneralSection({ draft, errors, patch }: { draft: Inspection; errors: Record<string, string>; patch: <K extends keyof Inspection>(key: K, value: Inspection[K]) => void }) {
  const catalogState = useOrganizationCatalog();
  const locations = useLocationCatalog();
  const periodId = useId(), locationSummaryId = useId(), inspectionTypeId = useId();
  const directory = useContext(AccountDirectory);
  const inspector = (directory || readAccounts()).find(person => person.id === draft.ownerId);
  const inspectorDetails = organizationDetails(inspector || {});
  const organizationSupported = draft.storage !== 'cloud' || typeof inspector?.management === 'string';
  const storedLocation = draft.areaLocation || (draft.area ? undefined : { site: '', zone: '', detail: '' });
  const managedLocations = draft.storage !== 'cloud' || locations.mode !== 'legacy';
  const baseLocation = storedLocation && (managedLocations ? { ...storedLocation, source: 'catalog' as const, textOrder: 'site-zone-area' as const, departmentDisplay: areaDisplayName({ management: storedLocation.management, area: storedLocation.department, areaNomenclature: storedLocation.departmentNomenclature }) } : storedLocation);
  const location = baseLocation && organizationSupported && ORGANIZATION_CATALOG.length ? { ...baseLocation, management: baseLocation.management || '', department: baseLocation.department || '' } : baseLocation;
  const activeLocations = locations.nodes.filter(node => locationNodeActive(node, locations.nodes));
  const selectedSite = activeLocations.find(node => node.kind === 'site' && (node.id === location?.siteId || !location?.siteId && node.name === location?.site));
  const selectedZone = activeLocations.find(node => node.kind === 'zone' && node.parent_id === selectedSite?.id && (node.id === location?.zoneId || !location?.zoneId && node.name === location?.zone));
  const installationReady = installationsReadyForZone(locations, selectedZone?.id);
  const currentLocation = location && { ...location, siteId: selectedSite?.id, zoneId: selectedZone?.id, ...(managedLocations ? { installationPending: !installationReady } : {}) };
  const physicalOptions = (kind: 'site' | 'zone' | 'installation', parent?: string) => activeLocations.filter(node => node.kind === kind && (kind === 'site' || !!parent && node.parent_id === parent)).map(node => ({ value: node.id, label: node.name }));
  const locationAvailable = !locations.loading && !locations.error && locations.mode !== 'legacy';
  const field = (key: 'area' | 'date' | 'inspector' | 'otherType', label: string, placeholder: string, type = 'text') => <Field label={label} required error={errors[key]} hint={key === 'inspector' ? inspectorDetails || 'Área y cargo por completar.' : undefined}>{props => <input {...props} value={draft[key]} type={type} maxLength={250} placeholder={placeholder} readOnly={key === 'inspector'} onChange={e => patch(key, e.target.value)} />}</Field>;
  return <div className="form-body"><p className="form-guidance">Los campos con * son obligatorios. Completa la ubicación y los responsables antes de continuar.</p>
    <details className="employer-disclosure">
      <summary><span className="section-icon"><Building2 size={19}/></span><span>DATOS DEL EMPLEADOR</span><ChevronDown className="disclosure-chevron" size={18}/></summary>
      <EmployerDetails />
    </details>
    <div className="section-divider" />
    <SectionTitle icon={<ClipboardList size={19} />} title="Datos de la inspección" subtitle="Completa la información de este registro." />
    {currentLocation && managedLocations && <>
      <div className="field-grid"><Field label="Sede" required error={errors.site || (errors.area && !currentLocation.site ? 'Selecciona una sede.' : undefined)}>{props => <Select {...props} searchable searchLabel="Buscar sedes" icon={<Building2/>} disabled={!locationAvailable} value={selectedSite?.id || ''} options={physicalOptions('site')} placeholder="Selecciona una sede" onChange={id => { const site = activeLocations.find(node => node.id === id)!; patch('areaLocation', { ...currentLocation, siteId: id, site: site.name, zoneId: undefined, zone: '', installationId: undefined, detail: '' }); }}/>}</Field><Field label="Zona de inspección" required error={errors.zone || (errors.area && currentLocation.site && !currentLocation.zone ? 'Selecciona una zona.' : undefined)}>{props => <Select {...props} searchable searchLabel="Buscar zonas" icon={<MapPin/>} disabled={!locationAvailable || !selectedSite} value={selectedZone?.id || ''} options={physicalOptions('zone', selectedSite?.id)} placeholder="Selecciona una zona" onChange={id => { const zone = activeLocations.find(node => node.id === id)!; patch('areaLocation', { ...currentLocation, zoneId: id, zone: zone.name, installationId: undefined, detail: '' }); }}/>}</Field></div>
      <Field label="Instalación" required={installationReady} error={errors.installation} hint={!selectedZone ? undefined : !installationReady ? 'Lista de instalaciones pendiente. Esta opción permanecerá bloqueada hasta que se cargue la lista.' : selectedZone && !physicalOptions('installation', selectedZone.id).length ? 'No hay instalaciones activas en esta zona. Solicita su actualización en Gestión De Áreas E Instalaciones.' : undefined}>{props => <Select {...props} searchable searchLabel="Buscar instalaciones" icon={<Building2/>} disabled={!locationAvailable || !installationReady || !selectedZone} value={location?.installationId || ''} options={physicalOptions('installation', selectedZone?.id)} placeholder={!selectedZone ? 'Selecciona primero una zona' : installationReady ? 'Selecciona una instalación' : 'Lista de instalaciones pendiente'} onChange={id => { const installation = activeLocations.find(node => node.id === id)!; patch('areaLocation', { ...currentLocation, installationId: id, detail: installation.name, installationPending: false }); }}/>}</Field>
      <OrganizationFields management={location?.management || ''} area={location?.department || ''} legacyArea={false} supported={organizationSupported} errors={errors} onChange={value => patch('areaLocation', { ...currentLocation, management: value.management, department: value.area, departmentNomenclature: areaNomenclature(value), departmentDisplay: areaDisplayName(value) })}/>
      {locations.error && <p role="alert" className="error-message">{locations.error} <button type="button" className="text-button" onClick={() => void refreshLocationCatalog().catch(() => {})}>Actualizar sedes y zonas</button></p>}
      {locations.mode === 'legacy' && <p className="field-hint">El catálogo de sedes y zonas está pendiente de activación.</p>}
      <section id={locationSummaryId} className="inspection-location-summary" aria-label="Área e instalación inspeccionada" aria-invalid={!!errors.area} tabIndex={-1}><h4>Área e instalación inspeccionada</h4>{currentLocation.site ? <span className="inspection-area-prefix"><MapPin aria-hidden="true"/>{locationText(currentLocation)}</span> : <p className="field-hint">Selecciona los datos de la inspección para ver su ubicación completa.</p>}{errors.area && <p role="alert" className="error-message">{errors.area}</p>}</section>
    </>}
    {currentLocation && !managedLocations && <>
      <div className="field-grid"><Field label="Sede" required error={errors.site || (errors.area && !currentLocation.site ? 'Selecciona una sede.' : undefined)}>{props => <LocationSelect {...props} icon={<Building2/>} value={currentLocation.site} options={Object.keys(INSPECTION_LOCATIONS)} placeholder="Selecciona una sede" onChange={site => patch('areaLocation', { ...currentLocation, site, zone: '' })}/>}</Field><Field label="Zona de inspección" required error={errors.zone || (errors.area && currentLocation.site && !currentLocation.zone ? 'Selecciona una zona.' : undefined)}>{props => <LocationSelect {...props} icon={<MapPin/>} disabled={!currentLocation.site} value={currentLocation.zone} options={INSPECTION_LOCATIONS[currentLocation.site] || []} placeholder="Selecciona una zona" onChange={zone => patch('areaLocation', { ...currentLocation, zone })}/>}</Field></div>
      <OrganizationFields management={currentLocation.management || ''} area={currentLocation.department || ''} legacyArea={false} supported={organizationSupported} errors={errors} onChange={value => patch('areaLocation', { ...currentLocation, management: value.management, department: value.area, departmentNomenclature: areaNomenclature(value) })}/>
      <Field label="Área e instalación inspeccionada" required error={errors.area}>{props => <div className="inspection-area-control">{currentLocation.site && <span className="inspection-area-prefix"><MapPin aria-hidden="true"/>{locationText({ ...currentLocation, detail: '' })} –</span>}<input {...props} value={currentLocation.detail} maxLength={250} placeholder="Ej. Taller de Maquinaria" onChange={event => patch('areaLocation', { ...currentLocation, detail: event.target.value })}/></div>}</Field>
    </>}
    {catalogState.error && <p role="alert" className="error-message">{catalogState.error}</p>}
    {!currentLocation && <section id={locationSummaryId} className="inspection-location-summary" aria-label="Área e instalación inspeccionada" aria-invalid={!!errors.area} tabIndex={-1}><h4>Área e instalación inspeccionada</h4><span className="inspection-area-prefix"><MapPin aria-hidden="true"/>{draft.area}</span><button type="button" className="text-button" onClick={() => patch('areaLocation', { site: '', zone: '', detail: '' })}>Seleccionar sede y zona</button></section>}
    <div className="primary-inspector-field">{field('inspector', 'Responsable de la inspección', 'Nombres y apellidos')}{draft.additionalInspectors.length < 3 && <button type="button" className="text-button add-general-inspector" onClick={() => patch('additionalInspectors', [...draft.additionalInspectors, newResponsible()])}><Plus size={13}/>Añadir inspector</button>}</div>
    <div className="general-inspectors"><AdditionalInspectors draft={draft} errors={errors} onChange={people => patch('additionalInspectors', people)}/></div>
    <div className="field-grid inspection-date-time-grid">{field('date', 'Fecha de inspección', '', 'date')}<Field label="Hora de inspección" required error={errors.inspectionTime || errors.inspectionPeriod}>{props => <div className="inspection-time-control"><input {...props} type="text" inputMode="numeric" placeholder="hh:mm" maxLength={5} value={draft.inspectionTime} onChange={e => patch('inspectionTime', inspectionTimeInput(e.target.value, draft.inspectionTime))} autoComplete="off"/><label className="sr-only" htmlFor={periodId}>AM o PM</label><Select className="inspection-period-select" id={periodId} aria-required={true} aria-invalid={!!errors.inspectionPeriod} aria-describedby={props['aria-describedby']} value={draft.inspectionPeriod} onChange={value => patch('inspectionPeriod', value as InspectionPeriod)} options={[{value:'',label:'AM/PM'},{value:'AM',label:'AM'},{value:'PM',label:'PM'}]}/></div>}</Field></div>
    <fieldset id={inspectionTypeId} aria-invalid={!!errors.type} tabIndex={-1} className="field"><legend>Tipo de inspección<span className="required">*</span></legend><div className="planning-options">{(['Planeada', 'No planeada', 'Otro'] as const).map(type => <label key={type} className={draft.type === type ? 'selected' : ''}><input type="radio" name="inspection-type" value={type} checked={draft.type === type} onChange={() => patch('type', type)} /><span>{type}</span></label>)}</div>{errors.type && <p className="error-message" role="alert">{errors.type}</p>}</fieldset>
    {draft.type === 'Otro' && field('otherType', 'Detalle de otro tipo de inspección', 'Especifica el tipo de inspección')}
    <div className="section-divider" />
    <section className="objective-section" aria-label="Objetivo de la inspección interna"><SectionTitle icon={<Target size={19}/>} title="Objetivo de la inspección interna"/>
    <div className="objective-field"><Field className="objective-input" label="Objetivo de la inspección interna" required error={errors.objective}>{props => <textarea {...props} spellCheck lang="es-PE" value={draft.objective} rows={2} maxLength={OBJECTIVE_LIMIT} placeholder="¿Qué buscamos identificar, verificar o mejorar en esta inspección?" onChange={e => patch('objective', e.target.value)} />}</Field><span className="character-count" aria-live="polite">{draft.objective.length} / {OBJECTIVE_LIMIT}</span></div></section>
    <div className="section-divider" />
    <div className="responsible-heading"><SectionTitle icon={<UsersRound size={19} />} title="Responsables del área inspeccionada" subtitle="Busca y selecciona a las personas que recibirán el informe." /><button className="text-button" onClick={() => patch('responsibles', [...draft.responsibles, newResponsible()])}><Plus size={16} />Añadir</button></div>
    <div className="responsibles">{draft.responsibles.map((r, index) => <div className="responsible-row" key={r.id}><span className="responsible-number">{index + 1}</span><ResponsiblePicker showEmail={false} value={r} error={errors[`person-${r.id}`]} excludedIds={draft.responsibles.filter(other => other.id !== r.id && other.personId).map(other => other.personId!)} onChange={changes => patch('responsibles', draft.responsibles.map(other => other.id === r.id ? { ...other, ...changes } : other))} />{draft.responsibles.length > 2 && <button className="icon-button delete-button" aria-label={`Eliminar responsable ${index + 1}`} onClick={() => patch('responsibles', draft.responsibles.filter(other => other.id !== r.id))}><Trash2 size={16} /></button>}</div>)}</div>
    {errors.responsibles && <p className="error-message" role="alert">{errors.responsibles}</p>}
  </div>;
}
