import { supabaseClient } from './supabase';

export type OrderedCatalogNode = { id: string; parent_id: string | null; kind: string; name: string; revision: number; sort_order?: number };
export type CatalogMove = 'first' | 'up' | 'down' | 'last';
export const compareCatalogNodes = (a: OrderedCatalogNode, b: OrderedCatalogNode) => (a.sort_order ?? Number.MAX_SAFE_INTEGER) - (b.sort_order ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name, 'es') || a.id.localeCompare(b.id);
export const hasCatalogOrder = (nodes: readonly OrderedCatalogNode[]) => nodes.length > 0 && nodes.every(node => Number.isSafeInteger(node.sort_order) && node.sort_order! >= 0);

// Include retired siblings in the request so a concurrent addition, retirement
// or move to another parent cannot silently overwrite the administrator's list.
export function moveCatalogNode<T extends OrderedCatalogNode>(nodes: readonly T[], visible: readonly T[], node: T, move: CatalogMove): T[] {
  const index = visible.findIndex(item => item.id === node.id);
  const target = visible[move === 'first' ? 0 : move === 'last' ? visible.length - 1 : index + (move === 'up' ? -1 : 1)];
  const siblings = nodes.filter(item => item.kind === node.kind && item.parent_id === node.parent_id).sort(compareCatalogNodes);
  if (!target || target.id === node.id) return siblings;
  const next = siblings.filter(item => item.id !== node.id);
  const targetIndex = next.findIndex(item => item.id === target.id);
  next.splice(targetIndex + (move === 'down' || move === 'last' ? 1 : 0), 0, node);
  return next;
}

export async function saveCatalogOrder(catalog: 'organization' | 'locations', nodes: readonly OrderedCatalogNode[]): Promise<unknown[]> {
  const { data, error } = await supabaseClient().rpc('berry_reorder_catalog', { p_catalog: catalog, p_ids: nodes.map(node => node.id), p_revisions: nodes.map(node => node.revision) }).abortSignal(AbortSignal.timeout(20000));
  if (error) throw new Error(error.code === '40001' ? 'La lista cambió en otra sesión. Termina de ordenar y pulsa Actualizar listas antes de volver a intentarlo.' : error.code === 'PGRST202' ? 'La opción de ordenar está pendiente de activación.' : error.code === '42501' ? 'No tienes permiso para ordenar estas listas. Actualiza tu sesión.' : 'No pudimos confirmar el nuevo orden. Vuelve a intentarlo o actualiza las listas.');
  if (!Array.isArray(data) || data.length !== nodes.length || new Set(data.map(node => node?.id)).size !== nodes.length || data.some(node => !nodes.some(item => item.id === node?.id) || !Number.isSafeInteger(node?.sort_order) || node.sort_order < 0)) throw new Error('No pudimos verificar el nuevo orden. Actualiza las listas.');
  return data;
}
