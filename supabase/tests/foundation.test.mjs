import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

let db;
const checks = [];
const test = (name, run) => checks.push({ name, run });
const migration = await readFile(new URL('../migrations/202611070001_foundation.sql', import.meta.url), 'utf8');
const accountsMigration = await readFile(new URL('../migrations/202611070002_accounts.sql', import.meta.url), 'utf8');
const reportsMigration = await readFile(new URL('../migrations/202611080003_reports.sql', import.meta.url), 'utf8');
const finalMigration = await readFile(new URL('../migrations/202611080004_final_archive.sql', import.meta.url), 'utf8');
const users = { author: '00000000-0000-4000-8000-000000000001', recipient: '00000000-0000-4000-8000-000000000002', other: '00000000-0000-4000-8000-000000000003', pending: '00000000-0000-4000-8000-000000000004' };
const reports = { draft: '10000000-0000-4000-8000-000000000001', sent: '10000000-0000-4000-8000-000000000002', closed: '10000000-0000-4000-8000-000000000003', otherDraft: '10000000-0000-4000-8000-000000000004', unassigned: '10000000-0000-4000-8000-000000000005' };
async function as(role, id, query, values = [], claims = {}) {
  return db.transaction(async tx => {
    await tx.exec(`set local role ${role}`);
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [id || '']);
    await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ ...claims, sub: id || '' })]);
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
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}', raw_app_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
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

const temporaryUser = '00000000-0000-4000-8000-000000000005';
const creationId = '50000000-0000-4000-8000-000000000001';
const passwordId = '50000000-0000-4000-8000-000000000002';
const input = { email: 'new@example.invalid', full_name: 'Nueva Persona', area: 'Prevención', job_title: 'Supervisora', role: 'admin', supervisor_emails: ['jefa@example.invalid'] };
test('account migration preserves the existing owner and guards creation by verified administrators', async () => {
  await db.exec(accountsMigration);
  assert.equal((await db.query('select must_change_password from public.berry_profiles where id=$1', [users.author])).rows[0].must_change_password, false);
  await denied(() => as('authenticated', users.recipient, 'select public.berry_admin_accounts()'));
  await denied(() => as('anon', null, 'select public.berry_prepare_account($1,$2)', [creationId, input]));
  await db.query("update public.berry_profiles set role='admin' where id=$1", [users.author]);
  await assert.rejects(() => as('authenticated', users.author, 'select public.berry_prepare_account($1,$2)', [creationId, { email: input.email }]), error => error.code === '22023');
  const prepared = await as('authenticated', users.author, 'select public.berry_prepare_account($1,$2) as value', [creationId, input]);
  assert.equal(prepared.rows[0].value.request_id, creationId);
  await db.query('insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data)values($1,$2,$3,$4)', [temporaryUser, input.email, { must_change_password: false, enabled: true, role: 'admin' }, { berry_request_id: creationId }]);
  assert.deepEqual((await db.query('select must_change_password,enabled,role from public.berry_profiles where id=$1', [temporaryUser])).rows[0], { must_change_password: true, enabled: false, role: 'inspector' });
  await denied(() => as('authenticated', users.recipient, 'select public.berry_finish_account($1,$2)', [creationId, temporaryUser]));
  const finished = await as('authenticated', users.author, 'select public.berry_finish_account($1,$2) as value', [creationId, temporaryUser]);
  assert.equal(finished.rows[0].value.enabled, true);
  assert.equal(finished.rows[0].value.must_change_password, true);
  assert.equal(finished.rows[0].value.role, 'admin');
  assert.equal((await as('authenticated', users.author, 'select public.berry_finish_account($1,$2) as value', [creationId, temporaryUser])).rows[0].value.id, temporaryUser);
  await denied(() => as('authenticated', temporaryUser, 'select public.berry_admin_accounts()'));
  assert.equal((await db.query("select actor_id from public.berry_audit where entity_id=$1 and action='update' order by id desc limit 1", [temporaryUser])).rows[0].actor_id, users.author);
});

