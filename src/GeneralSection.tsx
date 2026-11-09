import { LocationSelect } from './LocationSelect';
import { INSPECTION_LOCATIONS } from './inspection-location';
import { useId } from 'react';
import { Building2, ChevronDown, ClipboardList, MapPin, Plus, Target, Trash2, UsersRound } from 'lucide-react';
import { Field, SectionTitle } from './components';
import { AdditionalInspectors } from './PerformersSection';
import { ResponsiblePicker } from './ResponsiblePicker';
import { EMPLOYER, OBJECTIVE_LIMIT } from './employer';
import { newResponsible } from './model';
import type { Inspection } from './model';
import type { InspectionPeriod } from './inspection-time';

export function EmployerDetails() {
  return <section className="employer-details" aria-label="Datos del empleador"><dl className="details-grid"><div><dt>Razón social o denominación social</dt><dd>{EMPLOYER.name}</dd></div><div><dt>RUC</dt><dd>{EMPLOYER.ruc}</dd></div><div className="detail-full"><dt>Domicilio</dt><dd>{EMPLOYER.address}</dd></div><div><dt>Actividad económica</dt><dd>{EMPLOYER.activity}</dd></div><div><dt>N.º de trabajadores en el centro laboral</dt><dd>{EMPLOYER.workers}</dd></div></dl></section>;
}

