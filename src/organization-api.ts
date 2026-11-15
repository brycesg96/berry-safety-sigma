import { supabaseClient } from './supabase';
import { beginOrganizationCatalogRefresh, finishOrganizationCatalogRefresh } from './organization-catalog';
import type { OrganizationEntry, OrganizationNode } from './organization-catalog';

const failure = (code?: string) => code === 'PGRST202' ? 'La gestión de áreas e instalaciones está pendiente de activación.' : code === '42501' ? 'No tienes acceso a la gestión de áreas. Actualiza tu sesión.' : 'No pudimos consultar las gerencias, áreas y puestos. Revisa tu conexión y vuelve a intentarlo.';
function catalogResponse(data: unknown): OrganizationEntry[] {
  if (!Array.isArray(data) || data.some(entry => !entry || typeof entry.management !== 'string' || !Array.isArray(entry.areas) || entry.areas.some((area: unknown) => typeof area !== 'string') || entry.areaNomenclatures !== undefined && (!entry.areaNomenclatures || typeof entry.areaNomenclatures !== 'object' || Array.isArray(entry.areaNomenclatures) || Object.values(entry.areaNomenclatures).some(alias => typeof alias !== 'string' || alias.length > 50)) || !entry.positions || typeof entry.positions !== 'object' || entry.areas.some((area: string) => !Array.isArray(entry.positions[area]) || entry.positions[area].some((job: unknown) => typeof job !== 'string')))) throw new Error('El catálogo de áreas no pudo verificarse. Vuelve a actualizarlo.');
  return data;
}
export async function refreshOrganizationCatalog(isCurrent: () => boolean = () => true) {
  const request = beginOrganizationCatalogRefresh();
  try {
    const { data, error } = await supabaseClient().rpc('berry_organization_catalog').abortSignal(AbortSignal.timeout(12000));
    if (!isCurrent()) return;
    if (error) throw new Error(failure(error.code));
    finishOrganizationCatalogRefresh(request, catalogResponse(data));
  } catch (problem) {
    if (!isCurrent()) return;
    const message = problem instanceof Error ? problem.message : failure();
    finishOrganizationCatalogRefresh(request, [], message);
    throw new Error(message);
  }
}
function nodeResponse(data: unknown): OrganizationNode {
  const node = data as OrganizationNode | null;
  if (!node || node.nomenclature !== undefined && (typeof node.nomenclature !== 'string' || node.nomenclature.length > 50 || node.kind !== 'area' && node.nomenclature !== '') || typeof node.id !== 'string' || !['management', 'area', 'position'].includes(node.kind) || typeof node.name !== 'string' || typeof node.enabled !== 'boolean' || !Number.isSafeInteger(node.revision) || node.revision < 1 || node.parent_id !== null && typeof node.parent_id !== 'string') throw new Error('No pudimos verificar los datos del área. Actualiza la lista.');
  return node;
}
export async function loadOrganizationNodes() {
  const { data, error } = await supabaseClient().rpc('berry_admin_organization').abortSignal(AbortSignal.timeout(12000));
  if (error || !Array.isArray(data)) throw new Error(failure(error?.code));
  return data.map(nodeResponse);
}
export async function saveOrganizationNode(node: OrganizationNode, creating = false) {
  const withNomenclature = node.kind === 'area' && node.nomenclature !== undefined;
  const { data, error } = await supabaseClient().rpc(withNomenclature ? 'berry_manage_organization_v2' : 'berry_manage_organization', { p_id: node.id, p_kind: node.kind, p_parent_id: node.parent_id, p_name: node.name.trim().replace(/\s+/g, ' '), p_enabled: node.enabled, p_expected: creating ? null : node.revision, ...(withNomenclature ? { p_nomenclature: node.nomenclature!.trim().replace(/\s+/g, ' ') } : {}) }).abortSignal(AbortSignal.timeout(20000));
  if (error) throw new Error(error.code === '23505' ? 'Ya existe un elemento con ese nombre en esta lista. Puedes editarlo o restaurarlo.' : error.code === '40001' ? 'La lista cambió en otra sesión. Actualízala antes de volver a guardar.' : error.code === '22023' ? 'Revisa el nombre y selecciona una gerencia o área activa.' : error.code === '42501' || error.code === 'PGRST202' ? failure(error.code) : 'No pudimos confirmar el cambio. Conserva los datos y vuelve a intentarlo.');
  return nodeResponse(data);
}
