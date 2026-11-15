const connectors = new Set(['a', 'al', 'con', 'de', 'del', 'e', 'el', 'en', 'la', 'las', 'lo', 'los', 'o', 'para', 'por', 'sin', 'sobre', 'un', 'una', 'y', 'u', 'of']);
const acronyms = new Set(['ADM', 'BI', 'CAE', 'CAPEX', 'CAT', 'CCTV', 'EHS', 'ERP', 'HACCP', 'HSE', 'IPERC', 'ISO', 'IT', 'KPI', 'MC', 'RRHH', 'RR.HH.', 'SAP', 'SIGMA', 'SS.GG.', 'SSOMA', 'SST', 'TI', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']);
const acronymKeys = new Set([...acronyms].map(value => value.replace(/\./g, '')));

/** Display only: catalog values remain unchanged for selection and persistence. */
export function organizationLabel(value?: string): string {
  let first = true;
  return (value || '').trim().replace(/\s+/g, ' ').replace(/[\p{L}\p{N}]+(?:\.[\p{L}]+)*\.?/gu, word => {
    const initial = first; first = false;
    const upper = word.toLocaleUpperCase('es'), lower = word.toLocaleLowerCase('es');
    if (acronymKeys.has(upper.replace(/\./g, '')) || /^[a-z]{1,3}\d+[a-z\d]*$/i.test(word)) return upper;
    if (!initial && connectors.has(lower)) return lower;
    // Keep intentional brand casing such as SharePoint.
    if (/\p{Ll}.*\p{Lu}/u.test(word)) return word;
    return lower.charAt(0).toLocaleUpperCase('es') + lower.slice(1);
  });
}
