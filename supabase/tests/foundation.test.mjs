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
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz default now(), raw_user_meta_data jsonb default '{}', raw_app_meta_data jsonb default '{}');
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

test('final replacement stays blocked until every observation has been approved, even when statuses are already Executed',async()=>{
  await clock('2026-11-08T10:00:00Z');
  let row=await nextDraft(6);
  const second='90000000-0000-4000-8000-000000000099';
  row=(await as('authenticated',users.author,'select public.berry_save_draft($1,$2,$3) as value',[row.id,row.revision,{...cloudData(),id:row.id,observations:[...cloudData().observations,{...cloudData().observations[0],id:second}]}])).rows[0].value;
  row=(await storeAndCommit(row,await prepare(row),'2026/11-NOVIEMBRE')).inspection;
  const change=async(actor,observation,action,value)=>{row=(await as('authenticated',actor,'select public.berry_change_correction($1,$2,$3,$4,$5) as value',[row.id,observation,row.revision,action,value])).rows[0].value;};
  for(const observation of [cloudObservation,second])await change(users.author,observation,'state',{state:'Ejecutado'});
  assert.equal(row.workflow,'sent');await denied(()=>as('authenticated',users.author,'select public.berry_prepare_final($1,$2)',[row.id,row.revision]));
  for(const [index,observation] of [cloudObservation,second].entries()){
    await change(users.recipient,observation,'submit',{responsibleName:'Responsable',action:'Acción completada',date:'2026-11-08',photos:[],state:'Pendiente'});
    await change(users.author,observation,'approve',{note:'Evidencia revisada'});
    assert.equal(row.workflow,index===0?'sent':'closed');
    if(index===0)await denied(()=>as('authenticated',users.author,'select public.berry_prepare_final($1,$2)',[row.id,row.revision]));
  }
  assert.equal((await as('authenticated',users.recipient,'select public.berry_prepare_final($1,$2) as value',[row.id,row.revision])).rows[0].value.complete,false);
});

