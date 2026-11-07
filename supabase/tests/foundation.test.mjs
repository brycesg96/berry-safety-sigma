import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

let db;
const checks = [];
const test = (name, run) => checks.push({ name, run });
const migration = await readFile(new URL('../migrations/202611070001_foundation.sql', import.meta.url), 'utf8');
const users = { author: '00000000-0000-4000-8000-000000000001', recipient: '00000000-0000-4000-8000-000000000002', other: '00000000-0000-4000-8000-000000000003', pending: '00000000-0000-4000-8000-000000000004' };
const reports = { draft: '10000000-0000-4000-8000-000000000001', sent: '10000000-0000-4000-8000-000000000002', closed: '10000000-0000-4000-8000-000000000003', otherDraft: '10000000-0000-4000-8000-000000000004', unassigned: '10000000-0000-4000-8000-000000000005' };
async function as(role, id, query, values = []) {
  return db.transaction(async tx => {
    await tx.exec(`set local role ${role}`);
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [id || '']);
    return tx.query(query, values);
  });
}
const denied = fn => assert.rejects(fn, error => error.code === '42501');

async function setup() {
  db = await PGlite.create();
  // Supabase owns these platform schemas. Only their minimal contracts are
  // stubbed; all Berry SQL, roles, RLS policies and triggers run in PostgreSQL.
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth, storage to anon, authenticated;
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    grant select on storage.objects to anon, authenticated;
  `);
  await db.exec(migration);
  for (const [name, id] of Object.entries(users)) {
    await db.query('insert into auth.users(id, email, raw_user_meta_data) values ($1, $2, $3)', [id, `${name}@example.invalid`, { full_name: name, role: 'admin', enabled: true }]);
  }
  await db.query('update public.berry_profiles set enabled=true where id <> $1', [users.pending]);
  for (const [name, id] of Object.entries(reports)) {
    const workflow = name.toLowerCase().includes('draft') ? 'draft' : name === 'closed' ? 'closed' : 'sent';
    await db.query('insert into public.berry_inspections(id, author_id, workflow, data, sent_at, closed_at) values ($1,$2,$3,$4,$5,$6)', [id, ['draft', 'sent'].includes(name) ? users.author : users.other, workflow, { area: name }, workflow === 'draft' ? null : '2026-11-07T12:00:00Z', workflow === 'closed' ? '2026-11-07T13:00:00Z' : null]);
  }
  for (const id of [reports.sent, reports.closed, reports.otherDraft]) await db.query('insert into public.berry_recipients(inspection_id,user_id,assigned_by) values($1,$2,$3)', [id, users.recipient, users.author]);
  await db.query('insert into public.berry_corrections(inspection_id,observation_id,actor_id,responsible_name) values($1,$2,$3,$4)', [reports.sent, '20000000-0000-4000-8000-000000000001', users.recipient, 'Responsable']);
  for (const [bucket, path] of [['berry-evidence', `${reports.sent}/evidencia.jpg`], ['berry-documents', `${reports.closed}/registro.xlsx`], ['berry-evidence', `${reports.unassigned}/privada.jpg`], ['berry-evidence', 'not-a-uuid/privada.jpg']]) await db.query('insert into storage.objects(bucket_id,name) values($1,$2)', [bucket, path]);
}

test('new Auth accounts never inherit admin or enabled from user metadata', async () => {
  const { rows } = await db.query('select role,enabled from public.berry_profiles where id=$1', [users.pending]);
  assert.deepEqual(rows, [{ role: 'inspector', enabled: false }]);
  const own = await as('authenticated', users.pending, 'select id from public.berry_profiles');
  assert.deepEqual(own.rows, [{ id: users.pending }]);
});

test('anonymous access is limited to nonsensitive foundation status', async () => {
  const { rows } = await as('anon', null, 'select public.berry_schema_status() as status');
  assert.deepEqual(rows[0].status, { schema_version: '202611070001', stage: 'foundation', sync_ready: false });
  for (const name of ['profiles', 'inspections', 'recipients', 'corrections', 'documents', 'audit', 'shared_texts']) await denied(() => as('anon', null, `select * from public.berry_${name}`));
  assert.equal((await as('anon', null, 'select * from storage.objects')).rows.length, 0);
});

test('authors see their drafts; recipients see only assigned sent or closed reports', async () => {
  assert.deepEqual((await as('authenticated', users.author, 'select id from public.berry_inspections order by id')).rows.map(r => r.id), [reports.draft, reports.sent]);
  assert.deepEqual((await as('authenticated', users.recipient, 'select id from public.berry_inspections order by id')).rows.map(r => r.id), [reports.sent, reports.closed]);
  assert.equal((await as('authenticated', users.pending, 'select id from public.berry_inspections')).rows.length, 0);
  assert.equal((await as('authenticated', users.recipient, 'select * from public.berry_corrections')).rows.length, 1);
});

test('profile edits preserve roles, identity and other users, while creating audit evidence', async () => {
  await as('authenticated', users.author, 'update public.berry_profiles set job_title=$1 where id=$2', ['Supervisora', users.author]);
  assert.equal((await db.query('select job_title from public.berry_profiles where id=$1', [users.author])).rows[0].job_title, 'Supervisora');
  for (const assignment of ["role='admin'", 'enabled=false', "email='changed@example.invalid'"]) await denied(() => as('authenticated', users.author, `update public.berry_profiles set ${assignment} where id=$1`, [users.author]));
  assert.equal((await as('authenticated', users.author, "update public.berry_profiles set job_title='No permitido' where id=$1 returning id", [users.recipient])).rows.length, 0);
  const audit = await as('authenticated', users.author, "select actor_id,after_data from public.berry_audit where entity_type='berry_profiles' and action='update' and actor_id=$1", [users.author]);
  assert.equal(audit.rows.length, 1); assert.equal(audit.rows[0].after_data.job_title, 'Supervisora');
});

test('workflow and audit mutations wait for the protected server functions', async () => {
  await denied(() => as('authenticated', users.author, "update public.berry_inspections set workflow='closed' where id=$1", [reports.sent]));
  await denied(() => as('authenticated', users.author, 'delete from public.berry_inspections where id=$1', [reports.draft]));
  await denied(() => as('authenticated', users.recipient, "update public.berry_corrections set decision='approved',state='Ejecutado' where inspection_id=$1", [reports.sent]));
  await denied(() => as('authenticated', users.author, 'delete from public.berry_audit'));
  await denied(() => as('authenticated', users.author, "insert into public.berry_audit(entity_type,entity_id,action)values('fake','fake','approved')"));
  await denied(() => as('authenticated', users.author, 'select berry_private.record_change()'));
});

test('private files follow report permissions, including malformed-path denial', async () => {
  assert.deepEqual((await as('authenticated', users.recipient, 'select name from storage.objects order by name')).rows.map(r => r.name), [`${reports.sent}/evidencia.jpg`, `${reports.closed}/registro.xlsx`]);
  assert.equal((await as('authenticated', users.pending, 'select * from storage.objects')).rows.length, 0);
  const buckets = await db.query('select public,file_size_limit from storage.buckets');
  assert.equal(buckets.rows.length, 2); assert.ok(buckets.rows.every(b => b.public === false && Number(b.file_size_limit) === 15728640));
});

test('reapplying the transaction preserves existing data and enabled accounts', async () => {
  const before = (await db.query('select count(*)::int as count from public.berry_inspections')).rows[0].count;
  await db.exec(migration);
  assert.equal((await db.query('select count(*)::int as count from public.berry_inspections')).rows[0].count, before);
  assert.equal((await db.query('select enabled from public.berry_profiles where id=$1', [users.author])).rows[0].enabled, true);
});

let failed;
try {
  await setup();
  for (const check of checks) {
    await check.run();
    console.log('PASS: ' + check.name);
  }
  console.log(`${checks.length} comprobaciones de PostgreSQL completadas.`);
} catch (error) {
  failed = error;
} finally {
  await db?.close();
}
if (failed) { console.error(failed); process.exitCode = 1; }