test('temporary credentials cannot read assigned reports, edit profiles or clear the password requirement', async () => {
  await db.query('insert into public.berry_recipients(inspection_id,user_id,assigned_by)values($1,$2,$3)', [reports.sent, temporaryUser, users.author]);
  assert.deepEqual((await as('authenticated', temporaryUser, 'select id from public.berry_profiles')).rows, [{ id: temporaryUser }]);
  assert.equal((await as('authenticated', temporaryUser, 'select id from public.berry_inspections')).rows.length, 0);
  assert.equal((await as('authenticated', temporaryUser, 'select * from storage.objects')).rows.length, 0);
  assert.equal((await as('authenticated', temporaryUser, "update public.berry_profiles set full_name='Bypass' where id=$1 returning id", [temporaryUser])).rows.length, 0);
  await denied(() => as('authenticated', temporaryUser, 'update public.berry_profiles set must_change_password=false where id=$1', [temporaryUser]));
  await denied(() => as('authenticated', temporaryUser, 'select public.berry_password_operation($1,$2,$3)', [temporaryUser, passwordId, 'complete']));
  await denied(() => as('authenticated', users.author, 'select * from berry_private.account_requests'));
  await denied(() => as('authenticated', users.author, 'select public.berry_find_account_request($1)', [creationId]));
});

test('password completion is server-only, serializes changes and invalidates old JWTs with audited identity', async () => {
  await as('service_role', null, 'select public.berry_password_operation($1,$2,$3)', [temporaryUser, passwordId, 'begin']);
  await assert.rejects(() => as('service_role', null, 'select public.berry_password_operation($1,$2,$3)', [temporaryUser, creationId, 'begin']), error => error.code === '55P03');
  await as('service_role', null, 'select public.berry_password_operation($1,$2,$3)', [temporaryUser, passwordId, 'complete']);
  const profile = (await db.query('select must_change_password,credentials_valid_after from public.berry_profiles where id=$1', [temporaryUser])).rows[0];
  assert.equal(profile.must_change_password, false);
  assert.ok(Number(profile.credentials_valid_after) > 0);
  assert.equal((await as('authenticated', temporaryUser, 'select id from public.berry_inspections', [], { iat: Number(profile.credentials_valid_after) })).rows.length, 0);
  const fresh = { iat: Number(profile.credentials_valid_after) + 1 };
  assert.equal((await as('authenticated', temporaryUser, 'select id from public.berry_inspections', [], fresh)).rows.length, 1);
  assert.equal((await as('authenticated', temporaryUser, 'select public.berry_admin_accounts() as accounts', [], fresh)).rows[0].accounts.length, 5);
  const audit = (await db.query("select actor_id,after_data from public.berry_audit where entity_id=$1 and action='update' order by id desc limit 1", [temporaryUser])).rows[0];
  assert.equal(audit.actor_id, temporaryUser); assert.equal(audit.after_data.must_change_password, false);
  await as('authenticated', users.author, 'select public.berry_finish_account($1,$2)', [creationId, temporaryUser]);
  assert.equal((await db.query('select must_change_password from public.berry_profiles where id=$1', [temporaryUser])).rows[0].must_change_password, false);
  await db.exec(accountsMigration);
  assert.equal((await db.query('select must_change_password from public.berry_profiles where id=$1', [temporaryUser])).rows[0].must_change_password, false);
  await assert.rejects(() => db.exec(migration), error => error.code === '55000');
  await db.exec('rollback');
});

