import { useSyncExternalStore } from 'react';
import { supabaseClient } from './supabase';
import seed from './location-seed.json' with { type: 'json' };
import fundo from './fundo-installations.json' with { type: 'json' };
import { saveCatalogOrder } from './catalog-order';

export type LocationKind = 'site' | 'zone' | 'installation';
export type LocationNode = { id: string; parent_id: string | null; kind: LocationKind; name: string; enabled: boolean; revision: number; sort_order?: number };
export const INITIAL_LOCATION_NODES = seed as LocationNode[];
export const PREVIEW_LOCATION_NODES: LocationNode[] = [...INITIAL_LOCATION_NODES, ...fundo.zones.flatMap(zone => [
  ...(!INITIAL_LOCATION_NODES.some(node => node.id === zone.id) ? [{ id: zone.id, parent_id: fundo.siteId, kind: 'zone' as const, name: zone.name, enabled: true, revision: 1 }] : []),
  ...zone.installations.map((node, index) => ({ ...node, parent_id: zone.id, kind: 'installation' as const, enabled: true, revision: 1, sort_order: index + 1 })),
])];
export type LocationCatalog = { nodes: readonly LocationNode[]; installationsReady: boolean; installationSiteIds: readonly string[]; installationZoneIds: readonly string[]; mode: 'preview' | 'legacy' | 'cloud'; loading: boolean; error: string };
const preview = { nodes: PREVIEW_LOCATION_NODES, installationsReady: false, installationSiteIds: [fundo.siteId], installationZoneIds: fundo.zones.map(zone => zone.id) };
const empty = { nodes: [], installationsReady: false, installationSiteIds: [], installationZoneIds: [] };
let state: LocationCatalog = { ...preview, mode: 'preview', loading: false, error: '' }, generation = 0;
const listeners = new Set<() => void>();
export const locationCatalogState = () => state;
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const useLocationCatalog = () => useSyncExternalStore(subscribe, locationCatalogState);
function publish(next: LocationCatalog) { state = next; listeners.forEach(listener => listener()); }
export const installationsReadyForSite = (catalog: Pick<LocationCatalog, 'installationsReady' | 'installationSiteIds'>, id?: string | null) => catalog.installationsReady || !!id && catalog.installationSiteIds.includes(id);
export const installationsReadyForZone = (catalog: Pick<LocationCatalog, 'installationsReady' | 'installationZoneIds'>, id?: string | null) => catalog.installationsReady || !!id && catalog.installationZoneIds.includes(id);
export function resetLocationCatalog(mode: 'preview' | 'legacy' = 'legacy') {
  generation++; publish({ ...(mode === 'preview' ? preview : empty), mode, loading: false, error: '' });
}
export function locationNodeActive(node: LocationNode, nodes: readonly LocationNode[]): boolean {
  if (!node.enabled) return false;
  if (node.kind === 'site') return node.parent_id === null;
  const parent = nodes.find(item => item.id === node.parent_id);
  return !!parent && parent.kind === (node.kind === 'zone' ? 'site' : 'zone') && locationNodeActive(parent, nodes);
}
function nodeResponse(value: unknown): LocationNode {
  const node = value as LocationNode;
  if (!node || !['site', 'zone', 'installation'].includes(node.kind) || typeof node.id !== 'string' || typeof node.name !== 'string' || typeof node.enabled !== 'boolean' || !Number.isSafeInteger(node.revision) || node.revision < 1 || node.parent_id !== null && typeof node.parent_id !== 'string') throw new Error('No pudimos verificar las sedes, zonas e instalaciones. Actualiza la lista.');
  if (node.sort_order !== undefined && (!Number.isSafeInteger(node.sort_order) || node.sort_order < 0)) throw new Error('El catálogo de instalaciones no pudo verificarse. Actualiza la lista.');
  return node;
}
const failure = (code?: string) => code === 'PGRST202' ? 'La gestión de instalaciones está pendiente de activación.' : code === '42501' ? 'No tienes acceso a la gestión de instalaciones. Actualiza tu sesión.' : 'No pudimos consultar las sedes, zonas e instalaciones. Revisa tu conexión y vuelve a intentarlo.';
export async function refreshLocationCatalog(isCurrent: () => boolean = () => true) {
  const request = ++generation; publish({ ...state, mode: 'cloud', loading: true, error: '' });
  try {
    const { data, error } = await supabaseClient().rpc('berry_location_catalog').abortSignal(AbortSignal.timeout(12000));
    if (error) throw new Error(failure(error.code));
    if (!data || !Array.isArray(data.nodes) || typeof data.installationsReady !== 'boolean') throw new Error(failure());
    const nodes = data.nodes.map(nodeResponse);
    const scopes = (value: unknown, kind: LocationKind): string[] => {
      if (value === undefined) return [];
      if (!Array.isArray(value) || value.some(id => typeof id !== 'string' || !nodes.some((node: LocationNode) => node.id === id && node.kind === kind))) throw new Error(failure());
      return [...new Set(value)];
    };
    const installationSiteIds = scopes(data.installationSiteIds, 'site'), installationZoneIds = scopes(data.installationZoneIds, 'zone');
    if (request === generation && isCurrent()) publish({ nodes, installationsReady: data.installationsReady, installationSiteIds, installationZoneIds, mode: 'cloud', loading: false, error: '' });
  } catch (problem) {
    if (request !== generation || !isCurrent()) return;
    const message = problem instanceof Error ? problem.message : failure();
    publish({ ...empty, mode: 'cloud', loading: false, error: message }); throw new Error(message);
  }
}
export async function loadLocationNodes() {
  const { data, error } = await supabaseClient().rpc('berry_admin_locations').abortSignal(AbortSignal.timeout(12000));
  if (error || !Array.isArray(data)) throw new Error(failure(error?.code));
  return data.map(nodeResponse);
}
export async function reorderLocationNodes(nodes: readonly LocationNode[]) {
  return (await saveCatalogOrder('locations', nodes)).map(nodeResponse);
}
export async function saveLocationNode(node: LocationNode, creating = false) {
  const { data, error } = await supabaseClient().rpc('berry_manage_location', { p_id: node.id, p_kind: node.kind, p_parent_id: node.parent_id, p_name: node.name.trim().replace(/\s+/g, ' '), p_enabled: node.enabled, p_expected: creating ? null : node.revision }).abortSignal(AbortSignal.timeout(20000));
  if (error) throw new Error(error.code === '23505' ? 'Ya existe un elemento con ese nombre en esta lista. Puedes editarlo o restaurarlo.' : error.code === '40001' ? 'La lista cambió en otra sesión. Actualízala antes de volver a guardar.' : error.code === '22023' ? 'Revisa el nombre y selecciona una sede o zona activa. La lista de instalaciones puede estar pendiente de carga.' : error.code === '42501' || error.code === 'PGRST202' ? failure(error.code) : 'No pudimos confirmar el cambio. Conserva los datos y vuelve a intentarlo.');
  return nodeResponse(data);
}
