import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, Building2, CalendarDays, Camera, Check, CheckCheck, ChevronRight, CircleCheck, ClipboardCheck, ClipboardList, Download, FileCheck2, FileSpreadsheet, FileText, HelpCircle, ImagePlus, Info, LayoutGrid, Leaf, ListFilter, LoaderCircle, LockKeyhole, Mail, Menu, MoreHorizontal, Pencil, Plus, Save, Search, Send, ShieldCheck, Settings2, Sparkles, Trash2, X } from 'lucide-react';
import { Badge, Brand, Field, Modal, Stepper } from './components';
import { PhotoViewer } from './PhotoViewer';
import type { Evidence, Inspection, Observation } from './model';
import { emailValid, formatDate, initials, hasInspectionContent, loadInspections, newInspection, newObservation, setObservationClosingDate, persistInspection, preparePhoto, removeInspection, stepNames, validateStep } from './model';
import { exportExcel } from './export';
import { GeneralSection } from './GeneralSection';
import { EMPLOYER } from './employer';
import { pendingCodeLabel, confirmedInspectionCode } from './inspection-code';
import { formatInspectionTime } from './inspection-time';
import { InspectionCodeBadge } from './InspectionCodeBadge';
import { ClosingSection } from './ClosingSection';
import type { RegistrationDetails } from './registration';
import { closingRemarksOf, registrationPeople } from './registration';
import { FollowUp } from './FollowUp';
import { deliverInspection, inspectionClosed, isRecipient, needsReview, workflowLabel } from './follow-up';
import { Administration, MicrosoftAccess } from './Administration';
import { readAccounts, activeAccountId, selectTestAccount, updateOwnProfile } from './accounts';
import type { DemoAccount } from './accounts';

const stepDescriptions = [
  ['El primer paso para un entorno más seguro.', 'Cuéntanos dónde se realizará la inspección y quiénes serán los responsables.'],
  ['Observa. Registra. Previene.', 'Documenta cada hallazgo con evidencias claras y una acción para resolverlo.'],
  ['Una mirada a tus hallazgos.', 'Revisa las observaciones antes de completar las conclusiones de la inspección.'],
  ['Convierte los hallazgos en mejoras.', 'Comparte tus conclusiones, recomendaciones y los datos de quien realizó la inspección.'],
  ['Todo listo para el siguiente paso.', 'Verifica la información y descarga el informe para compartirlo con tu equipo.'],
];

export default function App() {
  const [initial] = useState(() => {
    try { return { accounts: readAccounts(), error: '' }; }
    catch (error) { return { accounts: [] as DemoAccount[], error: error instanceof Error ? error.message : 'Revisa la configuración de cuentas de prueba.' }; }
  });
  if (initial.error) return <main className="account-configuration-error"><Brand dark/><h1>Revisa las cuentas de prueba</h1><p role="alert">{initial.error}</p></main>;
  return <WorkspaceApp initialAccounts={initial.accounts}/>;
}