export function GeneralSection({ draft, errors, patch }: { draft: Inspection; errors: Record<string, string>; patch: <K extends keyof Inspection>(key: K, value: Inspection[K]) => void }) {
  const periodId = useId();
  const location = draft.areaLocation || (draft.area ? undefined : { site: '', zone: '', detail: '' });
  const field = (key: 'area' | 'date' | 'inspector' | 'otherType', label: string, placeholder: string, type = 'text') => <Field label={label} required error={errors[key]}>{props => <input {...props} value={draft[key]} type={type} maxLength={250} placeholder={placeholder} readOnly={key === 'inspector'} onChange={e => patch(key, e.target.value)} />}</Field>;
  return <div className="form-body">
    <details className="employer-disclosure">
      <summary><span className="section-icon"><Building2 size={19}/></span><span>DATOS DEL EMPLEADOR</span><ChevronDown className="disclosure-chevron" size={18}/></summary>
      <EmployerDetails />
    </details>
    <div className="section-divider" />
    <SectionTitle icon={<ClipboardList size={19} />} title="Datos de la inspección" subtitle="Completa la información de este registro." />
    {location && <div className="field-grid"><Field label="Sede" required error={errors.site}>{props => <LocationSelect {...props} icon={<Building2/>} value={location!.site} options={Object.keys(INSPECTION_LOCATIONS)} placeholder="Selecciona una sede" onChange={site => patch('areaLocation', { ...location!, site, zone: '' })}/>}</Field><Field label="Zona de inspección" required error={errors.zone}>{props => <LocationSelect {...props} icon={<MapPin/>} disabled={!location!.site} value={location!.zone} options={INSPECTION_LOCATIONS[location!.site] || []} placeholder="Selecciona una zona" onChange={zone => patch('areaLocation', { ...location!, zone })}/>}</Field></div>}
    <div className="field-grid"><div>{location ? <Field label="Área inspeccionada" required error={errors.area}>{props => <><div className="inspection-area-control">{location!.site && <span className="inspection-area-prefix"><MapPin aria-hidden="true"/>{[location!.site, location!.zone].filter(Boolean).join(' – ')} –</span>}<input {...props} value={location!.detail} maxLength={250} placeholder="Ej. Taller de Maquinaria" onChange={e => patch('areaLocation', { ...location!, detail: e.target.value })}/></div><span className="field-help">Completa la instalación o actividad inspeccionada.</span></>}</Field> : <>{field('area', 'Área inspeccionada', 'Instalación o actividad inspeccionada')}<button type="button" className="text-button" onClick={() => patch('areaLocation', { site: '', zone: '', detail: draft.area })}>Actualizar sede y zona</button></> }</div>{field('date', 'Fecha de inspección', '', 'date')}</div>
    <div className="field-grid"><div className="primary-inspector-field">{field('inspector', 'Responsable de la inspección', 'Nombres y apellidos')}{draft.additionalInspectors.length < 3 && <button type="button" className="text-button add-general-inspector" onClick={() => patch('additionalInspectors', [...draft.additionalInspectors, newResponsible()])}><Plus size={13}/>Añadir inspector</button>}</div><Field label="Hora de inspección" required error={errors.inspectionTime || errors.inspectionPeriod}>{props => <div className="inspection-time-control"><input {...props} type="text" placeholder="hh:mm" maxLength={5} value={draft.inspectionTime} onChange={e => patch('inspectionTime', e.target.value)} autoComplete="off"/><label className="sr-only" htmlFor={periodId}>AM o PM</label><select id={periodId} aria-required="true" aria-invalid={!!errors.inspectionPeriod} aria-describedby={props['aria-describedby']} value={draft.inspectionPeriod} onChange={e => patch('inspectionPeriod', e.target.value as InspectionPeriod)}><option value="">AM/PM</option><option value="AM">AM</option><option value="PM">PM</option></select></div>}</Field></div>
    <div className="general-inspectors"><AdditionalInspectors draft={draft} errors={errors} onChange={people => patch('additionalInspectors', people)}/></div>
    <fieldset className="field"><legend>Tipo de inspección<span className="required">*</span></legend><div className="planning-options">{(['Planeada', 'No planeada', 'Otro'] as const).map(type => <label key={type} className={draft.type === type ? 'selected' : ''}><input type="radio" name="inspection-type" value={type} checked={draft.type === type} onChange={() => patch('type', type)} /><span>{type}</span></label>)}</div>{errors.type && <p className="error-message" role="alert">{errors.type}</p>}</fieldset>
    {draft.type === 'Otro' && field('otherType', 'Detalle de otro tipo de inspección', 'Especifica el tipo de inspección')}
    <div className="section-divider" />
    <section className="objective-section" aria-label="Objetivo de la inspección interna"><SectionTitle icon={<Target size={19}/>} title="OBJETIVO DE LA INSPECCIÓN INTERNA"/>
    <div className="objective-field"><Field className="objective-input" label="Objetivo de la inspección interna" required error={errors.objective}>{props => <textarea {...props} spellCheck lang="es-PE" value={draft.objective} rows={2} maxLength={OBJECTIVE_LIMIT} placeholder="¿Qué buscamos identificar, verificar o mejorar en esta inspección?" onChange={e => patch('objective', e.target.value)} />}</Field><span className="character-count" aria-live="polite">{draft.objective.length} / {OBJECTIVE_LIMIT}</span></div></section>
    <div className="section-divider" />
    <div className="responsible-heading"><SectionTitle icon={<UsersRound size={19} />} title="Responsables del área inspeccionada" subtitle="Busca y selecciona a las personas que recibirán el informe." /><button className="text-button" onClick={() => patch('responsibles', [...draft.responsibles, newResponsible()])}><Plus size={16} />Añadir</button></div>
    <div className="responsibles">{draft.responsibles.map((r, index) => <div className="responsible-row" key={r.id}><span className="responsible-number">{index + 1}</span><ResponsiblePicker value={r} error={errors[`person-${r.id}`]} excludedIds={draft.responsibles.filter(other => other.id !== r.id && other.personId).map(other => other.personId!)} onChange={changes => patch('responsibles', draft.responsibles.map(other => other.id === r.id ? { ...other, ...changes } : other))} />{draft.responsibles.length > 1 && <button className="icon-button delete-button" aria-label={`Eliminar responsable ${index + 1}`} onClick={() => patch('responsibles', draft.responsibles.filter(other => other.id !== r.id))}><Trash2 size={16} /></button>}</div>)}</div>
    {errors.responsibles && <p className="error-message" role="alert">{errors.responsibles}</p>}
  </div>;
}
