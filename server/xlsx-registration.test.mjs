import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import JSZip from 'jszip';
import { randomBytes } from 'node:crypto';
import { registeredExcel } from './xlsx-registration.mjs';
test('registration modifies B5 only and preserves all template parts and ZIP readability', async () => {
  const source = await readFile(new URL('../public/templates/inspection.xlsx', import.meta.url));
  const original = await JSZip.loadAsync(source);
  const result = registeredExcel(source, 'IH-2026-001');
  const registered = await JSZip.loadAsync(result, { checkCRC32: true });
  assert.deepEqual(Object.keys(original.files), Object.keys(registered.files));
  for (const name of Object.keys(original.files)) {
    if (name.endsWith('/')) continue;
    const before = await original.file(name).async('nodebuffer'), after = await registered.file(name).async('nodebuffer');
    if (name !== 'xl/worksheets/sheet1.xml') assert.deepEqual(after, before, name);
    else {
      assert.match(after.toString(), /r="B5"[^>]*>[\s\S]*?IH-2026-001/);
      const withoutCell = text => text.replace(/<c\b[^>]*\br="B5"[^>]*>[\s\S]*?<\/c>/, '<REGISTRATION/>');
      assert.equal(withoutCell(before.toString()), withoutCell(after.toString()));
    }
  }
  assert.deepEqual(registeredExcel(source, 'IH-2026-001'), result);
  assert.match((await (await JSZip.loadAsync(registeredExcel(source, 'IH-2026-1000'))).file('xl/worksheets/sheet1.xml').async('string')), /IH-2026-1000/);
});
test('malformed, missing-cell and corrupt packages cannot be registered', async () => {
  assert.throws(() => registeredExcel(Buffer.from('not an Excel document'), 'IH-2026-001'));
  const source = await readFile(new URL('../public/templates/inspection.xlsx', import.meta.url));
  assert.throws(() => registeredExcel(source, 'client-code'));
  const archive = await JSZip.loadAsync(source);
  archive.file('xl/worksheets/sheet1.xml', (await archive.file('xl/worksheets/sheet1.xml').async('string')).replace(/r="B5"/g, 'r="B6"'));
  const missing = await archive.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  assert.throws(() => registeredExcel(missing, 'IH-2026-001'));
  const corrupt = Buffer.from(source); corrupt[70] ^= 255;
  assert.throws(() => registeredExcel(corrupt, 'IH-2026-001'));
});
test('a final archive permits larger workbooks while email keeps its 3 MB limit', async () => {
  const zip=await JSZip.loadAsync(await readFile(new URL('../public/templates/inspection.xlsx',import.meta.url)));
  zip.file('xl/media/large.bin',randomBytes(4*1024*1024));
  const source=await zip.generateAsync({type:'nodebuffer',compression:'STORE'});
  assert.throws(()=>registeredExcel(source,'IH-2026-001'));
  await JSZip.loadAsync(registeredExcel(source,'IH-2026-001',15*1024*1024),{checkCRC32:true});
});
