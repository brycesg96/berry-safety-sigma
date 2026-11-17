import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, cp, rm } from 'node:fs/promises';
import { join, resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

test('the production Docker COPY files start the API without local dependencies and expose notifications', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const image = await mkdtemp(join(tmpdir(), 'berry-server-image-'));
  try {
    const dockerfile = await readFile(join(root, 'server/Dockerfile'), 'utf8');
    for (const line of dockerfile.split('\n').filter(line => /^COPY\s/.test(line))) {
      const args = line.split(/\s+/).slice(1).filter(arg => !arg.startsWith('--'));
      const target = args.pop();
      for (const source of args) {
        const destination = resolve(image, target, ...(args.length > 1 || target.endsWith('/') ? [basename(source)] : []));
        await mkdir(resolve(destination, '..'), { recursive: true });
        await cp(join(root, source), destination, { recursive: true });
      }
    }
    const script = `
      const { createApi } = await import(${JSON.stringify(pathToFileURL(join(image, 'server/index.mjs')).href)});
      const server = createApi({ env: { NODE_ENV: 'production', MAKE_TEST_ENABLED: 'false', MAKE_REPORTS_ENABLED: 'false' } });
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      try {
        const base = 'http://127.0.0.1:' + server.address().port;
        const health = await fetch(base + '/healthz');
        const events = await fetch(base + '/api/mail/events');
        const reminders = await fetch(base + '/api/reminders/run');
        console.log(JSON.stringify({ health: health.status, status: (await health.json()).status, events: events.status, reminders: reminders.status }));
      } finally {
        server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
      }
    `;
    const { stdout } = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', script], { cwd: image, timeout: 20000 });
    assert.deepEqual(JSON.parse(stdout), { health: 200, status: 'ok', events: 405, reminders: 405 });
  } finally { await rm(image, { recursive: true, force: true }); }
});
