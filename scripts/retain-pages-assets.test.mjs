import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { retainAssets } from './retain-pages-assets.mjs';

test('old tabs keep their JS/CSS, current files win and retention expires without copying documents or links', t => {
  const root = mkdtempSync(join(tmpdir(), 'berry-assets-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const old = join(root, 'old'), current = join(root, 'current');
  mkdirSync(old); mkdirSync(current);
  const now = Date.now(), yesterday = new Date(now - 86400000);
  for (const [name, content] of [['jszip.min-old.js', 'old ZIP'], ['index-old.js', 'old app'], ['index-old.css', 'old styles'], ['current.js', 'obsolete'], ['expired.js', 'expired'], ['example.xlsx', 'not an asset']]) {
    writeFileSync(join(old, name), content); utimesSync(join(old, name), yesterday, yesterday);
  }
  writeFileSync(join(current, 'current.js'), 'current app');
  const expired = new Date(now - 8 * 86400000); utimesSync(join(old, 'expired.js'), expired, expired);
  symlinkSync(join(old, 'index-old.js'), join(old, 'link.js'));
  assert.equal(retainAssets(old, current, now), 3);
  assert.equal(readFileSync(join(current, 'jszip.min-old.js'), 'utf8'), 'old ZIP');
  assert.equal(statSync(join(current, 'jszip.min-old.js')).mtimeMs, yesterday.getTime());
  assert.equal(readFileSync(join(current, 'current.js'), 'utf8'), 'current app');
  assert.deepEqual(readdirSync(current).sort(), ['current.js', 'index-old.css', 'index-old.js', 'jszip.min-old.js']);
  const next = join(root, 'next');
  assert.equal(retainAssets(current, next, now + 8 * 86400000), 0);
});