const cloudReport = '80000000-0000-4000-8000-000000000001';
const cloudObservation = '80000000-0000-4000-8000-000000000002';
const sourceHash = 'a'.repeat(64), documentHash = 'b'.repeat(64);
let cloudRevision, registrationLease;
const cloudData = () => ({ id: cloudReport, ownerId: users.author, date: '2026-11-05', area: 'Taller', facility: 'Armonía', type: 'Planeada', inspectionTime: '09:30', inspectionPeriod: 'AM', objective: 'Objetivo', unfavorableCause: 'Causas', closingRemarks: 'Recomendaciones', status: 'draft', step: 4, responsibles: [{ id: 'row', personId: users.recipient, name: 'Fake', email: 'fake@example.invalid' }], additionalInspectors: [], registrationDetails: {}, observations: [{ id: cloudObservation, description: 'Hallazgo', correctiveAction: 'Medida correctiva', severity: 'media', dueDate: '2026-12-01', photos: [] }] });
test('cloud drafts enforce authorship and revisions, bind profile identities and preserve private files', async () => {
  await db.exec(reportsMigration);
  await db.exec("create or replace function berry_private.report_clock() returns timestamptz language sql volatile set search_path='' as $$select '2026-11-08T05:00:00Z'::timestamptz$$;");
  await denied(() => as('anon', null, 'select public.berry_ensure_draft($1)', [cloudReport]));
  await as('authenticated', users.author, 'select public.berry_ensure_draft($1)', [cloudReport]);
  await denied(() => as('authenticated', users.recipient, 'select public.berry_ensure_draft($1)', [cloudReport]));
  const saved = await as('authenticated', users.author, 'select public.berry_save_draft($1,$2,$3) as value', [cloudReport, 1, cloudData()]);
  cloudRevision = Number(saved.rows[0].value.revision);
  assert.equal(saved.rows[0].value.data.inspectorEmail, 'author@example.invalid');
  assert.equal(saved.rows[0].value.data.responsibles[0].email, 'recipient@example.invalid');
  await assert.rejects(() => as('authenticated', users.author, 'select public.berry_save_draft($1,$2,$3)', [cloudReport, 1, { ...cloudData(), area: 'Cambio obsoleto' }]), error => error.code === '40001');
  assert.equal((await as('authenticated', users.recipient, 'select id from public.berry_inspections where id=$1', [cloudReport])).rows.length, 0);
  const path = `${cloudReport}/${cloudObservation}/${documentHash}.jpg`;
  await as('authenticated', users.author, 'insert into storage.objects(bucket_id,name)values($1,$2)', ['berry-evidence', path]);
  await denied(() => as('authenticated', users.recipient, 'insert into storage.objects(bucket_id,name)values($1,$2)', ['berry-evidence', `${cloudReport}/${cloudObservation}/${sourceHash}.jpg`]));
});

test('annual code is committed only with stored bytes, archive path follows inspection month and replays preserve the code', async () => {
  const prepared = await as('authenticated', users.author, 'select public.berry_prepare_report($1,$2,$3) as value', [cloudReport, cloudRevision, sourceHash]);
  registrationLease = prepared.rows[0].value.lease;
  assert.equal(registrationLease.code, 'IH-2026-001');
  assert.equal((await db.query('select last_sequence from berry_private.report_counters where year=2026')).rows[0].last_sequence, 0);
  const doc = { filename: 'REG_INS_TALLER_05.11.2026.xlsx', sha256: documentHash, byte_size: 2000, storage_path: `2026/11-NOVIEMBRE/${cloudReport}/${documentHash}/REG_INS_TALLER_05.11.2026.xlsx` };
  await denied(() => as('authenticated', users.author, 'select public.berry_commit_report($1,$2,$3,$4)', [registrationLease.operation_id, users.author, 100, doc]));
  await assert.rejects(() => as('service_role', null, 'select public.berry_commit_report($1,$2,$3,$4)', [registrationLease.operation_id, users.author, 100, doc]), error => error.code === '22023');
  assert.equal((await db.query('select last_sequence from berry_private.report_counters where year=2026')).rows[0].last_sequence, 0);
  await db.query('insert into storage.objects(bucket_id,name)values($1,$2)', ['berry-documents', doc.storage_path]);
  const committed = await as('service_role', null, 'select public.berry_commit_report($1,$2,$3,$4) as value', [registrationLease.operation_id, users.author, 100, doc]);
  cloudRevision = Number(committed.rows[0].value.inspection.revision);
  assert.equal(committed.rows[0].value.inspection.code, 'IH-2026-001');
  assert.equal(committed.rows[0].value.document.storage_path, doc.storage_path);
  assert.equal((await as('authenticated', users.recipient, 'select code from public.berry_inspections where id=$1', [cloudReport])).rows[0].code, 'IH-2026-001');
  assert.equal((await as('authenticated', users.recipient, 'select name from storage.objects where name=$1', [doc.storage_path])).rows.length, 1);
  const replay = await as('authenticated', users.author, 'select public.berry_prepare_report($1,$2,$3) as value', [cloudReport, cloudRevision, null]);
  assert.equal(replay.rows[0].value.registered, true);
  assert.equal((await db.query('select last_sequence from berry_private.report_counters where year=2026')).rows[0].last_sequence, 1);
  await assert.rejects(() => as('authenticated', users.author, 'select public.berry_prepare_report($1,$2,$3)', [cloudReport, cloudRevision, 'c'.repeat(64)]), error => error.code === '23505');
});

