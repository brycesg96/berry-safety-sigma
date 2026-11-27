import { buildEmergencyWorkbook } from './emergency-workbook';
import type { EmergencyExportData } from './emergency-export-data';
const worker = globalThis as unknown as { onmessage: ((event: MessageEvent<EmergencyExportData>) => void) | null; postMessage: (value: unknown, transfer?: Transferable[]) => void };
worker.onmessage = async event => {
 try {
  const file = await buildEmergencyWorkbook(event.data);
  worker.postMessage(file, [file.bytes.buffer as ArrayBuffer]);
 } catch {
  worker.postMessage({ error: 'No pudimos generar el Excel. Conservamos los datos en Berry; vuelve a intentarlo.' });
 }
};
