import { Select } from './Select';
import type { SelectOption } from './Select';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, CheckCheck, ClipboardList, Download, LoaderCircle, RefreshCw, Search, Trash2, TriangleAlert } from 'lucide-react';
import { Field, Modal } from './components';
import { deleteCloudAdminInspection } from './cloud-account';
import type { CloudProfile } from './cloud-account';
import type { Inspection } from './model';
import { formatDate } from './model';
import { inspectionPeople } from './registration';
import { AdminInspectionEditor } from './AdminInspectionEditor';
import { finishAdminEdit } from './admin-edit';
import { dashboardSnapshot } from './dashboard';
import { FollowUp } from './FollowUp';
import { exportExcel } from './export';
import { exportPdf } from './pdf';
import { buildConsolidated, dashboardMetrics, dashboardState, dashboardStateLabel, emptyDashboardFilters, filterDashboard, loadDashboard, loadDashboardInspection, saveDashboardFile, dashboardAreas } from './dashboard';
import type { DashboardCache, DashboardFilters, DashboardRow } from './dashboard';
import './dashboard.css';

export function InspectionDashboard({ actor, cache, isCurrent, onBusyChange }: { actor: CloudProfile; cache: { current: DashboardCache | null }; isCurrent: () => boolean; onBusyChange: (busy: boolean) => void }) {
  const previous = cache.current?.actorId === actor.id ? cache.current : null;
  const [rows, setRows] = useState(previous?.rows || []), [updatedAt, setUpdatedAt] = useState(previous?.updatedAt || '');
  const [filters, setFilters] = useState(emptyDashboardFilters), [loading, setLoading] = useState(!previous), [retry, setRetry] = useState(0);
  const [deleting, setDeleting] = useState<DashboardRow | null>(null), [message, setMessage] = useState('');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [detail, setDetail] = useState<Inspection | null>(null);
  const detailBusy = useCallback((value: boolean) => { working.current = value; setBusy(value); onBusyChange(value); }, [onBusyChange]);
  const current = useRef(isCurrent); current.current = isCurrent;
  const live = useRef(true), working = useRef(false); working.current = busy || editing;
  useEffect(() => { live.current = true; return () => { live.current = false; onBusyChange(false); }; }, [onBusyChange]);
  useEffect(() => {
    let active = true, request = 0;
    const refresh = async () => {
      if (working.current) return;
      const sequence = ++request;
      setLoading(true); setError('');
      try {
        const data = await loadDashboard();
        if (!active || sequence !== request || !current.current()) return;
        const stamp = new Date().toISOString(); setRows(data); setUpdatedAt(stamp); cache.current = { actorId: actor.id, rows: data, updatedAt: stamp };
      } catch (problem) {
        if (active && sequence === request && current.current()) { cache.current = null; setRows([]); setUpdatedAt(''); setDetail(null); setError(problem instanceof Error ? problem.message : 'No se pudo actualizar el panel.'); }
      } finally { if (active && sequence === request) setLoading(false); }
    };
    void refresh(); window.addEventListener('focus', refresh);
    return () => { active = false; window.removeEventListener('focus', refresh); };
  }, [actor.id, cache, retry]);
  const update = <K extends keyof DashboardFilters,>(key: K, value: DashboardFilters[K]) => setFilters(old => ({ ...old, [key]: value }));
  const invalidDates = !!filters.from && !!filters.to && filters.from > filters.to;
  const filtered = useMemo(() => invalidDates ? [] : filterDashboard(rows, filters), [rows, filters, invalidDates]);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const metrics = dashboardMetrics(filtered, today);
  const options = useMemo(() => {
    const inspectors = new Map<string, SelectOption>(), responsibles = new Map<string, SelectOption>(), areas = new Map<string, SelectOption>();
    for (const row of rows) {
      inspectionPeople(row.data).forEach(person => {
        const email = person.email.trim().toLowerCase();
        if (!inspectors.has(email)) inspectors.set(email, { value: email, label: person.name, description: person.email });
      });
      row.data.responsibles.forEach(person => {
        const email = person.email.trim().toLowerCase();
        if (!responsibles.has(email)) responsibles.set(email, { value: email, label: person.name, description: person.email });
      });
      dashboardAreas(row).forEach(area => areas.set(area.key, { value: area.key, label: area.name }));
    }
    const sorted = (items: Map<string, SelectOption>) => [...items.values()].sort((a, b) => a.label.localeCompare(b.label, 'es'));
    return { inspectors: sorted(inspectors), responsibles: sorted(responsibles), areas: sorted(areas) };
  }, [rows]);
  async function action(work: () => Promise<void>) {
    if (working.current) return;
    working.current = true; setBusy(true); onBusyChange(true); setError('');
    try { await work(); } catch (problem) { if (live.current && current.current()) setError(problem instanceof Error ? problem.message : 'No se pudo completar la descarga.'); }
    finally { if (live.current) { working.current = false; setBusy(false); onBusyChange(false); } }
  }
  async function openReport(id: string, format?: 'excel' | 'pdf') {
    await action(async () => {
      const report = await loadDashboardInspection(id, actor.id);
      if (!live.current || !current.current()) return;
      if (format === 'excel') await exportExcel(report, { readOnly: true });
      else if (format === 'pdf') await exportPdf(report);
      else { setDetail(report); window.scrollTo({ top: 0 }); }
    });
  }
  async function removeReport() {
    if (!deleting) return;
    const target = deleting;
    await action(async () => {
      await deleteCloudAdminInspection(target);
      if (!live.current || !current.current()) return;
      const stamp = new Date().toISOString();
      setRows(old => { const next = old.filter(row => row.id !== target.id); cache.current = { actorId: actor.id, rows: next, updatedAt: stamp }; return next; });
      setUpdatedAt(stamp); setDeleting(null); setMessage(`Inspección ${target.code} eliminada. Su número permanece reservado.`);
      window.dispatchEvent(new Event('berry-cloud-inspections-changed'));
    });
  }
  const saved = (updated: Inspection) => {
    const snapshot = dashboardSnapshot(updated);
    setRows(old => { const next = old.map(row => row.id === updated.id ? snapshot : row); cache.current = { actorId: actor.id, rows: next, updatedAt: new Date().toISOString() }; return next; });
    setDetail(updated); setEditing(false); setRetry(value => value + 1); window.scrollTo({ top: 0 });
  };
  if (detail && editing) return <AdminInspectionEditor key={detail.id} inspection={detail} actor={actor} isCurrent={isCurrent} onCancel={() => { setEditing(false); void loadDashboardInspection(detail.id, actor.id).then(report => { if (live.current && current.current()) setDetail(report); }).catch(problem => { if (live.current) { setDetail(null); setError(problem.message); } }); }} onSaved={saved} onBusyChange={detailBusy}/>;
  if (detail) return <section className="inspection-dashboard">{error && <p className="notice notice-error" role="alert">{error}</p>}<FollowUp key={detail.id} inspection={detail} actor={{ id: actor.id, name: actor.full_name, email: actor.email, area: actor.area, jobTitle: actor.job_title, role: 'admin', enabled: actor.enabled }} readOnly externalBusy={busy} onChange={setDetail} onBack={() => { setError(''); setDetail(null); }} onBusyChange={detailBusy} onEdit={() => setEditing(true)} onArchiveRetry={detail.archiveEditOperation ? () => void action(async () => { const updated = await finishAdminEdit({ inspectionId: detail.id, operationId: detail.archiveEditOperation! }, actor.id); if (live.current && current.current()) saved(updated); }) : undefined}/></section>;
  const monthMaximum = Math.max(1, ...metrics.months.map(([, count]) => count)), areaMaximum = Math.max(1, ...metrics.areas.map(area => area.count));
  return <section className="inspection-dashboard" aria-busy={busy}>
    <div className="dashboard-heading"><div><div className="eyebrow">VISIÓN GENERAL</div><h1>Panel de inspecciones</h1><p>Consulta los registros, revisa su avance y descarga el consolidado.</p></div><button type="button" className="button button-primary" disabled={busy || invalidDates || !filtered.length} onClick={() => void action(async () => { const file = await buildConsolidated(filtered); if (live.current && current.current()) saveDashboardFile(file); })}><Download size={17}/>Descargar consolidado</button></div>
    <div className="dashboard-toolbar"><p>{updatedAt ? `Última actualización: ${new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', dateStyle: 'short', timeStyle: 'short' }).format(new Date(updatedAt))}` : 'Registros compartidos de inspección'}</p><button type="button" className="button button-outline" disabled={busy || loading} onClick={() => setRetry(value => value + 1)}>{loading ? <LoaderCircle size={16} className="spin"/> : <RefreshCw size={16}/>}Actualizar panel</button></div>
    {error && !deleting && <p className="notice notice-error" role="alert">{error}</p>}{message && <p role="status" className="account-success">{message}</p>}
    <div className="dashboard-filters"><h2><Search size={19}/>Filtrar inspecciones</h2><div className="dashboard-filter-grid">
      <Field label="Código de inspección">{props => <input {...props} value={filters.code} onChange={e => update('code', e.target.value)} placeholder="IH-2026-001" maxLength={100}/>}</Field>
      <Field label="Desde">{props => <input {...props} type="date" value={filters.from} onChange={e => update('from', e.target.value)}/>}</Field><Field label="Hasta">{props => <input {...props} type="date" value={filters.to} onChange={e => update('to', e.target.value)}/>}</Field>
      <Field label="Inspector">{props => <Select {...props} multiple searchable searchLabel="Buscar inspectores" value={filters.inspector} onChange={value => update('inspector', value)} placeholder="Todos los inspectores" options={options.inspectors}/>}</Field>
      <Field label="Área del responsable">{props => <Select {...props} searchable searchLabel="Buscar áreas" value={filters.area} onChange={value => update('area', value)} options={[{value:'',label:'Todas las áreas'}, ...options.areas]}/>}</Field>
      <Field label="Responsable del área">{props => <Select {...props} multiple searchable searchLabel="Buscar responsables" value={filters.responsible} onChange={value => update('responsible', value)} placeholder="Todos los responsables" options={options.responsibles}/>}</Field>
      <Field label="Estado de inspección">{props => <Select {...props} value={filters.state} onChange={value => update('state', value)} options={[{value:'',label:'Todos los estados'},{value:'open',label:'En levantamiento'},{value:'review',label:'En revisión'},{value:'closed',label:'Cerrada'}]}/>}</Field>
    </div><div className="dashboard-filter-footer"><p>La fecha corresponde al día de la inspección. Dentro de cada lista se incluye cualquiera de las personas seleccionadas; los filtros se combinan y se aplican a las estadísticas y al consolidado.</p><button type="button" className="text-button" onClick={() => setFilters(emptyDashboardFilters())}>Limpiar filtros</button></div>{invalidDates && <p className="error-message" role="alert">La fecha inicial debe ser anterior o igual a la fecha final.</p>}</div>
    <div className="dashboard-kpis" aria-label="Estadísticas de los resultados"><Metric label="Inspecciones" value={metrics.total} icon={<ClipboardList/>}/><Metric label="Inspecciones cerradas" value={metrics.closed} icon={<CheckCheck/>}/><Metric label="Observaciones pendientes" value={metrics.pending} icon={<BarChart3/>}/><Metric label="Cierres vencidos" value={metrics.overdue} icon={<TriangleAlert/>}/></div>
    <div className="dashboard-charts"><div className="dashboard-chart"><h2>Inspecciones por mes</h2><p>Selecciona un mes para consultar sus registros.</p>{metrics.months.length ? <div className="dashboard-months">{metrics.months.map(([month, count]) => <button type="button" key={month} className="dashboard-month" aria-label={`Filtrar mes ${month}: ${count} inspecciones`} onClick={() => { const end = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).toISOString().slice(0, 10); setFilters(old => ({ ...old, from: `${month}-01`, to: end })); }}><strong>{count}</strong><span className="dashboard-month-track"><span style={{ height: `${Math.max(4, count / monthMaximum * 100)}%` }}/></span><small>{new Intl.DateTimeFormat('es-PE', { timeZone: 'UTC', month: 'short', year: '2-digit' }).format(new Date(`${month}-01T12:00:00Z`))}</small></button>)}</div> : <p className="dashboard-empty">Sin registros para este período.</p>}</div>
    <div className="dashboard-chart"><h2>Inspecciones por área responsable</h2><p>Áreas registradas de los responsables. Una inspección puede corresponder a varias áreas.</p><div className="dashboard-areas">{metrics.areas.map(area => <button type="button" key={area.key} onClick={() => update('area', area.key)} aria-label={`Filtrar área ${area.name}`}><span>{area.name}</span><strong>{area.count}</strong><span className="dashboard-area-track"><span style={{ width: `${area.count / areaMaximum * 100}%` }}/></span></button>)}{!metrics.areas.length && <p className="dashboard-empty">Sin áreas para estos filtros.</p>}</div></div></div>
    <div className="dashboard-risk"><h2>Observaciones por nivel de riesgo</h2>{([['baja','Bajo'],['media','Medio'],['alta','Alto']] as const).map(([key, label]) => <span className={`dashboard-risk-${key}`} key={key}>{label}<strong>{metrics.risk[key]}</strong></span>)}<p>{metrics.executed} de {metrics.observations} observaciones ejecutadas</p></div>
    <div className="dashboard-results"><div className="dashboard-result-heading"><h2>Inspecciones registradas <span>{filtered.length}</span></h2></div>{loading && !updatedAt ? <p role="status" className="cloud-loading"><LoaderCircle className="spin" size={18}/>Consultando registros…</p> : <div className="dashboard-table-scroll"><table><thead><tr><th>Código / Fecha</th><th>Área inspeccionada</th><th>Inspector</th><th>Responsable del área</th><th>Estado</th><th>Descargas</th><th>Eliminar</th></tr></thead><tbody>{filtered.map(row => <tr key={row.id}><td><strong>{row.code}</strong><small>{formatDate(row.data.date)}</small></td><td>{row.data.area}<small>{row.data.facility}</small></td><td>{inspectionPeople(row.data).map(person => <span key={person.id}>{person.name}</span>)}</td><td>{row.data.responsibles.map(person => <span key={person.id}>{person.name}</span>)}</td><td><span className={`dashboard-status dashboard-status-${dashboardState(row)}`}>{dashboardStateLabel(row)}</span><small>{row.data.observations.length} observaciones</small></td><td><div className="dashboard-row-actions"><button className="button button-outline" disabled={busy} onClick={() => void openReport(row.id)}>Revisar</button><button className="text-button" disabled={busy} onClick={() => void openReport(row.id, 'excel')}>Excel</button>{row.workflow === 'closed' && <button className="text-button" disabled={busy} onClick={() => void openReport(row.id, 'pdf')}>PDF</button>}</div></td><td><button type="button" className="button button-outline delete-button dashboard-delete" aria-label={`Eliminar inspección ${row.code}`} disabled={busy} onClick={() => { setError(''); setMessage(''); setDeleting(row); }}><Trash2 size={16}/>Eliminar</button></td></tr>)}</tbody></table>{!filtered.length && <p className="dashboard-empty">{rows.length ? 'No hay inspecciones que coincidan con estos filtros.' : 'Aún no hay inspecciones registradas.'}</p>}</div>}</div>
    {deleting && <Modal title="Eliminar inspección" onClose={() => !busy && setDeleting(null)}><p className="modal-description">Se eliminará <strong>{deleting.code} · {deleting.data.area}</strong> de las listas y del panel. Su número permanecerá reservado y no se reutilizará.</p>{error && <p role="alert" className="error-message cloud-message">{error}</p>}<div className="modal-actions"><button type="button" className="button button-outline" disabled={busy} onClick={() => { setDeleting(null); setError(''); }}>Cancelar</button><button type="button" className="button button-danger" disabled={busy} onClick={() => void removeReport()}>{busy ? <LoaderCircle className="spin" size={16}/> : <Trash2 size={16}/>} {busy ? 'Eliminando…' : 'Eliminar inspección'}</button></div></Modal>}
    {busy && !deleting && <p role="status" className="dashboard-processing"><LoaderCircle className="spin" size={17}/>Preparando el informe…</p>}
  </section>;
}
function Metric({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) { return <div className="dashboard-metric"><span>{icon}</span><div><strong>{value}</strong><p>{label}</p></div></div>; }
