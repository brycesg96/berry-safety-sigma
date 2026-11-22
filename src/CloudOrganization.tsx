import { LiquidGlassSurface } from './components/ui/liquid-glass';
import { useEffect, useRef, useState } from 'react';
import { Building2, Check, LoaderCircle, Pencil, Plus, RefreshCw, RotateCcw, Search, Trash2 } from 'lucide-react';
import { Field, Modal } from './components';
import { Select } from './Select';
import { reorderOrganizationNodes, loadOrganizationNodes, refreshOrganizationCatalog, saveOrganizationNode } from './organization-api';
import { organizationNodeActive } from './organization-catalog';
import type { OrganizationKind, OrganizationNode } from './organization-catalog';
import { organizationLabel } from './organization-label';
import { compareCatalogNodes, hasCatalogOrder, moveCatalogNode } from './catalog-order';
import type { CatalogMove } from './catalog-order';
import { CatalogOrderControls, CatalogOrderToggle } from './CatalogOrderControls';
import { useCatalogOrderMotion } from './useCatalogOrderMotion';
import './organization-admin.css';

const normalized = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('es').trim();
const singular = { management: 'gerencia', area: 'área', position: 'puesto' };
const plural = { management: 'Gerencias', area: 'Áreas', position: 'Puestos' };
type Editor = { node: OrganizationNode; creating: boolean; displayName: string };

