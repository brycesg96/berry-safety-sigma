import { useSyncExternalStore } from 'react';
import { organizationCatalogState, subscribeOrganizationCatalog } from './organization-catalog';

export const useOrganizationCatalog = () => useSyncExternalStore(subscribeOrganizationCatalog, organizationCatalogState);
