import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

import openpyxl

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('fundo_import', ROOT / 'scripts/import-fundo-installations.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class FundoInstallations(unittest.TestCase):
    def test_reviewed_source_has_all_three_sheets_and_preserves_every_location(self):
        data = json.loads((ROOT / 'src/fundo-installations.json').read_text())
        report = json.loads((ROOT / 'reference/fundo-installations-import.json').read_text())
        self.assertEqual(report['counts'], dict(zones=15, installations=178, candidates=186, excluded=18, duplicates=8))
        self.assertEqual([s.strip() for s in report['sheets']], ['Zona 1', 'Zona 2', 'Zona 3'])
        ids = [item['id'] for zone in data['zones'] for item in zone['installations']]
        self.assertEqual(len(ids), len(set(ids)))
        for item in report['installations']:
            for source in item['sources']:
                self.assertNotEqual(module.key(source['category']), 'actividades fundo')
                self.assertEqual(module.key(source['zone']), module.key(item['zone']))
                self.assertEqual(module.label(source['point']), item['name'])
            self.assertNotEqual(item['name'], item['name'].upper())
        ilusion = next(z for z in data['zones'] if z['name'] == 'Ilusión I')
        self.assertIn('Tratamiento de Agua (Ilusión II)', [x['name'] for x in ilusion['installations']])
        self.assertEqual(len(next(z for z in data['zones'] if z['name'] == 'Chao')['installations']), 3)

    def test_names_preserve_accents_acronyms_units_and_module_identifiers(self):
        pairs = {
            'ALMACEN PRODUCTIVO ARMONIA II': 'Almacén Productivo Armonía II',
            'RESERVORIO 100 000 m3': 'Reservorio 100 000 m³',
            'FILTRADO MÓDULO C,D,E,F,Q': 'Filtrado Módulo C, D, E, F, Q',
            'OFICINA Y SALA DE INDUCCIONES SIGMA': 'Oficina y Sala de Inducciones SIGMA',
            'FILTRADO MÓDULO HIJK': 'Filtrado Módulo HIJK',
        }
        for raw, expected in pairs.items():
            self.assertEqual(module.label(raw), expected)

    def test_extract_reads_only_the_requested_columns_and_excludes_activities(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'programa.xlsx'
            book = openpyxl.Workbook()
            for index in range(3):
                sheet = book.active if index == 0 else book.create_sheet()
                sheet.title = f'Zona {index + 1}'
                sheet['F8'] = 'PUNTOS A INSPECCIONAR'; sheet['G8'] = 'UBICACIÓN'
                sheet['B10'] = 1; sheet['E10'] = 'OFICINA'; sheet['F10'] = 'OFICINA SIGMA'; sheet['G10'] = 'ARMONIA II'
                sheet['B12'] = 2; sheet['E12'] = 'ACTIVIDADES FUNDO'; sheet['F12'] = 'COSECHA'; sheet['G12'] = 'FUNDO'
                sheet['F20'] = 'NOTA DEL DOCUMENTO, NO ES UNA INSTALACIÓN'; sheet['G20'] = 'OTRA UBICACIÓN'
            book.save(path)
            data, report = module.extract(path)
            self.assertEqual(report['counts'], dict(zones=1, installations=1, candidates=3, excluded=3, duplicates=2))
            self.assertEqual(data['zones'][0]['name'], 'Armonía II')
            self.assertEqual(data['zones'][0]['installations'][0]['name'], 'Oficina SIGMA')


if __name__ == '__main__':
    unittest.main()
