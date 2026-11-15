import seed from './organization-seed.json' with { type: 'json' };
import { compareCatalogNodes } from './catalog-order';

export type OrganizationEntry = { management: string; areas: readonly string[]; positions?: Readonly<Record<string, readonly string[]>>; areaNomenclatures?: Readonly<Record<string, string>> };
export type OrganizationKind = 'management' | 'area' | 'position';
export type OrganizationNode = { id: string; parent_id: string | null; kind: OrganizationKind; name: string; enabled: boolean; revision: number; nomenclature?: string; sort_order?: number };

export function organizationNodeActive(node: OrganizationNode, nodes: readonly OrganizationNode[]): boolean {
  if (!node.enabled) return false;
  if (node.kind === 'management') return node.parent_id === null;
  const parent = nodes.find(item => item.id === node.parent_id);
  return !!parent && parent.kind === (node.kind === 'area' ? 'management' : 'area') && organizationNodeActive(parent, nodes);
}
export function catalogFromNodes(nodes: readonly OrganizationNode[]): OrganizationEntry[] {
  nodes = [...nodes].sort(compareCatalogNodes);
  return nodes.filter(node => node.kind === 'management' && organizationNodeActive(node, nodes)).map(management => {
    const areas = nodes.filter(node => node.kind === 'area' && node.parent_id === management.id && organizationNodeActive(node, nodes));
    const positions = Object.fromEntries(areas.map(area => [area.name, nodes.filter(node => node.kind === 'position' && node.parent_id === area.id && node.enabled).map(node => node.name)]).filter(([, jobs]) => jobs.length));
    return { management: management.name, areas: areas.map(area => area.name).filter(name => positions[name]?.length), positions, areaNomenclatures: Object.fromEntries(areas.filter(area => area.nomenclature !== undefined).map(area => [area.name, area.nomenclature!.trim()])) };
  }).filter(entry => entry.areas.length);
}
export const INITIAL_ORGANIZATION_NODES = seed as OrganizationNode[];
const initialCatalog = catalogFromNodes(INITIAL_ORGANIZATION_NODES);
export let ORGANIZATION_CATALOG: readonly OrganizationEntry[] = initialCatalog;
type CatalogState = { catalog: readonly OrganizationEntry[]; mode: 'preview' | 'legacy' | 'cloud'; loading: boolean; error: string };
let state: CatalogState = { catalog: ORGANIZATION_CATALOG, mode: 'preview', loading: false, error: '' };
let generation = 0;
const listeners = new Set<() => void>();
export const organizationCatalogState = () => state;
export const subscribeOrganizationCatalog = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
function publish(next: CatalogState) { state = next; ORGANIZATION_CATALOG = next.catalog; listeners.forEach(listener => listener()); }
export function resetOrganizationCatalog(mode: 'preview' | 'legacy' = 'legacy') { generation++; publish({ catalog: mode === 'preview' ? initialCatalog : [], mode, loading: false, error: '' }); }
export function beginOrganizationCatalogRefresh() { const request = ++generation; publish({ ...state, mode: 'cloud', loading: true, error: '' }); return request; }
export function finishOrganizationCatalogRefresh(request: number, catalog: readonly OrganizationEntry[], error = '') {
  if (request !== generation) return;
  publish({ catalog: error ? [] : catalog, mode: 'cloud', loading: false, error });
}
