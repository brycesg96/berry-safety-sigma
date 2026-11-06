import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reportFilename } from '../shared/report-filename.mjs';

test('nombre: área en mayúsculas, fecha sin cambio de zona horaria y nombre seguro', () => {
  assert.equal(reportFilename('Taller de maquinaria', '2026-11-06'), 'REG_INS_TALLER DE MAQUINARIA_06.11.2026.xlsx');
  assert.equal(reportFilename('  Almacén / área: "A"  ', '2027-01-01'), 'REG_INS_ALMACÉN ÁREA A_01.01.2027.xlsx');
  assert.equal(reportFilename('Área\nNorte', '2026-01-02'), 'REG_INS_ÁREA NORTE_02.01.2026.xlsx');
  assert.throws(() => reportFilename('Taller', '06/11/2026'));
});
