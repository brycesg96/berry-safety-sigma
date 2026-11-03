import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpRight, Building2, CalendarDays, Camera, Check, CheckCheck, ChevronRight, CircleCheck, ClipboardCheck, ClipboardList, Download, FileCheck2, FileSpreadsheet, FileText, HelpCircle, ImagePlus, Info, LayoutGrid, Leaf, ListFilter, LoaderCircle, LockKeyhole, Mail, Menu, MoreHorizontal, Pencil, Plus, Save, Search, Send, ShieldCheck, Sparkles, Trash2, UserRound, UsersRound, X } from 'lucide-react';
import { Badge, Brand, Field, Modal, SectionTitle, Stepper } from './components';
import type { Inspection, Observation, Profile } from './model';
import { emailValid, formatDate, initials, loadInspections, newInspection, newObservation, newResponsible, persistInspection, preparePhoto, removeInspection, stepNames, validateStep } from './model';
import { exportExcel } from './export';

const stepDescriptions = [
  ['El primer paso para un entorno más seguro.', 'Cuéntanos dónde se realizará la inspección y quiénes serán los responsables.'],
  ['Observa. Registra. Previene.', 'Documenta cada hallazgo con evidencias claras y una acción para resolverlo.'],
  ['Una mirada a tus hallazgos.', 'Revisa las observaciones antes de completar las conclusiones de la inspección.'],
  ['Convierte los hallazgos en mejoras.', 'Comparte tus conclusiones, recomendaciones y los datos de quien realizó la inspección.'],
  ['Todo listo para el siguiente paso.', 'Verifica la información y descarga el informe para compartirlo con tu equipo.'],
];

function readProfile(): Profile {
  try {
    const p = JSON.parse(localStorage.getItem('berry-profile') || 'null');
    if (p && typeof p.name === 'string' && typeof p.email === 'string') return p;
  } catch { /* El perfil local es opcional. */ }
  return { name: 'Brian', email: '' };
}

