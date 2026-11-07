import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, rmSync, utimesSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const WEEK = 7 * 24 * 60 * 60 * 1000;
const assetName = /^[a-zA-Z0-9_.-]+\.(?:js|css)$/;

/** Keep old immutable URLs usable without replacing any current build output. */
export function retainAssets(source, destination, now = Date.now()) {
  if (!existsSync(source)) return 0;
  mkdirSync(destination, { recursive: true });
  let copied = 0;
  for (const name of readdirSync(source)) {
    if (!assetName.test(name)) continue;
    const previous = join(source, name), current = join(destination, name);
    const stat = lstatSync(previous);
    if (!stat.isFile() || stat.mtimeMs < now - WEEK || existsSync(current)) continue;
    copyFileSync(previous, current);
    utimesSync(current, stat.atime, stat.mtime); // Do not renew old assets forever.
    copied++;
  }
  return copied;
}

export function retainPublishedAssets(output = 'dist-pages') {
  const runs = JSON.parse(execFileSync('gh', ['run', 'list', '--workflow', 'pages.yml', '--branch', 'main', '--status', 'success', '--limit', '3', '--json', 'databaseId'], { encoding: 'utf8' }));
  let total = 0;
  for (const { databaseId } of runs) {
    const directory = mkdtempSync(join(tmpdir(), 'berry-previous-pages-'));
    try {
      try {
        execFileSync('gh', ['run', 'download', String(databaseId), '--name', 'github-pages', '--dir', directory], { stdio: 'pipe' });
      } catch {
        console.log(`Publication ${databaseId}: previous artifact unavailable; skipped.`);
        continue;
      }
      const archive = join(directory, 'artifact.tar');
      const names = execFileSync('tar', ['-tf', archive], { encoding: 'utf8' }).split('\n')
        .filter(name => /^(?:\.\/)?assets\/[a-zA-Z0-9_.-]+\.(?:js|css)$/.test(name));
      if (names.length) execFileSync('tar', ['-xf', archive, '--directory', directory, '--no-same-owner', '--no-same-permissions', '--', ...names]);
      total += retainAssets(join(directory, 'assets'), join(output, 'assets'));
    } finally { rmSync(directory, { recursive: true, force: true }); }
  }
  console.log(`Retained ${total} previous JavaScript/CSS files for open tabs (maximum age: seven days).`);
  return total;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) retainPublishedAssets(resolve(process.argv[2] || 'dist-pages'));
