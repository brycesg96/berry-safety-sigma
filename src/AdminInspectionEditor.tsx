import { Select } from './Select';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Camera, Check, ImagePlus, LoaderCircle, Plus, Save, Trash2, X } from 'lucide-react';
import type { Inspection, Observation, Evidence } from './model';
import { newObservation, patchInspectionField, preparePhoto, setObservationClosingDate, validateStep } from './model';
import type { CloudProfile } from './cloud-account';
import type { DemoAccount } from './accounts';
import { AccountDirectory } from './AccountDirectory';
import { GeneralSection } from './GeneralSection';
import { ClosingSection } from './ClosingSection';
import { Badge, Field, Modal } from './components';
import { PhotoViewer } from './PhotoViewer';
import { registrationParticipantsOf } from './registration';
import { confirmedInspectionCode } from './inspection-code';
import { adminEditPeople, AdminEditError, finishAdminEdit, prepareAdminEdit } from './admin-edit';
import type { PreparedAdminEdit } from './admin-edit';
import './admin-edit.css';

type Props = { inspection: Inspection; actor: CloudProfile; isCurrent: () => boolean; onCancel: () => void; onSaved: (inspection: Inspection) => void; onBusyChange: (busy: boolean) => void };
export function AdminInspectionEditor({ inspection, actor, isCurrent, onCancel, onSaved, onBusyChange }: Props) {
  const [draft, setDraft] = useState<Inspection>(() => ({ ...inspection, registrationParticipants: registrationParticipantsOf(inspection) }));
  const baseline = useRef(JSON.stringify(draft)), live = useRef(true), current = useRef(isCurrent); current.current = isCurrent;
  const [people, setPeople] = useState<DemoAccount[] | null>(null), [section, setSection] = useState(0), [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [photoBusy, setPhotoBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<Evidence | null>(null), [discard, setDiscard] = useState(false), [signatureBusy, setSignatureBusy] = useState<string[]>([]);
  const [prepared, setPrepared] = useState<PreparedAdminEdit | null>(null);
  const dirty = JSON.stringify(draft) !== baseline.current;
  const signatureStatus = useCallback((id: string, value: boolean) => setSignatureBusy(old => value ? old.includes(id) ? old : [...old, id] : old.includes(id) ? old.filter(item => item !== id) : old), []);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  useEffect(() => { onBusyChange(dirty || busy || !!photoBusy || !!preview || signatureBusy.length > 0 || !!prepared); return () => onBusyChange(false); }, [dirty, busy, photoBusy, preview, signatureBusy.length, prepared, onBusyChange]);
  useEffect(() => {
    let active = true;
    void adminEditPeople().then(data => { if (active && current.current()) setPeople(data); }).catch(problem => { if (active) setError(problem.message); });
    return () => { active = false; };
  }, [actor.id]);
  const patch = <K extends keyof Inspection>(key: K, value: Inspection[K]) => { setDraft(old => patchInspectionField(old, key, value)); setErrors({}); setError(''); };
  const observation = (id: string, value: Partial<Observation>) => setDraft(old => ({ ...old, observations: old.observations.map(item => item.id === id ? { ...item, ...value } : item) }));
  async function photos(item: Observation, files: FileList | null) {
    if (!files?.length) return;
    if (files.length + item.photos.length > 8) { setError('Máximo 8 fotos por observación.'); return; }
    setPhotoBusy(item.id); setError('');
    try {
      const added = await Promise.all(Array.from(files).map(preparePhoto));
      if (live.current && current.current()) setDraft(old => ({ ...old, observations: old.observations.map(o => o.id === item.id ? { ...o, photos: [...o.photos, ...added].slice(0, 8) } : o) }));
    } catch (problem) { setError(problem instanceof Error ? problem.message : 'No se pudo cargar la evidencia.'); }
    finally { if (live.current) setPhotoBusy(null); }
  }
  async function save() {
    if (busy || photoBusy || signatureBusy.length) return;
    if (!prepared) {
      for (const step of [0, 1, 3]) {
        const found = validateStep(draft, step);
        if (Object.keys(found).length) { setErrors(found); setSection(step === 3 ? 2 : step); setError('Completa los campos indicados antes de guardar.'); window.scrollTo({ top: 0 }); return; }
      }
    }
    setBusy(true); setError('');
    try {
      const candidate = prepared || await prepareAdminEdit(draft, actor.id);
      if (!live.current || !current.current()) return;
      setPrepared(candidate);
      const updated = await finishAdminEdit(candidate, actor.id);
      if (live.current && current.current()) onSaved(updated);
    } catch (problem) {
      if (live.current && current.current()) { if (problem instanceof AdminEditError && problem.code === 'EDIT_EXPIRED') setPrepared(null); setError(problem instanceof Error ? problem.message : 'No se confirmó el guardado. Conserva esta pestaña y vuelve a intentarlo.'); }
    } finally { if (live.current) setBusy(false); }
  }
  return <section className="admin-inspection-editor" aria-busy={busy}>
    <button type="button" className="button button-back" disabled={busy || !!photoBusy || signatureBusy.length > 0} onClick={() => dirty || prepared ? setDiscard(true) : onCancel()}><ArrowLeft size={17}/>Volver al informe</button>
    <div className="page-heading"><div><div className="eyebrow">EDICIÓN ADMINISTRATIVA</div><h1>Editar inspección</h1><p>{confirmedInspectionCode(inspection)} · {inspection.inspector}</p></div></div>
    <p className="notice">Los cambios se aplican al guardar y reemplazan el Excel de esta inspección. Los avances se conservan; las observaciones modificadas vuelven a Pendiente para su revisión. Los responsables seleccionados verán el informe en su cuenta.</p>
    <div className="admin-edit-tabs" role="tablist" aria-label="Secciones de edición">{['Información general', 'Observaciones', 'Cierre'].map((label, index) => <button type="button" role="tab" aria-selected={section === index} key={label} disabled={busy} onClick={() => setSection(index)}>{label}</button>)}</div>
    {error && <p role="alert" className="notice notice-error">{error}</p>}
    {!people ? <p className="cloud-loading" role="status"><LoaderCircle className="spin" size={18}/>Consultando personas…</p> : <AccountDirectory.Provider value={people}><fieldset className="admin-edit-fields" disabled={busy || !!photoBusy || !!prepared}>
      <div className="form-card"><div className="form-card-heading"><h2>{['Información general', 'Observaciones', 'Cierre de la inspección'][section]}</h2></div>
      {section === 0 && <GeneralSection draft={draft} errors={errors} patch={patch}/>}
      {section === 1 && <div className="form-body observation-body">
        {draft.observations.map((item, index) => <section key={item.id} className="observation-card"><div className="observation-heading"><span className="observation-index">{index + 1}</span><h3>Observación {index + 1}</h3><Badge severity={item.severity}/><button type="button" className="icon-button delete-button" aria-label={`Eliminar observación ${index + 1}`} onClick={() => patch('observations', draft.observations.filter(o => o.id !== item.id))}><Trash2 size={17}/></button></div>
        <div className="observation-layout"><div className="observation-texts"><Field label="Descripción" required error={errors[`description-${item.id}`]}>{props => <textarea {...props} spellCheck lang="es-PE" rows={3} maxLength={10000} value={item.description} onChange={e => observation(item.id, { description: e.target.value })}/>}</Field><Field label="Medida correctiva" required error={errors[`action-${item.id}`]}>{props => <textarea {...props} spellCheck lang="es-PE" rows={3} maxLength={10000} value={item.correctiveAction} onChange={e => observation(item.id, { correctiveAction: e.target.value })}/>}</Field></div>
        <div className="observation-details"><Field label="Nivel de riesgo">{props => <Select {...props} value={item.severity} onChange={severity => observation(item.id, { severity: severity as Observation['severity'] })} options={[{value:'baja',label:'Baja'},{value:'media',label:'Media'},{value:'alta',label:'Alta'}]}/>}</Field><Field label="Fecha de Cierre prevista" required error={errors[`date-${item.id}`]}>{props => <input {...props} type="date" value={item.dueDate} onChange={e => setDraft(old => setObservationClosingDate(old, item.id, e.target.value))}/>}</Field>
        <div className="evidence-label"><span>Evidencia fotográfica</span><span>{item.photos.length} / 8</span></div><div className="photos-grid">{item.photos.map((photo, photoIndex) => <div className="photo-thumb" key={photo.id}><button type="button" className="photo-preview" aria-label={`Ver foto ${photoIndex + 1} de observación ${index + 1}`} onClick={() => setPreview(photo)}><img src={photo.data} alt={photo.name}/></button><button type="button" className="photo-remove" aria-label={`Eliminar foto ${photoIndex + 1} de observación ${index + 1}`} onClick={() => observation(item.id, { photos: item.photos.filter(p => p.id !== photo.id) })}><X size={13}/></button></div>)}{item.photos.length < 8 && <label className="upload-zone upload-small">{photoBusy === item.id ? <LoaderCircle className="spin" size={22}/> : <ImagePlus size={22}/>}<strong>Añadir fotos</strong><input type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={!!photoBusy} aria-label={`Añadir fotos a observación ${index + 1}`} onChange={e => { void photos(item, e.target.files); e.target.value = ''; }}/></label>}</div></div></div></section>)}
        {!draft.observations.length && <p className="inline-note"><Camera size={18}/>Añade al menos una observación.</p>}<button type="button" className="add-observation" onClick={() => patch('observations', [...draft.observations, newObservation(draft.defaultClosingDate)])}><Plus size={18}/>Añadir observación</button>{errors.observations && <p className="error-message" role="alert">{errors.observations}</p>}
      </div>}
      {section === 2 && <ClosingSection draft={draft} errors={errors} patch={patch} onRegistrationChange={(id, value) => setDraft(old => ({ ...old, registrationDetails: { ...old.registrationDetails, [id]: value } }))} onRegistrationBusy={signatureStatus}/>}
      </div></fieldset></AccountDirectory.Provider>}
    <div className="admin-edit-footer"><button type="button" className="button button-outline" disabled={busy || !!photoBusy || signatureBusy.length > 0} onClick={() => dirty || prepared ? setDiscard(true) : onCancel()}>Cancelar</button><button type="button" className="button button-primary" disabled={!people || busy || !!photoBusy || signatureBusy.length > 0 || !dirty && !prepared} onClick={() => void save()}>{busy ? <LoaderCircle className="spin" size={17}/> : <Save size={17}/>} {busy ? 'Guardando informe y Excel…' : prepared ? 'Reintentar guardado' : 'Guardar cambios'}</button></div>
    {preview && <PhotoViewer photo={preview} onClose={() => setPreview(null)} onSave={async photo => { setDraft(old => ({ ...old, observations: old.observations.map(item => ({ ...item, photos: item.photos.map(p => p.id === photo.id ? photo : p) })) })); setPreview(photo); }}/> }
    {discard && <Modal title="Salir de la edición" onClose={() => setDiscard(false)}><p>Se descartarán los cambios que aún no se hayan guardado. Si el guardado se interrumpió, puedes volver a abrir el informe para comprobar su estado.</p><div className="modal-actions"><button type="button" className="button button-outline" onClick={() => setDiscard(false)}>Seguir editando</button><button type="button" className="button button-primary" onClick={onCancel}><Check size={16}/>Volver al informe</button></div></Modal>}
  </section>;
}
