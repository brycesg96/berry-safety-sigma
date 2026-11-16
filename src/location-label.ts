// Physical catalog names are reviewed when imported and remain editable by the
// administrator. Preserve module letters, Roman numerals, brands and units m³.
export const locationLabel = (value?: string) => (value || '').trim().replace(/\s+/g, ' ');