export default function App() {
  const [profile, setProfile] = useState<Profile>(readProfile);
  const [draft, setDraft] = useState<Inspection>(() => newInspection(profile));
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<'editor' | 'list'>('editor');
  const [menuOpen, setMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 899px)').matches);
  const [modal, setModal] = useState<'help' | 'profile' | 'send' | null>(null);
  const [profileForm, setProfileForm] = useState(profile);
  const [profileError, setProfileError] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved');
  const [storageError, setStorageError] = useState(false);
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState<string | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<{ data: string; name: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Inspection | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const contentRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 899px)');
    const change = () => { setIsMobile(media.matches); if (!media.matches) setMenuOpen(false); };
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);

  useEffect(() => {
    let active = true;
    loadInspections().then(items => {
      if (!active) return;
      setInspections(items);
      if (items[0]) setDraft(items[0]);
      setLoaded(true);
    }).catch(() => {
      if (!active) return;
      setStorageError(true); setLoaded(true);
    });
    return () => { active = false; };
  }, []);

  const save = useCallback(async (item: Inspection) => {
    setSaveState('saving');
    try {
      await persistInspection(item);
      setInspections(items => [item, ...items.filter(i => i.id !== item.id)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
      setSaveState('saved'); setStorageError(false);
      return true;
    } catch { setSaveState('error'); setStorageError(true); return false; }
  }, []);

  useEffect(() => {
    if (!loaded) return;
    setSaveState('saving');
    const timer = window.setTimeout(() => { void save(draft); }, 650);
    return () => clearTimeout(timer);
  }, [draft, loaded, save]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    sidebarRef.current?.querySelector<HTMLElement>('button')?.focus();
    function keydown(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
      if (e.key === 'Tab') {
        const controls = sidebarRef.current?.querySelectorAll<HTMLElement>('button');
        if (!controls?.length) return;
        const first = controls[0], last = controls[controls.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); document.body.style.overflow = overflow; previous?.focus(); };
  }, [menuOpen]);

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (saveState !== 'saved') event.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [saveState]);

  const patch = <K extends keyof Inspection>(key: K, value: Inspection[K]) => {
    setDraft(d => ({ ...d, [key]: value, status: 'draft', updatedAt: new Date().toISOString() }));
    setErrors(e => { const next = { ...e }; delete next[key]; return next; });
  };
  const changeObservation = (observationId: string, changes: Partial<Observation>) => {
    setDraft(d => ({ ...d, observations: d.observations.map(o => o.id === observationId ? { ...o, ...changes } : o), status: 'draft', updatedAt: new Date().toISOString() }));
    setErrors(e => Object.fromEntries(Object.entries(e).filter(([key]) => !key.endsWith(observationId))));
  };
  const top = () => window.scrollTo({ top: 0, behavior: 'smooth' });
  const goToStep = (target: number) => {
    if (target > draft.step) {
      for (let i = 0; i < target; i++) {
        const found = validateStep(draft, i);
        if (Object.keys(found).length) {
          setDraft(d => ({ ...d, step: i })); setErrors(found);
          setTimeout(() => contentRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 80);
          setToast('Revisa los campos señalados para continuar.'); return;
        }
      }
    }
    setErrors({}); patch('step', target); top();
  };
  const startNew = async () => {
    if (!await save(draft)) { setToast('No pudimos guardar tu inspección. Descarga el informe antes de salir.'); return; }
    setDraft(newInspection(profile)); setErrors({}); setView('editor'); setMenuOpen(false); top();
  };
  const showList = async () => {
    await save(draft); setView('list'); setMenuOpen(false); top();
  };
  const addPhotos = async (o: Observation, files: FileList | null) => {
    if (!files?.length) return;
    if (o.photos.length + files.length > 8) { setToast('Puedes añadir hasta 8 fotos por observación.'); return; }
    setPhotoBusy(o.id);
    try {
      const photos = await Promise.all(Array.from(files).map(preparePhoto));
      // Se combina con el estado actual para conservar las ediciones hechas mientras se procesan las fotos.
      setDraft(d => ({ ...d, observations: d.observations.map(item => item.id === o.id ? { ...item, photos: [...item.photos, ...photos].slice(0, 8) } : item), updatedAt: new Date().toISOString(), status: 'draft' }));
    } catch (e) { setToast(e instanceof Error ? e.message : 'No se pudo cargar la foto.'); }
    finally { setPhotoBusy(null); }
  };
  const download = async () => {
    for (const step of [0, 1, 3]) {
      const found = validateStep(draft, step);
      if (Object.keys(found).length) { setErrors(found); patch('step', step); setModal(null); setToast('Completa los datos pendientes antes de generar el informe.'); top(); return; }
    }
    setBusy(true);
    try {
      await exportExcel(draft);
      const ready: Inspection = { ...draft, status: 'ready', updatedAt: new Date().toISOString() };
      setDraft(ready); await save(ready); setToast('Informe Excel descargado. Listo para compartir.');
    } catch { setToast('No pudimos generar el Excel. Inténtalo de nuevo; tus datos se conservan.'); }
    finally { setBusy(false); }
  };
  const saveProfile = () => {
    if (!profileForm.name.trim() || (profileForm.email && !emailValid(profileForm.email))) { setProfileError('Escribe tu nombre y, si incluyes un correo, comprueba que sea válido.'); return; }
    try { localStorage.setItem('berry-profile', JSON.stringify(profileForm)); }
    catch { setProfileError('No pudimos guardar el perfil en este navegador.'); return; }
    setProfile(profileForm); setModal(null); setToast('Perfil actualizado. Se usará en las nuevas inspecciones.');
  };
  const draftCount = inspections.filter(d => d.status === 'draft').length;
  const counts = { alta: draft.observations.filter(o => o.severity === 'alta').length, media: draft.observations.filter(o => o.severity === 'media').length, baja: draft.observations.filter(o => o.severity === 'baja').length };
  const formField = (key: 'company' | 'ruc' | 'facility' | 'area' | 'date' | 'objective' | 'conclusions' | 'recommendations' | 'inspector' | 'inspectorEmail', label: string, placeholder: string, required = true, type = 'text', textarea = false) => <Field label={label} required={required} error={errors[key]}>{props => textarea ? <textarea {...props} placeholder={placeholder} rows={key === 'objective' ? 3 : 5} value={draft[key]} onChange={e => patch(key, e.target.value)} maxLength={key === 'objective' ? 1200 : 5000} /> : <input {...props} type={type} placeholder={placeholder} value={draft[key]} onChange={e => patch(key, e.target.value)} maxLength={key === 'ruc' ? 11 : 250} inputMode={key === 'ruc' ? 'numeric' : undefined} />}</Field>;

  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Ir al contenido</a>
    {menuOpen && <div className="sidebar-scrim" onClick={() => setMenuOpen(false)} />}
    <aside ref={sidebarRef} className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`} aria-label="Menú principal" role={isMobile && menuOpen ? 'dialog' : undefined} aria-modal={isMobile && menuOpen ? true : undefined} inert={!menuOpen && isMobile ? true : undefined}>
      <div className="sidebar-brand"><Brand /><button className="mobile-close icon-button" aria-label="Cerrar menú" onClick={() => setMenuOpen(false)}><X size={20} /></button></div>
      <button className="user-card" onClick={() => { setProfileForm(profile); setProfileError(''); setModal('profile'); setMenuOpen(false); }} aria-label="Editar mi perfil"><span className="avatar">{initials(profile.name)}</span><span className="user-details"><strong>{profile.name}</strong><span>Inspector de seguridad</span></span><MoreHorizontal size={18} /></button>
      <div className="sidebar-divider" />
      <div className="nav-caption">ESPACIO DE TRABAJO</div>
      <nav className="sidebar-nav">
        <button className={view === 'editor' ? 'active' : ''} onClick={() => { if (view !== 'editor') void startNew(); else setMenuOpen(false); }}><ClipboardCheck size={19} /><span>Nueva inspección</span><Plus size={15} /></button>
        <button className={view === 'list' ? 'active' : ''} onClick={() => void showList()}><LayoutGrid size={19} /><span>Mis inspecciones</span>{inspections.length > 0 && <span className="nav-count">{inspections.length}</span>}</button>
      </nav>
      <div className="sidebar-bottom"><div className="prevention-card"><div className="prevention-art"><ShieldCheck size={32} strokeWidth={1.4} /><span /><span /></div><h3>La prevención<br />empieza contigo.</h3><p>Cada observación es una oportunidad para cuidar a tu equipo.</p><div className="small-line" /></div><button className="help-button" onClick={() => { setModal('help'); setMenuOpen(false); }}><HelpCircle size={18} /><span>¿Necesitas una mano?</span><ArrowUpRight size={15} /></button><div className="sidebar-footer"><span className="online-dot" />Tu espacio de seguridad<span>v0.1</span></div></div>
    </aside>

    <div className="workspace">
      <header className="topbar"><div className="topbar-left"><button className="menu-toggle icon-button" aria-label="Abrir menú" aria-expanded={menuOpen} onClick={() => setMenuOpen(v => !v)}><Menu size={23} /></button><span className="breadcrumb-parent">Espacio de trabajo</span><ChevronRight className="breadcrumb-separator" size={14} /><span className="breadcrumb-current">{view === 'editor' ? 'Nueva inspección' : 'Mis inspecciones'}</span></div><div className="topbar-right"><span className={`save-status ${saveState === 'error' ? 'save-error' : ''}`} aria-live="polite">{saveState === 'saving' ? <LoaderCircle className="spin" size={15} /> : saveState === 'error' ? <Info size={15} /> : <CircleCheck size={16} />}<span>{saveState === 'saving' ? 'Guardando…' : saveState === 'error' ? 'Sin guardar' : 'Guardado en este navegador'}</span></span><div className="topbar-separator" /><button className="top-avatar" aria-label="Mi perfil" onClick={() => { setProfileForm(profile); setProfileError(''); setModal('profile'); }}>{initials(profile.name)}</button></div></header>

      <main id="main-content" className="main-content" ref={contentRef}>
        {storageError && <div className="notice notice-error" role="alert"><Info size={19} /><div><strong>No se ha podido guardar el borrador.</strong><p>Comprueba el espacio y los permisos del navegador. Mantén esta pestaña abierta para conservar los datos.</p></div><button className="text-button" onClick={() => void save(draft)}>Reintentar</button></div>}
        {view === 'editor' ? <>
          <div className="page-heading"><div><div className="eyebrow"><span />SEGURIDAD Y SALUD EN EL TRABAJO</div><div className="title-row"><h1>Nueva inspección</h1><span className="draft-badge"><span />Borrador</span></div><p>{stepDescriptions[draft.step][0]}</p></div><button className="button button-outline save-exit" onClick={() => void showList()}><Save size={16} />Guardar y salir</button></div>
          <Stepper step={draft.step} names={stepNames} onStep={goToStep} />
          <div className="content-layout"><div className="form-column">
            <div className="form-card">
              <div className="form-card-heading"><div><span className="card-eyebrow">PASO {String(draft.step + 1).padStart(2, '0')} DE 05</span><h2>{['Información general', 'Registro de observaciones', 'Resumen de observaciones', 'Cierre de la inspección', 'Revisión final'][draft.step]}</h2><p>{stepDescriptions[draft.step][1]}</p></div><span className="heading-icon">{draft.step === 0 ? <ClipboardList size={25} /> : draft.step === 1 ? <Camera size={25} /> : draft.step === 4 ? <FileCheck2 size={25} /> : <FileText size={25} />}</span></div>

              {draft.step === 0 && <div className="form-body">
                <SectionTitle icon={<Building2 size={19} />} title="Empresa e instalación" subtitle="El contexto de tu inspección." />
                <div className="field-grid company-grid">{formField('company', 'Razón social', 'Nombre de la empresa')}{formField('ruc', 'RUC', '11 dígitos', false)}</div>
                <div className="field-grid">{formField('facility', 'Instalación / sede', 'Ej. Planta principal — Lima')}{formField('area', 'Área a inspeccionar', 'Ej. Almacén y despacho')}</div>
                <div className="field-grid type-grid"><fieldset className="field type-field"><legend>Tipo de inspección<span className="required">*</span></legend><div className="segmented">{(['Instalaciones', 'Actividades y tareas'] as const).map(type => <button key={type} type="button" aria-pressed={draft.type === type} className={draft.type === type ? 'selected' : ''} onClick={() => patch('type', type)}>{type === 'Instalaciones' ? <Building2 size={15} /> : <ClipboardCheck size={15} />}{type}</button>)}</div></fieldset>{formField('date', 'Fecha de inspección', '', true, 'date')}</div>
                <div className="objective-field">{formField('objective', 'Objetivo de la inspección', '¿Qué buscamos identificar, verificar o mejorar en esta inspección?', true, 'text', true)}<span className="character-count">{draft.objective.length} / 1200</span></div>
                <div className="section-divider" />
                <div className="responsible-heading"><SectionTitle icon={<UsersRound size={19} />} title="Responsables" subtitle="Personas que recibirán el informe de inspección." /><button className="text-button" onClick={() => patch('responsibles', [...draft.responsibles, newResponsible()])}><Plus size={16} />Añadir</button></div>
                <div className="responsibles">{draft.responsibles.map((r, i) => <div className="responsible-row" key={r.id}><span className="responsible-number">{i + 1}</span><div className="field-grid"><Field label="Nombre completo" required error={errors[`name-${r.id}`]}>{props => <input {...props} placeholder="Nombre del responsable" value={r.name} maxLength={250} onChange={e => { patch('responsibles', draft.responsibles.map(item => item.id === r.id ? { ...item, name: e.target.value } : item)); setErrors(old => ({ ...old, [`name-${r.id}`]: '' })); }} />}</Field><Field label="Correo electrónico" required error={errors[`email-${r.id}`]}>{props => <div className="input-icon"><Mail size={16} /><input {...props} type="email" placeholder="nombre@empresa.com" value={r.email} maxLength={250} onChange={e => { patch('responsibles', draft.responsibles.map(item => item.id === r.id ? { ...item, email: e.target.value } : item)); setErrors(old => ({ ...old, [`email-${r.id}`]: '' })); }} /></div>}</Field></div>{draft.responsibles.length > 1 && <button className="icon-button delete-button" aria-label={`Eliminar responsable ${i + 1}`} onClick={() => patch('responsibles', draft.responsibles.filter(item => item.id !== r.id))}><Trash2 size={16} /></button>}</div>)}</div>
                {errors.responsibles && <p className="error-message">{errors.responsibles}</p>}
                <div className="inline-note"><Info size={15} /><span>Puedes añadir a más de un responsable para mantener al equipo informado.</span></div>
              </div>}

              {draft.step === 1 && <div className="form-body observation-body">
                <div className="observation-intro"><span className="subtle-label">{draft.observations.length} {draft.observations.length === 1 ? 'observación registrada' : 'observaciones registradas'}</span><span className="optional-label">Las fotos son opcionales</span></div>
                {draft.observations.map((o, i) => <section key={o.id} className="observation-card"><div className="observation-heading"><span className="observation-index">{String(i + 1).padStart(2, '0')}</span><h3>Observación {i + 1}</h3><Badge severity={o.severity} /><button className="icon-button delete-button" aria-label={`Eliminar observación ${i + 1}`} onClick={() => { patch('observations', draft.observations.filter(item => item.id !== o.id)); }}><Trash2 size={17} /></button></div>
                  <Field label="Descripción de la observación" required error={errors[`description-${o.id}`]}>{props => <textarea {...props} rows={3} maxLength={5000} placeholder="Describe la condición o el acto identificado. Sé concreto: qué sucede y dónde." value={o.description} onChange={e => changeObservation(o.id, { description: e.target.value })} />}</Field>
                  <Field label="Medida correctiva" required error={errors[`action-${o.id}`]}>{props => <textarea {...props} rows={2} maxLength={5000} placeholder="¿Qué acción se debe realizar para corregirlo?" value={o.correctiveAction} onChange={e => changeObservation(o.id, { correctiveAction: e.target.value })} />}</Field>
                  <div className="field-grid"><fieldset className="field"><legend>Nivel de criticidad<span className="required">*</span></legend><div className="severity-options">{(['baja', 'media', 'alta'] as const).map(s => <button type="button" key={s} aria-pressed={o.severity === s} className={`severity-choice severity-${s} ${o.severity === s ? 'chosen' : ''}`} onClick={() => changeObservation(o.id, { severity: s })}><span />{s === 'alta' ? 'Alta' : s === 'media' ? 'Media' : 'Baja'}{o.severity === s && <Check size={12} />}</button>)}</div></fieldset><Field label="Fecha de compromiso" required error={errors[`date-${o.id}`]}>{props => <input {...props} type="date" value={o.dueDate} onChange={e => changeObservation(o.id, { dueDate: e.target.value })} />}</Field></div>
                  <div className="evidence-label"><span>Evidencia fotográfica</span><span>{o.photos.length} / 8</span></div>
                  <div className="photos-grid">{o.photos.map((photo, pi) => <div className="photo-thumb" key={photo.id}><button className="photo-preview" aria-label={`Ver foto ${pi + 1} de observación ${i + 1}`} onClick={() => setPreviewPhoto(photo)}><img src={photo.data} alt={`Evidencia ${pi + 1}: ${photo.name}`} /></button><button className="photo-remove" aria-label={`Eliminar foto ${pi + 1} de observación ${i + 1}`} onClick={() => changeObservation(o.id, { photos: o.photos.filter(p => p.id !== photo.id) })}><X size={13} /></button></div>)}{o.photos.length < 8 && <label className={`upload-zone ${o.photos.length ? 'upload-small' : ''} ${photoBusy === o.id ? 'upload-busy' : ''}`}>{photoBusy === o.id ? <LoaderCircle className="spin" size={24} /> : <ImagePlus size={24} />}<strong>{photoBusy === o.id ? 'Procesando fotos…' : 'Añadir fotos'}</strong>{!o.photos.length && <span>Desde tu cámara o galería · JPG, PNG o WebP, hasta 15 MB</span>}<input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={photoBusy !== null} aria-label={`Añadir fotos a observación ${i + 1}`} onChange={e => { void addPhotos(o, e.target.files); e.target.value = ''; }} /></label>}</div>
                </section>)}
                {!draft.observations.length && <div className="empty-observations"><span className="empty-icon"><Camera size={30} strokeWidth={1.5} /></span><h3>Cada detalle cuenta</h3><p>Añade tu primer hallazgo y acompáñalo con fotos,<br className="desktop-break" /> una medida correctiva y su fecha de compromiso.</p></div>}
                <button className="add-observation" onClick={() => { patch('observations', [...draft.observations, newObservation()]); patch('noFindings', false); }}><Plus size={18} />Añadir observación</button>
                {!draft.observations.length && <label className="checkbox-row"><input type="checkbox" checked={draft.noFindings} onChange={e => { patch('noFindings', e.target.checked); setErrors({}); }} /><span>No se identificaron observaciones durante la inspección.</span></label>}
                {errors.observations && <div className="error-message" role="alert">{errors.observations}</div>}
              </div>}

              {draft.step === 2 && <div className="form-body"><div className="summary-stats"><div><strong>{draft.observations.length.toString().padStart(2, '0')}</strong><span>Observaciones</span></div>{(['alta', 'media', 'baja'] as const).map(s => <div key={s}><strong className={`count-${s}`}>{counts[s].toString().padStart(2, '0')}</strong><Badge severity={s} /></div>)}</div>
                {!draft.observations.length ? <div className="success-note"><CircleCheck size={22} /><div><strong>Sin observaciones registradas</strong><p>Confirmaste que no se identificaron hallazgos durante la inspección.</p></div></div> : draft.observations.map((o, i) => <div className="review-observation" key={o.id}><div className="review-observation-top"><span className="observation-index">{String(i + 1).padStart(2, '0')}</span><Badge severity={o.severity} /><button className="text-button" onClick={() => goToStep(1)}><Pencil size={14} />Editar</button></div><h3>{o.description}</h3><p><span>Medida correctiva</span>{o.correctiveAction}</p><div className="review-meta"><CalendarDays size={15} />Compromiso: {formatDate(o.dueDate)}<span /><Camera size={15} />{o.photos.length} {o.photos.length === 1 ? 'foto' : 'fotos'}</div>{o.photos.length > 0 && <div className="review-photos">{o.photos.map(p => <button key={p.id} aria-label={`Ver evidencia ${p.name}`} onClick={() => setPreviewPhoto(p)}><img src={p.data} alt={p.name} /></button>)}</div>}</div>)}
                <button className="button button-outline full-width" onClick={() => goToStep(1)}><Plus size={17} />{draft.observations.length ? 'Añadir o editar observaciones' : 'Añadir una observación'}</button>
              </div>}

              {draft.step === 3 && <div className="form-body"><SectionTitle icon={<FileText size={19} />} title="Conclusiones y recomendaciones" subtitle="Cierra la inspección con acciones claras para tu equipo." />{formField('conclusions', 'Conclusiones', '¿Cuál es el estado general de las instalaciones o actividades inspeccionadas?', true, 'text', true)}{formField('recommendations', 'Recomendaciones', 'Indica las mejoras y acciones de seguimiento que recomiendas.', true, 'text', true)}<div className="section-divider" /><SectionTitle icon={<UserRound size={19} />} title="Realizado por" subtitle="Datos de la persona que realizó la inspección." /><div className="field-grid">{formField('inspector', 'Nombre completo', 'Nombre del inspector')}{formField('inspectorEmail', 'Correo del inspector', 'nombre@empresa.com', false, 'email')}</div><div className="inline-note"><Info size={15} />Estos datos se incluirán en el informe de inspección.</div></div>}

              {draft.step === 4 && <div className="form-body final-body"><div className="ready-banner"><span><CheckCheck size={27} /></span><div><h3>Una inspección. Un entorno más seguro.</h3><p>Revisa los últimos detalles antes de compartir tu informe.</p></div></div>
                <div className="final-section"><div className="final-section-heading"><h3><Building2 size={18} />Datos de la inspección</h3><button className="text-button" onClick={() => goToStep(0)}><Pencil size={14} />Editar</button></div><dl className="details-grid"><div><dt>Empresa</dt><dd>{draft.company}</dd></div><div><dt>RUC</dt><dd>{draft.ruc || 'No indicado'}</dd></div><div><dt>Instalación / sede</dt><dd>{draft.facility}</dd></div><div><dt>Área</dt><dd>{draft.area}</dd></div><div><dt>Tipo</dt><dd>{draft.type}</dd></div><div><dt>Fecha</dt><dd>{formatDate(draft.date)}</dd></div><div className="detail-full"><dt>Objetivo</dt><dd>{draft.objective}</dd></div></dl></div>
                <div className="final-section"><div className="final-section-heading"><h3><ClipboardCheck size={18} />Observaciones registradas</h3><button className="text-button" onClick={() => goToStep(2)}>Ver detalle<ArrowRight size={14} /></button></div><div className="final-counts"><strong>{draft.observations.length} en total</strong>{(['alta', 'media', 'baja'] as const).map(s => <span key={s}><Badge severity={s} />{counts[s]}</span>)}</div></div>
                <div className="final-section"><div className="final-section-heading"><h3><FileText size={18} />Cierre</h3><button className="text-button" onClick={() => goToStep(3)}><Pencil size={14} />Editar</button></div><div className="closing-text"><span>Conclusiones</span><p>{draft.conclusions}</p><span>Recomendaciones</span><p>{draft.recommendations}</p></div><div className="inspector-signature"><span className="avatar avatar-small">{initials(draft.inspector)}</span><div><strong>{draft.inspector}</strong><span>Realizó la inspección{draft.inspectorEmail ? ` · ${draft.inspectorEmail}` : ''}</span></div></div></div>
                <div className="final-section"><div className="final-section-heading"><h3><Mail size={18} />Destinatarios del informe</h3><button className="text-button" onClick={() => goToStep(0)}><Pencil size={14} />Editar</button></div><div className="recipient-list">{draft.responsibles.map(r => <div key={r.id}><span className="avatar avatar-small">{initials(r.name)}</span><span><strong>{r.name}</strong><small>{r.email}</small></span></div>)}</div></div>
                <div className="export-panel"><div className="excel-icon"><FileSpreadsheet size={25} /></div><div><strong>Tu informe en Excel</strong><p>Formato provisional con tus datos y fotografías.</p></div><button className="button button-primary" disabled={busy} onClick={() => void download()}>{busy ? <LoaderCircle className="spin" size={16} /> : <Download size={16} />}{busy ? 'Generando…' : 'Descargar Excel'}</button></div><div className="inline-note"><Info size={15} /><span>El envío por correo está pendiente de conexión. Por ahora, descarga el informe y compártelo con los responsables.</span></div>
              </div>}

              <div className="form-footer"><span><span className="required">*</span> Campos obligatorios</span><span><LockKeyhole size={13} />Borrador privado en este navegador</span></div>
            </div>
            <div className="wizard-actions"><button className="button button-back" disabled={draft.step === 0} onClick={() => goToStep(draft.step - 1)}><ArrowLeft size={17} />Anterior</button><span className="step-counter">Paso {draft.step + 1} de 5</span>{draft.step < 4 ? <button className="button button-primary next-button" disabled={!!photoBusy || !loaded} onClick={() => goToStep(draft.step + 1)}>Continuar<ArrowRight size={17} /></button> : <button className="button button-primary next-button" onClick={() => setModal('send')}>Enviar inspección<Send size={16} /></button>}</div>
          </div>

          <aside className="context-column"><div className="context-card"><div className="context-top"><span className="context-leaf"><Leaf size={21} strokeWidth={1.7} /></span><span>MENOS TRÁMITES, MÁS PREVENCIÓN</span></div><h3>Un espacio seguro<br />se construye<br /><span>paso a paso.</span></h3><p>Registra lo importante.<br />Nosotros te ayudamos a ordenarlo.</p><div className="context-illustration" aria-hidden="true"><div className="illustration-orbit orbit-1" /><div className="illustration-orbit orbit-2" /><div className="illustration-paper"><span /><span /><span /><span /><div><Check size={20} /></div></div><div className="illustration-shield"><ShieldCheck size={37} strokeWidth={1.4} /></div><span className="illustration-star star-1">✦</span><span className="illustration-star star-2">✦</span></div></div>
            <div className="registration-card"><div className="registration-title"><h3>Tu inspección</h3><span className="live-dot" /></div><dl><div><dt>Instalación</dt><dd>{draft.facility || 'Por definir'}</dd></div><div><dt>Tipo</dt><dd>{draft.type}</dd></div><div><dt>Responsables</dt><dd>{draft.responsibles.filter(r => r.name.trim() && emailValid(r.email)).length} asignados</dd></div><div><dt>Observaciones</dt><dd>{draft.observations.length} registradas</dd></div></dl><div className="registration-progress"><span>Progreso del registro<strong>{(draft.step + 1) * 20}%</strong></span><div><span style={{ width: `${(draft.step + 1) * 20}%` }} /></div></div></div>
            <div className="tip-card"><span className="tip-icon"><Sparkles size={18} /></span><div><h4>Un detalle que hace la diferencia</h4><p>{draft.step === 0 ? 'Un objetivo claro te ayudará a enfocar la inspección y obtener mejores resultados.' : draft.step === 1 ? 'Fotografía el contexto y el detalle del hallazgo. Una buena evidencia facilita la corrección.' : draft.step === 3 ? 'Las recomendaciones concretas ayudan a que cada hallazgo se convierta en una mejora.' : 'Revisa que las fechas y las medidas correctivas sean claras para los responsables.'}</p></div></div>
          </aside></div>
          <footer className="page-footer"><span>Hecho para cuidar a las personas.</span><span>Berry Safety Workspace<ShieldCheck size={13} /></span></footer>
        </> : <>
          <div className="page-heading"><div><div className="eyebrow"><span />TU ESPACIO DE SEGURIDAD</div><h1>Mis inspecciones</h1><p>Cada registro, un paso hacia un trabajo más seguro.</p></div><button className="button button-primary" onClick={() => void startNew()}><Plus size={17} />Nueva inspección</button></div>
          <div className="list-stats"><div><span className="list-stat-icon"><ClipboardList size={22} /></span><div><strong>{inspections.length}</strong><span>Inspecciones</span></div></div><div><span className="list-stat-icon muted-icon"><Pencil size={22} /></span><div><strong>{draftCount}</strong><span>En borrador</span></div></div><div><span className="list-stat-icon green-icon"><FileCheck2 size={22} /></span><div><strong>{inspections.filter(i => i.status === 'ready').length}</strong><span>Informes preparados</span></div></div></div>
          <div className="list-card"><div className="list-toolbar"><div className="search-box"><Search size={18} /><input aria-label="Buscar inspecciones" placeholder="Buscar por empresa, instalación o área…" value={query} onChange={e => setQuery(e.target.value)} /></div><label className="filter-select"><ListFilter size={16} /><select aria-label="Filtrar por estado" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">Todos los estados</option><option value="draft">Borradores</option><option value="ready">Informes preparados</option></select></label></div>
          <div className="inspection-list">{inspections.filter(i => (filter === 'all' || i.status === filter) && `${i.company} ${i.facility} ${i.area}`.toLowerCase().includes(query.toLowerCase())).map(item => <div className="inspection-list-row" key={item.id}><div className="list-building"><Building2 size={23} /></div><div className="inspection-list-info"><strong>{item.facility || 'Inspección sin título'}</strong><span>{item.company || 'Empresa por definir'}{item.area ? ` · ${item.area}` : ''}</span><small>{formatDate(item.date)} · {item.observations.length} observaciones</small></div><span className={`list-status ${item.status === 'ready' ? 'status-ready' : ''}`}>{item.status === 'ready' ? 'Informe preparado' : 'Borrador'}</span><button className="button button-outline" onClick={() => { setDraft(item); setView('editor'); setErrors({}); top(); }}>{item.status === 'ready' ? 'Ver informe' : 'Continuar'}<ArrowRight size={15} /></button><button className="icon-button delete-button" aria-label={`Eliminar inspección ${item.facility || 'sin título'}`} onClick={() => setDeleteTarget(item)}><Trash2 size={17} /></button></div>)}</div>
          {inspections.filter(i => (filter === 'all' || i.status === filter) && `${i.company} ${i.facility} ${i.area}`.toLowerCase().includes(query.toLowerCase())).length === 0 && <div className="empty-list"><Search size={32} /><h3>No encontramos inspecciones</h3><p>Prueba con otra búsqueda o crea una nueva inspección.</p></div>}</div>
          <div className="local-storage-note"><LockKeyhole size={15} />Tus inspecciones se guardan solo en este navegador y dispositivo.</div>
        </>}
      </main>
    </div>

    {toast && <div className="toast" role="status"><Info size={18} /><span>{toast}</span><button aria-label="Cerrar aviso" onClick={() => setToast('')}><X size={16} /></button></div>}
    {modal === 'help' && <Modal title="Una inspección, paso a paso" onClose={() => setModal(null)}><p className="modal-description">Lo importante es lo que observas. Berry te ayuda a darle forma.</p><ol className="help-steps">{['Define la empresa, la instalación, el objetivo y los responsables.', 'Añade tus observaciones, fotos y medidas correctivas. Selecciona la criticidad y una fecha de compromiso.', 'Revisa el resumen de los hallazgos.', 'Completa las conclusiones, recomendaciones y los datos del inspector.', 'Revisa los destinatarios y descarga el informe Excel.'].map((text, i) => <li key={text}><span>{i + 1}</span><div><strong>{stepNames[i]}</strong><p>{text}</p></div></li>)}</ol><div className="notice"><Info size={19} /><p>Los borradores se guardan automáticamente en este navegador. El envío por correo y la plantilla oficial se incorporarán en una siguiente etapa.</p></div><button className="button button-primary full-width" onClick={() => setModal(null)}>Entendido<Check size={16} /></button></Modal>}
    {modal === 'profile' && <Modal title="Tu perfil" onClose={() => setModal(null)}><div className="profile-modal-avatar">{initials(profileForm.name)}</div><p className="modal-description centered">Estos datos se usarán al crear nuevas inspecciones.<br />Este es un perfil local, sin inicio de sesión.</p><Field label="Nombre completo" required>{props => <input {...props} autoComplete="name" value={profileForm.name} maxLength={250} onChange={e => setProfileForm(p => ({ ...p, name: e.target.value }))} />}</Field><Field label="Correo electrónico" hint="Opcional. Aparecerá como correo del inspector.">{props => <input {...props} type="email" autoComplete="email" placeholder="nombre@empresa.com" value={profileForm.email} maxLength={250} onChange={e => setProfileForm(p => ({ ...p, email: e.target.value }))} />}</Field>{profileError && <p className="error-message" role="alert">{profileError}</p>}<button className="button button-primary full-width" onClick={saveProfile}>Guardar perfil<Check size={16} /></button></Modal>}
    {modal === 'send' && <Modal title="Compartir tu inspección" onClose={() => setModal(null)}><div className="send-illustration"><Mail size={34} /></div><h3 className="centered">Tu informe ya tiene destinatarios</h3><p className="modal-description centered">El envío por correo aún no está habilitado. Por ahora, puedes descargar el Excel y compartirlo con los responsables.</p><div className="send-recipients">{draft.responsibles.map(r => <div key={r.id}><Mail size={16} /><span><strong>{r.name}</strong><small>{r.email}</small></span></div>)}</div><button className="button button-primary full-width" disabled={busy} onClick={() => void download()}>{busy ? <LoaderCircle className="spin" size={16} /> : <ArrowDownToLine size={16} />}{busy ? 'Generando informe…' : 'Descargar informe Excel'}</button><p className="send-status"><Info size={14} />No se ha enviado ningún correo.</p></Modal>}
    {previewPhoto && <Modal title="Evidencia fotográfica" wide onClose={() => setPreviewPhoto(null)}><img className="photo-full" src={previewPhoto.data} alt={previewPhoto.name} /><p className="photo-caption">{previewPhoto.name}</p></Modal>}
    {deleteTarget && <Modal title="Eliminar inspección" onClose={() => setDeleteTarget(null)}><p className="modal-description">Se eliminará «{deleteTarget.facility || 'Inspección sin título'}» y sus fotografías de este navegador. Esta acción no se puede deshacer.</p><div className="modal-actions"><button className="button button-outline" onClick={() => setDeleteTarget(null)}>Conservar inspección</button><button className="button button-danger" onClick={async () => { try { await removeInspection(deleteTarget.id); setInspections(items => items.filter(i => i.id !== deleteTarget.id)); if (draft.id === deleteTarget.id) setDraft(newInspection(profile)); setDeleteTarget(null); setToast('Inspección eliminada.'); } catch { setToast('No pudimos eliminar la inspección. Inténtalo de nuevo.'); } }}><Trash2 size={16} />Eliminar</button></div></Modal>}
  </div>;
}
