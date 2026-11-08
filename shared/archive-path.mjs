const months = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
/** Archive by inspection date, even if sending occurs in a different month. */
export function inspectionArchiveFolder(date) {
  if (typeof date !== 'string' || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(date)) throw new Error('Fecha de inspección inválida.');
  const parsed = new Date(`${date}T12:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new Error('Fecha de inspección inválida.');
  const month = Number(date.slice(5, 7));
  return `${date.slice(0, 4)}/${date.slice(5, 7)}-${months[month - 1]}`;
}
export function inspectionArchivePath(date, inspectionId, hash, filename) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(inspectionId) ||
    !/^[a-f0-9]{64}$/.test(hash) || typeof filename !== 'string' || !filename || /[\\/\u0000-\u001f]/.test(filename) || filename === '.' || filename === '..') throw new Error('Ruta del informe inválida.');
  return `${inspectionArchiveFolder(date)}/${inspectionId.toLowerCase()}/${hash}/${filename}`;
}
