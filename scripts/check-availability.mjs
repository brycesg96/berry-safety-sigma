import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { SUPABASE_PROJECT } from '../src/supabase-project.ts';

const WEB = 'https://brycesg96.github.io/berry-safety-sigma/';
const API = 'https://berry-safety-api.onrender.com';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

function publicURL(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Usa una URL pública HTTPS sin credenciales ni parámetros.');
  return url;
}

/** Read-only probes. No login, real inspection, message or synthetic delivery event is created. */
export async function checkAvailability({ webURL = WEB, apiURL = API, database = SUPABASE_PROJECT, fetchImpl = fetch, delay = pause, timeoutMs = 65000, maxDurationMs = 240000 } = {}) {
  const web = publicURL(webURL), api = publicURL(apiURL), db = publicURL(database.url);
  const deadline = Date.now() + maxDurationMs;
  const checks = [];
  const request = async (url, options = {}) => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error('Se agotó el tiempo total de comprobación.');
      try {
        const response = await fetchImpl(url, { method: 'GET', redirect: 'error', ...options, signal: AbortSignal.timeout(Math.min(timeoutMs, remaining)) });
        if (attempt === 0 && (response.status === 429 || response.status >= 500)) { await response.body?.cancel(); await delay(1000); continue; }
        return response;
      } catch (error) {
        if (attempt === 1) throw error;
        await delay(1000);
      }
    }
  };
  const check = async (name, action) => {
    const started = Date.now();
    try { checks.push({ name, ok: true, detail: await action(), durationMs: Date.now() - started }); }
    catch (error) {
      const code = /^[A-Z_]+$/.test(error?.cause?.code || '') ? ` (${error.cause.code})` : '';
      checks.push({ name, ok: false, detail: error instanceof Error ? error.message + code : 'No se pudo completar la comprobación.', durationMs: Date.now() - started });
    }
  };
  let assets = [];
  await check('Página web', async () => {
    const response = await request(web);
    if (response.status !== 200) throw new Error(`La página respondió HTTP ${response.status}.`);
    const html = await response.text();
    const script = html.match(/<script\b[^>]*\bsrc=["']([^"']+\.js)["']/i)?.[1];
    const css = html.match(/<link\b(?=[^>]*\brel=["']stylesheet["'])[^>]*\bhref=["']([^"']+)["']/i)?.[1];
    if (!/\bid=["']root["']/.test(html) || !script || !css) throw new Error('El HTML no contiene la aplicación y sus archivos de producción.');
    assets = [script, css].map(path => {
      const asset = new URL(path, web);
      if (asset.origin !== web.origin || !asset.pathname.startsWith(web.pathname)) throw new Error('El HTML apunta a archivos fuera de la ubicación esperada.');
      return asset;
    });
    return 'HTML de la aplicación disponible.';
  });
  await check('Archivos JavaScript y CSS', async () => {
    if (assets.length !== 2) throw new Error('No se pudieron identificar los archivos de la web.');
    for (const asset of assets) {
      const response = await request(asset, { method: 'HEAD' });
      if (response.status !== 200) throw new Error(`${asset.pathname.split('/').at(-1)} respondió HTTP ${response.status}.`);
      const expected = asset.pathname.endsWith('.js') ? /javascript/ : /text\/css/;
      if (!expected.test(response.headers.get('content-type') || '')) throw new Error('Uno de los archivos tiene un tipo de contenido incorrecto.');
    }
    return 'El navegador puede descargar el código y los estilos.';
  });
  await check('API de Berry Safety', async () => {
    const response = await request(new URL('/healthz', api));
    if (response.status !== 200) throw new Error(`La API respondió HTTP ${response.status}.`);
    const result = await response.json();
    if (result.status !== 'ok') throw new Error('La API no confirmó su estado operativo.');
    return `API disponible${/^[a-f0-9]{40}$/.test(result.revision || '') ? ` · revisión ${result.revision.slice(0, 7)}` : ''}.`;
  });
  await check('Base de datos y esquema', async () => {
    const response = await request(new URL('/rest/v1/rpc/berry_schema_status', db), { headers: { apikey: database.publishableKey } });
    if (response.status !== 200) throw new Error(`La consulta pública de estado respondió HTTP ${response.status}.`);
    const result = await response.json();
    if (result.sync_ready !== true || !result.reports_version || !result.productivity_version) throw new Error('El esquema no confirmó inspecciones, productividad y sincronización disponibles.');
    return 'Inspecciones y productividad habilitadas; consulta pública disponible.';
  });
  await check('Rutas de envío y seguimiento de correo', async () => {
    for (const path of ['/api/inspections/send', '/api/mail/events']) {
      const response = await request(new URL(path, api), { headers: { Origin: web.origin } });
      if (response.status !== 405 || (await response.json()).code !== 'METHOD_NOT_ALLOWED') throw new Error(`${path} no devolvió el contrato HTTP esperado.`);
    }
    return 'Las rutas están instaladas. Esta comprobación no envía correos ni acredita entrega.';
  });
  return { checkedAt: new Date().toISOString(), ok: checks.every(check => check.ok), checks, mailDelivery: 'not_tested' };
}

async function main() {
  let report;
  try { report = await checkAvailability({ webURL: process.env.BERRY_HEALTH_WEB_URL || WEB, apiURL: process.env.BERRY_HEALTH_API_URL || API }); }
  catch (error) { report = { checkedAt: new Date().toISOString(), ok: false, checks: [{ name: 'Configuración', ok: false, detail: error.message }], mailDelivery: 'not_tested' }; }
  await mkdir('quality-reports', { recursive: true });
  await writeFile('quality-reports/availability.json', JSON.stringify(report, null, 2) + '\n');
  const rows = report.checks.map(check => `| ${check.ok ? 'Correcto' : 'Fallo'} | ${check.name} | ${check.detail.replace(/[|\r\n]/g, ' ')} |`).join('\n');
  const summary = `## Disponibilidad de Berry Safety\n\n| Resultado | Comprobación | Detalle |\n| --- | --- | --- |\n${rows}\n\nLa disponibilidad de las rutas de correo no confirma la entrega al destinatario.\n`;
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
  for (const check of report.checks) console.log(`${check.ok ? 'OK' : 'FALLO'} · ${check.name}: ${check.detail}`);
  process.exitCode = report.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
