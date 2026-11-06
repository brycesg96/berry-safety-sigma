import { DatabaseSync } from 'node:sqlite';
export function openReportRegistry(path = process.env.REPORT_REGISTRY_PATH || '/tmp/berry-report-receipts.sqlite') {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS report_receipts (id TEXT PRIMARY KEY, hash TEXT NOT NULL, result TEXT)');
  db.exec('CREATE TABLE IF NOT EXISTS report_default_texts (id INTEGER PRIMARY KEY CHECK(id=1), texts TEXT NOT NULL, accepted_at TEXT NOT NULL)');
  return {
    find(id) { const row = db.prepare('SELECT hash, result FROM report_receipts WHERE id=?').get(id); return row ? { hash: row.hash, result: row.result ? JSON.parse(row.result) : null } : null; },
    claim(id, hash) { return db.prepare('INSERT OR IGNORE INTO report_receipts(id,hash) VALUES (?,?)').run(id, hash).changes === 1; },
    defaults() { const row = db.prepare('SELECT texts, accepted_at FROM report_default_texts WHERE id=1').get(); return row ? { texts: JSON.parse(row.texts), acceptedAt: row.accepted_at } : null; },
    finish(id, result, texts, acceptedAt) {
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare('UPDATE report_receipts SET result=? WHERE id=?').run(JSON.stringify(result), id);
        if (texts && acceptedAt) db.prepare('INSERT INTO report_default_texts(id,texts,accepted_at) VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET texts=excluded.texts, accepted_at=excluded.accepted_at').run(JSON.stringify(texts), acceptedAt);
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    close() { db.close(); },
  };
}
