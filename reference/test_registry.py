import io
import sqlite3
import tempfile
import unittest
import zipfile
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path
from registry import initialize, register


def excel(code, metadata):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w') as archive:
        archive.writestr('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>')
        archive.writestr('xl/workbook.xml', '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"/>')
        archive.writestr('xl/worksheets/sheet1.xml', f'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>{code}</t></is></c></row></sheetData></worksheet>')
    return buffer.getvalue()

class RegistryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = str(Path(self.tmp.name) / 'reports.sqlite')
        initialize(self.path)
    def tearDown(self): self.tmp.cleanup()
    def submit(self, identifier, at='2026-11-04T10:00:00-05:00', **changes):
        args = dict(inspection_id=identifier, actor_id='verified-user', metadata={'area': 'Taller'}, render_excel=excel, clock=lambda: datetime.fromisoformat(at))
        args.update(changes)
        return register(self.path, **args)
    def test_parallel_distinct_reports(self):
        with ThreadPoolExecutor(max_workers=12) as pool:
            results = list(pool.map(lambda n: self.submit(f'inspection-{n}'), range(30)))
        codes = {r['code'] for r in results}
        self.assertEqual(codes, {f'IH-2026-{n:03d}' for n in range(1, 31)})
        with sqlite3.connect(self.path) as db:
            self.assertEqual(db.execute('SELECT count(*) FROM outbox').fetchone()[0], 30)
            for code, content in db.execute('SELECT code, excel FROM reports'):
                with zipfile.ZipFile(io.BytesIO(content)) as z:
                    self.assertIn(code.encode(), z.read('xl/worksheets/sheet1.xml'))
    def test_parallel_retries_get_same_code_and_single_file(self):
        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(lambda _: self.submit('same-inspection'), range(12)))
        self.assertEqual({r['code'] for r in results}, {'IH-2026-001'})
        self.assertEqual(sum(not r['replayed'] for r in results), 1)
        with sqlite3.connect(self.path) as db:
            self.assertEqual(db.execute('SELECT count(*) FROM reports').fetchone()[0], 1)
            self.assertEqual(db.execute('SELECT count(*) FROM outbox').fetchone()[0], 1)
        with self.assertRaises(ValueError): self.submit('same-inspection', metadata={'area': 'Different'})
        with self.assertRaises(PermissionError): self.submit('same-inspection', actor_id='other-account')
        self.assertEqual(self.submit('next')['code'], 'IH-2026-002')
    def test_lima_year_boundary_and_retry_keeps_original_year(self):
        self.assertEqual(self.submit('old', '2027-01-01T04:59:59+00:00')['code'], 'IH-2026-001')
        self.assertEqual(self.submit('new', '2027-01-01T05:00:00+00:00')['code'], 'IH-2027-001')
        self.assertEqual(self.submit('old', '2027-01-02T10:00:00+00:00')['code'], 'IH-2026-001')
        self.assertEqual(self.submit('next', '2027-01-02T10:00:00+00:00')['code'], 'IH-2027-002')
    def test_failed_document_does_not_consume_number(self):
        def failing(*_): raise RuntimeError('Render failed')
        with self.assertRaises(RuntimeError): self.submit('failed', render_excel=failing)
        with self.assertRaises(ValueError): self.submit('bad', render_excel=lambda *_: b'')
        with self.assertRaises(ValueError): self.submit('wrong-code', render_excel=lambda *_: excel('IH-2025-999', {}))
        self.assertEqual(self.submit('valid')['code'], 'IH-2026-001')
        with sqlite3.connect(self.path) as db: self.assertEqual(db.execute('SELECT count(*) FROM outbox').fetchone()[0], 1)
    def test_more_than_999_reports_does_not_wrap(self):
        with sqlite3.connect(self.path) as db: db.execute('INSERT INTO annual_counters VALUES (2026,999)')
        self.assertEqual(self.submit('thousand')['code'], 'IH-2026-1000')

if __name__ == '__main__': unittest.main()