const accessMigration=await readFile(new URL('../migrations/202611080005_access_controls.sql',import.meta.url),'utf8');
let receiverRevision;
const permissions=(create,receive,admin=false,enabled=true)=>({enabled,role:admin?'admin':'inspector',can_create_inspections:create,can_receive_inspections:receive});
async function accessChange(actor,target,revision,values,action='update'){
 return(await as('authenticated',actor,'select public.berry_manage_account($1,$2,$3,$4) as value',[target,revision,action,values])).rows[0].value;
}
test('independent capabilities preserve existing access and cannot be granted by profile edits or user metadata',async()=>{
 await db.exec(accessMigration);
 await db.query("update public.berry_profiles set role='inspector' where id=$1",[temporaryUser]);
 const existing=(await db.query('select can_create_inspections,can_receive_inspections from public.berry_profiles where id=$1',[users.recipient])).rows[0];assert.equal(existing.can_create_inspections,true);assert.equal(existing.can_receive_inspections,true);
 await denied(()=>as('authenticated',users.recipient,'update public.berry_profiles set can_create_inspections=true where id=$1',[users.recipient]));
 await denied(()=>accessChange(users.recipient,users.author,1,permissions(true,true,true)));
 const p=(await accessChange(users.author,users.recipient,1,permissions(false,true)));receiverRevision=p.access_revision;
 assert.equal(p.can_create_inspections,false);assert.equal(p.can_receive_inspections,true);
 await denied(()=>as('authenticated',users.recipient,'select public.berry_ensure_draft($1)',['92000000-0000-4000-8000-000000000001']));
 const assigned=(await db.query("select id from public.berry_inspections where code='IH-2026-002'")).rows[0].id;
 assert.equal((await as('authenticated',users.recipient,'select id from public.berry_inspections where id=$1',[assigned])).rows.length,1);
 const off=await accessChange(users.author,users.recipient,receiverRevision,permissions(true,false));receiverRevision=off.access_revision;
 assert.equal((await as('authenticated',users.recipient,'select id from public.berry_inspections where id=$1',[assigned])).rows.length,0);
 await denied(()=>as('authenticated',users.recipient,'select public.berry_change_correction($1,$2,$3,$4,$5)',[assigned,cloudObservation,1,'submit',{state:'Pendiente'}]));
 await as('authenticated',users.recipient,'select public.berry_ensure_draft($1)',['92000000-0000-4000-8000-000000000001']);
 const restored=await accessChange(users.author,users.recipient,receiverRevision,permissions(true,true));receiverRevision=restored.access_revision;
});
test('deactivation blocks login data and selection, preserves historical reports, and exposes only current administrator contacts to a fresh account session',async()=>{
 const account=(await db.query('select access_revision from public.berry_profiles where id=$1',[users.other])).rows[0];
 const history=(await db.query('select id,author_id,data from public.berry_inspections where author_id=$1 order by id',[users.other])).rows;
 const disabled=await accessChange(users.author,users.other,account.access_revision,permissions(true,true,false,false));
 assert.equal(disabled.enabled,false);assert.equal(disabled.deleted_at,null);
 assert.equal((await as('authenticated',users.author,'select id from public.berry_profiles where id=$1',[users.other])).rows.length,0);
 assert.deepEqual((await db.query('select id,author_id,data from public.berry_inspections where author_id=$1 order by id',[users.other])).rows,history);
 const cutoff=(await db.query('select credentials_valid_after from public.berry_profiles where id=$1',[users.other])).rows[0].credentials_valid_after;
 await denied(()=>as('anon',null,'select public.berry_account_administrators()'));
 await denied(()=>as('authenticated',users.other,'select public.berry_account_administrators()',[],{iat:Number(cutoff)}));
 const contacts=(await as('authenticated',users.other,'select public.berry_account_administrators() as value',[],{iat:Number(cutoff)+1})).rows[0].value;
 assert.deepEqual(contacts.map(p=>p.id),[users.author]);
 assert.ok(contacts.every(p=>Object.keys(p).sort().join(',')==='email,full_name,id'));
 assert.equal((await as('authenticated',users.other,'select id from public.berry_inspections',[],{iat:Number(cutoff)+1})).rows.length,0);
 const restored=await accessChange(users.author,users.other,disabled.access_revision,permissions(true,true));
 assert.equal(restored.enabled,true);assert.equal(restored.deleted_at,null);
});
test('administrators can delegate administration and remove access with version checks while preserving the last usable administrator',async()=>{
 await assert.rejects(()=>accessChange(users.author,users.author,1,permissions(true,true,false)),error=>error.code==='22023'&&error.message==='LAST_ADMIN_REQUIRED');
 const promoted=await accessChange(users.author,users.recipient,receiverRevision,permissions(false,false,true));receiverRevision=promoted.access_revision;
 assert.equal(promoted.can_create_inspections,true);assert.equal(promoted.can_receive_inspections,true);
 await as('authenticated',users.recipient,'select public.berry_ensure_draft($1)',['92000000-0000-4000-8000-000000000002']);
 const assigned=(await db.query("select id from public.berry_inspections where code='IH-2026-002'")).rows[0].id;
 assert.equal((await as('authenticated',users.recipient,'select id from public.berry_inspections where id=$1',[assigned])).rows.length,1);
 await assert.rejects(()=>db.query('update public.berry_profiles set can_receive_inspections=false where id=$1',[users.recipient]),error=>error.code==='23514');
 assert.ok((await as('authenticated',users.recipient,'select public.berry_admin_accounts() as value')).rows[0].value.length>0);
 await assert.rejects(()=>accessChange(users.author,users.recipient,1,permissions(true,true)),error=>error.code==='40001');
 const other=(await db.query('select access_revision from public.berry_profiles where id=$1',[users.other])).rows[0];
 const reportHistory=(await db.query('select id,author_id,data from public.berry_inspections where author_id=$1 order by id',[users.other])).rows;
 const deleted=await accessChange(users.recipient,users.other,other.access_revision,{},'delete');assert.ok(deleted.deleted_at);assert.equal(deleted.enabled,false);
 assert.deepEqual((await db.query('select id,author_id,data from public.berry_inspections where author_id=$1 order by id',[users.other])).rows,reportHistory);
 assert.equal((await as('authenticated',users.author,'select id from public.berry_profiles where id=$1',[users.other])).rows.length,0);
 await denied(()=>as('authenticated',users.other,'select public.berry_account_administrators()',[],{iat:Math.floor(Date.now()/1000)+10}));
 assert.equal((await db.query('select id from auth.users where id=$1',[users.other])).rows.length,1);
 assert.ok(!(await as('authenticated',users.author,'select public.berry_admin_accounts() as value')).rows[0].value.some(p=>p.id===users.other));
 await denied(()=>as('authenticated',users.other,'select public.berry_cloud_session()'));
 const restored=await accessChange(users.author,users.recipient,receiverRevision,permissions(true,true));receiverRevision=restored.access_revision;
});
test('new account grants accept independent booleans, reject forged flags and apply only the administrator request',async()=>{
 const requestId='93000000-0000-4000-8000-000000000001',newId='93000000-0000-4000-8000-000000000002';
 const input={email:'receiver-only@example.invalid',full_name:'Solo recibe',area:'Operaciones',job_title:'Responsable',role:'inspector',supervisor_emails:[],can_create_inspections:false,can_receive_inspections:true};
 await assert.rejects(()=>as('authenticated',users.author,'select public.berry_prepare_account($1,$2)',[requestId,{...input,can_create_inspections:'true'}]),error=>error.code==='22023');
 await as('authenticated',users.author,'select public.berry_prepare_account($1,$2)',[requestId,input]);
 await db.query('insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data)values($1,$2,$3,$4)',[newId,input.email,{can_create_inspections:true,role:'admin'},{berry_request_id:requestId}]);
 const profile=(await db.query('select can_create_inspections,can_receive_inspections from public.berry_profiles where id=$1',[newId])).rows[0];assert.equal(profile.can_create_inspections,false);assert.equal(profile.can_receive_inspections,false);
 const created=(await as('authenticated',users.author,'select public.berry_finish_account($1,$2) as value',[requestId,newId])).rows[0].value;
 assert.equal(created.can_create_inspections,false);assert.equal(created.can_receive_inspections,true);assert.equal(created.role,'inspector');
 const adminRequest='93000000-0000-4000-8000-000000000003',adminId='93000000-0000-4000-8000-000000000004';
 const adminInput={...input,email:'admin-includes-inspections@example.invalid',role:'admin',can_create_inspections:false,can_receive_inspections:false};
 await as('authenticated',users.author,'select public.berry_prepare_account($1,$2)',[adminRequest,adminInput]);
 await db.query('insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data)values($1,$2,$3,$4)',[adminId,adminInput.email,{},{berry_request_id:adminRequest}]);
 const admin=(await as('authenticated',users.author,'select public.berry_finish_account($1,$2) as value',[adminRequest,adminId])).rows[0].value;
 assert.equal(admin.role,'admin');assert.equal(admin.can_create_inspections,true);assert.equal(admin.can_receive_inspections,true);assert.equal(admin.must_change_password,true);
 await denied(()=>as('authenticated',adminId,'select public.berry_cloud_session()'));
});
test('normal administrative deletion can remove another author report and leaves numbering gaps without reusing a code',async()=>{
 const foreign=(await db.query('select revision from public.berry_inspections where id=$1',[reports.otherDraft])).rows[0];
 await denied(()=>as('authenticated',users.recipient,'select public.berry_admin_delete_inspection($1,$2)',[reports.otherDraft,foreign.revision]));
 await as('authenticated',users.author,'select public.berry_admin_delete_inspection($1,$2)',[reports.otherDraft,foreign.revision]);
 const records=[];
 for(const n of [100,101,102]){const row=await nextDraft(n);records.push((await storeAndCommit(row,await prepare(row),'2026/11-NOVIEMBRE')).inspection);}
 const deleted=records[1],counter=(await db.query('select last_sequence from berry_private.report_counters where year=2026')).rows[0].last_sequence;
 await as('authenticated',users.author,'select public.berry_admin_delete_inspection($1,$2)',[deleted.id,deleted.revision]);
 assert.equal((await db.query('select last_sequence from berry_private.report_counters where year=2026')).rows[0].last_sequence,counter);
 assert.equal((await db.query('select code from public.berry_inspections where id=$1',[deleted.id])).rows[0].code,deleted.code);
 assert.equal((await as('authenticated',users.recipient,'select id from public.berry_inspections where id=$1',[deleted.id])).rows.length,0);
 await denied(()=>as('authenticated',users.author,'select public.berry_ensure_draft($1)',[deleted.id]));
 const next=await nextDraft(103),lease=await prepare(next);
 assert.equal(Number(lease.code.split('-')[2]),Number(records[2].code.split('-')[2])+1);assert.notEqual(lease.code,deleted.code);
 await as('service_role',null,'select public.berry_cancel_report($1,$2)',[lease.operation_id,users.author]);
 const visible=(await as('authenticated',users.author,'select public.berry_admin_inspections() as value')).rows[0].value;
 assert.ok(!visible.some(row=>row.id===deleted.id));assert.ok(visible.some(row=>row.id===records[0].id));assert.ok(visible.some(row=>row.id===records[2].id));
});
test('another administrator can be deleted while reports retain their author and the last usable administrator stays protected',async()=>{
 let target=(await db.query('select access_revision from public.berry_profiles where id=$1',[users.recipient])).rows[0];
 const admin=await accessChange(users.author,users.recipient,target.access_revision,permissions(true,true,true));
 const history=(await db.query('select id,author_id,data from public.berry_inspections where author_id=$1 order by id',[users.recipient])).rows;
 const removed=await accessChange(users.author,users.recipient,admin.access_revision,{},'delete');
 assert.equal(removed.enabled,false);assert.ok(removed.deleted_at);
 assert.deepEqual((await db.query('select id,author_id,data from public.berry_inspections where author_id=$1 order by id',[users.recipient])).rows,history);
 await assert.rejects(()=>accessChange(users.author,users.author,1,permissions(true,true)),error=>error.code==='22023'&&error.message==='LAST_ADMIN_REQUIRED');
});
test('capabilities cannot be bypassed through old workflow functions, earlier setup or a duplicate migration',async()=>{
 await denied(()=>as('authenticated',users.author,'select berry_private.berry_ensure_draft_v4($1)',['94000000-0000-4000-8000-000000000001']));
 await assert.rejects(()=>db.exec(finalMigration),error=>error.code==='55000');await db.exec('rollback');
 await db.exec(accessMigration);
 assert.equal((await as('anon',null,'select public.berry_schema_status() as value')).rows[0].value.permissions_version,'202611080005');
});

