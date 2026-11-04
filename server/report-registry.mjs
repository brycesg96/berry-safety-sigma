import { DatabaseSync } from 'node:sqlite';
export function openReportRegistry(path = process.env.REPORT_REGISTRY_PATH || '/tmp/berry-report-receipts.sqlite') {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS report_receipts (id TEXT PRIMARY KEY, hash TEXT NOT NULL, result TEXT)');
  return {
    find(id) { const row = db.prepare('SELECT hash, result FROM report_receipts WHERE id=?').get(id); return row ? { hash: row.hash, result: row.result ? JSON.parse(row.result) : null } : null; },
    claim(id, hash) { return db.prepare('INSERT OR IGNORE INTO report_receipts(id,hash) VALUES (?,?)').run(id, hash).changes === 1; },
    finish(id, result) { db.prepare('UPDATE report_receipts SET result=? WHERE id=?').run(JSON.stringify(result), id); },
    close() { db.close(); },
  };
}