test('mail outbox is claimed once and its persisted receipt is shared with the report', async () => {
  assert.equal((await as('service_role', null, 'select public.berry_claim_report_mail($1,$2) as value', [cloudReport, users.author])).rows[0].value.dispatch, true);
  assert.equal((await as('service_role', null, 'select public.berry_claim_report_mail($1,$2) as value', [cloudReport, users.author])).rows[0].value.dispatch, false);
  await as('service_role', null, 'select public.berry_finish_report_mail($1,$2,$3)', [cloudReport, users.author, { state: 'accepted', upstreamStatus: 200 }]);
  assert.equal((await as('authenticated', users.recipient, 'select data from public.berry_inspections where id=$1', [cloudReport])).rows[0].data.emailDelivery.state, 'accepted');
  assert.equal((await as('authenticated', users.author, 'select objective from public.berry_shared_texts')).rows[0].objective, 'Objetivo');
});

test('shared corrections permit both status controls, enforce review decisions and lock the complete closed report', async () => {
  const change = async (actor, action, value) => {
    const result = await as('authenticated', actor, 'select public.berry_change_correction($1,$2,$3,$4,$5) as value', [cloudReport, cloudObservation, cloudRevision, action, value]);
    cloudRevision = Number(result.rows[0].value.revision); return result.rows[0].value;
  };
  await denied(() => change(users.other, 'state', { state: 'Ejecutado' }));
  await change(users.recipient, 'save', { responsibleName: 'Persona responsable', action: 'Acción realizada', date: '2026-11-08', photos: [], state: 'Pendiente' });
  await change(users.author, 'state', { state: 'Ejecutado' });
  const saved = await change(users.recipient, 'submit', { responsibleName: 'Persona responsable', action: 'Acción realizada', date: '2026-11-08', photos: [], state: 'Pendiente' });
  assert.equal(saved.data.delivery.corrections[cloudObservation].decision, 'review');
  await change(users.recipient, 'state', { state: 'Ejecutado' });
  const changes = await change(users.author, 'changes', { note: 'Completar evidencia' });
  assert.equal(changes.data.delivery.corrections[cloudObservation].state, 'Pendiente');
  await change(users.recipient, 'submit', { responsibleName: 'Persona responsable', action: 'Acción completa', date: '2026-11-08', photos: [], state: 'Pendiente' });
  const closed = await change(users.author, 'approve', { note: 'Aprobado' });
  assert.equal(closed.workflow, 'closed');
  assert.equal(closed.data.delivery.corrections[cloudObservation].state, 'Ejecutado');
  await denied(() => change(users.recipient, 'state', { state: 'Pendiente' }));
  await denied(() => as('authenticated', users.recipient, 'insert into storage.objects(bucket_id,name)values($1,$2)', ['berry-evidence', `${cloudReport}/${cloudObservation}/${sourceHash}.jpg`]));
  const audit = (await db.query("select actor_id from public.berry_audit where inspection_id=$1 and entity_type='berry_corrections' order by id desc limit 1", [cloudReport])).rows[0];
  assert.equal(audit.actor_id, users.author);
});