function WorkspaceApp({ initialAccounts }: { initialAccounts: DemoAccount[] }) {
  const [accounts, setAccounts] = useState(initialAccounts);
  const [activeId, setActiveId] = useState(() => activeAccountId(initialAccounts));
  const account = accounts.find(a => a.id === activeId && a.enabled) || accounts[0];
  const isAdmin = account.role === 'admin';
  const profile = { name: account.name, email: account.email, area: account.area, jobTitle: account.jobTitle, accountId: account.id };
  const activeIdRef = useRef(account.id); activeIdRef.current = account.id;
  const [draft, setDraft] = useState<Inspection>(() => newInspection(profile));
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [received, setReceived] = useState<Inspection[]>([]);
  const [receivedFilter, setReceivedFilter] = useState<'pending' | 'closed'>('pending');
  const [followUp, setFollowUp] = useState<Inspection | null>(null);
  const [followUpOrigin, setFollowUpOrigin] = useState<'list' | 'received'>('list');
  const startedDraftIds = useRef(new Set<string>());
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<'editor' | 'list' | 'admin' | 'received' | 'followup'>('editor');
  const [menuOpen, setMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 899px)').matches);
  const [modal, setModal] = useState<'help' | 'profile' | 'send' | null>(null);
  const [profileForm, setProfileForm] = useState(profile);
  const [profileError, setProfileError] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error' | 'empty'>('empty');
  const [storageError, setStorageError] = useState(false);
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState<string | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<Evidence | null>(null);
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
    const refresh = () => {
      try { const next = readAccounts(); setAccounts(next); setActiveId(activeAccountId(next)); }
      catch { setToast('No se pudo leer la configuración de cuentas.'); }
    };
    window.addEventListener('berry-accounts-changed', refresh);
    window.addEventListener('storage', refresh);
    return () => { window.removeEventListener('berry-accounts-changed', refresh); window.removeEventListener('storage', refresh); };
  }, []);

  useEffect(() => {
    let active = true;
    setLoaded(false); setView('editor'); setErrors({}); setReceivedFilter('pending');
    setProfileForm({ name: account.name, email: account.email, area: account.area, jobTitle: account.jobTitle, accountId: account.id });
    loadInspections().then(items => {
      if (!active) return;
      const owned = items.filter(item => item.ownerId === account.id);
      owned.filter(hasInspectionContent).forEach(item => startedDraftIds.current.add(item.id));
      setInspections(owned); setReceived(items.filter(item => isRecipient(item, account.id))); setDraft(owned.find(i => !i.delivery) || newInspection(profile)); setFollowUp(null); setLoaded(true);
    }).catch(() => { if (active) { setInspections([]); setDraft(newInspection(profile)); setStorageError(true); setLoaded(true); } });
    return () => { active = false; };
  }, [account.id]);

  useEffect(() => {
    if (!loaded) return;
    setDraft(d => d.ownerId !== account.id || d.delivery || (d.inspector === account.name && d.inspectorEmail === account.email) ? d : { ...d, inspector: account.name, inspectorEmail: account.email, updatedAt: new Date().toISOString() });
  }, [loaded, account.id, account.name, account.email, draft.id]);

  useEffect(() => {
    if (!loaded || draft.step !== 3 || draft.delivery) return;
    setDraft(d => {
      const records = { ...d.registrationDetails }; let changed = false;
      for (const person of registrationPeople(d)) {
        if (!records[person.id]) {
          const accountPerson = accounts.find(a => a.id === person.id || a.email.toLowerCase() === person.email.toLowerCase());
          records[person.id] = { jobTitle: accountPerson?.jobTitle || person.jobTitle || '', initialJobTitle: accountPerson?.jobTitle || person.jobTitle || '', date: d.date }; changed = true;
        }
      }
      return changed ? { ...d, registrationDetails: records } : d;
    });
  }, [loaded, draft.id, draft.step, draft.additionalInspectors, accounts]);
  const changeRegistrationDetails = (inspectionId: string, personId: string, data: RegistrationDetails) => {
    setDraft(d => d.id === inspectionId ? { ...d, registrationDetails: { ...d.registrationDetails, [personId]: data }, updatedAt: new Date().toISOString(), status: 'draft' } : d);
  };

  const save = useCallback(async (item: Inspection) => {
    if (item.delivery) return true;
    const hasContent = hasInspectionContent(item);
    if (!hasContent && !startedDraftIds.current.has(item.id)) { setSaveState('empty'); return true; }
    startedDraftIds.current.add(item.id);
    setSaveState('saving');
    try {
      await persistInspection(item);
      if (item.ownerId === activeIdRef.current) setInspections(items => (hasContent ? [item, ...items.filter(i => i.id !== item.id)] : items.filter(i => i.id !== item.id)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
      if (!hasContent) startedDraftIds.current.delete(item.id);
      setSaveState(hasContent ? 'saved' : 'empty'); setStorageError(false);
      return true;
    } catch { setSaveState('error'); setStorageError(true); return false; }
  }, []);

  useEffect(() => {
    if (!loaded || draft.ownerId !== account.id || draft.delivery) return;
    if (!hasInspectionContent(draft) && !startedDraftIds.current.has(draft.id)) { setSaveState('empty'); return; }
    setSaveState('saving');
    const timer = window.setTimeout(() => { void save(draft); }, 650);
    return () => clearTimeout(timer);
  }, [draft, loaded, save, account.id]);

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
      if (saveState === 'saving' || saveState === 'error') event.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [saveState]);

  const patch = <K extends keyof Inspection>(key: K, value: Inspection[K]) => {
    setDraft(d => ({ ...d, [key]: value, status: 'draft', updatedAt: new Date().toISOString() }));
    setErrors(e => { const next = { ...e }; delete next[key]; if (key === 'responsibles') Object.keys(next).filter(k => k.startsWith('person-')).forEach(k => delete next[k]); if (key === 'additionalInspectors') Object.keys(next).filter(k => k.startsWith('inspector-')).forEach(k => delete next[k]); return next; });
  };
  const changeObservation = (observationId: string, changes: Partial<Observation>) => {
    setDraft(d => ({ ...d, observations: d.observations.map(o => o.id === observationId ? { ...o, ...changes } : o), status: 'draft', updatedAt: new Date().toISOString() }));
    setErrors(e => Object.fromEntries(Object.entries(e).filter(([key]) => !key.endsWith(observationId))));
  };
  const changeClosingDate = (observationId: string, date: string) => {
    setDraft(d => ({ ...setObservationClosingDate(d, observationId, date), status: 'draft', updatedAt: new Date().toISOString() }));
    setErrors(e => Object.fromEntries(Object.entries(e).filter(([key]) => !key.startsWith('date-'))));
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
  const refreshInspections = async () => {
    const items = await loadInspections();
    setInspections(items.filter(i => i.ownerId === account.id));
    setReceived(items.filter(i => isRecipient(i, account.id)));
  };
  const showList = async () => {
    if (!await save(draft)) return;
    await refreshInspections(); setView('list'); setMenuOpen(false); top();
  };
  const showReceived = async () => {
    if (!await save(draft)) return;
    await refreshInspections(); setView('received'); setMenuOpen(false); top();
  };
  const openFollowUp = (item: Inspection, origin: 'list' | 'received') => {
    setFollowUp(item); setFollowUpOrigin(origin); setView('followup'); setMenuOpen(false); top();
  };
  const updateFollowUp = (item: Inspection) => {
    setFollowUp(item);
    setInspections(items => items.map(i => i.id === item.id ? item : i));
    setReceived(items => items.map(i => i.id === item.id ? item : i));
    if (draft.id === item.id) setDraft(item);
  };
  const sendInspection = async () => {
    setBusy(true);
    try {
      if (!await save(draft)) throw new Error('No se pudo guardar el informe antes del envío.');
      const sent = await deliverInspection(draft, account.id);
      setDraft(sent); setModal(null); await refreshInspections(); openFollowUp(sent, 'list');
      setToast('Inspección disponible en la cuenta destinataria de este navegador. No se envió correo.');
    } catch (error) { setToast(error instanceof Error ? error.message : 'No se pudo enviar la inspección.'); }
    finally { setBusy(false); }
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
      setDraft(ready); await save(ready); setToast('Borrador descargado. El código definitivo se asignará al registrar el envío.');
    } catch { setToast('No pudimos generar el Excel. Inténtalo de nuevo; tus datos se conservan.'); }
    finally { setBusy(false); }
  };
  const saveProfile = () => {
    try {
      const next = updateOwnProfile(account.id, profileForm.name, profileForm.area, profileForm.jobTitle);
      setAccounts(next); setModal(null); setProfileError('');
      if (!draft.area && !draft.observations.length) setDraft(d => ({ ...d, inspector: profileForm.name.trim(), inspectorEmail: account.email, updatedAt: new Date().toISOString() }));
      setToast('Perfil actualizado. El correo corresponde a tu cuenta.');
    } catch (error) { setProfileError(error instanceof Error ? error.message : 'No pudimos guardar el perfil.'); }
  };
  const switchAccount = async (id: string) => {
    if (id === account.id) return;
    if (busy || photoBusy) { setToast('Espera a que termine de procesarse el archivo antes de cambiar de cuenta.'); return; }
    if (!await save(draft)) { setToast('Guarda el borrador antes de cambiar de cuenta.'); return; }
    try { selectTestAccount(id); setLoaded(false); setActiveId(id); setView('editor'); setMenuOpen(false); setProfileError(''); }
    catch (error) { setToast(error instanceof Error ? error.message : 'No se pudo cambiar la cuenta.'); }
  };
  const showAdmin = async () => { if (!isAdmin) return; await save(draft); setView('admin'); setMenuOpen(false); top(); };
  const pendingReceivedCount = received.filter(item => !inspectionClosed(item)).length;
  const visibleReceived = received.filter(item => receivedFilter === 'closed' ? inspectionClosed(item) : !inspectionClosed(item));
  const reviewCount = inspections.filter(needsReview).length;
  const draftCount = inspections.filter(d => !d.delivery).length;
  const matches = (i: Inspection) => (filter === 'all' || (filter === 'draft' && !i.delivery) || (filter === 'pending' && i.delivery && !inspectionClosed(i) && !needsReview(i)) || (filter === 'review' && needsReview(i)) || (filter === 'closed' && inspectionClosed(i))) && `${i.company} ${i.facility} ${i.area}`.toLowerCase().includes(query.toLowerCase());
  const counts = { alta: draft.observations.filter(o => o.severity === 'alta').length, media: draft.observations.filter(o => o.severity === 'media').length, baja: draft.observations.filter(o => o.severity === 'baja').length };


  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Ir al contenido</a>
    {menuOpen && <div className="sidebar-scrim" onClick={() => setMenuOpen(false)} />}
    <aside ref={sidebarRef} className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`} aria-label="Menú principal" role={isMobile && menuOpen ? 'dialog' : undefined} aria-modal={isMobile && menuOpen ? true : undefined} inert={!menuOpen && isMobile ? true : undefined}>
      <div className="sidebar-brand"><Brand /><button className="mobile-close icon-button" aria-label="Cerrar menú" onClick={() => setMenuOpen(false)}><X size={20} /></button></div>
      <button className="user-card" onClick={() => { setProfileForm(profile); setProfileError(''); setModal('profile'); setMenuOpen(false); }} aria-label="Editar mi perfil"><span className="avatar">{initials(profile.name)}</span><span className="user-details"><strong>{profile.name}</strong><span>{isAdmin ? 'Administrador' : 'Inspecciones'}{account.area ? ` · ${account.area}` : ''}</span></span><MoreHorizontal size={18} /></button>
      <div className="sidebar-divider" />
      <div className="nav-caption">ESPACIO DE TRABAJO</div>
      <nav className="sidebar-nav">
        <button className={view === 'editor' ? 'active' : ''} onClick={() => { if (view !== 'editor') void startNew(); else setMenuOpen(false); }}><ClipboardCheck size={19} /><span>Nueva inspección</span><Plus size={15} /></button>
        <button aria-label="Mis inspecciones" className={view === 'list' ? 'active' : ''} onClick={() => void showList()}><LayoutGrid size={19} /><span>Mis inspecciones</span>{reviewCount > 0 && <span className="nav-count">{reviewCount}</span>}</button>
        <button aria-label="Inspecciones recibidas" className={view === 'received' ? 'active' : ''} onClick={() => void showReceived()}><Mail size={19}/><span>Inspecciones recibidas</span>{pendingReceivedCount > 0 && <span className="nav-count">{pendingReceivedCount}</span>}</button>
        {isAdmin && <button className={view === 'admin' ? 'active' : ''} onClick={() => void showAdmin()}><Settings2 size={19}/><span>Administración</span></button>}
      </nav>
      <div className="sidebar-bottom"><div className="prevention-card"><div className="prevention-art"><ShieldCheck size={32} strokeWidth={1.4} /><span /><span /></div><h3>La prevención<br />empieza contigo.</h3><p>Cada observación es una oportunidad para cuidar a tu equipo.</p><div className="small-line" /></div><button className="help-button" onClick={() => { setModal('help'); setMenuOpen(false); }}><HelpCircle size={18} /><span>¿Necesitas una mano?</span><ArrowUpRight size={15} /></button><div className="sidebar-footer"><span className="online-dot" />Tu espacio de seguridad<span>v0.1</span></div></div>
    </aside>

    <div className="workspace">
      <header className="topbar"><div className="topbar-left"><button className="menu-toggle icon-button" aria-label="Abrir menú" aria-expanded={menuOpen} onClick={() => setMenuOpen(v => !v)}><Menu size={23} /></button><span className="breadcrumb-parent">Espacio de trabajo</span><ChevronRight className="breadcrumb-separator" size={14} /><span className="breadcrumb-current">{view === 'editor' ? 'Nueva inspección' : view === 'admin' ? 'Administración' : view === 'received' ? 'Inspecciones recibidas' : view === 'followup' ? 'Levantamiento' : 'Mis inspecciones'}</span></div><div className="topbar-right"><span className="demo-badge header-demo-badge">Modo de prueba</span><span className={`save-status ${saveState === 'error' ? 'save-error' : ''}`} aria-live="polite">{view === 'followup' ? <Info size={15}/> : saveState === 'empty' ? <Pencil size={15}/> : saveState === 'saving' ? <LoaderCircle className="spin" size={15} /> : saveState === 'error' ? <Info size={15} /> : <CircleCheck size={16} />}<span>{view === 'followup' ? 'Guarda cada avance' : saveState === 'empty' ? 'Sin iniciar' : saveState === 'saving' ? 'Guardando…' : saveState === 'error' ? 'Sin guardar' : 'Guardado en este navegador'}</span></span><div className="topbar-separator" /><button className="top-avatar" aria-label="Mi perfil" onClick={() => { setProfileForm(profile); setProfileError(''); setModal('profile'); }}>{initials(profile.name)}</button></div></header>

      <main id="main-content" className="main-content" ref={contentRef}>
        {storageError && <div className="notice notice-error" role="alert"><Info size={19} /><div><strong>No se ha podido guardar el borrador.</strong><p>Comprueba el espacio y los permisos del navegador. Mantén esta pestaña abierta para conservar los datos.</p></div><button className="text-button" onClick={() => void save(draft)}>Reintentar</button></div>}
        {view === 'followup' && followUp ? <FollowUp inspection={followUp} actor={account} onChange={updateFollowUp} onBack={() => void (followUpOrigin === 'received' ? showReceived() : showList())}/> : view === 'received' ? <>
          <div className="page-heading"><div><div className="eyebrow">SEGUIMIENTO DE HALLAZGOS</div><h1>Inspecciones recibidas</h1><p>Revisa los informes asignados a tu cuenta y registra sus levantamientos.</p></div></div>
          <div className="notice"><Info size={18}/><p>Prueba local: los informes aparecen al cambiar entre cuentas en este navegador. El correo y la sincronización entre dispositivos siguen pendientes.</p></div>
          <div className="received-filters" role="group" aria-label="Estado de las inspecciones recibidas">{([['pending', 'Pendientes'], ['closed', 'Cerradas']] as const).map(([value, label]) => <button key={value} type="button" aria-label={label} aria-pressed={receivedFilter === value} onClick={() => setReceivedFilter(value)}>{label}</button>)}</div>
          <div className="list-card inspection-list">{visibleReceived.length === 0 ? <div className="empty-list"><Mail size={32}/><h3>{received.length === 0 ? 'No tienes inspecciones recibidas' : receivedFilter === 'pending' ? 'No tienes inspecciones pendientes' : 'No tienes inspecciones cerradas'}</h3><p>{receivedFilter === 'closed' ? 'Las inspecciones con todos sus hallazgos ejecutados aparecerán aquí.' : 'Los informes pendientes asignados a tu cuenta aparecerán aquí.'}</p></div> : visibleReceived.map(item => <div className="inspection-list-row" key={item.id}><div className="list-building"><ClipboardCheck size={23}/></div><div className="inspection-list-info"><strong>{item.area}</strong><span>{item.inspector} · {formatDate(item.date)}</span><small>{item.observations.length} observaciones · {workflowLabel(item)}</small></div><button className="button button-outline" onClick={() => openFollowUp(item, 'received')}>Revisar inspección<ArrowRight size={15}/></button></div>)}</div>
        </> : view === 'editor' ? <>
          <div className="page-heading"><div><div className="eyebrow"><span />SEGURIDAD Y SALUD EN EL TRABAJO</div><div className="title-row"><h1>Nueva inspección</h1><span className="draft-badge"><span />Borrador</span></div><p>{stepDescriptions[draft.step][0]}</p></div><button className="button button-outline save-exit" onClick={() => void showList()}><Save size={16} />Guardar y salir</button></div>
          <Stepper step={draft.step} names={stepNames} onStep={goToStep} />
          <div className="content-layout"><div className="form-column">
            <div className="form-card">
              <div className="form-card-heading"><div><span className="card-eyebrow">PASO {String(draft.step + 1).padStart(2, '0')} DE 05</span><div className="form-heading-title-row"><h2>{['Información general', 'RESULTADO DE LA INSPECCIÓN', 'Resumen de observaciones', 'Cierre de la inspección', 'Revisión final'][draft.step]}</h2>{draft.step === 0 && <InspectionCodeBadge draft={draft}/>}</div><p>{stepDescriptions[draft.step][1]}</p></div>{draft.step !== 0 && <span className="heading-icon">{draft.step === 1 ? <Camera size={25} /> : draft.step === 4 ? <FileCheck2 size={25} /> : <FileText size={25} />}</span>}</div>

              {draft.step === 0 && <GeneralSection draft={draft} errors={errors} patch={patch} />}

              {draft.step === 1 && <div className="form-body observation-body">
                <div className="observation-intro"><span className="subtle-label">{draft.observations.length} {draft.observations.length === 1 ? 'observación registrada' : 'observaciones registradas'}</span></div>
                {draft.observations.map((o, i) => <section key={o.id} className="observation-card"><div className="observation-heading"><span className="observation-index">{String(i + 1).padStart(2, '0')}</span><h3>Observación {i + 1}</h3><Badge severity={o.severity} /><button className="icon-button delete-button" aria-label={`Eliminar observación ${i + 1}`} onClick={() => { patch('observations', draft.observations.filter(item => item.id !== o.id)); }}><Trash2 size={17} /></button></div>
                  <div className="observation-layout"><div className="observation-texts"><Field label="Descripción" required error={errors[`description-${o.id}`]}>{props => <textarea {...props} rows={3} maxLength={5000} placeholder="Describe la condición o el acto identificado. Sé concreto: qué sucede y dónde." value={o.description} onChange={e => changeObservation(o.id, { description: e.target.value })} />}</Field>
                  <Field label="Acción a tomar" required error={errors[`action-${o.id}`]}>{props => <textarea {...props} rows={2} maxLength={5000} placeholder="¿Qué acción se debe realizar para corregirlo?" value={o.correctiveAction} onChange={e => changeObservation(o.id, { correctiveAction: e.target.value })} />}</Field>
                  </div><div className="observation-details"><fieldset className="field"><legend>Nivel de riesgo<span className="required">*</span></legend><div className="severity-options">{(['baja', 'media', 'alta'] as const).map(s => <button type="button" key={s} aria-pressed={o.severity === s} className={`severity-choice severity-${s} ${o.severity === s ? 'chosen' : ''}`} onClick={() => changeObservation(o.id, { severity: s })}><span />{s === 'alta' ? 'Alta' : s === 'media' ? 'Media' : 'Baja'}{o.severity === s && <Check size={12} />}</button>)}</div></fieldset><Field label="Fecha de Cierre" required error={errors[`date-${o.id}`]}>{props => <input {...props} type="date" value={o.dueDate} onChange={e => changeClosingDate(o.id, e.target.value)} />}</Field>
                  <div className="evidence-label"><span>Evidencia fotográfica</span><span>{o.photos.length} / 8</span></div>
                  <div className="photos-grid">{o.photos.map((photo, pi) => <div className="photo-thumb" key={photo.id}><button className="photo-preview" aria-label={`Ver foto ${pi + 1} de observación ${i + 1}`} onClick={() => setPreviewPhoto(photo)}><img src={photo.data} alt={`Evidencia ${pi + 1}: ${photo.name}`} /></button><button className="photo-remove" aria-label={`Eliminar foto ${pi + 1} de observación ${i + 1}`} onClick={() => changeObservation(o.id, { photos: o.photos.filter(p => p.id !== photo.id) })}><X size={13} /></button></div>)}{o.photos.length < 8 && <label className={`upload-zone ${o.photos.length ? 'upload-small' : ''} ${photoBusy === o.id ? 'upload-busy' : ''}`}>{photoBusy === o.id ? <LoaderCircle className="spin" size={24} /> : <ImagePlus size={24} />}<strong>{photoBusy === o.id ? 'Procesando fotos…' : 'Añadir fotos'}</strong>{!o.photos.length && <span>Desde tu cámara o galería · JPG, PNG o WebP, hasta 15 MB</span>}<input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={photoBusy !== null} aria-label={`Añadir fotos a observación ${i + 1}`} onChange={e => { void addPhotos(o, e.target.files); e.target.value = ''; }} /></label>}</div>
                  </div></div>
                </section>)}
                {!draft.observations.length && <div className="empty-observations"><span className="empty-icon"><Camera size={30} strokeWidth={1.5} /></span><h3>Cada detalle cuenta</h3><p>Añade tu primer hallazgo y acompáñalo con fotos.</p></div>}
                <button className="add-observation" onClick={() => { patch('observations', [...draft.observations, newObservation(draft.defaultClosingDate)]); }}><Plus size={18} />Añadir observación</button>
                {errors.observations && <div className="error-message" role="alert">{errors.observations}</div>}
              </div>}

              {draft.step === 2 && <div className="form-body summary-body"><div className="summary-stats"><div><strong>{draft.observations.length.toString().padStart(2, '0')}</strong><span>Observaciones</span></div>{(['alta', 'media', 'baja'] as const).map(s => <div key={s}><strong className={`count-${s}`}>{counts[s].toString().padStart(2, '0')}</strong><Badge severity={s} /></div>)}</div>
                {!draft.observations.length ? <div className="success-note"><CircleCheck size={22} /><div><strong>Sin observaciones registradas</strong><p>Añade una observación para continuar con el informe.</p></div></div> : <div className="review-observations-grid">{draft.observations.map((o, i) => <div className="review-observation" key={o.id}><div className="review-observation-top"><span className="observation-index">{String(i + 1).padStart(2, '0')}</span><Badge severity={o.severity} /><button className="text-button" onClick={() => goToStep(1)}><Pencil size={14} />Editar</button></div><h3>{o.description}</h3><p><span>Acción a tomar</span>{o.correctiveAction}</p><div className="review-meta"><CalendarDays size={15} />Fecha de Cierre: {formatDate(o.dueDate)}<span /><Camera size={15} />{o.photos.length} {o.photos.length === 1 ? 'foto' : 'fotos'}</div>{o.photos.length > 0 && <div className="review-photos">{o.photos.map(p => <button key={p.id} aria-label={`Ver evidencia ${p.name}`} onClick={() => setPreviewPhoto(p)}><img src={p.data} alt={p.name} /></button>)}</div>}</div>)}</div>}
                <button className="button button-outline full-width" onClick={() => goToStep(1)}><Plus size={17} />{draft.observations.length ? 'Añadir o editar observaciones' : 'Añadir una observación'}</button>
              </div>}

              {draft.step === 3 && <ClosingSection draft={draft} errors={errors} patch={patch} onRegistrationChange={(id, data) => changeRegistrationDetails(draft.id, id, data)}/>}

              {draft.step === 4 && <div className="form-body final-body"><div className="ready-banner"><span><CheckCheck size={27} /></span><div><h3>Una inspección. Un entorno más seguro.</h3><p>Revisa los últimos detalles antes de compartir tu informe.</p></div></div>
                <div className="final-section"><div className="final-section-heading"><h3><Building2 size={18} />Datos de la inspección</h3><button className="text-button" onClick={() => goToStep(0)}><Pencil size={14} />Editar</button></div><dl className="details-grid"><div><dt>Empresa</dt><dd>{EMPLOYER.name}</dd></div><div><dt>RUC</dt><dd>{EMPLOYER.ruc}</dd></div><div><dt>Código de inspección</dt><dd>{confirmedInspectionCode(draft) || pendingCodeLabel()} · {confirmedInspectionCode(draft) ? 'Registrado' : 'Tentativo'}</dd></div><div><dt>Área</dt><dd>{draft.area}</dd></div><div><dt>Tipo</dt><dd>{draft.type || 'Por definir'}{draft.type === 'Otro' ? `: ${draft.otherType}` : ''}</dd></div><div><dt>Fecha y hora</dt><dd>{formatDate(draft.date)} · {formatInspectionTime(draft.inspectionTime, draft.inspectionPeriod)}</dd></div><div className="detail-full"><dt>Objetivo</dt><dd>{draft.objective}</dd></div></dl></div>
                <div className="final-section"><div className="final-section-heading"><h3><ClipboardCheck size={18} />Observaciones registradas</h3><button className="text-button" onClick={() => goToStep(2)}>Ver detalle<ArrowRight size={14} /></button></div><div className="final-counts"><strong>{draft.observations.length} en total</strong>{(['alta', 'media', 'baja'] as const).map(s => <span key={s}><Badge severity={s} />{counts[s]}</span>)}</div></div>
                <div className="final-section"><div className="final-section-heading"><h3><FileText size={18} />Cierre</h3><button className="text-button" onClick={() => goToStep(3)}><Pencil size={14} />Editar</button></div><div className="closing-text"><span>DESCRIPCIÓN DE LA CAUSA ANTE RESULTADOS DESFAVORABLES DE LA INSPECCIÓN</span><p>{draft.unfavorableCause || 'Sin indicar'}</p><span>CONCLUSIONES Y RECOMENDACIONES</span><p>{closingRemarksOf(draft)}</p><span>RESPONSABLE DEL REGISTRO</span></div><div className="inspection-team">{registrationPeople(draft).map(person => <div className="inspector-signature" key={person.id}><span className="avatar avatar-small">{initials(person.name)}</span><div><strong>{person.name}</strong><span>{person.email}{draft.registrationDetails?.[person.id]?.jobTitle ? ` · ${draft.registrationDetails[person.id].jobTitle}` : ''} · {formatDate(draft.registrationDetails?.[person.id]?.date ?? draft.date)}</span>{draft.registrationDetails?.[person.id]?.signature && <img className="registration-review-signature" src={draft.registrationDetails[person.id].signature!.data} alt={`Firma de ${person.name}`}/>}</div></div>)}</div></div>
                <div className="final-section"><div className="final-section-heading"><h3><Mail size={18} />Destinatarios del informe</h3><button className="text-button" onClick={() => goToStep(0)}><Pencil size={14} />Editar</button></div><div className="recipient-list">{draft.responsibles.map(r => <div key={r.id}><span className="avatar avatar-small">{initials(r.name)}</span><span><strong>{r.name}</strong><small>{r.email}</small></span></div>)}</div></div>
                <div className="export-panel"><div className="excel-icon"><FileSpreadsheet size={25} /></div><div><strong>Tu informe en Excel</strong><p>Copia de borrador, sin código definitivo.</p></div><button className="button button-primary" disabled={busy} onClick={() => void download()}>{busy ? <LoaderCircle className="spin" size={16} /> : <Download size={16} />}{busy ? 'Generando…' : 'Descargar Excel'}</button></div><div className="inline-note"><Info size={15} /><span>Puedes enviar la inspección a las cuentas destinatarias de este navegador. El correo y la sincronización entre dispositivos siguen pendientes.</span></div>
              </div>}

              <div className="form-footer"><span><span className="required">*</span> Campos obligatorios</span><span><LockKeyhole size={13} />Borrador privado en este navegador</span></div>
            </div>
            <div className="wizard-actions"><button className="button button-back" disabled={draft.step === 0} onClick={() => goToStep(draft.step - 1)}><ArrowLeft size={17} />Anterior</button><span className="step-counter">Paso {draft.step + 1} de 5</span>{draft.step < 4 ? <button className="button button-primary next-button" disabled={!!photoBusy || !loaded} onClick={() => goToStep(draft.step + 1)}>Continuar<ArrowRight size={17} /></button> : <button className="button button-primary next-button" onClick={() => setModal('send')}>Enviar inspección<Send size={16} /></button>}</div>
          </div>

          <aside className="context-column"><div className="context-card"><div className="context-top"><span className="context-leaf"><Leaf size={21} strokeWidth={1.7} /></span><span>MENOS TRÁMITES, MÁS PREVENCIÓN</span></div><h3>Un espacio seguro<br />se construye<br /><span>paso a paso.</span></h3><p>Registra lo importante.<br />Nosotros te ayudamos a ordenarlo.</p><div className="context-illustration" aria-hidden="true"><div className="illustration-orbit orbit-1" /><div className="illustration-orbit orbit-2" /><div className="illustration-paper"><span /><span /><span /><span /><div><Check size={20} /></div></div><div className="illustration-shield"><ShieldCheck size={37} strokeWidth={1.4} /></div><span className="illustration-star star-1">✦</span><span className="illustration-star star-2">✦</span></div></div>
            <div className="registration-card"><div className="registration-title"><h3>Tu inspección</h3><span className="live-dot" /></div><dl><div><dt>Área inspeccionada</dt><dd>{draft.area || 'Por definir'}</dd></div><div><dt>Tipo</dt><dd>{draft.type || 'Por definir'}{draft.type === 'Otro' ? `: ${draft.otherType}` : ''}</dd></div><div><dt>Responsables</dt><dd>{draft.responsibles.filter(r => r.name.trim() && emailValid(r.email)).length} asignados</dd></div><div><dt>Observaciones</dt><dd>{draft.observations.length} registradas</dd></div></dl><div className="registration-progress"><span>Progreso del registro<strong>{(draft.step + 1) * 20}%</strong></span><div><span style={{ width: `${(draft.step + 1) * 20}%` }} /></div></div></div>
            <div className="tip-card"><span className="tip-icon"><Sparkles size={18} /></span><div><h4>Un detalle que hace la diferencia</h4><p>{draft.step === 0 ? 'Un objetivo claro te ayudará a enfocar la inspección y obtener mejores resultados.' : draft.step === 1 ? 'Fotografía el contexto y el detalle del hallazgo. Una buena evidencia facilita la corrección.' : draft.step === 3 ? 'Las recomendaciones concretas ayudan a que cada hallazgo se convierta en una mejora.' : 'Revisa que las fechas y las medidas correctivas sean claras para los responsables.'}</p></div></div>
          </aside></div>
          <footer className="page-footer"><span>Hecho para cuidar a las personas.</span><span>Berry Safety Workspace<ShieldCheck size={13} /></span></footer>
        </> : view === 'admin' ? <Administration accounts={accounts} actor={account} onAccounts={setAccounts}/> : <>
          <div className="page-heading"><div><div className="eyebrow"><span />TU ESPACIO DE SEGURIDAD</div><h1>Mis inspecciones</h1><p>Cada registro, un paso hacia un trabajo más seguro.</p></div><button className="button button-primary" onClick={() => void startNew()}><Plus size={17} />Nueva inspección</button></div>
          <div className="list-stats"><div><span className="list-stat-icon"><ClipboardList size={22} /></span><div><strong>{inspections.length}</strong><span>Inspecciones</span></div></div><div><span className="list-stat-icon muted-icon"><Pencil size={22} /></span><div><strong>{draftCount}</strong><span>En borrador</span></div></div><div><span className="list-stat-icon"><Search size={22}/></span><div><strong>{reviewCount}</strong><span>Inspecciones a revisar</span></div></div><div><span className="list-stat-icon green-icon"><FileCheck2 size={22} /></span><div><strong>{inspections.filter(inspectionClosed).length}</strong><span>Inspecciones cerradas</span></div></div></div>
          <div className="list-card"><div className="list-toolbar"><div className="search-box"><Search size={18} /><input aria-label="Buscar inspecciones" placeholder="Buscar por empresa, instalación o área…" value={query} onChange={e => setQuery(e.target.value)} /></div><label className="filter-select"><ListFilter size={16} /><select aria-label="Filtrar por estado" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">Todos los estados</option><option value="draft">Borradores</option><option value="pending">En levantamiento</option><option value="review">Inspecciones a revisar</option><option value="closed">Inspecciones cerradas</option></select></label></div>
          <div className="inspection-list">{inspections.filter(matches).map(item => <div className="inspection-list-row" key={item.id}><div className="list-building"><Building2 size={23} /></div><div className="inspection-list-info"><strong>{item.area || item.facility || 'Inspección sin título'}</strong><span>{item.company || 'Empresa por definir'}{item.area ? ` · ${item.area}` : ''}</span><small>{formatDate(item.date)} · {item.observations.length} observaciones</small><span className="registration-list-code">{confirmedInspectionCode(item) ? `Código definitivo: ${confirmedInspectionCode(item)}` : 'Código definitivo: pendiente de envío'}</span></div><span className={`list-status ${item.status === 'ready' ? 'status-ready' : ''}`}>{workflowLabel(item)}</span><button className="button button-outline" onClick={() => { if (item.delivery) { openFollowUp(item, 'list'); return; } setDraft(item); setView('editor'); setErrors({}); top(); }}>{item.delivery ? 'Revisar informe' : item.status === 'ready' ? 'Ver informe' : 'Continuar'}<ArrowRight size={15} /></button>{!item.delivery && <button className="icon-button delete-button" aria-label={`Eliminar inspección ${item.area || item.facility || 'sin título'}`} onClick={() => setDeleteTarget(item)}><Trash2 size={17} /></button>}</div>)}</div>
          {inspections.filter(matches).length === 0 && <div className="empty-list"><Search size={32} /><h3>No encontramos inspecciones</h3><p>Prueba con otra búsqueda o crea una nueva inspección.</p></div>}</div>
          <div className="local-storage-note"><LockKeyhole size={15} />Tus inspecciones se guardan solo en este navegador y dispositivo.</div>
        </>}
      </main>
    </div>

    {toast && <div className="toast" role="status"><Info size={18} /><span>{toast}</span><button aria-label="Cerrar aviso" onClick={() => setToast('')}><X size={16} /></button></div>}
    {modal === 'help' && <Modal title="Una inspección, paso a paso" onClose={() => setModal(null)}><p className="modal-description">Lo importante es lo que observas. Berry te ayuda a darle forma.</p><ol className="help-steps">{['Define la empresa, la instalación, el objetivo y los responsables.', 'Añade tus observaciones, fotos y medidas correctivas. Selecciona el nivel de riesgo y la Fecha de Cierre. La primera fecha se aplica a todas; después puedes ajustarlas por separado.', 'Revisa el resumen de los hallazgos.', 'Completa las conclusiones, recomendaciones y los datos del inspector.', 'Revisa los destinatarios y descarga el informe Excel.'].map((text, i) => <li key={text}><span>{i + 1}</span><div><strong>{stepNames[i]}</strong><p>{text}</p></div></li>)}</ol><div className="notice"><Info size={19} /><p>Los borradores se guardan automáticamente en este navegador. El envío por correo y la plantilla oficial se incorporarán en una siguiente etapa.</p></div><button className="button button-primary full-width" onClick={() => setModal(null)}>Entendido<Check size={16} /></button></Modal>}
    {modal === 'profile' && <Modal title="Tu perfil" onClose={() => setModal(null)}><div className="profile-modal-avatar">{initials(profileForm.name)}</div><Field label="Cuenta de prueba" hint="Cambia de cuenta sin iniciar sesión mientras Microsoft está desactivado.">{props => <select {...props} value={account.id} disabled={!loaded || busy || photoBusy !== null} onChange={e => void switchAccount(e.target.value)}>{accounts.filter(a => a.enabled).map(a => <option key={a.id} value={a.id}>{a.name} — {a.email} ({a.role === 'admin' ? 'Administrador' : 'Inspecciones'})</option>)}</select>}</Field><form onSubmit={e => { e.preventDefault(); saveProfile(); }}><Field label="Nombres y apellidos" required>{props => <input {...props} autoComplete="name" placeholder="Nombres y apellidos completos" value={profileForm.name} maxLength={250} onChange={e => setProfileForm(p => ({ ...p, name: e.target.value }))}/>}</Field><Field label="Área" required>{props => <input {...props} placeholder="Área a la que perteneces" value={profileForm.area} maxLength={250} onChange={e => setProfileForm(p => ({ ...p, area: e.target.value }))}/>}</Field><Field label="Cargo">{props => <input {...props} placeholder="Puesto o cargo que desempeñas" value={profileForm.jobTitle} maxLength={250} onChange={e => setProfileForm(p => ({ ...p, jobTitle: e.target.value }))}/>}</Field><Field label="Correo de tu cuenta">{props => <input {...props} type="email" value={profileForm.email} readOnly/>}</Field>{profileError && <p className="error-message" role="alert">{profileError}</p>}<button type="submit" className="button button-primary full-width">Guardar perfil<Check size={16}/></button></form><MicrosoftAccess/></Modal>}
    {modal === 'send' && <Modal title="Enviar inspección de prueba" onClose={() => !busy && setModal(null)}><div className="send-illustration"><Mail size={34}/></div><h3 className="centered">Compartir con las cuentas destinatarias</h3><p className="modal-description">El informe quedará disponible en Inspecciones recibidas al cambiar de cuenta en este navegador. No se envía correo ni se comparte entre dispositivos. El código definitivo sigue pendiente de conexión.</p><div className="send-recipients">{draft.responsibles.map(r => <div key={r.id}><Mail size={16}/><span><strong>{r.name}</strong><small>{r.email}</small></span></div>)}</div><button className="button button-primary full-width" disabled={busy} onClick={() => void sendInspection()}>{busy ? <LoaderCircle className="spin" size={16}/> : <Send size={16}/>}Enviar a destinatarios de prueba</button><p className="send-status"><Info size={14}/>No se ha enviado ningún correo.</p></Modal>}
    {previewPhoto && <PhotoViewer photo={previewPhoto} onClose={() => setPreviewPhoto(null)} onSave={!draft.delivery && draft.observations.some(o => o.photos.some(p => p.id === previewPhoto.id)) ? async photo => {
      const updated = { ...draft, observations: draft.observations.map(o => ({ ...o, photos: o.photos.map(p => p.id === photo.id ? photo : p) })), updatedAt: new Date().toISOString(), status: 'draft' as const };
      if (!await save(updated)) throw new Error('No se pudo guardar la imagen. Tus cambios siguen abiertos en el editor.');
      setDraft(updated); setPreviewPhoto(photo);
    } : undefined}/>}
    {deleteTarget && <Modal title="Eliminar inspección" onClose={() => setDeleteTarget(null)}><p className="modal-description">Se eliminará «{deleteTarget.area || deleteTarget.facility || 'Inspección sin título'}» y sus fotografías de este navegador. Esta acción no se puede deshacer.</p><div className="modal-actions"><button className="button button-outline" onClick={() => setDeleteTarget(null)}>Conservar inspección</button><button className="button button-danger" onClick={async () => { try { await removeInspection(deleteTarget.id); setInspections(items => items.filter(i => i.id !== deleteTarget.id)); if (draft.id === deleteTarget.id) setDraft(newInspection(profile)); setDeleteTarget(null); setToast('Inspección eliminada.'); } catch { setToast('No pudimos eliminar la inspección. Inténtalo de nuevo.'); } }}><Trash2 size={16} />Eliminar</button></div></Modal>}
  </div>;
}
