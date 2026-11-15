import { useEffect, useRef, useState } from 'react';
import { ArrowDownUp, Building2, Check, LoaderCircle, Pencil, Plus, RefreshCw, RotateCcw, Search, Trash2 } from 'lucide-react';
import { Field, Modal } from './components';
import { Select } from './Select';
import { reorderLocationNodes, loadLocationNodes, refreshLocationCatalog, saveLocationNode, locationNodeActive, useLocationCatalog } from './location-catalog';
import type { LocationKind, LocationNode } from './location-catalog';
import { organizationLabel } from './organization-label';
import { compareCatalogNodes, hasCatalogOrder, moveCatalogNode } from './catalog-order';
import type { CatalogMove } from './catalog-order';
import { CatalogOrderControls } from './CatalogOrderControls';
import './organization-admin.css';

const normalized = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('es').trim();
const singular = { site: 'sede', zone: 'zona', installation: 'instalación' };
const plural = { site: 'Sedes', zone: 'Zonas', installation: 'Instalaciones' };
type Editor = { node: LocationNode; creating: boolean; displayName: string };

export function CloudLocations({ isCurrent, onBusyChange }: { isCurrent: () => boolean; onBusyChange: (busy: boolean) => void }) {
  const [nodes, setNodes] = useState<LocationNode[]>([]);
  const [site, setSite] = useState(''), [zone, setZone] = useState('');
  const [ordering, setOrdering] = useState(false);
  const [query, setQuery] = useState(''), [showRemoved, setShowRemoved] = useState(false);
  const [loading, setLoading] = useState(true), [ready, setReady] = useState(false), [retry, setRetry] = useState(0);
  const [editor, setEditor] = useState<Editor | null>(null), [removing, setRemoving] = useState<LocationNode | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const current = useRef(isCurrent); current.current = isCurrent;
  const live = useRef(true), locked = useRef(false); locked.current = busy || !!editor || !!removing || ordering;
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  useEffect(() => { onBusyChange(busy || !!editor || !!removing); return () => onBusyChange(false); }, [busy, editor, removing, onBusyChange]);
  useEffect(() => {
    let active = true, sequence = 0;
    const refresh = async () => {
      if (locked.current) return;
      const request = ++sequence;
      setLoading(true); setError('');
      try {
        const next = await loadLocationNodes();
        if (active && request === sequence && current.current()) { setNodes(next); setReady(true); }
      } catch (problem) {
        if (active && request === sequence && current.current()) { setNodes([]); setReady(false); setError(problem instanceof Error ? problem.message : 'No pudimos consultar las zonas.'); }
      } finally { if (active && request === sequence) setLoading(false); }
    };
    void refresh(); window.addEventListener('focus', refresh);
    return () => { active = false; window.removeEventListener('focus', refresh); };
  }, [retry]);

  const catalog = useLocationCatalog();
  const byId = new Map(nodes.map(node => [node.id, node]));
  const active = (node: LocationNode) => locationNodeActive(node, nodes);
  const visible = nodes.filter(node => showRemoved || active(node)).sort(compareCatalogNodes);
  const terms = normalized(query).split(/\s+/).filter(Boolean);
  const matches = (node: LocationNode) => terms.every(term => normalized([node.name, byId.get(node.parent_id || '')?.name, byId.get(byId.get(node.parent_id || '')?.parent_id || '')?.name].filter(Boolean).join(' ')).includes(term));
  const containsMatch = (node: LocationNode): boolean => matches(node) || visible.some(child => child.parent_id === node.id && (matches(child) || child.kind === 'zone' && visible.some(job => job.parent_id === child.id && matches(job))));
  const lists = {
    site: visible.filter(node => node.kind === 'site' && containsMatch(node)),
    zone: visible.filter(node => node.kind === 'zone' && node.parent_id === site && containsMatch(node)),
    installation: visible.filter(node => node.kind === 'installation' && node.parent_id === zone && matches(node)),
  };
  const add = (kind: LocationKind) => {
    setError(''); setMessage('');
    setEditor({ creating: true, displayName: '', node: { id: crypto.randomUUID(), kind, parent_id: kind === 'site' ? null : kind === 'zone' ? site : zone, name: '', enabled: true, revision: 1 } });
  };
  const commit = async (node: LocationNode, creating = false) => {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const saved = await saveLocationNode(node, creating);
      if (!live.current || !current.current()) return;
      setNodes(previous => [...previous.filter(item => item.id !== saved.id), saved]);
      if (saved.kind === 'site') { setSite(saved.id); setZone(''); }
      if (saved.kind === 'zone') { setSite(saved.parent_id!); setZone(saved.id); }
      setEditor(null); setRemoving(null);
      const label = saved.kind === 'site' ? 'Sede' : saved.kind === 'zone' ? 'Zona' : 'Instalación';
      const ending = 'a';
      setMessage(`${label} ${creating ? 'añadid' : !saved.enabled ? 'retirad' : 'actualizad'}${ending}.`);
      try { await refreshLocationCatalog(() => live.current && current.current()); }
      catch { if (live.current && current.current()) setError('El cambio se guardó, pero no pudimos actualizar las listas de selección. Pulsa Actualizar listas para reintentar.'); }
    } catch (problem) { if (live.current && current.current()) setError(problem instanceof Error ? problem.message : 'No pudimos guardar el cambio.'); }
    finally { if (live.current) setBusy(false); }
  };
  const move = async (node: LocationNode, direction: CatalogMove, list: LocationNode[]) => {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const saved = await reorderLocationNodes(moveCatalogNode(nodes, list, node, direction));
      if (!live.current || !current.current()) return;
      const ids = new Set(saved.map(item => item.id));
      setNodes(previous => [...previous.filter(item => !ids.has(item.id)), ...saved]);
      setMessage('Orden guardado. También se aplicará en las listas de selección.');
      try { await refreshLocationCatalog(() => live.current && current.current()); }
      catch { if (live.current && current.current()) setError('El orden se guardó, pero no pudimos actualizar los desplegables. Termina de ordenar y pulsa Actualizar listas.'); }
    } catch (problem) { if (live.current && current.current()) setError(problem instanceof Error ? problem.message : 'No pudimos guardar el orden.'); }
    finally { if (live.current) setBusy(false); }
  };
  const refreshAll = async () => {
    setRetry(value => value + 1);
    try { await refreshLocationCatalog(() => live.current && current.current()); }
    catch (problem) { if (live.current && current.current()) setError(problem instanceof Error ? problem.message : 'No pudimos actualizar las listas.'); }
  };
  const editParentKind = editor?.node.kind === 'zone' ? 'site' : 'zone';
  const parentOptions = nodes.filter(node => node.kind === editParentKind && (active(node) || node.id === editor?.node.parent_id)).sort(compareCatalogNodes).map(node => ({ value: node.id, label: organizationLabel(node.name), description: node.kind === 'zone' ? organizationLabel(byId.get(node.parent_id!)?.name) : !active(node) ? 'Retirada' : undefined }));
  return <section className="organization-catalog" aria-label="Catálogo de instalaciones">
    <div className="organization-heading"><div><h2>Sedes, Zonas E Instalaciones</h2><p>Administra las sedes, zonas y instalaciones disponibles en las inspecciones.</p></div><button type="button" className="button button-outline" disabled={loading || locked.current} onClick={() => void refreshAll()}>{loading ? <LoaderCircle size={16} className="spin"/> : <RefreshCw size={16}/>}Actualizar listas</button></div>
    {error && !editor && !removing && <p role="alert" className="notice notice-error">{error}</p>}{message && <p role="status" className="account-success cloud-message">{message}</p>}
    <div className="organization-toolbar"><div className="account-user-search"><Search size={18} aria-hidden="true"/><input type="search" aria-label="Buscar sedes, zonas o instalaciones" placeholder="Buscar sedes, zonas o instalaciones" disabled={ordering} value={query} onChange={event => setQuery(event.target.value)}/></div><label className="organization-removed-toggle"><input type="checkbox" disabled={ordering} checked={showRemoved} onChange={event => setShowRemoved(event.target.checked)}/>Mostrar elementos retirados</label></div>
    <p className="organization-totals">{nodes.filter(node => node.kind === 'site' && active(node)).length} sedes · {nodes.filter(node => node.kind === 'zone' && active(node)).length} zonas · {nodes.filter(node => node.kind === 'installation' && active(node)).length} instalaciones</p>
    <div className="catalog-order-toolbar"><button type="button" className="button button-outline" aria-pressed={ordering} disabled={busy || loading || !!editor || !!removing || !hasCatalogOrder(nodes) || !!query.trim()} onClick={() => { setOrdering(value => !value); setError(''); }}><ArrowDownUp size={16}/>{ordering ? 'Terminar de ordenar' : 'Ordenar listas'}</button><p aria-live="polite">{ordering && busy ? 'Guardando orden…' : ordering ? 'Usa las flechas para subir, bajar o mover un elemento al principio o al final. Cada cambio se guarda automáticamente.' : query.trim() ? 'Borra la búsqueda para ordenar toda la lista.' : hasCatalogOrder(nodes) ? 'El orden que elijas también se usará en los desplegables de la plataforma.' : 'La opción de ordenar está pendiente de activación.'}</p></div>
    {loading && !ready ? <p role="status" className="cloud-loading"><LoaderCircle size={18} className="spin"/>Consultando las listas…</p> : <div className="organization-columns">{(['site', 'zone', 'installation'] as const).map(kind => {
      const parent = kind === 'zone' ? byId.get(site) : kind === 'installation' ? byId.get(zone) : undefined;
      const enabled = ready && !busy && !ordering && (kind !== 'installation' || catalog.installationsReady) && (kind === 'site' || !!parent && active(parent));
      return <section className="organization-column" key={kind} aria-label={plural[kind]}><div className="organization-column-heading"><h2>{kind === 'site' && <Building2 size={18}/>} {plural[kind]} <span>{lists[kind].length}</span></h2><button type="button" className="text-button" disabled={!enabled} aria-label={`Añadir ${singular[kind]}`} onClick={() => add(kind)}><Plus size={15}/>Añadir</button></div>
        {kind !== 'site' && <p className="organization-parent-name">{organizationLabel(parent?.name) || `Selecciona ${kind === 'zone' ? 'una sede' : 'una zona'} para ver sus ${kind === 'zone' ? 'zonas' : 'instalaciones'}.`}</p>}
        <ul className="organization-node-list">{lists[kind].map((node, index) => {
          const selected = kind === 'site' ? site === node.id : kind === 'zone' ? zone === node.id : false;
          const available = active(node), canRestore = node.parent_id === null || !!byId.get(node.parent_id) && active(byId.get(node.parent_id)!);
          return <li key={node.id} className={selected ? 'organization-node-selected' : ''}><div className="organization-node-name">{kind === 'installation' ? <span>{organizationLabel(node.name)}</span> : <button type="button" aria-pressed={selected} onClick={() => { if (kind === 'site') { setSite(node.id); setZone(''); } else setZone(node.id); }}>{organizationLabel(node.name)}</button>}{!available && <small>{node.enabled ? 'Su sede o zona está retirada' : 'Retirado'}</small>}</div><div className="organization-node-actions">{ordering ? <CatalogOrderControls label={organizationLabel(node.name)} index={index} count={lists[kind].length} disabled={busy || !ready || kind === 'installation' && !catalog.installationsReady} onMove={direction => void move(node, direction, lists[kind])}/> : <><button type="button" className="icon-button" aria-label={`Editar ${singular[kind]} ${organizationLabel(node.name)}`} disabled={busy} onClick={() => { setError(''); setEditor({ node: { ...node }, creating: false, displayName: organizationLabel(node.name) }); }}><Pencil size={15}/></button>{node.enabled ? <button type="button" className="icon-button delete-button" disabled={busy} aria-label={`Retirar ${singular[kind]} ${organizationLabel(node.name)}`} onClick={() => { setError(''); setRemoving(node); }}><Trash2 size={15}/></button> : <button type="button" className="icon-button" disabled={busy || !canRestore} title={!canRestore ? 'Restaura primero su sede o zona.' : undefined} aria-label={`Restaurar ${singular[kind]} ${organizationLabel(node.name)}`} onClick={() => void commit({ ...node, enabled: true })}><RotateCcw size={15}/></button>}</>}</div></li>;
        })}</ul>{!lists[kind].length && <p className="organization-empty">{kind === 'installation' && !catalog.installationsReady ? 'Lista de instalaciones pendiente. Esta opción permanecerá bloqueada hasta que se cargue la lista.' : terms.length ? 'No hay coincidencias en esta lista.' : kind === 'site' || parent ? 'Todavía no hay elementos en esta lista.' : `Elige ${kind === 'zone' ? 'una sede' : 'una zona'} de la lista anterior.`}</p>}
      </section>;
    })}</div>}
    {editor && <Modal title={`${editor.creating ? 'Añadir' : 'Editar'} ${singular[editor.node.kind]}`} onClose={() => !busy && setEditor(null)}><form onSubmit={event => { event.preventDefault(); void commit(editor.node, editor.creating); }}>
      {editor.node.kind !== 'site' && <Field label={editor.node.kind === 'zone' ? 'Sede' : 'Zona'} required>{props => <Select {...props} searchable searchLabel={editor.node.kind === 'zone' ? 'Buscar sedes' : 'Buscar zonas'} value={editor.node.parent_id || ''} disabled={busy} placeholder={editor.node.kind === 'zone' ? 'Selecciona una sede' : 'Selecciona una zona'} options={parentOptions} onChange={value => setEditor(previous => previous && { ...previous, node: { ...previous.node, parent_id: value } })}/>}</Field>}
      <Field label={`Nombre ${editor.node.kind === 'zone' ? 'de la zona' : editor.node.kind === 'site' ? 'de la sede' : 'de la instalación'}`} required>{props => <input {...props} autoFocus required maxLength={250} disabled={busy} value={editor.displayName} onChange={event => setEditor(previous => previous && { ...previous, displayName: event.target.value, node: { ...previous.node, name: event.target.value } })}/>}</Field>
      {error && <p role="alert" className="error-message cloud-message">{error}</p>}<div className="modal-actions"><button type="button" className="button button-outline" disabled={busy} onClick={() => setEditor(null)}>Cancelar</button><button type="submit" className="button button-primary" disabled={busy || !editor.node.name.trim() || editor.node.kind !== 'site' && !editor.node.parent_id}>{busy ? <LoaderCircle size={16} className="spin"/> : <Check size={16}/>}Guardar</button></div>
    </form></Modal>}
    {removing && <Modal title={`Retirar ${singular[removing.kind]}`} onClose={() => !busy && setRemoving(null)}><p className="modal-description">Se quitará <strong>{organizationLabel(removing.name)}</strong> de las listas de selección.{removing.kind !== 'installation' && ' Sus zonas e instalaciones asociadas tampoco estarán disponibles mientras esté retirado.'} Las inspecciones existentes conservarán su información.</p>{error && <p role="alert" className="error-message cloud-message">{error}</p>}<div className="modal-actions"><button type="button" className="button button-outline" disabled={busy} onClick={() => setRemoving(null)}>Cancelar</button><button type="button" className="button button-danger" disabled={busy} onClick={() => void commit({ ...removing, enabled: false })}>{busy ? <LoaderCircle size={16} className="spin"/> : <Trash2 size={16}/>}Retirar</button></div></Modal>}
  </section>;
}
