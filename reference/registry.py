"""Tested reference for the future server, NOT an exposed or connected API.

One SQLite transaction stores the next annual code, metadata, final Excel and
an outbox job. Deploy the equivalent transaction in the selected real database.
Authentication, business validation and rendering belong to the trusted server.
"""
import hashlib
import io
import json
import sqlite3
import zipfile
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

LIMA = ZoneInfo('America/Lima')
SCHEMA = '''
CREATE TABLE IF NOT EXISTS annual_counters (
 year INTEGER PRIMARY KEY, last_sequence INTEGER NOT NULL CHECK(last_sequence > 0)
);
CREATE TABLE IF NOT EXISTS reports (
 inspection_id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, request_hash TEXT NOT NULL,
 year INTEGER NOT NULL, sequence INTEGER NOT NULL, code TEXT NOT NULL UNIQUE,
 accepted_at TEXT NOT NULL, metadata TEXT NOT NULL, excel BLOB NOT NULL,
 UNIQUE(year, sequence)
);
CREATE TABLE IF NOT EXISTS outbox (
 inspection_id TEXT PRIMARY KEY REFERENCES reports(inspection_id),
 state TEXT NOT NULL DEFAULT 'pending'
);
'''

def initialize(path):
    with sqlite3.connect(path) as db:
        db.execute('PRAGMA journal_mode=WAL')
        db.executescript(SCHEMA)


def register(path, *, inspection_id, actor_id, metadata, render_excel, clock=None):
    """IDs/actor and payload must already be authenticated and validated upstream.

    A repeated inspection ID with identical data returns its original receipt.
    Changing data on retry is a conflict. Failed rendering/storage consumes no code.
    A fresh inspection ID is a new report, even if the content happens to match.
    """
    if not inspection_id or not actor_id or not isinstance(metadata, dict) or not metadata:
        raise ValueError('Identity and validated metadata are required')
    canonical = json.dumps(metadata, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False)
    fingerprint = hashlib.sha256(canonical.encode()).hexdigest()
    db = sqlite3.connect(path, timeout=30, isolation_level=None)
    db.execute('PRAGMA foreign_keys=ON')
    try:
        db.execute('BEGIN IMMEDIATE')
        previous = db.execute('SELECT actor_id, request_hash, code, accepted_at FROM reports WHERE inspection_id=?', (inspection_id,)).fetchone()
        if previous:
            if previous[0] != actor_id:
                raise PermissionError('Inspection belongs to a different account')
            if previous[1] != fingerprint:
                raise ValueError('Inspection already registered with different data')
            db.commit()
            return {'inspectionId': inspection_id, 'code': previous[2], 'acceptedAt': previous[3], 'replayed': True}
        accepted = (clock or (lambda: datetime.now(timezone.utc)))()
        if accepted.tzinfo is None:
            raise ValueError('Server clock must include its timezone')
        year = accepted.astimezone(LIMA).year
        sequence = db.execute('''INSERT INTO annual_counters(year, last_sequence) VALUES (?, 1)
          ON CONFLICT(year) DO UPDATE SET last_sequence=last_sequence+1
          RETURNING last_sequence''', (year,)).fetchone()[0]
        code = f'IH-{year}-{sequence:03d}'
        excel = render_excel(code, metadata)
        if not isinstance(excel, bytes) or not excel:
            raise ValueError('The final Excel is required')
        with zipfile.ZipFile(io.BytesIO(excel)) as archive:
            names = archive.namelist()
            if '[Content_Types].xml' not in names or 'xl/workbook.xml' not in names:
                raise ValueError('The report must be an XLSX document')
            if not any(code.encode() in archive.read(n) for n in names if n.startswith('xl/') and n.endswith('.xml')):
                raise ValueError('The final Excel must contain the assigned code')
        accepted_at = accepted.isoformat()
        db.execute('INSERT INTO reports VALUES (?,?,?,?,?,?,?,?,?)', (inspection_id, actor_id, fingerprint, year, sequence, code, accepted_at, canonical, excel))
        db.execute('INSERT INTO outbox(inspection_id) VALUES (?)', (inspection_id,))
        db.commit()
        return {'inspectionId': inspection_id, 'code': code, 'acceptedAt': accepted_at, 'replayed': False}
    except BaseException:
        db.rollback()
        raise
    finally:
        db.close()
