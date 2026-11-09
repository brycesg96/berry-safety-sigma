import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, Building2, CalendarDays, Camera, Check, CheckCheck, ChevronRight, CircleCheck, ClipboardCheck, ClipboardList, Download, FileCheck2, FileSpreadsheet, FileText, HelpCircle, ImagePlus, Info, LayoutGrid, Leaf, ListFilter, LoaderCircle, LockKeyhole, LogOut, Mail, Menu, MoreHorizontal, Pencil, Plus, Save, Search, Send, ShieldCheck, Settings2, Sparkles, Trash2, X } from 'lucide-react';
import { Badge, Brand, Field, Modal, Stepper } from './components';
import { PhotoViewer } from './PhotoViewer';
import type { Evidence, Inspection, Observation } from './model';
import { emailValid, formatDate, initials, hasInspectionContent, loadInspections, newInspection, newObservation, setObservationClosingDate, persistInspection, preparePhoto, removeInspection, stepNames, validateStep } from './model';
import { ReportSendForm } from './ReportSendForm';
import { exportExcel } from './export';
import { applyInspectionTexts, refreshInspectionTexts, rememberInspectionTexts } from './inspection-texts';
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
import { Administration } from './Administration';
import { readAccounts, activeAccountId, selectTestAccount, updateOwnProfile, accountEmail } from './accounts';
import type { DemoAccount } from './accounts';
import type { ExitConfirmation } from './useExitConfirmation';
import { AccountDirectory } from './AccountDirectory';
import { discardCloudPending } from './cloud-store';
type CloudConnection = { actorId: string; accounts: DemoAccount[] };

const stepDescriptions = [
  ['El primer paso para un entorno más seguro.', 'Cuéntanos dónde se realizará la inspección y quiénes serán los responsables.'],
  ['Observa. Registra. Previene.', 'Documenta cada hallazgo con evidencias claras y una acción para resolverlo.'],
  ['Una mirada a tus hallazgos.', 'Revisa las observaciones antes de completar las conclusiones de la inspección.'],
  ['Convierte los hallazgos en mejoras.', 'Comparte tus conclusiones, recomendaciones y los datos de quien realizó la inspección.'],
  ['Todo listo para el siguiente paso.', 'Verifica la información y descarga el informe para compartirlo con tu equipo.'],
];

const searchText = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim();
function responsibleAreas(inspection: Inspection, accounts: DemoAccount[]) {
  return [...new Set(inspection.responsibles.map(person => person.area?.trim() || accounts.find(account => account.id === person.personId || accountEmail(account.email) === accountEmail(person.email))?.area.trim()).filter(Boolean))].join(' / ');
}

export default function App({ exit, onCloudAccess, cloud }: { exit: ExitConfirmation; onCloudAccess: (section?: 'profile' | 'admin') => void; cloud?: CloudConnection }) {
  const [initial] = useState(() => {
    try { return { accounts: cloud?.accounts || readAccounts(), error: '' }; }
    catch (error) { return { accounts: [] as DemoAccount[], error: error instanceof Error ? error.message : 'Revisa la configuración de cuentas de prueba.' }; }
  });
  if (initial.error) return <main className="account-configuration-error"><Brand dark/><h1>Revisa las cuentas de prueba</h1><p role="alert">{initial.error}</p></main>;
  return <WorkspaceApp initialAccounts={cloud?.accounts || initial.accounts} exit={exit} onCloudAccess={onCloudAccess} cloud={cloud}/>;
}