const clock = time => db.exec(`create or replace function berry_private.report_clock() returns timestamptz language sql volatile set search_path='' as $$select '${time}'::timestamptz$$;`);
async function nextDraft(index, date = '2026-11-05') {
  const id = `90000000-0000-4000-8000-${String(index).padStart(12,'0')}`;
  await as('authenticated', users.author, 'select public.berry_ensure_draft($1)', [id]);
  const row = (await as('authenticated', users.author, 'select public.berry_save_draft($1,1,$2) as value', [id, { ...cloudData(), id, date }])).rows[0].value;
  return row;
}
async function prepare(row) { return (await as('authenticated', users.author, 'select public.berry_prepare_report($1,$2,$3) as value', [row.id, row.revision, sourceHash])).rows[0].value.lease; }
async function storeAndCommit(row, lease, folder) {
  const doc = { filename: 'REG_INS_TALLER.xlsx', sha256: documentHash, byte_size: 2000, storage_path: `${folder}/${row.id}/${documentHash}/REG_INS_TALLER.xlsx` };
  await db.query('insert into storage.objects(bucket_id,name)values($1,$2)', ['berry-documents',doc.storage_path]);
  // Objects uploaded before their transaction commits are never visible to browsers.
  assert.equal((await as('authenticated',users.author,'select name from storage.objects where name=$1',[doc.storage_path])).rows.length,0);
  return (await as('service_role',null,'select public.berry_commit_report($1,$2,$3,$4) as value',[lease.operation_id,users.author,100,doc])).rows[0].value;
}
test('later months share an annual counter, November inspections keep their folder when sent in December, and reservations serialize', async () => {
  await clock('2026-12-02T12:00:00Z');
  const november = await nextDraft(1), december = await nextDraft(2, '2026-12-02');
  const lease = await prepare(november);
  assert.equal(lease.code,'IH-2026-002');
  assert.equal((await prepare(november)).operation_id,lease.operation_id);
  await assert.rejects(() => prepare(december),error => error.code==='55P03');
  assert.equal((await storeAndCommit(november,lease,'2026/11-NOVIEMBRE')).inspection.code,'IH-2026-002');
  assert.equal((await storeAndCommit(december,await prepare(december),'2026/12-DICIEMBRE')).inspection.code,'IH-2026-003');
});
test('a year boundary discards the old reservation without consuming a number and preserves the inspection-date archive', async () => {
  await clock('2027-01-01T04:59:30Z');
  const row = await nextDraft(3), old = await prepare(row);
  assert.equal(old.code,'IH-2026-004');
  await clock('2027-01-01T05:00:01Z');
  await assert.rejects(() => as('service_role',null,'select public.berry_commit_report($1,$2,$3,$4)',[old.operation_id,users.author,100,{}]),error=>error.code==='40001' && error.message==='YEAR_CHANGED');
  await as('service_role',null,'select public.berry_cancel_report($1,$2)',[old.operation_id,users.author]);
  assert.equal((await db.query('select last_sequence from berry_private.report_counters where year=2026')).rows[0].last_sequence,3);
  const fresh = await prepare(row); assert.equal(fresh.code,'IH-2027-001');
  assert.equal((await storeAndCommit(row,fresh,'2026/11-NOVIEMBRE')).inspection.code,'IH-2027-001');
  await clock('2028-01-01T06:00:00Z');
  await db.exec('insert into berry_private.report_counters(year,last_sequence) values(2028,999)');
  assert.equal((await prepare(await nextDraft(4))).code,'IH-2028-1000');
});
test('invalid JSON cannot poison shared records, and rerunning older setup cannot reset an activated workspace', async () => {
  const row = await nextDraft(5);
  for (const data of [{ ...cloudData(), area:{} },{ ...cloudData(), observations:[{ ...cloudData().observations[0], description:null }] },{ ...cloudData(), registrationDetails:{ [users.author]:{ date:[] } } }]) {
    await assert.rejects(() => as('authenticated',users.author,'select public.berry_save_draft($1,$2,$3)',[row.id,row.revision,data]),error=>error.code==='22023');
  }
  await assert.rejects(() => db.exec(accountsMigration),error=>error.code==='55000'); await db.exec('rollback');
  await db.exec(reportsMigration);
  assert.equal((await as('anon',null,'select public.berry_schema_status() as value')).rows[0].value.sync_ready,true);
  assert.equal((await db.query('select code from public.berry_inspections where id=$1',[cloudReport])).rows[0].code,'IH-2026-001');
});

