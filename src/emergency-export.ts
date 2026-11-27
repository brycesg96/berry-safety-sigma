import type { EmergencyExportData } from './emergency-export-data';

export type EmergencyExportFile = { name: string; bytes: Uint8Array };
export function createEmergencyExport(data: EmergencyExportData, signal: AbortSignal): Promise<EmergencyExportFile> {
 signal.throwIfAborted();
 return new Promise((resolve, reject) => {
  const worker = new Worker(new URL('./emergency-export.worker.ts', import.meta.url), { type: 'module' });
  const close = () => { worker.terminate(); signal.removeEventListener('abort', abort); };
  const abort = () => { close(); reject(new DOMException('Generación cancelada', 'AbortError')); };
  signal.addEventListener('abort', abort, { once: true });
  worker.onerror = () => { close(); reject(new Error('No pudimos generar el Excel. Vuelve a intentarlo.')); };
  worker.onmessage = event => {
   close();
   if (event.data?.error) reject(new Error(event.data.error));
   else if (typeof event.data?.name === 'string' && event.data?.bytes instanceof Uint8Array) resolve(event.data);
   else reject(new Error('No pudimos verificar el archivo generado.'));
  };
  worker.postMessage(data);
 });
}
export function downloadEmergencyExport(file: EmergencyExportFile) {
 const url = URL.createObjectURL(new Blob([file.bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
 const link = document.createElement('a'); link.href = url; link.download = file.name; link.click();
 return { url, name: file.name };
}