function WorkspaceApp({ initialAccounts, exit, onCloudAccess, cloud }: { initialAccounts: DemoAccount[]; exit: ExitConfirmation; onCloudAccess: (section?: 'profile' | 'admin') => void; cloud?: CloudConnection }) {
  const [accounts, setAccounts] = useState(initialAccounts);
  const [activeId, setActiveId] = useState(() => cloud?.actorId || activeAccountId(initialAccounts));
  const account = accounts.find(a => a.id === activeId && a.enabled) || accounts[0];
  const isAdmin = account.role === 'admin';
  const canCreate = !cloud || account.canCreateInspections !== false;
  const canReceive = !cloud || account.canReceiveInspections !== false;
  const profile = { name: account.name, email: account.email, area: account.area, jobTitle: account.jobTitle, accountId: account.id, ...(cloud ? { storage: 'cloud' as const } : {}) };
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
  const [modal, setModal] = useState<'help' | 'profile' | 'send' | 'reload' | null>(null);
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
  const editorStartRef = useRef<HTMLDivElement>(null);
  const observationRefs = useRef(new Map<string, HTMLElement>());
  const pendingEditorScroll = useRef<{ observationId?: string } | null>(null);

  // Wait for the destination step to render before choosing its scroll position.
  useLayoutEffect(() => {
    const destination = pendingEditorScroll.current;
    if (!destination || view !== 'editor') return;
    pendingEditorScroll.current = null;
    const observation = destination.observationId ? observationRefs.current.get(destination.observationId) : null;
    const anchor = observation || editorStartRef.current;
    if (!anchor) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    anchor.scrollIntoView({ block: 'start', behavior: reducedMotion ? 'instant' : 'smooth' });
    observation?.querySelector<HTMLTextAreaElement>('textarea')?.focus({ preventScroll: true });
  });
  const sidebarRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 899px)');
    const change = () => { setIsMobile(media.matches); if (!media.matches) setMenuOpen(false); };
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);

  useEffect(() => {
    if (cloud) { setAccounts(cloud.accounts); return; }
    const refresh = () => {
      try { const next = readAccounts(); setAccounts(next); setActiveId(activeAccountId(next)); }
      catch { setToast('No se pudo leer la configuración de cuentas.'); }
    };
    window.addEventListener('berry-accounts-changed', refresh);
    window.addEventListener('storage', refresh);
    return () => { window.removeEventListener('berry-accounts-changed', refresh); window.removeEventListener('storage', refresh); };
  }, [cloud?.accounts]);

  useEffect(() => {
    let active = true;
    setLoaded(false); setView(canCreate ? 'editor' : canReceive ? 'received' : 'list'); setErrors({}); setReceivedFilter('pending');
    setProfileForm({ name: account.name, email: account.email, area: account.area, jobTitle: account.jobTitle, accountId: account.id });
    loadInspections(cloud ? account.id : undefined).then(items => {
      if (!active) return;
      if (!cloud) for (const item of items) if (item.emailDelivery?.state === 'accepted') rememberInspectionTexts({ objective: item.objective, unfavorableCause: item.unfavorableCause || '', closingRemarks: closingRemarksOf(item) }, item.emailDelivery.updatedAt);
      const owned = items.filter(item => item.ownerId === account.id);
      owned.filter(hasInspectionContent).forEach(item => startedDraftIds.current.add(item.id));
      const existing = owned.find(i => !i.delivery), next = existing || newInspection(profile);
      setInspections(owned); setReceived(items.filter(item => isRecipient(item, account.id))); setDraft(next); setFollowUp(null); setLoaded(true);
      void refreshInspectionTexts(!!cloud).then(texts => {
        if (active && !existing) setDraft(current => current.id === next.id ? applyInspectionTexts(current, texts) : current);
      });
    }).catch(() => { if (active) { setInspections([]); setDraft(newInspection(profile)); setStorageError(true); setLoaded(true); } });
    return () => { active = false; };
  }, [account.id]);

  useEffect(() => {
    if (!loaded || !canCreate) return;
    setDraft(d => d.ownerId !== account.id || d.delivery || (d.inspector === account.name && d.inspectorEmail === account.email) ? d : { ...d, inspector: account.name, inspectorEmail: account.email, updatedAt: new Date().toISOString() });
  }, [loaded, account.id, account.name, account.email, draft.id]);

  useEffect(() => {
    if (!loaded || !canCreate || draft.delivery) return;
    setDraft(d => {
      if (d.delivery || d.ownerId !== account.id) return d;
      const records = { ...d.registrationDetails }; let changed = false;
      for (const person of registrationPeople(d)) {
        if (!person.personId) continue;
        const previous = records[person.id];
        if (!previous && d.step < 3) continue;
        const accountPerson = accounts.find(a => a.id === person.id || accountEmail(a.email) === accountEmail(person.email));
        const jobTitle = accountPerson ? accountPerson.jobTitle : person.jobTitle || '';
        if (!previous || previous.jobTitle !== jobTitle || previous.initialJobTitle !== jobTitle) {
          records[person.id] = { ...previous, jobTitle, initialJobTitle: jobTitle, date: previous?.date ?? d.date }; changed = true;
        }
      }
      return changed ? { ...d, registrationDetails: records } : d;
    });
  }, [loaded, draft.id, draft.step, draft.delivery, draft.additionalInspectors, draft.registrationParticipants, draft.registrationDetails, accounts, account.id]);
  const changeRegistrationDetails = (inspectionId: string, personId: string, data: RegistrationDetails) => {
    setDraft(d => d.id === inspectionId ? { ...d, registrationDetails: { ...d.registrationDetails, [personId]: data }, updatedAt: new Date().toISOString(), status: 'draft' } : d);
  };

  const save = useCallback(async (item: Inspection) => {
    if (item.delivery || !canCreate) return true;
    const hasContent = hasInspectionContent(item);
    if (!hasContent && !startedDraftIds.current.has(item.id)) { setSaveState('empty'); return true; }
    startedDraftIds.current.add(item.id);
    setSaveState('saving');
    try {
      const stored = await persistInspection(item);
      item = stored || item;
      if (item.ownerId === activeIdRef.current) setInspections(items => (hasContent ? [item, ...items.filter(i => i.id !== item.id)] : items.filter(i => i.id !== item.id)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
      if (!hasContent) startedDraftIds.current.delete(item.id);
      setSaveState(hasContent ? 'saved' : 'empty'); setStorageError(false);
      return true;
    } catch { setSaveState('error'); setStorageError(true); return false; }
  }, [canCreate]);

  useEffect(() => {
    if (!canCreate || !loaded || draft.ownerId !== account.id || draft.delivery) return;
    if (!hasInspectionContent(draft) && !startedDraftIds.current.has(draft.id)) { setSaveState('empty'); return; }
    setSaveState('saving');
    const timer = window.setTimeout(() => { void save(draft); }, 650);
    return () => clearTimeout(timer);
  }, [draft, loaded, save, account.id, canCreate]);

  useEffect(() => {
    if (!canCreate && view === 'editor') setView(canReceive ? 'received' : 'list');
    if (!canReceive && view === 'received') setView('list');
  }, [canCreate, canReceive, view]);

  useEffect(() => exit.setBeforeLeave(async () => {
    if (busy || photoBusy) throw new Error('Espera a que termine el envío o el archivo antes de cerrar la sesión.');
    if (view === 'editor' && !await save(draft)) throw new Error('No pudimos guardar el borrador. Revisa tu conexión antes de cerrar la sesión.');
  }), [exit.setBeforeLeave, busy, photoBusy, view, save, draft]);

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

  const patch = <K extends keyof Inspection>(key: K, value: Inspection[K]) => {
    setDraft(d => ({ ...d, [key]: value, status: 'draft', updatedAt: new Date().toISOString() }));
    setErrors(e => { const next = { ...e }; delete next[key]; if (key === 'responsibles') Object.keys(next).filter(k => k.startsWith('person-')).forEach(k => delete next[k]); if (key === 'additionalInspectors' || key === 'registrationParticipants') Object.keys(next).filter(k => k.startsWith(key === 'additionalInspectors' ? 'inspector-' : 'registrant-')).forEach(k => delete next[k]); return next; });
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
  const goToStep = (target: number, observationId?: string) => {
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
    pendingEditorScroll.current = { observationId };
    setErrors({}); patch('step', target);
  };
  const startNew = async () => {
    if (!canCreate) return;
    if (!await save(draft)) { setToast('No pudimos guardar tu inspección. Descarga el informe antes de salir.'); return; }
    const next = newInspection(profile);
    setDraft(next); setErrors({}); setView('editor'); setMenuOpen(false); top();
    void refreshInspectionTexts(!!cloud).then(texts => setDraft(current => current.id === next.id ? applyInspectionTexts(current, texts) : current));
  };
  const refreshInspections = async () => {
    const items = await loadInspections(cloud ? account.id : undefined);
    setInspections(items.filter(i => i.ownerId === account.id));
    setReceived(items.filter(i => isRecipient(i, account.id)));
  };
  useEffect(() => {
    if (!cloud || !loaded || busy || !['list', 'received'].includes(view)) return;
    let active = true, running = false;
    const refresh = async () => {
      if (running || document.visibilityState === 'hidden') return;
      running = true;
      try {
        const items = await loadInspections(account.id);
        if (active) { setInspections(items.filter(i => i.ownerId === account.id)); setReceived(items.filter(i => isRecipient(i, account.id))); }
      } catch { if (active) setToast('No pudimos actualizar la lista. Revisa tu conexión y vuelve a abrirla.'); }
      finally { running = false; }
    };
    const timer = window.setInterval(() => void refresh(), 20000);
    window.addEventListener('focus', refresh);
    window.addEventListener('berry-cloud-inspections-changed', refresh);
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener('berry-cloud-inspections-changed', refresh); };
  }, [cloud?.actorId, loaded, view, busy, account.id]);
  const showList = async () => {
    if (!await save(draft)) return;
    try { await refreshInspections(); setView('list'); setMenuOpen(false); top(); } catch { setToast('No pudimos consultar tus inspecciones. Revisa tu conexión.'); }
  };
  const showReceived = async () => {
    if (!canReceive) return;
    if (!await save(draft)) return;
    try { await refreshInspections(); setView('received'); setMenuOpen(false); top(); } catch { setToast('No pudimos consultar tus inspecciones recibidas. Revisa tu conexión.'); }
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
      rememberInspectionTexts(sent);
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
  const showAdmin = async () => { if (!isAdmin) return; if (cloud) { if (await save(draft)) onCloudAccess('admin'); return; } await save(draft); setView('admin'); setMenuOpen(false); top(); };
  const openCloudAccess = async (section: 'profile' | 'admin' = 'profile') => { if (busy || photoBusy) return; if (await save(draft)) onCloudAccess(section); };
  const pendingReceivedCount = received.filter(item => !inspectionClosed(item)).length;
  const visibleReceived = received.filter(item => receivedFilter === 'closed' ? inspectionClosed(item) : !inspectionClosed(item));
  const reviewCount = inspections.filter(needsReview).length;
  const draftCount = inspections.filter(d => !d.delivery).length;
  const matches = (i: Inspection) => (filter === 'all' || (filter === 'draft' && !i.delivery) || (filter === 'pending' && i.delivery && !inspectionClosed(i) && !needsReview(i)) || (filter === 'review' && needsReview(i)) || (filter === 'closed' && inspectionClosed(i))) && searchText(`${i.facility} ${i.area} ${responsibleAreas(i, accounts)} ${i.responsibles.map(person => `${person.name} ${person.email}`).join(' ')}`).includes(searchText(query));
  const counts = { alta: draft.observations.filter(o => o.severity === 'alta').length, media: draft.observations.filter(o => o.severity === 'media').length, baja: draft.observations.filter(o => o.severity === 'baja').length };
  const following = view === 'followup' && followUp;
  const breadcrumbSection = following ? followUpOrigin === 'received' ? inspectionClosed(following) ? 'Cerradas' : 'Pendientes' : inspectionClosed(following) ? 'Inspecciones cerradas' : needsReview(following) ? 'Inspecciones a revisar' : 'En levantamiento' : view === 'editor' ? 'Nueva inspección' : view === 'admin' ? 'Administración' : view === 'received' ? 'Inspecciones recibidas' : 'Mis inspecciones';


  return <AccountDirectory.Provider value={cloud ? accounts : undefined}><div className="app-shell" spellCheck={false}>
    <a className="skip-link" href="#main-content">Ir al contenido</a>
    {menuOpen && <div className="sidebar-scrim" onClick={() => setMenuOpen(false)} />}
    <aside ref={sidebarRef} className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`} aria-label="Menú principal" role={isMobile && menuOpen ? 'dialog' : undefined} aria-modal={isMobile && menuOpen ? true : undefined} inert={!menuOpen && isMobile ? true : undefined}>
      <div className="sidebar-brand"><Brand /><button className="mobile-close icon-button" aria-label="Cerrar menú" onClick={() => setMenuOpen(false)}><X size={20} /></button></div>
      <button className="user-card" onClick={() => { setProfileForm(profile); setProfileError(''); setModal('profile'); setMenuOpen(false); }} aria-label="Editar mi perfil"><span className="avatar">{initials(profile.name)}</span><span className="user-details"><strong>{profile.name}</strong><span>{isAdmin ? 'Administrador' : canCreate ? 'Inspecciones' : 'Usuario'}{account.area ? ` · ${account.area}` : ''}</span></span><MoreHorizontal size={18} /></button>
      <div className="sidebar-divider" />
      <div className="nav-caption">ESPACIO DE TRABAJO</div>
      <nav className="sidebar-nav">
        {canCreate && <button className={view === 'editor' ? 'active' : ''} onClick={() => { if (view !== 'editor') void startNew(); else setMenuOpen(false); }}><ClipboardCheck size={19} /><span>Nueva inspección</span><Plus size={15} /></button>}
        <button aria-label="Mis inspecciones" className={view === 'list' || following && followUpOrigin === 'list' ? 'active' : ''} onClick={() => void showList()}><LayoutGrid size={19} /><span>Mis inspecciones</span>{reviewCount > 0 && <span className="nav-count">{reviewCount}</span>}</button>
        {canReceive && <button aria-label="Inspecciones recibidas" className={view === 'received' || following && followUpOrigin === 'received' ? 'active' : ''} onClick={() => void showReceived()}><Mail size={19}/><span>Inspecciones recibidas</span>{pendingReceivedCount > 0 && <span className="nav-count">{pendingReceivedCount}</span>}</button>}
        {isAdmin && <button className={view === 'admin' ? 'active' : ''} onClick={() => void showAdmin()}><Settings2 size={19}/><span>{cloud ? 'Gestión de Cuentas' : 'Administración'}</span></button>}
      </nav>
      <div className="sidebar-bottom"><div className="prevention-card"><div className="prevention-art"><ShieldCheck size={32} strokeWidth={1.4} /><span /><span /></div><h3>La prevención<br />empieza contigo.</h3><p>Cada observación es una oportunidad para cuidar a tu equipo.</p><div className="small-line" /></div><button className="help-button" onClick={() => { setModal('help'); setMenuOpen(false); }}><HelpCircle size={18} /><span>¿Necesitas una mano?</span><ArrowUpRight size={15} /></button><div className="sidebar-footer"><span className="online-dot" />Tu espacio de seguridad<span>v0.1</span></div></div>
    </aside>

    <div className="workspace">
      <header className="topbar"><div className="topbar-left"><button className="menu-toggle icon-button" aria-label="Abrir menú" aria-expanded={menuOpen} onClick={() => setMenuOpen(v => !v)}><Menu size={23} /></button><nav className="breadcrumbs" aria-label="Ruta de navegación"><ol><li className="breadcrumb-parent"><span>Espacio de trabajo</span><ChevronRight className="breadcrumb-separator" size={14} aria-hidden="true"/></li>{following && <li><button type="button" className="breadcrumb-link" aria-label={followUpOrigin === 'received' ? 'Volver a Inspecciones recibidas' : 'Volver a Mis inspecciones'} onClick={() => void (followUpOrigin === 'received' ? showReceived() : showList())}>{followUpOrigin === 'received' ? 'Inspecciones recibidas' : 'Mis inspecciones'}</button><ChevronRight className="breadcrumb-separator" size={14} aria-hidden="true"/></li>}<li><span className="breadcrumb-current" aria-current="page">{breadcrumbSection}</span></li></ol></nav></div><div className="topbar-right">{!cloud && <span className="demo-badge header-demo-badge">Modo de prueba</span>}<span className={`save-status ${saveState === 'error' ? 'save-error' : ''}`} aria-live="polite">{view === 'followup' ? <Info size={15}/> : saveState === 'empty' ? <Pencil size={15}/> : saveState === 'saving' ? <LoaderCircle className="spin" size={15} /> : saveState === 'error' ? <Info size={15} /> : <CircleCheck size={16} />}<span>{view === 'followup' ? 'Guarda cada avance' : saveState === 'empty' ? 'Sin iniciar' : saveState === 'saving' ? 'Guardando…' : saveState === 'error' ? 'Sin guardar' : cloud ? 'Guardado en tu cuenta' : 'Guardado en este navegador'}</span></span>{cloud && <button type="button" className="text-button" onClick={exit.request}>Cerrar sesión</button>}<div className="topbar-separator" /><button className="top-avatar" aria-label="Mi perfil" onClick={() => { setProfileForm(profile); setProfileError(''); setModal('profile'); }}>{initials(profile.name)}</button></div></header>

      <main id="main-content" className="main-content" ref={contentRef}>
        {storageError && <div className="notice notice-error" role="alert"><Info size={19} /><div><strong>No se ha podido guardar el borrador.</strong><p>{cloud ? 'Revisa tu conexión. Si lo editaste en otro dispositivo, abre la versión guardada antes de continuar.' : 'Comprueba el espacio y los permisos del navegador. Mantén esta pestaña abierta para conservar los datos.'}</p></div><button className="text-button" onClick={() => void save(draft)}>Reintentar</button>{cloud && <button className="text-button" onClick={() => setModal('reload')}>Abrir versión guardada</button>}</div>}
        {view === 'followup' && followUp ? <FollowUp inspection={followUp} actor={account} onChange={updateFollowUp} onBack={() => void (followUpOrigin === 'received' ? showReceived() : showList())}/> : view === 'received' ? <>
          <div className="page-heading"><div><div className="eyebrow">SEGUIMIENTO DE HALLAZGOS</div><h1>Inspecciones recibidas</h1><p>Revisa los informes asignados a tu cuenta y registra sus levantamientos.</p></div></div>
          {!cloud && <div className="notice"><Info size={18}/><p>Prueba local: los informes aparecen al cambiar entre cuentas en este navegador. El estado del correo se consulta en cada informe. La sincronización de levantamientos entre dispositivos sigue pendiente.</p></div>}
          <div className="received-filters" role="group" aria-label="Estado de las inspecciones recibidas">{([['pending', 'Pendientes'], ['closed', 'Cerradas']] as const).map(([value, label]) => <button key={value} type="button" aria-label={label} aria-pressed={receivedFilter === value} onClick={() => setReceivedFilter(value)}>{label}</button>)}</div>
          <div className="list-card inspection-list">{visibleReceived.length === 0 ? <div className="empty-list"><Mail size={32}/><h3>{received.length === 0 ? 'No tienes inspecciones recibidas' : receivedFilter === 'pending' ? 'No tienes inspecciones pendientes' : 'No tienes inspecciones cerradas'}</h3><p>{receivedFilter === 'closed' ? 'Las inspecciones con todos sus hallazgos ejecutados aparecerán aquí.' : 'Los informes pendientes asignados a tu cuenta aparecerán aquí.'}</p></div> : visibleReceived.map(item => <div className="inspection-list-row" key={item.id}><div className="list-building"><ClipboardCheck size={23}/></div><div className="inspection-list-info"><strong>{item.area}</strong><span>{item.inspector} · {formatDate(item.date)}</span><small>{item.observations.length} observaciones · {workflowLabel(item)}</small></div><button className="button button-outline" onClick={() => openFollowUp(item, 'received')}>Revisar inspección<ArrowRight size={15}/></button></div>)}</div>
        </> : view === 'editor' && !loaded ? <p className="cloud-loading" role="status"><LoaderCircle size={18} className="spin"/>Abriendo tus inspecciones…</p> : view === 'editor' ? <div className="inspection-editor">
          <div className="page-heading"><div><div className="eyebrow inspection-start" ref={editorStartRef}><span />SEGURIDAD Y SALUD EN EL TRABAJO</div><div className="title-row"><h1>Nueva inspección</h1><span className="draft-badge"><span />Borrador</span></div><p>{stepDescriptions[draft.step][0]}</p></div><button className="button button-outline save-exit" onClick={() => void showList()}><Save size={16} />Guardar y salir</button></div>
          <Stepper step={draft.step} names={stepNames} onStep={goToStep} />
          <div className="content-layout"><div className="form-column">
            <div className="form-card">
              <div className="form-card-heading"><div><span className="card-eyebrow">PASO {String(draft.step + 1).padStart(2, '0')} DE 05</span><div className="form-heading-title-row"><h2>{['Información general', 'RESULTADO DE LA INSPECCIÓN', 'Resumen de observaciones', 'Cierre de la inspección', 'Revisión final'][draft.step]}</h2>{draft.step === 0 && <InspectionCodeBadge draft={draft}/>}</div><p>{stepDescriptions[draft.step][1]}</p></div>{draft.step !== 0 && <span className="heading-icon">{draft.step === 1 ? <Camera size={25} /> : draft.step === 4 ? <FileCheck2 size={25} /> : <FileText size={25} />}</span>}</div>

              {draft.step === 0 && <GeneralSection draft={draft} errors={errors} patch={patch} />}

              {draft.step === 1 && <div className="form-body observation-body">
                <div className="observation-intro"><span className="subtle-label">{draft.observations.length} {draft.observations.length === 1 ? 'observación registrada' : 'observaciones registradas'}</span></div>
                {draft.observations.map((o, i) => <section key={o.id} className="observation-card" ref={element => { if (element) observationRefs.current.set(o.id, element); else observationRefs.current.delete(o.id); }}><div className="observation-heading"><span className="observation-index">{String(i + 1).padStart(2, '0')}</span><h3>Observación {i + 1}</h3><Badge severity={o.severity} /><button className="icon-button delete-button" aria-label={`Eliminar observación ${i + 1}`} onClick={() => { patch('observations', draft.observations.filter(item => item.id !== o.id)); }}><Trash2 size={17} /></button></div>
                  <div className="observation-layout"><div className="observation-texts"><Field label="Descripción" required error={errors[`description-${o.id}`]}>{props => <textarea {...props} spellCheck lang="es-PE" rows={3} maxLength={5000} placeholder="Describe la condición o el acto identificado. Sé concreto: qué sucede y dónde." value={o.description} onChange={e => changeObservation(o.id, { description: e.target.value })} />}</Field>
                  <Field label="Acción a tomar" required error={errors[`action-${o.id}`]}>{props => <textarea {...props} spellCheck lang="es-PE" rows={2} maxLength={5000} placeholder="¿Qué acción se debe realizar para corregirlo?" value={o.correctiveAction} onChange={e => changeObservation(o.id, { correctiveAction: e.target.value })} />}</Field>
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
                {!draft.observations.length ? <div className="success-note"><CircleCheck size={22} /><div><strong>Sin observaciones registradas</strong><p>Añade una observación para continuar con el informe.</p></div></div> : <div className="review-observations-grid">{draft.observations.map((o, i) => <div className="review-observation" key={o.id}><div className="review-observation-top"><span className="observation-index">{String(i + 1).padStart(2, '0')}</span><Badge severity={o.severity} /><button className="text-button" aria-label={`Editar observación ${i + 1}`} onClick={() => goToStep(1, o.id)}><Pencil size={14} />Editar</button></div><h3>{o.description}</h3><p><span>Acción a tomar</span>{o.correctiveAction}</p><div className="review-meta"><CalendarDays size={15} />Fecha de Cierre: {formatDate(o.dueDate)}<span /><Camera size={15} />{o.photos.length} {o.photos.length === 1 ? 'foto' : 'fotos'}</div>{o.photos.length > 0 && <div className="review-photos">{o.photos.map(p => <button key={p.id} aria-label={`Ver evidencia ${p.name}`} onClick={() => setPreviewPhoto(p)}><img src={p.data} alt={p.name} /></button>)}</div>}</div>)}</div>}
                <button className="button button-outline full-width" onClick={() => goToStep(1)}><Plus size={17} />{draft.observations.length ? 'Añadir o editar observaciones' : 'Añadir una observación'}</button>
              </div>}

              {draft.step === 3 && <ClosingSection draft={draft} errors={errors} patch={patch} onRegistrationChange={(id, data) => changeRegistrationDetails(draft.id, id, data)}/>}

              {draft.step === 4 && <div className="form-body final-body"><div className="ready-banner"><span><CheckCheck size={27} /></span><div><h3>Una inspección. Un entorno más seguro.</h3><p>Revisa los últimos detalles antes de compartir tu informe.</p></div></div>
                <div className="final-section"><div className="final-section-heading"><h3><Building2 size={18} />Datos de la inspección</h3><button className="text-button" onClick={() => goToStep(0)}><Pencil size={14} />Editar</button></div><dl className="details-grid"><div><dt>Empresa</dt><dd>{EMPLOYER.name}</dd></div><div><dt>RUC</dt><dd>{EMPLOYER.ruc}</dd></div><div><dt>Código de inspección</dt><dd>{confirmedInspectionCode(draft) || pendingCodeLabel()} · {confirmedInspectionCode(draft) ? 'Registrado' : 'Tentativo'}</dd></div><div><dt>Área</dt><dd>{draft.area}</dd></div><div><dt>Tipo</dt><dd>{draft.type || 'Por definir'}{draft.type === 'Otro' ? `: ${draft.otherType}` : ''}</dd></div><div><dt>Fecha y hora</dt><dd>{formatDate(draft.date)} · {formatInspectionTime(draft.inspectionTime, draft.inspectionPeriod)}</dd></div><div className="detail-full"><dt>Objetivo</dt><dd>{draft.objective}</dd></div></dl></div>
                <div className="final-section"><div className="final-section-heading"><h3><ClipboardCheck size={18} />Observaciones registradas</h3><button className="text-button" onClick={() => goToStep(2)}>Ver detalle<ArrowRight size={14} /></button></div><div className="final-counts"><strong>{draft.observations.length} en total</strong>{(['alta', 'media', 'baja'] as const).map(s => <span key={s}><Badge severity={s} />{counts[s]}</span>)}</div></div>
                <div className="final-section"><div className="final-section-heading"><h3><FileText size={18} />Cierre</h3><button className="text-button" onClick={() => goToStep(3)}><Pencil size={14} />Editar</button></div><div className="closing-text"><span>DESCRIPCIÓN DE LA CAUSA ANTE RESULTADOS DESFAVORABLES DE LA INSPECCIÓN</span><p>{draft.unfavorableCause || 'Sin indicar'}</p><span>CONCLUSIONES Y RECOMENDACIONES</span><p>{closingRemarksOf(draft)}</p><span>RESPONSABLE DEL REGISTRO</span></div><div className="inspection-team">{registrationPeople(draft).map(person => <div className="inspector-signature" key={person.id}><span className="avatar avatar-small">{initials(person.name)}</span><div><strong>{person.name}</strong><span>{person.email}{draft.registrationDetails?.[person.id]?.jobTitle ? ` · ${draft.registrationDetails[person.id].jobTitle}` : ''} · {formatDate(draft.registrationDetails?.[person.id]?.date ?? draft.date)}</span>{draft.registrationDetails?.[person.id]?.signature && <img className="registration-review-signature" src={draft.registrationDetails[person.id].signature!.data} alt={`Firma de ${person.name}`}/>}</div></div>)}</div></div>
                <div className="final-section"><div className="final-section-heading"><h3><Mail size={18} />Destinatarios del informe</h3><button className="text-button" onClick={() => goToStep(0)}><Pencil size={14} />Editar</button></div><div className="recipient-list">{draft.responsibles.map(r => <div key={r.id}><span className="avatar avatar-small">{initials(r.name)}</span><span><strong>{r.name}</strong><small>{r.email}</small></span></div>)}</div></div>
                <div className="export-panel"><div className="excel-icon"><FileSpreadsheet size={25} /></div><div><strong>Tu informe en Excel</strong><p>Copia de borrador, sin código definitivo.</p></div><button className="button button-primary" disabled={busy} onClick={() => void download()}>{busy ? <LoaderCircle className="spin" size={16} /> : <Download size={16} />}{busy ? 'Generando…' : 'Descargar Excel'}</button></div><div className="inline-note"><Info size={15} /><span>{cloud ? 'Al enviar se guardará el informe con su código de registro y se compartirá con los responsables.' : 'Puedes enviar la inspección a las cuentas destinatarias de este navegador. El estado del correo se consulta en cada informe. La sincronización de levantamientos entre dispositivos sigue pendiente.'}</span></div>
              </div>}

              <div className="form-footer"><span><span className="required">*</span> Campos obligatorios</span><span><LockKeyhole size={13} />{cloud ? 'Borrador privado en tu cuenta' : 'Borrador privado en este navegador'}</span></div>
            </div>
            <div className="wizard-actions"><button className="button button-back" disabled={draft.step === 0} onClick={() => goToStep(draft.step - 1)}><ArrowLeft size={17} />Anterior</button><span className="step-counter">Paso {draft.step + 1} de 5</span>{draft.step < 4 ? <button className="button button-primary next-button" disabled={!!photoBusy || !loaded} onClick={() => goToStep(draft.step + 1)}>Continuar<ArrowRight size={17} /></button> : <button className="button button-primary next-button" onClick={() => setModal('send')}>Enviar inspección<Send size={16} /></button>}</div>
          </div>

          <aside className="context-column"><div className="context-card"><div className="context-top"><span className="context-leaf"><Leaf size={21} strokeWidth={1.7} /></span><span>MENOS TRÁMITES, MÁS PREVENCIÓN</span></div><h3>Un espacio seguro<br />se construye<br /><span>paso a paso.</span></h3><p>Registra lo importante.<br />Nosotros te ayudamos a ordenarlo.</p><div className="context-illustration" aria-hidden="true"><div className="illustration-orbit orbit-1" /><div className="illustration-orbit orbit-2" /><div className="illustration-paper"><span /><span /><span /><span /><div><Check size={20} /></div></div><div className="illustration-shield"><ShieldCheck size={37} strokeWidth={1.4} /></div><span className="illustration-star star-1">✦</span><span className="illustration-star star-2">✦</span></div></div>
            <div className="registration-card"><div className="registration-title"><h3>Tu inspección</h3><span className="live-dot" /></div><dl><div><dt>Área inspeccionada</dt><dd>{draft.area || 'Por definir'}</dd></div><div><dt>Tipo</dt><dd>{draft.type || 'Por definir'}{draft.type === 'Otro' ? `: ${draft.otherType}` : ''}</dd></div><div><dt>Responsables</dt><dd>{draft.responsibles.filter(r => r.name.trim() && emailValid(r.email)).length} asignados</dd></div><div><dt>Observaciones</dt><dd>{draft.observations.length} registradas</dd></div></dl><div className="registration-progress"><span>Progreso del registro<strong>{(draft.step + 1) * 20}%</strong></span><div><span style={{ width: `${(draft.step + 1) * 20}%` }} /></div></div></div>
            <div className="tip-card"><span className="tip-icon"><Sparkles size={18} /></span><div><h4>Un detalle que hace la diferencia</h4><p>{draft.step === 0 ? 'Un objetivo claro te ayudará a enfocar la inspección y obtener mejores resultados.' : draft.step === 1 ? 'Fotografía el contexto y el detalle del hallazgo. Una buena evidencia facilita la corrección.' : draft.step === 3 ? 'Las recomendaciones concretas ayudan a que cada hallazgo se convierta en una mejora.' : 'Revisa que las fechas y las medidas correctivas sean claras para los responsables.'}</p></div></div>
          </aside></div>
          <footer className="page-footer"><span>Hecho para cuidar a las personas.</span><span>Berry Safety Workspace<ShieldCheck size={13} /></span></footer>
        </div> : view === 'admin' ? <Administration actor={account} onCloudAccess={() => void openCloudAccess('admin')}/> : <>
          <div className="page-heading"><div><div className="eyebrow"><span />TU ESPACIO DE SEGURIDAD</div><h1>Mis inspecciones</h1><p>Cada registro, un paso hacia un trabajo más seguro.</p></div>{canCreate && <button className="button button-primary" onClick={() => void startNew()}><Plus size={17} />Nueva inspección</button>}</div>
          <div className="list-stats"><div><span className="list-stat-icon"><ClipboardList size={22} /></span><div><strong>{inspections.length}</strong><span>Inspecciones</span></div></div><div><span className="list-stat-icon muted-icon"><Pencil size={22} /></span><div><strong>{draftCount}</strong><span>En borrador</span></div></div><div><span className="list-stat-icon"><Search size={22}/></span><div><strong>{reviewCount}</strong><span>Inspecciones a revisar</span></div></div><div><span className="list-stat-icon green-icon"><FileCheck2 size={22} /></span><div><strong>{inspections.filter(inspectionClosed).length}</strong><span>Inspecciones cerradas</span></div></div></div>
          <div className="list-card"><div className="list-toolbar"><div className="search-box"><Search size={18} /><input aria-label="Buscar inspecciones" placeholder="Buscar por instalación, por área, responsable" value={query} onChange={e => setQuery(e.target.value)} /></div><label className="filter-select"><ListFilter size={16} /><select aria-label="Filtrar por estado" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">Todos los estados</option><option value="draft">Borradores</option><option value="pending">En levantamiento</option><option value="review">Inspecciones a revisar</option><option value="closed">Inspecciones cerradas</option></select></label></div>
          <div className="inspection-list">{inspections.filter(matches).map(item => <div className="inspection-list-row" key={item.id}><div className="list-building"><Building2 size={23} /></div><div className="inspection-list-info"><strong className="list-inspected-area">{item.area || item.facility || 'Inspección sin título'}</strong><span className="list-responsibles">{item.responsibles.map(person => person.name.trim()).filter(Boolean).join(', ') || 'Responsable sin asignar'}</span><span className="list-responsible-areas">{responsibleAreas(item, accounts) || 'Área del responsable sin registrar'}</span><small>{formatDate(item.date)} · {formatInspectionTime(item.inspectionTime, item.inspectionPeriod) || 'Hora sin registrar'} — {item.observations.length} {item.observations.length === 1 ? 'observación' : 'observaciones'}</small><span className="registration-list-code">{confirmedInspectionCode(item) ? `Código definitivo: ${confirmedInspectionCode(item)}` : 'Código definitivo: pendiente de envío'}</span></div><span className={`list-status ${item.status === 'ready' ? 'status-ready' : ''}`}>{workflowLabel(item)}</span><button className="button button-outline" disabled={!canCreate && !item.delivery} onClick={() => { if (item.delivery) { openFollowUp(item, 'list'); return; } setDraft(item); setView('editor'); setErrors({}); top(); }}>{item.delivery ? 'Revisar informe' : item.status === 'ready' ? 'Ver informe' : 'Continuar'}<ArrowRight size={15} /></button>{canCreate && !item.delivery && <button className="icon-button delete-button" aria-label={`Eliminar inspección ${item.area || item.facility || 'sin título'}`} onClick={() => setDeleteTarget(item)}><Trash2 size={17} /></button>}</div>)}</div>
          {inspections.filter(matches).length === 0 && <div className="empty-list"><Search size={32} /><h3>No encontramos inspecciones</h3><p>{canCreate ? 'Prueba con otra búsqueda o crea una nueva inspección.' : 'Prueba con otra búsqueda o consulta tus accesos con el administrador.'}</p></div>}</div>
          <div className="local-storage-note"><LockKeyhole size={15} />{cloud ? 'Tus inspecciones están disponibles en tu cuenta.' : 'Tus inspecciones se guardan solo en este navegador y dispositivo.'}</div>
        </>}
      </main>
    </div>

    {toast && <div className="toast" role="status"><Info size={18} /><span>{toast}</span><button aria-label="Cerrar aviso" onClick={() => setToast('')}><X size={16} /></button></div>}
    {modal === 'reload' && cloud && <Modal title="¿Abrir la versión guardada?" onClose={() => !busy && setModal(null)}><p className="modal-description">Los cambios de esta pestaña que no se hayan sincronizado se sustituirán por la versión guardada en tu cuenta.</p><div className="modal-actions"><button className="button button-outline" disabled={busy} onClick={() => setModal(null)}>Seguir editando</button><button className="button button-primary" disabled={busy} onClick={async () => { setBusy(true); try { await discardCloudPending(draft.id, account.id); const items = await loadInspections(account.id); const item = items.find(i => i.id === draft.id); setDraft(item || newInspection(profile)); setInspections(items.filter(i => i.ownerId === account.id)); setStorageError(false); setModal(null); if (item?.delivery) openFollowUp(item, 'list'); } catch { setToast('No pudimos consultar la versión guardada. Conserva esta pestaña y revisa tu conexión.'); } finally { setBusy(false); } }}>Abrir versión guardada</button></div></Modal>}
    {modal === 'help' && <Modal title="Una inspección, paso a paso" onClose={() => setModal(null)}><p className="modal-description">Lo importante es lo que observas. Berry te ayuda a darle forma.</p><ol className="help-steps">{['Define la empresa, la instalación, el objetivo y los responsables.', 'Añade tus observaciones, fotos y medidas correctivas. Selecciona el nivel de riesgo y la Fecha de Cierre. La primera fecha se aplica a todas; después puedes ajustarlas por separado.', 'Revisa el resumen de los hallazgos.', 'Completa las conclusiones, recomendaciones y los datos del inspector.', 'Revisa los destinatarios y descarga el informe Excel.'].map((text, i) => <li key={text}><span>{i + 1}</span><div><strong>{stepNames[i]}</strong><p>{text}</p></div></li>)}</ol><div className="notice"><Info size={19} /><p>{cloud ? 'Los borradores y las evidencias se guardan en tu cuenta. Al enviar se asigna un código y se conserva el Excel en el archivo del mes de inspección.' : 'Los borradores se guardan automáticamente en este navegador. El Excel utiliza la plantilla de inspecciones internas. La recepción del correo se confirma en el buzón destinatario.'}</p></div><button className="button button-primary full-width" onClick={() => setModal(null)}>Entendido<Check size={16} /></button></Modal>}
    {modal === 'profile' && !cloud && <Modal title="Tu perfil" onClose={() => setModal(null)}><div className="profile-modal-avatar">{initials(profileForm.name)}</div><Field label="Cuenta de prueba" hint="Cambia entre las cuentas locales de prueba.">{props => <select {...props} value={account.id} disabled={!loaded || busy || photoBusy !== null} onChange={e => void switchAccount(e.target.value)}>{accounts.filter(a => a.enabled).map(a => <option key={a.id} value={a.id}>{a.name} — {a.email} ({a.role === 'admin' ? 'Administrador' : 'Inspecciones'})</option>)}</select>}</Field><form onSubmit={e => { e.preventDefault(); saveProfile(); }}><Field label="Nombres y apellidos" required>{props => <input {...props} autoComplete="name" placeholder="Nombres y apellidos completos" value={profileForm.name} maxLength={250} onChange={e => setProfileForm(p => ({ ...p, name: e.target.value }))}/>}</Field><Field label="Área" required>{props => <input {...props} placeholder="Área a la que perteneces" value={profileForm.area} maxLength={250} onChange={e => setProfileForm(p => ({ ...p, area: e.target.value }))}/>}</Field><Field label="Puesto">{props => <input {...props} placeholder="Puesto que desempeñas" value={profileForm.jobTitle} maxLength={250} onChange={e => setProfileForm(p => ({ ...p, jobTitle: e.target.value }))}/>}</Field><Field label="Correo de tu cuenta">{props => <input {...props} type="email" value={profileForm.email} readOnly/>}</Field>{profileError && <p className="error-message" role="alert">{profileError}</p>}<button type="submit" className="button button-primary full-width">Guardar perfil<Check size={16}/></button></form><div className="cloud-access-entry"><button type="button" className="button button-outline full-width" disabled={busy || photoBusy !== null} onClick={() => void openCloudAccess()}><LockKeyhole size={16}/>Iniciar sesión con correo</button><button type="button" className="button button-outline full-width profile-logout" disabled={busy || photoBusy !== null} onClick={() => { setModal(null); exit.request(); }}><LogOut size={16}/>Cerrar sesión</button></div></Modal>}
    {modal === 'profile' && cloud && <Modal title="Tu perfil" onClose={() => setModal(null)}><div className="profile-modal-avatar">{initials(profile.name)}</div><p className="modal-description">{profile.name}<br/>{profile.email}<br/>{profile.area}{profile.jobTitle ? ` · ${profile.jobTitle}` : ''}</p><button type="button" className="button button-primary full-width" disabled={busy || photoBusy !== null} onClick={() => void openCloudAccess()}>Ir a mi cuenta</button><button type="button" className="button button-outline full-width profile-logout" disabled={busy || photoBusy !== null} onClick={() => { setModal(null); exit.request(); }}><LogOut size={16}/>Cerrar sesión</button></Modal>}
    {modal === 'send' && <Modal title="Enviar inspección" onClose={() => !busy && setModal(null)}><div className="send-illustration"><Mail size={34}/></div><h3 className="centered">Enviar informe a los responsables</h3><div className="send-recipients">{draft.responsibles.map(r => <div key={r.id}><Mail size={16}/><span><strong>{r.name}</strong><small>{r.email}</small></span></div>)}</div><ReportSendForm inspection={draft} actorId={account.id} onBusyChange={setBusy} onPrepare={async () => { if (!await save(draft)) throw new Error('No se pudo guardar el informe.'); return deliverInspection(draft, account.id); }} onChange={sent => { if (activeIdRef.current !== sent.ownerId) return; setDraft(sent); setModal(null); void refreshInspections().catch(() => {}); openFollowUp(sent, 'list'); setToast(sent.emailDelivery?.state === 'accepted' ? cloud ? 'Informe guardado y envío aceptado por el servicio de correo.' : 'Make aceptó el informe y el Excel. Confirma Outlook en el historial de Make.' : 'Informe guardado. El envío por correo no está confirmado.'); }}/>{!cloud && <details className="local-delivery-option"><summary>Compartir solo en este navegador</summary><p>Disponible en las cuentas destinatarias de este navegador. Esta opción no envía correo.</p><button className="button button-outline full-width" disabled={busy} onClick={() => void sendInspection()}>{busy ? <LoaderCircle className="spin" size={16}/> : <Send size={16}/>}Enviar a destinatarios de prueba</button><p className="send-status"><Info size={14}/>No se ha enviado ningún correo.</p></details>}</Modal>}
    {previewPhoto && <PhotoViewer photo={previewPhoto} onClose={() => setPreviewPhoto(null)} onSave={!draft.delivery && draft.observations.some(o => o.photos.some(p => p.id === previewPhoto.id)) ? async photo => {
      const updated = { ...draft, observations: draft.observations.map(o => ({ ...o, photos: o.photos.map(p => p.id === photo.id ? photo : p) })), updatedAt: new Date().toISOString(), status: 'draft' as const };
      if (!await save(updated)) throw new Error('No se pudo guardar la imagen. Tus cambios siguen abiertos en el editor.');
      setDraft(updated); setPreviewPhoto(photo);
    } : undefined}/>}
    {deleteTarget && <Modal title="Eliminar inspección" onClose={() => setDeleteTarget(null)}><p className="modal-description">Se eliminará «{deleteTarget.area || deleteTarget.facility || 'Inspección sin título'}»{cloud ? ' de tus borradores' : ' y sus fotografías de este navegador'}. Esta acción no se puede deshacer.</p><div className="modal-actions"><button className="button button-outline" onClick={() => setDeleteTarget(null)}>Conservar inspección</button><button className="button button-danger" onClick={async () => { try { await removeInspection(deleteTarget.id, cloud ? account.id : undefined, deleteTarget.cloudRevision || 0); setInspections(items => items.filter(i => i.id !== deleteTarget.id)); if (draft.id === deleteTarget.id) setDraft(newInspection(profile)); setDeleteTarget(null); setToast('Inspección eliminada.'); } catch { setToast('No pudimos eliminar la inspección. Inténtalo de nuevo.'); } }}><Trash2 size={16} />Eliminar</button></div></Modal>}
    {exit.requested && <Modal title="¿Estás seguro de salir?" onClose={exit.cancel}><p className="modal-description">{busy || photoBusy ? 'Espera a que termine el envío o el archivo antes de cerrar la sesión.' : 'Se guardará el borrador y volverás al inicio de sesión. Guarda primero cualquier levantamiento en edición.'}</p>{exit.error && <p className="error-message" role="alert">{exit.error}</p>}<div className="modal-actions"><button type="button" className="button button-outline" disabled={exit.leaving} onClick={exit.cancel}>Seguir en la aplicación</button><button type="button" className="button button-danger" disabled={exit.leaving || busy || photoBusy !== null} onClick={() => void exit.leave()}>{exit.leaving ? 'Cerrando sesión…' : 'Salir'}</button></div></Modal>}
  </div></AccountDirectory.Provider>;
}