const restoreOwner = await readFile(new URL('../operations/restore-owner-access.sql',import.meta.url),'utf8');
const resetPilot = await readFile(new URL('../operations/reset-pilot.sql',import.meta.url),'utf8');
test('owner recovery changes only the confirmed administrator, revokes its sessions and returns the temporary credential only to SQL Editor',async()=>{
  await db.exec(`create schema if not exists extensions;
    create or replace function extensions.gen_random_bytes(integer)returns bytea language sql as $$select decode(repeat('ab',$1),'hex')$$;
    create or replace function extensions.gen_salt(text,integer)returns text language sql as $$select 'test-salt'$$;
    create or replace function extensions.crypt(text,text)returns text language sql as $$select 'test-hash-only'$$;
    alter table auth.users add column encrypted_password text default 'previous-hash';
    alter table auth.users add column updated_at timestamptz default now();
    create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id));
    create table auth.refresh_tokens(id bigint generated always as identity primary key,user_id text);
    alter table auth.users add column if not exists email_confirmed_at timestamptz;`);
  await db.query("update auth.users set email='bryx96@gmail.com',email_confirmed_at=now() where id=$1",[users.author]);
  await db.query("update public.berry_profiles set email='bryx96@gmail.com',role='admin',enabled=true where id=$1",[users.author]);
  await db.query('insert into auth.sessions(id,user_id)values($1,$2),($3,$4)',[passwordId,users.author,creationId,users.recipient]);
  await db.query('insert into auth.refresh_tokens(user_id)values($1),($2)',[users.author,users.recipient]);
  const restored=await db.query(restoreOwner);
  assert.equal(restored.rows[0].email,'bryx96@gmail.com');assert.equal(restored.rows[0].temporary_password.length,36);
  assert.equal((await db.query('select encrypted_password from auth.users where id=$1',[users.author])).rows[0].encrypted_password,'test-hash-only');
  assert.equal((await db.query('select encrypted_password from auth.users where id=$1',[users.recipient])).rows[0].encrypted_password,'previous-hash');
  assert.equal((await db.query('select user_id from auth.sessions')).rows[0].user_id,users.recipient);
  assert.equal((await db.query('select must_change_password from public.berry_profiles where id=$1',[users.author])).rows[0].must_change_password,true);
  assert.equal((await db.query(restoreOwner.replaceAll('bryx96@gmail.com','missing@example.invalid'))).rows.length,0);
});
test('the one-time pilot reset preserves the verified owner, removes the other accounts and records, starts at 001 and cannot erase new work on replay',async()=>{
  await assert.rejects(()=>db.exec(resetPilot),error=>error.code==='55000');await db.exec('rollback');
  assert.ok((await db.query('select count(*) as count from public.berry_inspections')).rows[0].count>0);
  // Simulates Empty bucket in Storage; the operator SQL never deletes storage metadata.
  await db.exec("delete from storage.objects where bucket_id in('berry-evidence','berry-documents')");
  await db.exec(resetPilot);
  assert.deepEqual((await db.query('select id from auth.users')).rows,[{id:users.author}]);
  assert.equal((await db.query('select count(*) as count from public.berry_inspections')).rows[0].count,0);
  assert.equal((await db.query('select count(*) as count from berry_private.report_counters')).rows[0].count,0);
  assert.equal((await db.query('select count(*) as count from auth.sessions')).rows[0].count,0);
  await assert.rejects(()=>db.query('insert into public.berry_inspections(id,author_id,data)values($1,$2,$3)',[cloudReport,users.author,{}]),error=>error.code==='42501');
  const cutoff=Number((await db.query('select credentials_valid_after from public.berry_profiles where id=$1',[users.author])).rows[0].credentials_valid_after);
  await denied(()=>as('authenticated',users.author,'select public.berry_cloud_session()',[],{iat:cutoff}));
  await db.query('update public.berry_profiles set must_change_password=false where id=$1',[users.author]);
  const fresh={iat:cutoff+1},id='91000000-0000-4000-8000-000000000001';
  await as('authenticated',users.author,'select public.berry_ensure_draft($1)',[id],fresh);
  const saved=(await as('authenticated',users.author,'select public.berry_save_draft($1,1,$2) as value',[id,{...cloudData(),id,responsibles:[{id:'self',personId:users.author,name:'Propietario',email:'bryx96@gmail.com'}]}],fresh)).rows[0].value;
  const lease=(await as('authenticated',users.author,'select public.berry_prepare_report($1,$2,$3) as value',[id,saved.revision,sourceHash],fresh)).rows[0].value.lease;
  assert.equal(lease.code,'IH-2026-001');
  await assert.rejects(()=>db.exec(resetPilot),error=>error.code==='55000');await db.exec('rollback');
  assert.equal((await db.query('select count(*) as count from public.berry_inspections')).rows[0].count,1);
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
