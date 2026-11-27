import datetime as dt
import importlib.util
import hashlib
import json
from pathlib import Path
import re
import tempfile
import unittest

import openpyxl

spec = importlib.util.spec_from_file_location('emergency_import', Path(__file__).parents[1] / 'scripts/prepare-emergency-import.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
HEADERS = ['N° DE EXTINTOR','FILTRO','Fuente','Gerencia','Gerencia Usuaria','UBICACIÓN (Edificio/Piso/Área)','FIRMA INSPECTOR','FECHA DE INSPECCIÓN','TIPO','CAPACIDAD','N° SERIE','MARCA','AÑO DE FABRICACIÓN','ÚLTIMA PRUEBA HIDRÓSTATICA','PRÓXIMA PRUEBA HIDRÓSTATICA','FECHA DE VENCIMIENTO','ESTADO','OBSERVACIÓN','MV','AV','fecha última inspección','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Setiembre','Octubre','Noviembre']


class EmergencyImportTest(unittest.TestCase):
    def prepare(self, rows, excluded=frozenset()):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'source.xlsx'
            book = openpyxl.Workbook(); sheet = book.active; sheet.title = '2026'; sheet.append(HEADERS)
            for row in rows:
                sheet.append([row.get(field) for field in HEADERS])
            book.save(path)
            original = path.read_bytes()
            result = module.prepare(path, [], excluded)
            self.assertEqual(path.read_bytes(), original)
            return result

    def test_confirmed_exclusion_is_exact_and_november_uses_h_even_if_another_month(self):
        base = {'FECHA DE INSPECCIÓN': dt.datetime(2026, 10, 6), 'Enero': '12 enero 2025', 'Noviembre': '18 noviembre 2025', 'N° SERIE': 'OLD'}
        _, rows, removed, _ = self.prepare([
            {**base, 'N° DE EXTINTOR': 'VEH-001'},
            {**base, 'N° DE EXTINTOR': 'VEH-001', 'N° SERIE': '00011847'},
            {**base, 'N° DE EXTINTOR': 'OTHER-002'},
        ], {('VEH001', 'OLD')})
        self.assertEqual(len(rows), 2)
        self.assertEqual(removed, [{'source_row': 2, 'code': 'VEH-001', 'serial_number': 'OLD'}])
        self.assertEqual(rows[0]['serial_number'], '00011847')
        self.assertEqual(rows[0]['legacy']['months']['Noviembre'], '2026-10-06')
        self.assertEqual(rows[0]['legacy']['months']['Enero'], '12 enero 2025')
        self.assertEqual(rows[1]['serial_number'], 'OLD')
        self.assertNotIn('area_id', rows[0])

    def test_empty_h_does_not_invent_an_inspection_and_unknown_years_survive_in_original(self):
        _, rows, _, _ = self.prepare([{'N° DE EXTINTOR': 'TEST-002', 'Noviembre': '18 noviembre 2025', 'ÚLTIMA PRUEBA HIDRÓSTATICA': '2205', 'AÑO DE FABRICACIÓN': '22'}])
        row = rows[0]
        self.assertIsNone(row['legacy']['official_date'])
        self.assertIsNone(row['legacy']['months']['Noviembre'])
        self.assertIsNone(row['legacy']['original']['Noviembre'])
        self.assertIsNone(row['last_hydro_year'])
        self.assertEqual(row['legacy']['original']['ÚLTIMA PRUEBA HIDRÓSTATICA'], '2205')
        self.assertEqual(row['legacy']['original']['AÑO DE FABRICACIÓN'], '22')

    def test_unresolved_code_alias_duplicates_stop_preparation(self):
        with self.assertRaisesRegex(ValueError, 'duplicado'):
            self.prepare([{'N° DE EXTINTOR': 'TEST-100'}, {'N° DE EXTINTOR': 'test 100'}])

    def test_editor_files_keep_every_record_and_bound_the_entire_utf8_query(self):
        _, rows, _, _ = self.prepare([
            {'N° DE EXTINTOR': f'TEST-{index:03d}', 'N° SERIE': f'000{index}',
             'OBSERVACIÓN': "Revisión áéíóú · $stage_part$ · 'texto' " * 20,
             'FECHA DE INSPECCIÓN': dt.datetime(2026, 10, 6)} for index in range(8)
        ])
        payload = json.dumps(rows, ensure_ascii=False, separators=(',', ':'))
        batch = hashlib.sha256(payload.encode()).hexdigest()
        files = module.editor_scripts(rows, batch, '1'*64, '-- Schema\n', part_bytes=4000)
        self.assertGreater(len(files), 1)
        reconstructed = []
        for index, (name, sql) in enumerate(files.items(), 1):
            self.assertTrue(name.startswith(f'31-{index:02d}-de-'))
            self.assertLessEqual(len(sql.encode()), module.EDITOR_FILE_BYTES)
            match = re.search(r'v_text text:=(\$inventory_part_[a-f0-9]+\$)(.*?)\1;', sql, re.S)
            reconstructed.extend(json.loads(match[2]))
            self.assertIn(hashlib.sha256(match[2].encode()).hexdigest(), sql)
            self.assertEqual('perform berry_private.import_emergency_inventory(' in sql, index == len(files))
        self.assertEqual(reconstructed, rows)
        first = next(iter(files.values()))
        self.assertIn('alter table berry_private.emergency_import_parts enable row level security', first)
        self.assertIn('revoke all on berry_private.emergency_import_parts from public,anon,authenticated', first)

    def test_editor_preparation_refuses_empty_or_unsplittable_input(self):
        with self.assertRaisesRegex(ValueError, 'vacío'):
            module.editor_scripts([], '0'*64, '1'*64, '')
        with self.assertRaisesRegex(ValueError, 'registro supera'):
            module.editor_scripts([{'notes': 'á'*100}], '0'*64, '1'*64, '', part_bytes=100)


if __name__ == '__main__':
    unittest.main()