export function AreaCatalog({ isCurrent, onBusyChange }: { isCurrent: () => boolean; onBusyChange: (busy: boolean) => void }) {
  const [nodes, setNodes] = useState<OrganizationNode[]>([]);
  const [management, setManagement] = useState(''), [area, setArea] = useState('');
  const [ordering, setOrdering] = useState<OrganizationKind | null>(null);
  const columns = useRef<HTMLDivElement>(null);
  const captureOrder = useCatalogOrderMotion(columns, ordering !== null);
  const [query, setQuery] = useState(''), [showRemoved, setShowRemoved] = useState(false);
  const [loading, setLoading] = useState(true), [ready, setReady] = useState(false), [retry, setRetry] = useState(0);
  const [editor, setEditor] = useState<Editor | null>(null), [removing, setRemoving] = useState<OrganizationNode | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const current = useRef(isCurrent); current.current = isCurrent;
  const live = useRef(true), locked = useRef(false); locked.current = busy || !!editor || !!removing || ordering !== null;
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  useEffect(() => { onBusyChange(busy || !!editor || !!removing); return () => onBusyChange(false); }, [busy, editor, removing, onBusyChange]);
  useEffect(() => {
    let active = true, sequence = 0;
    const refresh = async () => {
      if (locked.current) return;
      const request = ++sequence;
      setLoading(true); setError('');
      try {
        const next = await loadOrganizationNodes();
        if (active && request === sequence && current.current()) { setNodes(next); setReady(true); }
      } catch (problem) {
        if (active && request === sequence && current.current()) { setNodes([]); setReady(false); setError(problem instanceof Error ? problem.message : 'No pudimos consultar las áreas.'); }
      } finally { if (active && request === sequence) setLoading(false); }
    };
    void refresh(); window.addEventListener('focus', refresh);
    return () => { active = false; window.removeEventListener('focus', refresh); };
  }, [retry]);

  const nomenclatureSupported = nodes.some(node => typeof node.nomenclature === 'string');
  const byId = new Map(nodes.map(node => [node.id, node]));
  const active = (node: OrganizationNode) => organizationNodeActive(node, nodes);
  const visible = nodes.filter(node => showRemoved || active(node)).sort(compareCatalogNodes);
  const terms = normalized(query).split(/\s+/).filter(Boolean);
  const matches = (node: OrganizationNode) => terms.every(term => normalized([node.name, node.nomenclature, byId.get(node.parent_id || '')?.name, byId.get(byId.get(node.parent_id || '')?.parent_id || '')?.name].filter(Boolean).join(' ')).includes(term));
  const containsMatch = (node: OrganizationNode): boolean => matches(node) || visible.some(child => child.parent_id === node.id && (matches(child) || child.kind === 'area' && visible.some(job => job.parent_id === child.id && matches(job))));
  const lists = {
    management: visible.filter(node => node.kind === 'management' && containsMatch(node)),
    area: visible.filter(node => node.kind === 'area' && node.parent_id === management && containsMatch(node)),
    position: visible.filter(node => node.kind === 'position' && node.parent_id === area && matches(node)),
  };
  const add = (kind: OrganizationKind) => {
    setOrdering(null); setError(''); setMessage('');
    setEditor({ creating: true, displayName: '', node: { id: crypto.randomUUID(), kind, parent_id: kind === 'management' ? null : kind === 'area' ? management : area, name: '', enabled: true, revision: 1, ...(kind === 'area' && nomenclatureSupported ? { nomenclature: '' } : {}) } });
  };
  const commit = async (node: OrganizationNode, creating = false) => {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const saved = await saveOrganizationNode(node, creating);
      if (!live.current || !current.current()) return;
      setNodes(previous => [...previous.filter(item => item.id !== saved.id), saved]);
      if (saved.kind === 'management') { setManagement(saved.id); setArea(''); }
      if (saved.kind === 'area') { setManagement(saved.parent_id!); setArea(saved.id); }
      setEditor(null); setRemoving(null);
      const label = saved.kind === 'management' ? 'Gerencia' : saved.kind === 'area' ? 'Área' : 'Puesto';
      const ending = saved.kind === 'position' ? 'o' : 'a';
      setMessage(`${label} ${creating ? 'añadid' : !saved.enabled ? 'retirad' : 'actualizad'}${ending}.`);
      try { await refreshOrganizationCatalog(() => live.current && current.current()); }
      catch { if (live.current && current.current()) setError('El cambio se guardó, pero no pudimos actualizar las listas de selección. Pulsa Actualizar listas para reintentar.'); }
    } catch (problem) { if (live.current && current.current()) setError(problem instanceof Error ? problem.message : 'No pudimos guardar el cambio.'); }
    finally { if (live.current) setBusy(false); }
  };
  const move = async (node: OrganizationNode, direction: CatalogMove, list: OrganizationNode[]) => {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const saved = await reorderOrganizationNodes(moveCatalogNode(nodes, list, node, direction));
      if (!live.current || !current.current()) return;
      captureOrder();
      const ids = new Set(saved.map(item => item.id));
      setNodes(previous => [...previous.filter(item => !ids.has(item.id)), ...saved]);
      setMessage('Orden guardado. También se aplicará en las listas de selección.');
      try { await refreshOrganizationCatalog(() => live.current && current.current()); }
      catch { if (live.current && current.current()) setError('El orden se guardó, pero no pudimos actualizar los desplegables. Termina de ordenar y pulsa Actualizar listas.'); }
    } catch (problem) { if (live.current && current.current()) setError(problem instanceof Error ? problem.message : 'No pudimos guardar el orden.'); }
    finally { if (live.current) setBusy(false); }
  };
  const refreshAll = async () => {
    setRetry(value => value + 1);
    try { await refreshOrganizationCatalog(() => live.current && current.current()); }
    catch (problem) { if (live.current && current.current()) setError(problem instanceof Error ? problem.message : 'No pudimos actualizar las listas.'); }
  };
  const editParentKind = editor?.node.kind === 'area' ? 'management' : 'area';
  const parentOptions = nodes.filter(node => node.kind === editParentKind && (active(node) || node.id === editor?.node.parent_id)).sort(compareCatalogNodes).map(node => ({ value: node.id, label: organizationLabel(node.name), description: node.kind === 'area' ? organizationLabel(byId.get(node.parent_id!)?.name) : !active(node) ? 'Retirada' : undefined }));
  return <section className="organization-catalog" aria-label="Catálogo de áreas">
    <div className="organization-heading"><div><h2>Gerencias, Áreas Y Puestos</h2><p>Administra las gerencias, áreas y puestos disponibles en los perfiles y las inspecciones.</p></div><button type="button" className="button button-outline" disabled={loading || locked.current} onClick={() => void refreshAll()}>{loading ? <LoaderCircle size={16} className="spin"/> : <RefreshCw size={16}/>}Actualizar listas</button></div>
    {error && !editor && !removing && <p role="alert" className="notice notice-error">{error}</p>}{message && <p role="status" className="account-success cloud-message">{message}</p>}
    <div className="organization-toolbar"><div className="account-user-search"><Search size={18} aria-hidden="true"/><input type="search" aria-label="Buscar gerencias, áreas o puestos" placeholder="Buscar gerencias, áreas o puestos" disabled={ordering !== null} value={query} onChange={event => setQuery(event.target.value)}/></div><label className="organization-removed-toggle"><input type="checkbox" disabled={ordering !== null} checked={showRemoved} onChange={event => setShowRemoved(event.target.checked)}/>Mostrar elementos retirados</label></div>
    <p className="organization-totals">{nodes.filter(node => node.kind === 'management' && active(node)).length} gerencias · {nodes.filter(node => node.kind === 'area' && active(node)).length} áreas · {nodes.filter(node => node.kind === 'position' && active(node)).length} puestos</p>
    {loading && !ready ? <p role="status" className="cloud-loading"><LoaderCircle size={18} className="spin"/>Consultando las listas…</p> : <div className="organization-columns" ref={columns}>{(['management', 'area', 'position'] as const).map(kind => {
      const parent = kind === 'area' ? byId.get(management) : kind === 'position' ? byId.get(area) : undefined;
      const enabled = ready && !busy && ordering !== kind && (kind === 'management' || !!parent && active(parent));
      return <section className="organization-column liquid-glass-card" key={kind} aria-label={plural[kind]}><LiquidGlassSurface/><div className="organization-column-heading"><h2>{kind === 'management' && <Building2 size={18}/>} {plural[kind]} <span>{lists[kind].length}</span></h2><div className="organization-column-actions"><CatalogOrderToggle label={plural[kind].toLocaleLowerCase('es')} active={ordering === kind} disabled={busy || loading || !!editor || !!removing || !ready || !hasCatalogOrder(nodes) || !!query.trim() || lists[kind].length < 2} onToggle={() => { setOrdering(value => value === kind ? null : kind); setError(''); }}/><button type="button" className="text-button" disabled={!enabled} aria-label={`Añadir ${singular[kind]}`} onClick={() => add(kind)}><Plus size={15}/>Añadir</button></div></div>
        {kind !== 'management' && <p className="organization-parent-name">{organizationLabel(parent?.name) || `Selecciona ${kind === 'area' ? 'una gerencia' : 'un área'} para ver sus ${kind === 'area' ? 'áreas' : 'puestos'}.`}</p>}
        <ul className="organization-node-list">{lists[kind].map((node, index) => {
          const selected = kind === 'management' ? management === node.id : kind === 'area' ? area === node.id : false;
          const available = active(node), canRestore = node.parent_id === null || !!byId.get(node.parent_id) && active(byId.get(node.parent_id)!);
          return <li key={node.id} data-catalog-node={node.id} className={selected ? 'organization-node-selected' : ''}><div className="organization-node-name">{kind === 'position' ? <span>{organizationLabel(node.name)}</span> : <button type="button" aria-pressed={selected} onClick={() => { if (kind === 'management') { if (ordering !== 'management') setOrdering(null); setManagement(node.id); setArea(''); } else { if (ordering === 'position') setOrdering(null); setArea(node.id); } }}>{organizationLabel(node.name)}</button>}{node.nomenclature && <small>{node.nomenclature}</small>}{!available && <small>{node.enabled ? 'Su gerencia o área está retirada' : 'Retirado'}</small>}</div><div className="organization-node-actions">{ordering === kind ? <CatalogOrderControls label={organizationLabel(node.name)} index={index} count={lists[kind].length} disabled={busy || !ready} onMove={direction => void move(node, direction, lists[kind])}/> : <><button type="button" className="icon-button" aria-label={`Editar ${singular[kind]} ${organizationLabel(node.name)}`} disabled={busy} onClick={() => { setOrdering(null); setError(''); setEditor({ node: { ...node }, creating: false, displayName: organizationLabel(node.name) }); }}><Pencil size={15}/></button>{node.enabled ? <button type="button" className="icon-button delete-button" disabled={busy} aria-label={`Retirar ${singular[kind]} ${organizationLabel(node.name)}`} onClick={() => { setOrdering(null); setError(''); setRemoving(node); }}><Trash2 size={15}/></button> : <button type="button" className="icon-button" disabled={busy || !canRestore} title={!canRestore ? 'Restaura primero su gerencia o área.' : undefined} aria-label={`Restaurar ${singular[kind]} ${organizationLabel(node.name)}`} onClick={() => void commit({ ...node, enabled: true })}><RotateCcw size={15}/></button>}</>}</div></li>;
        })}</ul>{!lists[kind].length && <p className="organization-empty">{terms.length ? 'No hay coincidencias en esta lista.' : kind === 'management' || parent ? 'Todavía no hay elementos en esta lista.' : `Elige ${kind === 'area' ? 'una gerencia' : 'un área'} de la lista anterior.`}</p>}
      </section>;
    })}</div>}
    {editor && <Modal title={`${editor.creating ? 'Añadir' : 'Editar'} ${singular[editor.node.kind]}`} onClose={() => !busy && setEditor(null)}><form onSubmit={event => { event.preventDefault(); void commit(editor.node, editor.creating); }}>
      {editor.node.kind !== 'management' && <Field label={editor.node.kind === 'area' ? 'Gerencia' : 'Área'} required>{props => <Select {...props} searchable searchLabel={editor.node.kind === 'area' ? 'Buscar gerencias' : 'Buscar áreas'} value={editor.node.parent_id || ''} disabled={busy} placeholder={editor.node.kind === 'area' ? 'Selecciona una gerencia' : 'Selecciona un área'} options={parentOptions} onChange={value => setEditor(previous => previous && { ...previous, node: { ...previous.node, parent_id: value } })}/>}</Field>}
      <Field label={`Nombre ${editor.node.kind === 'area' ? 'del área' : editor.node.kind === 'management' ? 'de la gerencia' : 'del puesto'}`} required>{props => <input {...props} autoFocus required maxLength={250} disabled={busy} value={editor.displayName} onChange={event => setEditor(previous => previous && { ...previous, displayName: event.target.value, node: { ...previous.node, name: event.target.value } })}/>}</Field>
      {editor.node.kind === 'area' && <Field label="Abreviatura" hint={nomenclatureSupported ? "Opcional. Se mostrará en lugar del nombre completo del área en los perfiles y las nuevas inspecciones." : "Disponible al activar la actualización de abreviaturas en Supabase (paso 16)."}>{props => <input {...props} maxLength={50} placeholder="Ej. SIGMA" disabled={busy || !nomenclatureSupported} value={editor.node.nomenclature || ''} onChange={event => setEditor(previous => previous && { ...previous, node: { ...previous.node, nomenclature: event.target.value } })}/>}</Field>}
      {error && <p role="alert" className="error-message cloud-message">{error}</p>}<div className="modal-actions"><button type="button" className="button button-outline" disabled={busy} onClick={() => setEditor(null)}>Cancelar</button><button type="submit" className="button button-primary" disabled={busy || !editor.node.name.trim() || editor.node.kind !== 'management' && !editor.node.parent_id}>{busy ? <LoaderCircle size={16} className="spin"/> : <Check size={16}/>}Guardar</button></div>
    </form></Modal>}
    {removing && <Modal title={`Retirar ${singular[removing.kind]}`} onClose={() => !busy && setRemoving(null)}><p className="modal-description">Se quitará <strong>{organizationLabel(removing.name)}</strong> de las listas de selección.{removing.kind !== 'position' && ' Sus áreas y puestos asociados tampoco estarán disponibles mientras esté retirado.'} Los perfiles e informes existentes conservarán su información.</p>{error && <p role="alert" className="error-message cloud-message">{error}</p>}<div className="modal-actions"><button type="button" className="button button-outline" disabled={busy} onClick={() => setRemoving(null)}>Cancelar</button><button type="button" className="button button-danger" disabled={busy} onClick={() => void commit({ ...removing, enabled: false })}>{busy ? <LoaderCircle size={16} className="spin"/> : <Trash2 size={16}/>}Retirar</button></div></Modal>}
  </section>;
}
