import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inspectionArchiveFolder, inspectionArchivePath, storageFilename } from '../shared/archive-path.mjs';
test('archive folders follow inspection date across month, leap-day and year boundaries', () => {
  assert.equal(inspectionArchiveFolder('2026-11-30'), '2026/11-NOVIEMBRE');
  assert.equal(inspectionArchiveFolder('2026-12-01'), '2026/12-DICIEMBRE');
  assert.equal(inspectionArchiveFolder('2027-01-01'), '2027/01-ENERO');
  assert.equal(inspectionArchiveFolder('2028-02-29'), '2028/02-FEBRERO');
  for (const date of ['2026-02-29', '2026-11-31', '2026-13-01', '06.11.2026', '../2026-11-01']) assert.throws(() => inspectionArchiveFolder(date));
});
test('immutable paths separate reports and byte versions without trusting filename paths', () => {
  const id = '80000000-0000-4000-8000-000000000001', hash = 'a'.repeat(64);
  const path = inspectionArchivePath('2026-11-05', id, hash, 'REG_INS_ÁREA_05.11.2026.xlsx');
  assert.equal(path, `2026/11-NOVIEMBRE/${id}/${hash}/REG_INS_AREA_05.11.2026.xlsx`);
  assert.notEqual(path, inspectionArchivePath('2026-11-05', id, 'b'.repeat(64), 'REG_INS_ÁREA_05.11.2026.xlsx'));
  for (const name of ['../registro.xlsx', 'carpeta/registro.xlsx', 'carpeta\\registro.xlsx', '..']) assert.throws(() => inspectionArchivePath('2026-11-05', id, hash, name));
});

test('storage basename supports accented areas while display filename remains intact', () => {
  assert.equal(storageFilename('REG_INS_MAQUINARIA - ARMONÍA 2_05.11.2026.xlsx'), 'REG_INS_MAQUINARIA - ARMONIA 2_05.11.2026.xlsx');
  assert.equal(storageFilename('REG_INS_AÑÓ%#_05.11.2026.xlsx'), 'REG_INS_ANO___05.11.2026.xlsx');
  assert.equal(storageFilename('AÑO'), storageFilename('AN\u0303O'));
});