let originalDocument, finalDocument;
test('only a fully closed assigned inspection can replace its workbook, and failed storage preserves the original',async()=>{
  await db.exec(finalMigration);
  originalDocument=(await db.query("select * from public.berry_documents where inspection_id=$1 and kind='excel'",[cloudReport])).rows[0];
  await denied(()=>as('authenticated',users.other,'select public.berry_prepare_final($1,$2)',[cloudReport,cloudRevision]));
  const open=(await db.query("select id,revision from public.berry_inspections where code='IH-2026-002'")).rows[0];
  await denied(()=>as('authenticated',users.author,'select public.berry_prepare_final($1,$2)',[open.id,open.revision]));
  assert.equal((await as('authenticated',users.recipient,'select public.berry_prepare_final($1,$2) as value',[cloudReport,cloudRevision])).rows[0].value.complete,false);
  finalDocument={...originalDocument,storage_path:originalDocument.storage_path.replace(documentHash,'c'.repeat(64)),sha256:'c'.repeat(64),byte_size:3000};
  await denied(()=>as('authenticated',users.author,'select public.berry_commit_final($1,$2,$3,$4,$5)',[cloudReport,users.author,100,cloudRevision,finalDocument]));
  await assert.rejects(()=>as('service_role',null,'select public.berry_commit_final($1,$2,$3,$4,$5)',[cloudReport,users.author,100,cloudRevision,finalDocument]),error=>error.code==='22023');
  assert.equal((await db.query('select storage_path from public.berry_documents where id=$1',[originalDocument.id])).rows[0].storage_path,originalDocument.storage_path);
});
test('replacement keeps one document row, removes the old object before success and preserves code, corrections and audit history',async()=>{
  const abandoned=originalDocument.storage_path.replace(documentHash,'f'.repeat(64));
  await db.query('insert into storage.objects(bucket_id,name)values($1,$2)',['berry-documents',abandoned]);
  await db.query('insert into storage.objects(bucket_id,name)values($1,$2)',['berry-documents',finalDocument.storage_path]);
  const committed=(await as('service_role',null,'select public.berry_commit_final($1,$2,$3,$4,$5) as value',[cloudReport,users.author,100,cloudRevision,finalDocument])).rows[0].value;
  assert.equal(committed.document.id,originalDocument.id);assert.equal(committed.document.is_final,true);
  assert.equal((await db.query('select count(*) from public.berry_documents where inspection_id=$1',[cloudReport])).rows[0].count,1);
  assert.equal((await as('authenticated',users.recipient,'select name from storage.objects where name=$1',[originalDocument.storage_path])).rows.length,0);
  const cleanup=(await as('service_role',null,'select public.berry_final_cleanup($1,$2,$3) as value',[cloudReport,users.author,100])).rows[0].value;
  assert.deepEqual(new Set(cleanup),new Set([originalDocument.storage_path,abandoned]));
  await assert.rejects(()=>as('service_role',null,'select public.berry_finish_final($1,$2,$3,$4)',[cloudReport,users.author,100,[]]),error=>error.code==='40001');
  await db.query('delete from storage.objects where bucket_id=$1 and name=any($2)',['berry-documents',cleanup]);
  const finished=(await as('service_role',null,'select public.berry_finish_final($1,$2,$3,$4) as value',[cloudReport,users.author,100,cleanup])).rows[0].value;
  assert.equal(finished.final_excel_stored,true);assert.equal(finished.code,'IH-2026-001');assert.equal(finished.data.delivery.corrections[cloudObservation].decision,'approved');
  assert.equal((await db.query('select count(*) from storage.objects where bucket_id=$1 and name in($2,$3)',['berry-documents',originalDocument.storage_path,finalDocument.storage_path])).rows[0].count,1);
  const history=await as('authenticated',users.recipient,"select before_data,after_data from public.berry_audit where entity_type='berry_documents' and entity_id=$1 order by id desc limit 1",[originalDocument.id]);
  assert.equal(history.rows[0].before_data.is_final,false);assert.equal(history.rows[0].after_data.is_final,true);
});
test('competing final uploads keep the first completed workbook, clean the unused file and cannot reset the migration',async()=>{
  const alternate={...finalDocument,storage_path:finalDocument.storage_path.replace('c'.repeat(64),'d'.repeat(64)),sha256:'d'.repeat(64)};
  await db.query('insert into storage.objects(bucket_id,name)values($1,$2)',['berry-documents',alternate.storage_path]);
  const raced=(await as('service_role',null,'select public.berry_commit_final($1,$2,$3,$4,$5) as value',[cloudReport,users.recipient,100,cloudRevision,alternate])).rows[0].value;
  assert.equal(raced.document.storage_path,finalDocument.storage_path);
  const cleanup=(await as('service_role',null,'select public.berry_final_cleanup($1,$2,$3) as value',[cloudReport,users.recipient,100])).rows[0].value;
  assert.deepEqual(cleanup,[alternate.storage_path]);
  await db.query('delete from storage.objects where bucket_id=$1 and name=$2',['berry-documents',alternate.storage_path]);
  await as('service_role',null,'select public.berry_finish_final($1,$2,$3,$4)',[cloudReport,users.recipient,100,cleanup]);
  assert.equal((await db.query('select count(*) from public.berry_documents where inspection_id=$1',[cloudReport])).rows[0].count,1);
  await assert.rejects(()=>db.exec(reportsMigration),error=>error.code==='55000');await db.exec('rollback');
  await db.exec(finalMigration);
  assert.equal((await as('anon',null,'select public.berry_schema_status() as value')).rows[0].value.final_archive_version,'202611080004');
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
