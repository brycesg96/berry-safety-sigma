/** Official Gerencia → Área pairs will be supplied by the organization. */
export type OrganizationEntry = { management: string; areas: readonly string[] };
export const ORGANIZATION_CATALOG: readonly OrganizationEntry[] = [];
