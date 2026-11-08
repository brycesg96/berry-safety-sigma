import { createMailSessionHandler, MAIL_SESSION_PATH } from './mail-session.mjs';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { createReportHandler, REPORT_PATH } from './make-report.mjs';
import { createMakeTestHandler } from './make-test.mjs';
import { ACCOUNTS_PATH, PASSWORD_PATH, createAccountsHandler } from './accounts.mjs';
import { CLOUD_REPORT_PATH, CLOUD_FINAL_PATH, createCloudReportHandler } from './cloud-reports.mjs';
export function createApi(options = {}) {
  const sessionHandler = createMailSessionHandler(options);
  const testHandler = createMakeTestHandler(options);
  const reportHandler = createReportHandler(options);
  const accountsHandler = createAccountsHandler(options);
  const cloudReportHandler = createCloudReportHandler(options);
  const handler = (req, res) => req.url === CLOUD_REPORT_PATH || req.url === CLOUD_FINAL_PATH ? cloudReportHandler(req, res) : req.url === ACCOUNTS_PATH || req.url === PASSWORD_PATH ? accountsHandler(req, res) : req.url === MAIL_SESSION_PATH ? sessionHandler(req, res) : req.url === REPORT_PATH ? reportHandler(req, res) : testHandler(req, res);
  return createServer({ requestTimeout: 60000, headersTimeout: 5000, keepAliveTimeout: 5000, maxHeaderSize: 8192 }, (req, res) => {
    handler(req, res).catch(() => { if (!res.headersSent) { res.writeHead(500, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({ ok: false, code: 'INTERNAL_ERROR', message: 'No se pudo completar la prueba.' })); } else res.end(); });
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const port = Number(process.env.PORT || 8787);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT no es válido.');
    const server = createApi();
    server.on('error', () => { console.error('No se pudo iniciar la API de pruebas.'); process.exitCode = 1; });
    server.listen(port, process.env.HOST || '0.0.0.0', () => console.log(`Berry Make test API disponible en puerto ${port}.`));
    for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => process.exit(0)));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
