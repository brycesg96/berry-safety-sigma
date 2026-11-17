export function productivityReady() {
  try { return JSON.parse(localStorage.getItem('berry-offline-schema-v1') || '{}').productivity_version === '202611170023'; }
  catch { return false; }
}
