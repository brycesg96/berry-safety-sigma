import { expect } from '@playwright/test';
import type { BrowserContext } from '@playwright/test';
import type { OrderedCatalogNode } from '../src/catalog-order';

export function withCatalogOrder<T extends OrderedCatalogNode>(nodes: readonly T[]): T[] {
  return nodes.map(node => ({ ...node, sort_order: [...nodes].filter(item => item.kind === node.kind && item.parent_id === node.parent_id).sort((a, b) => a.name.localeCompare(b.name, 'es')).findIndex(item => item.id === node.id) + 1 }));
}

export async function mockCatalogOrder<T extends OrderedCatalogNode>(context: BrowserContext, state: { nodes: T[] }) {
  const control = { fail: false, conflict: false, writes: [] as Record<string, unknown>[] };
  await context.route('**/rest/v1/rpc/berry_reorder_catalog', async route => {
    const body = route.request().postDataJSON(); control.writes.push(body);
    if (control.fail) return route.fulfill({ status: 503, json: { message: 'offline' } });
    if (control.conflict) return route.fulfill({ status: 409, json: { code: '40001' } });
    const nodes = (body.p_ids as string[]).map(id => state.nodes.find(node => node.id === id)!);
    expect(nodes.every(node => node.kind === nodes[0].kind && node.parent_id === nodes[0].parent_id)).toBe(true);
    expect(nodes).toHaveLength(state.nodes.filter(node => node.kind === nodes[0].kind && node.parent_id === nodes[0].parent_id).length);
    const saved = nodes.map((node, index) => ({ ...node, sort_order: index + 1, revision: node.revision + (node.sort_order === index + 1 ? 0 : 1) }));
    state.nodes = [...state.nodes.filter(node => !body.p_ids.includes(node.id)), ...saved].sort((a, b) => a.sort_order! - b.sort_order!);
    return route.fulfill({ json: saved });
  });
  return control;
}
