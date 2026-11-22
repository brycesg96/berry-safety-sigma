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
  await denied(() => as('authenticated', users.author, "update public.berry_inspections set workflow='closed',closed_at=now() where id=$1", [reports.sent]));
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

const upgradeWorkspace=await readFile(new URL('../operations/upgrade-workspace.sql',import.meta.url),'utf8');
test('single workspace upgrade installs steps 5 to 12 atomically from the current final-archive stage without changing reports or counters',async()=>{
 const reportsBefore=(await db.query('select id,data,code from public.berry_inspections order by id')).rows;
 const countersBefore=(await db.query('select * from berry_private.report_counters order by year')).rows;
 await assert.rejects(()=>db.transaction(async tx=>{
  await tx.exec(upgradeWorkspace);
  assert.equal((await tx.query('select public.berry_schema_status() as value')).rows[0].value.registration_version,'202611090008');
  assert.equal((await tx.query('select public.berry_schema_status() as value')).rows[0].value.correction_identity_version,'202611090009');
  assert.equal((await tx.query('select public.berry_schema_status() as value')).rows[0].value.admin_edit_version,'202611090010');
  assert.equal((await tx.query('select public.berry_schema_status() as value')).rows[0].value.account_copies_version,'202611090011');
  assert.equal((await tx.query('select public.berry_schema_status() as value')).rows[0].value.next_registration_version,'202611090012');
  assert.deepEqual((await tx.query('select id,data,code from public.berry_inspections order by id')).rows,reportsBefore);
  assert.deepEqual((await tx.query('select * from berry_private.report_counters order by year')).rows,countersBefore);
  throw new Error('ROLLBACK_UPGRADE_FIXTURE');
 }),e=>e.message==='ROLLBACK_UPGRADE_FIXTURE');
 assert.equal((await db.query('select public.berry_schema_status() as value')).rows[0].value.registration_version,undefined);
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

const storageMigration=await readFile(new URL('../migrations/202611080006_storage_names.sql',import.meta.url),'utf8');
const dashboardMigration=await readFile(new URL('../migrations/202611080007_dashboard.sql',import.meta.url),'utf8');
let accentedReport;
test('accented filenames commit ASCII storage keys, preserve visible names and consume a code only after storage succeeds',async()=>{
 await db.exec(storageMigration);
 const {storageFilename,inspectionArchivePath}=await import('../../shared/archive-path.mjs');
 for(const name of ['REG_INS_MAQUINARIA - ARMONÍA 2.xlsx','AÑO.xlsx','AN\u0303O.xlsx','A%#漢字.xlsx'])
  assert.equal((await db.query('select berry_private.storage_filename($1) as value',[name])).rows[0].value,storageFilename(name));
 await as('authenticated',users.author,'select public.berry_ensure_draft($1)',['95000000-0000-4000-8000-000000000001']);
 const payload={...cloudData(),id:'95000000-0000-4000-8000-000000000001',area:'Maquinaria - Armonía 2',responsibles:[{id:'recipient',personId:temporaryUser}]};
 const row=(await as('authenticated',users.author,'select public.berry_save_draft($1,1,$2) as value',[payload.id,payload])).rows[0].value;
 const lease=await prepare(row), before=(await db.query('select last_sequence from berry_private.report_counters where year=2026')).rows[0].last_sequence;
 const name='REG_INS_MAQUINARIA - ARMONÍA 2_05.11.2026.xlsx',path=inspectionArchivePath(row.data.date,row.id,documentHash,name);
 const doc={filename:name,storage_path:path,sha256:documentHash,byte_size:2000};
 await assert.rejects(()=>as('service_role',null,'select public.berry_commit_report($1,$2,100,$3)',[lease.operation_id,users.author,doc]),e=>e.message==='DOCUMENT_NOT_STORED');
 assert.equal((await db.query('select last_sequence from berry_private.report_counters where year=2026')).rows[0].last_sequence,before);
 await db.query('insert into storage.objects(bucket_id,name) values($1,$2)',['berry-documents',path]);
 const committed=(await as('service_role',null,'select public.berry_commit_report($1,$2,100,$3) as value',[lease.operation_id,users.author,doc])).rows[0].value;
 assert.equal(committed.document.filename,name);assert.equal(committed.document.storage_path,path);
 assert.equal(Number(committed.inspection.code.split('-').at(-1)),Number(before)+1); accentedReport=committed.inspection;
 await db.query("update public.berry_inspections set workflow='closed',closed_at=now() where id=$1",[row.id]);
 const finalDoc={...doc,sha256:'f'.repeat(64),storage_path:inspectionArchivePath(row.data.date,row.id,'f'.repeat(64),name)};
 await db.query('insert into storage.objects(bucket_id,name) values($1,$2)',['berry-documents',finalDoc.storage_path]);
 const final=(await as('service_role',null,'select public.berry_commit_final($1,$2,100,$3,$4) as value',[row.id,users.author,committed.inspection.revision,finalDoc])).rows[0].value;
 assert.equal(final.document.filename,name);assert.equal(final.document.storage_path,finalDoc.storage_path);assert.equal(final.document.is_final,true);
 assert.equal((await db.query('select count(*) as total from public.berry_documents where inspection_id=$1',[row.id])).rows[0].total,1);
 assert.ok((await db.query('select storage_path from berry_private.document_cleanup where inspection_id=$1',[row.id])).rows.some(r=>r.storage_path===path));
 await denied(()=>as('authenticated',users.author,'select berry_private.storage_filename($1)',['AÑO.xlsx']));
 await assert.rejects(()=>db.exec(accessMigration),e=>e.code==='55000');await db.exec('rollback');
});
test('admin dashboard includes historical registered reports, strips photos and signatures, and keeps other authors drafts private',async()=>{
 await db.exec(dashboardMigration);
 // A retired author's report remains searchable and downloadable by administrators.
 await db.query("update public.berry_inspections set author_id=$2,data=jsonb_set(data,'{registrationDetails}',$3) where id=$1",[accentedReport.id,users.other,{[users.other]:{signature:{data:'private-signature'},jobTitle:'Inspector'}}]);
 const rows=(await as('authenticated',users.author,'select public.berry_admin_dashboard() as value')).rows[0].value;
 assert.ok(rows.some(r=>r.id===accentedReport.id && r.author_id===users.other));
 assert.ok(rows.every(r=>r.code && ['sent','closed'].includes(r.workflow) && !r.deleted_at));
 assert.ok(!JSON.stringify(rows).includes('private-signature'));
 assert.ok(rows.every(r=>r.data.observations.every(o=>o.photos.length===0)));
 const detail=(await as('authenticated',users.author,'select public.berry_admin_inspection($1) as value',[accentedReport.id])).rows[0].value;
 assert.equal(detail.data.registrationDetails[users.other].signature.data,'private-signature');
 assert.equal((await as('authenticated',users.author,'select id from public.berry_inspections where id=$1',[accentedReport.id])).rows.length,1);
 const foreignDraft='95000000-0000-4000-8000-000000000002';
 await db.query("insert into public.berry_inspections(id,author_id,data)values($1,$2,'{}')",[foreignDraft,users.other]);
 assert.equal((await as('authenticated',users.author,'select id from public.berry_inspections where id=$1',[foreignDraft])).rows.length,0);
 await denied(()=>as('authenticated',users.author,'select public.berry_admin_inspection($1)',[foreignDraft]));
 await denied(()=>as('anon',null,'select public.berry_admin_dashboard()'));
 const cutoff=(await db.query('select credentials_valid_after from public.berry_profiles where id=$1',[temporaryUser])).rows[0].credentials_valid_after;
 await denied(()=>as('authenticated',temporaryUser,'select public.berry_admin_dashboard()',[],{iat:Number(cutoff)+1}));
 await denied(()=>as('authenticated',temporaryUser,'select public.berry_admin_inspection($1)',[accentedReport.id],{iat:Number(cutoff)+1}));
 const status=(await as('anon',null,'select public.berry_schema_status() as value')).rows[0].value;
 assert.equal(status.storage_version,'202611080006');assert.equal(status.dashboard_version,'202611080007');
 await assert.rejects(()=>db.exec(storageMigration),e=>e.code==='55000');await db.exec('rollback');
});

const registrationMigration=await readFile(new URL('../migrations/202611090008_registration_participants.sql',import.meta.url),'utf8');
test('four inspection participants and four independent registrants preserve historical reports, bind profile data and validate eligibility',async()=>{
 const history=(await db.query("select id,data from public.berry_inspections where workflow<>'draft' order by id")).rows;
 await db.exec(registrationMigration);
 assert.deepEqual((await db.query("select id,data from public.berry_inspections where workflow<>'draft' order by id")).rows,history);
 const people=[];
 for(let n=1;n<=6;n++){
  const id=`96000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
  await db.query('insert into auth.users(id,email)values($1,$2)',[id,`participant${n}@example.invalid`]);
  await db.query("update public.berry_profiles set full_name=$2,job_title=$3,enabled=true,must_change_password=false,can_create_inspections=true,can_receive_inspections=true where id=$1",[id,`Participante ${n}`,`Puesto ${n}`]);
  people.push({id,personId:id,name:'Forged name',email:'forged@example.invalid'});
 }
 const id='96000000-0000-4000-8000-000000000010';
 await as('authenticated',users.author,'select public.berry_ensure_draft($1)',[id]);
 const payload={...cloudData(),id,additionalInspectors:people.slice(0,3),registrationParticipants:people.slice(3),responsibles:[{id:'recipient',personId:temporaryUser}],registrationDetails:{[people[0].id]:{jobTitle:'Unselected',date:'2026-11-05'},[people[3].id]:{jobTitle:'Forged title',date:'2026-11-06'}}};
 const row=(await as('authenticated',users.author,'select public.berry_save_draft($1,1,$2) as value',[id,payload])).rows[0].value;
 assert.equal(row.data.additionalInspectors.length,3);assert.equal(row.data.registrationParticipants.length,3);
 assert.deepEqual(row.data.registrationParticipants.map(p=>p.name),['Participante 4','Participante 5','Participante 6']);
 assert.equal(row.data.registrationDetails[people[3].id].jobTitle,'Puesto 4');assert.ok(!row.data.registrationDetails[people[0].id]);
 for(const patch of [{additionalInspectors:people.slice(0,4)},{registrationParticipants:people.slice(2)},{registrationParticipants:[people[3],people[3]]},{registrationParticipants:[{id:users.author,personId:users.author}]},{registrationParticipants:null}])
  await assert.rejects(()=>as('authenticated',users.author,'select public.berry_save_draft($1,$2,$3)',[id,row.revision,{...payload,...patch}]),e=>e.code==='22023');
 // A person may legitimately be selected once in each separate list.
 const both=(await as('authenticated',users.author,'select public.berry_save_draft($1,$2,$3) as value',[id,row.revision,{...payload,registrationParticipants:[people[0],people[3],people[4]]}])).rows[0].value;
 assert.equal(both.data.registrationParticipants[0].personId,both.data.additionalInspectors[0].personId);
 const target=(await db.query('select access_revision from public.berry_profiles where id=$1',[people[3].id])).rows[0];
 const disabled=await accessChange(users.author,people[3].id,target.access_revision,permissions(true,true,false,false));
 await assert.rejects(()=>prepare(both),e=>e.code==='22023');
 await accessChange(users.author,people[3].id,disabled.access_revision,permissions(true,true));
 const lease=await prepare(both);
 await as('service_role',null,'select public.berry_cancel_report($1,$2)',[lease.operation_id,users.author]);
 assert.equal((await as('anon',null,'select public.berry_schema_status() as value')).rows[0].value.registration_version,'202611090008');
 const beforeReplay=(await db.query('select id,data,revision from public.berry_inspections order by id')).rows;await db.exec(registrationMigration);assert.deepEqual((await db.query('select id,data,revision from public.berry_inspections order by id')).rows,beforeReplay);
 await assert.rejects(()=>db.exec(dashboardMigration),e=>e.code==='55000');await db.exec('rollback');
});

const correctionIdentityMigration=await readFile(new URL('../migrations/202611090009_correction_identity.sql',import.meta.url),'utf8');
test('correction responsible is bound to the original assignment for recipients and reviewer; forged names cannot change it or bypass permissions',async()=>{
 const previousReports=(await db.query('select id,data,revision from public.berry_inspections order by id')).rows;
 const previousCounters=(await db.query('select * from berry_private.report_counters order by year')).rows;
 await db.exec(correctionIdentityMigration);
 assert.deepEqual((await db.query('select id,data,revision from public.berry_inspections order by id')).rows,previousReports);
 assert.deepEqual((await db.query('select * from berry_private.report_counters order by year')).rows,previousCounters);
 const id='98000000-0000-4000-8000-000000000001',lead='96000000-0000-4000-8000-000000000001',second='96000000-0000-4000-8000-000000000002',secondObservation='98000000-0000-4000-8000-000000000002';
 await as('authenticated',users.author,'select public.berry_ensure_draft($1)',[id]);
 const data={...cloudData(),id,responsibles:[{id:'first',personId:lead},{id:'second',personId:second}],observations:[...cloudData().observations,{...cloudData().observations[0],id:secondObservation}]};
 let row=(await as('authenticated',users.author,'select public.berry_save_draft($1,1,$2) as value',[id,data])).rows[0].value;
 row=(await storeAndCommit(row,await prepare(row),'2026/11-NOVIEMBRE')).inspection;
 const assignedName=row.data.responsibles[0].name,code=row.code;
 const change=async(actor,observation,action,value)=>{row=(await as('authenticated',actor,'select public.berry_change_correction($1,$2,$3,$4,$5) as value',[id,observation,row.revision,action,value])).rows[0].value;return row.data.delivery.corrections[observation];};
 const input={responsibleName:'Nombre falso',action:'Corregir la condición.',date:'2026-11-09',photos:[],state:'Pendiente'};
 let correction=await change(lead,cloudObservation,'save',input);
 assert.equal(correction.responsibleName,assignedName);assert.equal(correction.actorId,lead);
 correction=await change(users.author,secondObservation,'state',{state:'Pendiente',responsibleName:'Nombre del revisor'});
 assert.equal(correction.responsibleName,assignedName);assert.equal(correction.actorId,lead);
 // Later profile edits do not rewrite the identity recorded at assignment.
 await db.query('update public.berry_profiles set full_name=$2 where id=$1',[lead,'Nombre actualizado del perfil']);
 correction=await change(second,cloudObservation,'submit',{...input,responsibleName:'Otro responsable inventado'});
 assert.equal(correction.responsibleName,assignedName);assert.equal(correction.actorId,second);
 await change(users.author,cloudObservation,'state',{state:'Ejecutado'});
 correction=await change(users.author,cloudObservation,'changes',{note:'Completar la descripción.',responsibleName:'Otro nombre'});assert.equal(correction.responsibleName,assignedName);
 assert.equal(correction.state,'Pendiente');assert.equal(correction.proposedState,'Pendiente');assert.equal(correction.decision,'changes');
 assert.equal(row.data.delivery.corrections[secondObservation].state,'Pendiente');
 assert.equal((await db.query('select state from public.berry_corrections where inspection_id=$1 and observation_id=$2',[id,cloudObservation])).rows[0].state,'Pendiente');
 correction=await change(lead,cloudObservation,'submit',{...input,responsibleName:undefined});assert.equal(correction.responsibleName,assignedName);
 correction=await change(users.author,cloudObservation,'approve',{note:'Conforme'});assert.equal(correction.responsibleName,assignedName);
 await change(second,secondObservation,'submit',input);await change(users.author,secondObservation,'approve',{note:'Conforme'});
 assert.equal(row.workflow,'closed');assert.equal(row.code,code);
 const stored=(await db.query('select responsible_name,data from public.berry_corrections where inspection_id=$1',[id])).rows;
 assert.equal(stored.length,2);assert.ok(stored.every(c=>c.responsible_name===assignedName&&c.data.responsibleName===assignedName));
 await denied(()=>change(lead,cloudObservation,'save',input));
 await denied(()=>as('authenticated',lead,'select berry_private.berry_change_correction_v4($1,$2,$3,$4,$5)',[id,cloudObservation,row.revision,'save',input]));
 await denied(()=>as('anon',null,'select public.berry_change_correction($1,$2,$3,$4,$5)',[id,cloudObservation,row.revision,'save',input]));
 assert.equal((await as('anon',null,'select public.berry_schema_status() as value')).rows[0].value.correction_identity_version,'202611090009');
 await assert.rejects(()=>db.exec(registrationMigration),e=>e.code==='55000');await db.exec('rollback');
});

const adminEditMigration=await readFile(new URL('../migrations/202611090010_admin_edit.sql',import.meta.url),'utf8');
test('administrative edit schema installs without changing existing reports or numbering',async()=>{
 const before=(await db.query('select id,author_id,code,data,revision from public.berry_inspections order by id')).rows;
 const counters=(await db.query('select * from berry_private.report_counters order by year')).rows;
 await db.exec(adminEditMigration);
 assert.deepEqual((await db.query('select id,author_id,code,data,revision from public.berry_inspections order by id')).rows,before);
 assert.deepEqual((await db.query('select * from berry_private.report_counters order by year')).rows,counters);
 assert.equal((await db.query('select public.berry_schema_status() as value')).rows[0].value.admin_edit_version,'202611090010');
});

const editCreator='96000000-0000-4000-8000-000000000006',editLead='96000000-0000-4000-8000-000000000001',editNew='96000000-0000-4000-8000-000000000002';
async function editFixture(n) {
 const id=`99000000-0000-4000-8000-${String(n).padStart(12,'0')}`,second=`99100000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 await as('authenticated',editCreator,'select public.berry_ensure_draft($1)',[id]);
 let row=(await as('authenticated',editCreator,'select public.berry_save_draft($1,1,$2) as value',[id,{...cloudData(),id,responsibles:[{id:'r',personId:editLead}],observations:[...cloudData().observations,{...cloudData().observations[0],id:second}]}])).rows[0].value;
 const lease=(await as('authenticated',editCreator,'select public.berry_prepare_report($1,$2,$3) as value',[id,row.revision,sourceHash])).rows[0].value.lease;
 const doc={filename:'REG_INS_TALLER.xlsx',sha256:documentHash,byte_size:2000,storage_path:`2026/11-NOVIEMBRE/${id}/${documentHash}/REG_INS_TALLER.xlsx`};
 await db.query('insert into storage.objects(bucket_id,name)values($1,$2)',['berry-documents',doc.storage_path]);
 const committed=(await as('service_role',null,'select public.berry_commit_report($1,$2,100,$3) as value',[lease.operation_id,editCreator,doc])).rows[0].value;
 return {row:committed.inspection,document:committed.document,second};
}
const prepareEdit=async(row,data,operation,actor=users.author)=>(await as('authenticated',actor,'select public.berry_prepare_admin_edit($1,$2,$3,$4) as value',[row.id,row.revision,data,operation])).rows[0].value;
const editService=async(name,operation,extra=[],actor=users.author)=>(await as('service_role',null,`select public.${name}($1,$2,100${extra.map((_,i)=>`,$${i+3}`).join('')}) as value`,[operation,actor,...extra])).rows[0].value;
const editDoc=(id,hash='e'.repeat(64))=>({filename:'REG_INS_ARREGLADO.xlsx',sha256:hash,byte_size:2400,storage_path:`2026/12-DICIEMBRE/${id}/${hash}/REG_INS_ARREGLADO.xlsx`});
let adminFixture;
test('admin stages edits to another author report, preserves corrections and identity, and cannot publish before a workbook exists',async()=>{
 adminFixture=await editFixture(1);let row=adminFixture.row;
 const change=async(obs,action,value,actor=editLead)=>{row=(await as('authenticated',actor,'select public.berry_change_correction($1,$2,$3,$4,$5) as value',[row.id,obs,row.revision,action,value])).rows[0].value;};
 const path=`${row.id}/${cloudObservation}/${documentHash}.png`;
 await as('authenticated',editLead,'insert into storage.objects(bucket_id,name)values($1,$2)',['berry-evidence',path]);
 const progress={action:'Avance histórico',date:'2026-11-09',photos:[{id:cloudObservation,name:'evidencia.png',dataRef:path}],state:'Ejecutado'};
 await change(cloudObservation,'submit',progress);await change(cloudObservation,'approve',{note:'Conforme'},editCreator);
 await change(adminFixture.second,'save',{...progress,state:'Pendiente'});
 await denied(()=>change(adminFixture.second,'state',{state:'Ejecutado'},editCreator));
 adminFixture.row=row;adminFixture.counters=(await db.query('select * from berry_private.report_counters order by year')).rows;
 const operation='99200000-0000-4000-8000-000000000001';adminFixture.operation=operation;
 const input={...row.data,ownerId:users.author,inspector:'Falso',serverRegistration:{code:'FAKE'},delivery:{corrections:{}},date:'2026-12-01',area:'Texto manipulado',areaLocation:{site:'Fundo',zone:'Armonía II',detail:'Taller corregido'},responsibles:[{id:'r',personId:editNew}],observations:row.data.observations.map((o,i)=>i===0?{...o,description:'Descripción corregida'}:o)};
 const prepared=await prepareEdit(row,input,operation),data=prepared.inspection.data;
 assert.equal(data.ownerId,editCreator);assert.equal(data.inspector,row.data.inspector);assert.deepEqual(data.serverRegistration,row.data.serverRegistration);
 assert.equal(data.area,'Fundo – Armonía II – Taller corregido');
 const c=data.delivery.corrections[cloudObservation],unchanged=data.delivery.corrections[adminFixture.second];
 assert.equal(c.state,'Pendiente');assert.equal(c.decision,'changes');assert.equal(c.action,progress.action);assert.deepEqual(c.photos,progress.photos);assert.equal(c.actorId,editLead);assert.equal(c.responsibleName,'Participante 2');
 assert.deepEqual(unchanged,{...row.data.delivery.corrections[adminFixture.second],responsibleName:'Participante 2'});
 assert.deepEqual((await db.query('select data from public.berry_inspections where id=$1',[row.id])).rows[0].data,row.data);
 assert.equal((await prepareEdit(row,input,operation)).state,'prepared');
 await assert.rejects(()=>prepareEdit(row,{...input,objective:'Otra edición'},operation),e=>e.code==='40001');
 await denied(()=>prepareEdit(row,input,'99200000-0000-4000-8000-000000000002',editLead));
 await denied(()=>as('anon',null,'select public.berry_prepare_admin_edit($1,$2,$3,$4)',[row.id,row.revision,input,operation]));
 await denied(()=>as('authenticated',users.author,'select * from berry_private.admin_edits'));
 await denied(()=>as('authenticated',users.author,'select public.berry_commit_admin_edit($1,$2,100,$3)',[operation,users.author,editDoc(row.id)]));
 await assert.rejects(()=>editService('berry_commit_admin_edit',operation,[editDoc(row.id)]),e=>e.message==='DOCUMENT_NOT_STORED');
 assert.equal((await db.query('select storage_path from public.berry_documents where inspection_id=$1',[row.id])).rows[0].storage_path,adminFixture.document.storage_path);
 assert.deepEqual((await db.query('select * from berry_private.report_counters order by year')).rows,adminFixture.counters);
});
test('admin commit changes recipients atomically, retains history and code, audits the real administrator and removes only superseded workbooks',async()=>{
 const f=adminFixture,doc=editDoc(f.row.id);await db.query('insert into storage.objects(bucket_id,name)values($1,$2)',['berry-documents',doc.storage_path]);
 const committed=await editService('berry_commit_admin_edit',f.operation,[doc]);
 assert.equal(committed.inspection.code,f.row.code);assert.equal(committed.inspection.author_id,editCreator);assert.equal(committed.inspection.sent_at,f.row.sent_at);assert.equal(committed.document.id,f.document.id);
 assert.equal(committed.inspection.active_edit_operation,f.operation);assert.equal(committed.inspection.data.emailDelivery.state,'unconfirmed');
 assert.equal((await as('authenticated',editLead,'select id from public.berry_inspections where id=$1',[f.row.id])).rows.length,0);
 assert.equal((await as('authenticated',editNew,'select id from public.berry_inspections where id=$1',[f.row.id])).rows.length,1);
 await denied(()=>as('authenticated',editLead,'select public.berry_change_correction($1,$2,$3,$4,$5)',[f.row.id,cloudObservation,committed.inspection.revision,'save',{state:'Pendiente',action:'Intento',date:'2026-12-01',photos:[]}]));
 const corrected=(await as('authenticated',editNew,'select public.berry_change_correction($1,$2,$3,$4,$5) as value',[f.row.id,cloudObservation,committed.inspection.revision,'save',{state:'Pendiente',action:'Continuado por nuevo responsable',date:'2026-12-01',photos:[]}])).rows[0].value;
 assert.equal(corrected.data.delivery.corrections[cloudObservation].responsibleName,'Participante 2');
 const historical=(await db.query('select data from public.berry_corrections where inspection_id=$1 and observation_id=$2',[f.row.id,f.second])).rows[0].data;assert.equal(historical.actorId,editLead);assert.equal(historical.action,'Avance histórico');
 assert.ok((await as('authenticated',users.author,"select actor_id from public.berry_audit where entity_id=$1 and action='update'",[f.row.id])).rows.some(a=>a.actor_id===users.author));
 const abandoned=`2026/11-NOVIEMBRE/${f.row.id}/${'f'.repeat(64)}/ABANDONADO.xlsx`;
 await db.query('insert into storage.objects(bucket_id,name)values($1,$2)',['berry-documents',abandoned]);
 const cleanup=await editService('berry_admin_edit_cleanup',f.operation);assert.deepEqual(new Set(cleanup),new Set([abandoned,f.document.storage_path]));assert.ok(!cleanup.includes(doc.storage_path));
 await assert.rejects(()=>editService('berry_finish_admin_edit',f.operation,[cleanup]),e=>e.message==='EDIT_CLEANUP_PENDING');
 for(const path of cleanup)await db.query("delete from storage.objects where bucket_id='berry-documents' and name=$1",[path]);
 const complete=await editService('berry_finish_admin_edit',f.operation,[cleanup]);assert.equal(complete.active_edit_operation,null);
 assert.equal((await editService('berry_admin_edit_upload',f.operation)).state,'complete');
 assert.equal((await db.query("select name from storage.objects where bucket_id='berry-documents' and split_part(name,'/',3)=$1",[f.row.id])).rows.length,1);
 assert.deepEqual((await db.query('select * from berry_private.report_counters order by year')).rows,f.counters);
});
test('stale, expired, closed and revoked admin operations cannot replace an active document; recipient eligibility is rechecked at commit',async()=>{
 const f=await editFixture(2),operation='99200000-0000-4000-8000-000000000003',data={...f.row.data,date:'2026-12-01',responsibles:[{id:'r',personId:editNew}]};
 await prepareEdit(f.row,data,operation);const doc=editDoc(f.row.id);await db.query('insert into storage.objects(bucket_id,name)values($1,$2)',['berry-documents',doc.storage_path]);
 await db.query('update public.berry_profiles set enabled=false where id=$1',[editNew]);
 await assert.rejects(()=>editService('berry_commit_admin_edit',operation,[doc]),e=>e.message==='RECIPIENT_NOT_ALLOWED');
 await db.query('update public.berry_profiles set enabled=true where id=$1',[editNew]);
 await db.query('update public.berry_inspections set revision=revision+1 where id=$1',[f.row.id]);
 await assert.rejects(()=>editService('berry_commit_admin_edit',operation,[doc]),e=>e.message==='REVISION_CONFLICT');
 await db.query("update berry_private.admin_edits set expires_at=now()-interval '1 minute' where operation_id=$1",[operation]);
 await assert.rejects(()=>editService('berry_admin_edit_upload',operation),e=>e.message==='EDIT_EXPIRED');
 await denied(()=>editService('berry_admin_edit_upload',operation,[],editLead));
 await db.query("update public.berry_inspections set workflow='closed',closed_at=now() where id=$1",[f.row.id]);
 await denied(()=>prepareEdit({...f.row,revision:f.row.revision+1},data,'99200000-0000-4000-8000-000000000004'));
 assert.equal((await db.query('select storage_path from public.berry_documents where inspection_id=$1',[f.row.id])).rows[0].storage_path,f.document.storage_path);
});
test('removing the last pending observation preserves approvals, closes with one final workbook and permits another current administrator to finish cleanup',async()=>{
 const f=await editFixture(4),operation='99200000-0000-4000-8000-000000000005';let row=f.row;
 for(const [actor,action,value] of [[editLead,'submit',{action:'Corregido',date:'2026-11-10',photos:[],state:'Pendiente'}],[editCreator,'approve',{note:'Conforme'}]])row=(await as('authenticated',actor,'select public.berry_change_correction($1,$2,$3,$4,$5) as value',[row.id,cloudObservation,row.revision,action,value])).rows[0].value;
 const target=(await db.query('select access_revision from public.berry_profiles where id=$1',[editNew])).rows[0];await accessChange(users.author,editNew,target.access_revision,permissions(true,true,true));
 const counters=(await db.query('select * from berry_private.report_counters order by year')).rows;
 await prepareEdit(row,{...row.data,date:'2026-12-01',observations:[row.data.observations[0]]},operation);
 await denied(()=>editService('berry_admin_edit_upload',operation,[],editNew));
 const doc=editDoc(row.id);await db.query('insert into storage.objects(bucket_id,name)values($1,$2)',['berry-documents',doc.storage_path]);
 const committed=await editService('berry_commit_admin_edit',operation,[doc]);assert.equal(committed.inspection.workflow,'closed');assert.equal(committed.document.is_final,true);assert.equal(committed.inspection.code,row.code);
 const cleanup=await editService('berry_admin_edit_cleanup',operation,[],editNew);for(const path of cleanup)await db.query("delete from storage.objects where bucket_id='berry-documents' and name=$1",[path]);
 const complete=await editService('berry_finish_admin_edit',operation,[cleanup],editNew);assert.equal(complete.final_excel_stored,true);assert.equal(complete.active_edit_operation,null);
 await denied(()=>prepareEdit(complete,complete.data,'99200000-0000-4000-8000-000000000006'));
 assert.deepEqual((await db.query('select * from berry_private.report_counters order by year')).rows,counters);
});

test('structured areas preserve the composed text in drafts, reject retired sites and wrong zones, and the installer can replay safely',async()=>{
 const id='99000000-0000-4000-8000-000000000003';await as('authenticated',editCreator,'select public.berry_ensure_draft($1)',[id]);
 const data={...cloudData(),id,responsibles:[{id:'r',personId:editNew}],area:'Inventado',areaLocation:{site:'Trujillo',zone:'Quintanas',detail:'Almacén'}};
 const row=(await as('authenticated',editCreator,'select public.berry_save_draft($1,1,$2) as value',[id,data])).rows[0].value;assert.equal(row.data.area,'Trujillo – Quintanas – Almacén');
 for(const location of [{site:'Puerto Morín',zone:'Puerto Morín',detail:'Taller'},{site:'Fundo',zone:'Quintanas',detail:'Taller'},'incorrecto',null])await assert.rejects(()=>as('authenticated',editCreator,'select public.berry_save_draft($1,$2,$3)',[id,row.revision,{...data,areaLocation:location}]),e=>e.message==='INVALID_LOCATION');
 const partial=(await as('authenticated',editCreator,'select public.berry_save_draft($1,$2,$3) as value',[id,row.revision,{...data,areaLocation:{...data.areaLocation,zone:''}}])).rows[0].value;
 await assert.rejects(()=>as('authenticated',editCreator,'select public.berry_prepare_report($1,$2,$3)',[id,partial.revision,sourceHash]),e=>e.message==='INCOMPLETE_LOCATION');
 const before=(await db.query('select id,code,data,revision from public.berry_inspections order by id')).rows,counters=(await db.query('select * from berry_private.report_counters order by year')).rows;
 await assert.rejects(()=>db.transaction(async tx=>{await tx.exec(upgradeWorkspace);assert.deepEqual((await tx.query('select id,code,data,revision from public.berry_inspections order by id')).rows,before);assert.deepEqual((await tx.query('select * from berry_private.report_counters order by year')).rows,counters);throw new Error('ROLLBACK_UPGRADE_FIXTURE');}),e=>e.message==='ROLLBACK_UPGRADE_FIXTURE');
 await assert.rejects(()=>db.exec(correctionIdentityMigration),e=>e.code==='55000');await db.exec('rollback');
});

const copiesMigration=await readFile(new URL('../migrations/202611090011_account_copies.sql',import.meta.url),'utf8');
test('account copy migration preserves profiles, report history, documents and numbering, and blocks obsolete setup',async()=>{
 const before=(await db.query('select * from public.berry_profiles order by id')).rows;
 const history=(await db.query('select id,code,data,revision from public.berry_inspections order by id')).rows,documents=(await db.query('select * from public.berry_documents order by id')).rows,counters=(await db.query('select * from berry_private.report_counters order by year')).rows;
 await assert.rejects(()=>db.transaction(async tx=>{
  await tx.exec(shortUpgrade);
  assert.equal((await tx.query('select public.berry_schema_status() as value')).rows[0].value.next_registration_version,'202611090012');
  assert.deepEqual((await tx.query('select * from public.berry_profiles order by id')).rows,before);
  assert.deepEqual((await tx.query('select id,code,data,revision from public.berry_inspections order by id')).rows,history);
  assert.deepEqual((await tx.query('select * from public.berry_documents order by id')).rows,documents);
  assert.deepEqual((await tx.query('select * from berry_private.report_counters order by year')).rows,counters);
  throw new Error('ROLLBACK_SHORT_UPGRADE_FIXTURE');
 }),e=>e.message==='ROLLBACK_SHORT_UPGRADE_FIXTURE');
 await db.exec(copiesMigration);
 assert.deepEqual((await db.query('select * from public.berry_profiles order by id')).rows,before);
 assert.deepEqual((await db.query('select id,code,data,revision from public.berry_inspections order by id')).rows,history);assert.deepEqual((await db.query('select * from public.berry_documents order by id')).rows,documents);assert.deepEqual((await db.query('select * from berry_private.report_counters order by year')).rows,counters);
 assert.equal((await db.query('select public.berry_schema_status() as value')).rows[0].value.account_copies_version,'202611090011');
 await assert.rejects(()=>db.exec(adminEditMigration),e=>e.code==='55000');await db.exec('rollback');
});
test('only current administrators can edit CC with version checks, normalization and audit; legacy permission updates retain CC',async()=>{
 const target=editLead,original=(await db.query('select * from public.berry_profiles where id=$1',[target])).rows[0];
 const settings=permissions(original.can_create_inspections,original.can_receive_inspections,original.role==='admin',original.enabled);
 let row=await accessChange(users.author,target,original.access_revision,{...settings,supervisor_emails:[' BOSS@example.invalid ','boss@example.invalid','second@example.invalid']});
 assert.deepEqual(row.supervisor_emails,['boss@example.invalid','second@example.invalid']);assert.equal(row.access_revision,Number(original.access_revision)+1);
 for(const key of ['enabled','role','can_create_inspections','can_receive_inspections','full_name','email','area','job_title'])assert.equal(row[key],original[key]);
 const audit=(await db.query("select actor_id,after_data from public.berry_audit where entity_type='berry_profiles' and entity_id=$1 and action='update' order by id desc limit 1",[target])).rows[0];assert.equal(audit.actor_id,users.author);assert.deepEqual(audit.after_data.supervisor_emails,row.supervisor_emails);
 await assert.rejects(()=>accessChange(users.author,target,original.access_revision,{...settings,supervisor_emails:[]}),e=>e.code==='40001');
 await denied(()=>accessChange(target,target,row.access_revision,{...settings,supervisor_emails:['forged@example.invalid']}));
 await denied(()=>as('anon',null,'select public.berry_manage_account($1,$2,$3,$4)',[target,row.access_revision,'update',{...settings,supervisor_emails:[]}]));
 await denied(()=>as('authenticated',target,"update public.berry_profiles set supervisor_emails=array['forged@example.invalid'] where id=$1",[target]));
 for(const value of [null,'not-an-array',[1],['invalido'],[' '],Array(51).fill('boss@example.invalid'),['bad\nheader@example.invalid']])await assert.rejects(()=>accessChange(users.author,target,row.access_revision,{...settings,supervisor_emails:value}),e=>e.code==='22023');
 row=await accessChange(users.author,target,row.access_revision,settings);assert.deepEqual(row.supervisor_emails,['boss@example.invalid','second@example.invalid']);
 const saved=(await db.query('select access_revision,supervisor_emails from public.berry_profiles where id=$1',[target])).rows[0];assert.equal(Number(saved.access_revision),row.access_revision);assert.deepEqual(saved.supervisor_emails,row.supervisor_emails);
});
test('editing copies cannot bypass the last usable administrator protection',async()=>{
 const row=(await db.query('select access_revision from public.berry_profiles where id=$1',[users.author])).rows[0];
 await assert.rejects(()=>db.transaction(async tx=>{
  await tx.query("update public.berry_profiles set enabled=false where id<>$1 and role='admin'",[users.author]);
  await tx.exec('set local role authenticated');await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[users.author]);await tx.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:users.author,iat:100})]);
  await tx.query('select public.berry_manage_account($1,$2,$3,$4)',[users.author,row.access_revision,'update',{...permissions(true,true),supervisor_emails:['boss@example.invalid']}]);
 }),e=>e.message==='LAST_ADMIN_REQUIRED');
});
test('CC edits affect future registrations, preserve sent reports and can clear every copy address without changing a sequence',async()=>{
 const f=await editFixture(5);assert.deepEqual(f.row.data.emailCc,['boss@example.invalid','second@example.invalid']);
 const history=(await db.query('select id,code,data,revision from public.berry_inspections order by id')).rows,documents=(await db.query('select * from public.berry_documents order by id')).rows,counters=(await db.query('select * from berry_private.report_counters order by year')).rows;
 let target=(await db.query('select * from public.berry_profiles where id=$1',[editLead])).rows[0],settings=permissions(target.can_create_inspections,target.can_receive_inspections,target.role==='admin',target.enabled);
 target=await accessChange(users.author,editLead,target.access_revision,{...settings,supervisor_emails:[]});assert.deepEqual(target.supervisor_emails,[]);
 assert.deepEqual((await db.query('select id,code,data,revision from public.berry_inspections order by id')).rows,history);assert.deepEqual((await db.query('select * from public.berry_documents order by id')).rows,documents);assert.deepEqual((await db.query('select * from berry_private.report_counters order by year')).rows,counters);
 const next=await editFixture(6);assert.deepEqual(next.row.data.emailCc,[]);assert.equal((await db.query('select data from public.berry_inspections where id=$1',[f.row.id])).rows[0].data.emailCc.length,2);
 const beforeReplay=(await db.query('select * from public.berry_profiles order by id')).rows;await db.exec(upgradeWorkspace);assert.deepEqual((await db.query('select * from public.berry_profiles order by id')).rows,beforeReplay);
});

const previewMigration=await readFile(new URL('../migrations/202611090012_next_registration.sql',import.meta.url),'utf8');
const shortUpgrade=await readFile(new URL('../operations/upgrade-registration-preview.sql',import.meta.url),'utf8');
const previewCreator='a1000000-0000-4000-8000-000000000001',previewReceiver='a1000000-0000-4000-8000-000000000002';
const nextCode=async actor=>(await as('authenticated',actor,'select public.berry_next_registration() as value')).rows[0].value;
test('registration preview migration preserves data and exposes only the global next code to enabled creators',async()=>{
 const before=(await db.query('select id,code,data,revision from public.berry_inspections order by id')).rows,counters=(await db.query('select * from berry_private.report_counters order by year')).rows;
 await db.exec(previewMigration);
 for(const [id,create] of [[previewCreator,true],[previewReceiver,false]]){await db.query('insert into auth.users(id,email)values($1,$2)',[id,`${id}@example.invalid`]);await db.query('update public.berry_profiles set enabled=true,must_change_password=false,can_create_inspections=$2,can_receive_inspections=true where id=$1',[id,create]);}
 const result=await nextCode(previewCreator);assert.deepEqual(Object.keys(result).sort(),['checked_at','code','sequence','year']);
 await denied(()=>nextCode(previewReceiver));await denied(()=>as('anon',null,'select public.berry_next_registration()'));await denied(()=>as('authenticated',previewCreator,'select * from berry_private.report_counters'));
 assert.deepEqual((await db.query('select id,code,data,revision from public.berry_inspections order by id')).rows,before);assert.deepEqual((await db.query('select * from berry_private.report_counters order by year')).rows,counters);
 assert.equal((await db.query('select public.berry_schema_status() as value')).rows[0].value.next_registration_version,'202611090012');
});
test('twenty committed numbers preview 021 for multiple accounts, registration advances both previews and deletion never fills a gap',async()=>{
 await clock('2030-11-09T12:00:00Z');await db.query('insert into berry_private.report_counters(year,last_sequence)values(2030,20)');
 const counter=(await db.query('select * from berry_private.report_counters order by year')).rows;
 for(let n=0;n<2;n++)for(const actor of [previewCreator,editCreator])assert.equal((await nextCode(actor)).code,'IH-2030-021');
 assert.deepEqual((await db.query('select * from berry_private.report_counters order by year')).rows,counter);
 const first=await editFixture(7);assert.equal(first.row.code,'IH-2030-021');for(const actor of [previewCreator,editCreator])assert.equal((await nextCode(actor)).code,'IH-2030-022');
 await as('authenticated',users.author,'select public.berry_admin_delete_inspection($1,$2)',[first.row.id,first.row.revision]);assert.equal((await nextCode(previewCreator)).code,'IH-2030-022');
});
test('preview follows the Lima year, supports 1000, writes no empty-year counter and rejects disabled or temporary accounts',async()=>{
 await db.query('update berry_private.report_counters set last_sequence=999 where year=2030');await clock('2031-01-01T04:59:59Z');assert.equal((await nextCode(previewCreator)).code,'IH-2030-1000');
 await clock('2031-01-01T05:00:01Z');assert.equal((await nextCode(previewCreator)).code,'IH-2031-001');assert.equal((await db.query('select * from berry_private.report_counters where year=2031')).rows.length,0);
 await db.query('update public.berry_profiles set enabled=false where id=$1',[previewCreator]);await denied(()=>nextCode(previewCreator));await db.query('update public.berry_profiles set enabled=true,must_change_password=true where id=$1',[previewCreator]);await denied(()=>nextCode(previewCreator));await db.query('update public.berry_profiles set must_change_password=false where id=$1',[previewCreator]);
 const profiles=(await db.query('select * from public.berry_profiles order by id')).rows,counters=(await db.query('select * from berry_private.report_counters order by year')).rows;
 await db.exec(shortUpgrade);assert.deepEqual((await db.query('select * from public.berry_profiles order by id')).rows,profiles);assert.deepEqual((await db.query('select * from berry_private.report_counters order by year')).rows,counters);
 await assert.rejects(()=>db.exec(copiesMigration),e=>e.code==='55000');await db.exec('rollback');await clock('2026-11-08T10:00:00Z');
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


const organizationMigration = await readFile(new URL('../migrations/202611150013_organization.sql', import.meta.url), 'utf8');
test('organization upgrade preserves records and profile permissions; canonical inspection text includes the department', async()=>{
 const before=(await db.query('select id,revision,data from public.berry_inspections order by id')).rows;
 const roles=(await db.query('select id,role,enabled,can_create_inspections,can_receive_inspections from public.berry_profiles order by id')).rows;
 await db.exec(organizationMigration);
 assert.deepEqual((await db.query('select id,revision,data from public.berry_inspections order by id')).rows,before);
 assert.deepEqual((await db.query('select id,role,enabled,can_create_inspections,can_receive_inspections from public.berry_profiles order by id')).rows,roles);
 await db.query('update public.berry_profiles set enabled=true,must_change_password=false,deleted_at=null where id in($1,$2)',[users.author,users.recipient]);
 await as('authenticated',users.author,"update public.berry_profiles set management='Gerencia de prueba' where id=$1",[users.author],{iat:99999999999});
 assert.equal((await db.query('select management from public.berry_profiles where id=$1',[users.author])).rows[0].management,'Gerencia de prueba');
 assert.equal((await as('authenticated',users.author,"update public.berry_profiles set management='No permitido' where id=$1 returning id",[users.recipient],{iat:99999999999})).rows.length,0);
 await denied(()=>as('authenticated',users.author,"update public.berry_profiles set role='admin' where id=$1",[users.author],{iat:99999999999}));
 await assert.rejects(()=>as('authenticated',users.author,'update public.berry_profiles set management=$1 where id=$2',['x'.repeat(251),users.author],{iat:99999999999}),error=>error.code==='23514');
 const location={site:'Fundo',management:'Gerencia de prueba',department:'Área de prueba',zone:'Armonía II',detail:'Taller de maquinaria'};
 assert.equal((await db.query('select berry_private.location_area($1) as value',[location])).rows[0].value,'Fundo – Área de prueba – Armonía II – Taller de maquinaria');
 assert.equal((await db.query('select berry_private.location_area($1) as value',[{site:'Fundo',zone:'Armonía II',detail:'Taller antiguo'}])).rows[0].value,'Fundo – Armonía II – Taller antiguo');
 await assert.rejects(()=>db.query('select berry_private.location_area($1)',[{...location,department:42}]),error=>error.code==='22023');
 const person=(await db.query('select berry_private.report_person($1) as value',[{id:'row',personId:users.author,name:'Nombre falso',email:'falso@example.invalid',management:'Gerencia falsa'}])).rows[0].value;
 assert.equal(person.management,'Gerencia de prueba');assert.notEqual(person.name,'Nombre falso');
 await db.exec(organizationMigration);
 assert.equal((await db.query('select management from public.berry_profiles where id=$1',[users.author])).rows[0].management,'Gerencia de prueba');
});

const catalogMigration = await readFile(new URL('../migrations/202611150014_organization_catalog.sql', import.meta.url), 'utf8');
const catalogUser = '99900000-0000-4000-8000-000000000001';
const catalogManagement = '99900000-0000-4000-8000-000000000002';
const catalogArea = '99900000-0000-4000-8000-000000000003';
const catalogPosition = '99900000-0000-4000-8000-000000000004';
const freshCatalogClaims = { iat: 99999999999 };
const manageCatalog = (id, kind, parent, name, enabled = true, expected = null, actor = users.author) => as('authenticated', actor, 'select public.berry_manage_organization($1,$2,$3,$4,$5,$6) as value', [id, kind, parent, name, enabled, expected], freshCatalogClaims);
const readCatalog = () => as('authenticated', catalogUser, 'select public.berry_organization_catalog() as value');
test('organization catalog imports only reviewed employee jobs and preserves every existing profile and report', async()=>{
 const profilesBefore=(await db.query('select * from public.berry_profiles order by id')).rows;
 const reportsBefore=(await db.query('select * from public.berry_inspections order by id')).rows;
 await db.exec(catalogMigration);
 assert.deepEqual((await db.query('select * from public.berry_profiles order by id')).rows,profilesBefore);
 assert.deepEqual((await db.query('select * from public.berry_inspections order by id')).rows,reportsBefore);
 assert.deepEqual((await db.query('select kind,count(*)::int as count from public.berry_organization group by kind order by kind')).rows,[{kind:'area',count:60},{kind:'management',count:18},{kind:'position',count:300}]);
 const imported=(await db.query('select kind,name from public.berry_organization')).rows;
 assert.ok(!imported.some(row=>row.kind==='position' && /\b(OBRERO|OPERARIO|PEON|PRACTICANTE)\b/.test(row.name)));
 for(const name of ['OPERADOR CCTV','OPERADOR DE MAQUINARIA','GERENCIA GENERAL','GERENCIA CORPORATIVA DE OPERACIONES','GERENCIA DE EXPORTACIONES']) assert.ok(!imported.some(row=>row.name===name));
 await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[catalogUser,'catalog-reader@example.invalid']);
 await db.query('update public.berry_profiles set enabled=true,must_change_password=false where id=$1',[catalogUser]);
 const catalog=(await readCatalog()).rows[0].value;
 assert.equal(catalog.length,18);assert.equal(catalog.reduce((sum,entry)=>sum+entry.areas.length,0),60);
 assert.equal(catalog.reduce((sum,entry)=>sum+Object.values(entry.positions).reduce((n,jobs)=>n+jobs.length,0),0),300);
});
test('catalog readers cannot manage lists, disabled accounts and anonymous users cannot read them, and raw table writes remain closed', async()=>{
 await denied(()=>as('anon',null,'select public.berry_organization_catalog()'));
 await denied(()=>as('authenticated',catalogUser,'select * from public.berry_organization'));
 await denied(()=>as('authenticated',users.author,"insert into public.berry_organization(kind,name)values('management','Falsa')",[],freshCatalogClaims));
 await denied(()=>as('authenticated',catalogUser,'select public.berry_admin_organization()'));
 await denied(()=>manageCatalog(catalogManagement,'management',null,'No permitido',true,null,catalogUser));
 await db.query('update public.berry_profiles set enabled=false where id=$1',[catalogUser]);await denied(()=>readCatalog());
 await db.query('update public.berry_profiles set enabled=true where id=$1',[catalogUser]);
});
test('administrators create a complete hierarchy with idempotent retries and reject duplicates and invalid parents', async()=>{
 const first=(await manageCatalog(catalogManagement,'management',null,'Gerencia añadida')).rows[0].value;
 assert.equal(first.revision,1);
 assert.deepEqual((await manageCatalog(catalogManagement,'management',null,'Gerencia añadida')).rows[0].value,first);
 await manageCatalog(catalogArea,'area',catalogManagement,'Área añadida');
 await manageCatalog(catalogPosition,'position',catalogArea,'Puesto añadido');
 assert.ok((await readCatalog()).rows[0].value.some(entry=>entry.management==='Gerencia añadida' && entry.positions['Área añadida'].includes('Puesto añadido')));
 await assert.rejects(()=>manageCatalog('99900000-0000-4000-8000-000000000005','management',null,'gerencia añadida'),error=>error.code==='23505');
 await assert.rejects(()=>manageCatalog('99900000-0000-4000-8000-000000000005','position',catalogManagement,'Parentezco incorrecto'),error=>error.code==='22023');
 await assert.rejects(()=>manageCatalog(catalogArea,'area',catalogPosition,'Ciclo incorrecto',true,1),error=>error.code==='22023');
});
test('profile changes require an active management-area-position chain and preserve unrelated permissions', async()=>{
 await as('authenticated',catalogUser,'update public.berry_profiles set management=$1,area=$2,job_title=$3 where id=$4',['Gerencia añadida','Área añadida','Puesto añadido',catalogUser]);
 await assert.rejects(()=>as('authenticated',catalogUser,"update public.berry_profiles set job_title='Otro puesto' where id=$1",[catalogUser]),error=>error.code==='22023');
 await assert.rejects(()=>as('authenticated',catalogUser,"update public.berry_profiles set management='' where id=$1",[catalogUser]),error=>error.code==='22023');
 assert.equal((await as('authenticated',catalogUser,"update public.berry_profiles set management='Otra' where id=$1 returning id",[users.author])).rows.length,0);
 assert.deepEqual((await db.query('select role,enabled,management,area,job_title from public.berry_profiles where id=$1',[catalogUser])).rows[0],{role:'inspector',enabled:true,management:'Gerencia añadida',area:'Área añadida',job_title:'Puesto añadido'});
});
test('renames propagate to the shared catalog, stale changes are rejected, and old profile text remains intact', async()=>{
 const updated=(await manageCatalog(catalogManagement,'management',null,'Gerencia actualizada',true,1)).rows[0].value;
 assert.equal(updated.revision,2);assert.equal((await manageCatalog(catalogManagement,'management',null,'Gerencia actualizada',true,1)).rows[0].value.revision,2);
 await assert.rejects(()=>manageCatalog(catalogManagement,'management',null,'Sobrescritura obsoleta',true,1),error=>error.code==='40001');
 assert.ok((await readCatalog()).rows[0].value.some(entry=>entry.management==='Gerencia actualizada'));
 assert.equal((await db.query('select management from public.berry_profiles where id=$1',[catalogUser])).rows[0].management,'Gerencia añadida');
 await as('authenticated',catalogUser,"update public.berry_profiles set full_name='Nombre corregido' where id=$1",[catalogUser]);
 const history=(await db.query("select before_data,after_data from public.berry_audit where entity_type='berry_organization' and entity_id=$1 order by occurred_at,id",[catalogManagement])).rows;
 assert.ok(history.some(row=>row.before_data?.name==='Gerencia añadida' && row.after_data?.name==='Gerencia actualizada'));
});
test('retiring a branch hides its descendants without changing reports or reactivating positions previously removed', async()=>{
 const before=(await db.query('select id,data,revision from public.berry_inspections order by id')).rows;
 await manageCatalog(catalogPosition,'position',catalogArea,'Puesto añadido',false,1);
 await manageCatalog(catalogManagement,'management',null,'Gerencia actualizada',false,2);
 assert.ok(!(await readCatalog()).rows[0].value.some(entry=>entry.management==='Gerencia actualizada'));
 await assert.rejects(()=>manageCatalog(catalogPosition,'position',catalogArea,'Puesto añadido',true,2),error=>error.code==='22023');
 await manageCatalog(catalogManagement,'management',null,'Gerencia actualizada',true,3);
 assert.equal((await db.query('select enabled from public.berry_organization where id=$1',[catalogPosition])).rows[0].enabled,false);
 assert.ok(!(await readCatalog()).rows[0].value.some(entry=>entry.management==='Gerencia actualizada'));
 await manageCatalog(catalogPosition,'position',catalogArea,'Puesto añadido',true,2);
 assert.ok((await readCatalog()).rows[0].value.some(entry=>entry.management==='Gerencia actualizada'));
 assert.deepEqual((await db.query('select id,data,revision from public.berry_inspections order by id')).rows,before);
 assert.equal((await db.query('select management from public.berry_profiles where id=$1',[catalogUser])).rows[0].management,'Gerencia añadida');
});
test('reapplying the catalog migration preserves all administrator changes and never reimports retired entries', async()=>{
 await manageCatalog(catalogPosition,'position',catalogArea,'Puesto actualizado',true,3);
 const before=(await db.query('select * from public.berry_organization order by id')).rows;
 await db.exec(catalogMigration);
 assert.deepEqual((await db.query('select * from public.berry_organization order by id')).rows,before);
 assert.equal((await db.query("select count(*)::int as n from berry_private.organization_seed_versions where version='iperc-2026-20261115'")).rows[0].n,1);
});

const identityMigration = await readFile(new URL('../migrations/202611150015_account_identity.sql', import.meta.url), 'utf8');
const oldIdentity='99800000-0000-4000-8000-000000000001', rehireIdentity='99800000-0000-4000-8000-000000000002', otherIdentity='99800000-0000-4000-8000-000000000003';
const rehireOperation='99800000-0000-4000-8000-000000000004', otherOperation='99800000-0000-4000-8000-000000000005';
const identityOwnReport='99800000-0000-4000-8000-000000000006',identityReceivedReport='99800000-0000-4000-8000-000000000007';
let originalPerson,rehirePerson;
const identityInput={email:'historia@example.invalid',full_name:'Persona Coincidente',area:'',job_title:'',role:'inspector',supervisor_emails:[],can_create_inspections:true,can_receive_inspections:true};
const identityRpc=(name,values)=>as('authenticated',users.author,`select public.${name}(${values.map((_,i)=>`$${i+1}`).join(',')}) as value`,values,freshCatalogClaims);
async function identityReport(author,id,recipient,extra={}) {
 await as('authenticated',author,'select public.berry_ensure_draft($1)',[id],freshCatalogClaims);
 const data={...cloudData(),...extra,id,ownerId:author,responsibles:[{id:'recipient',personId:recipient}]};
 const row=(await as('authenticated',author,'select public.berry_save_draft($1,1,$2) as value',[id,data],freshCatalogClaims)).rows[0].value;
 const lease=(await as('authenticated',author,'select public.berry_prepare_report($1,$2,$3) as value',[id,row.revision,sourceHash],freshCatalogClaims)).rows[0].value.lease;
 const doc={filename:'REG_INS_TALLER_05.11.2026.xlsx',sha256:documentHash,byte_size:2000,storage_path:`2026/11-NOVIEMBRE/${id}/${documentHash}/REG_INS_TALLER_05.11.2026.xlsx`};
 await db.query('insert into storage.objects(bucket_id,name)values($1,$2)',['berry-documents',doc.storage_path]);
 await as('service_role',null,'select public.berry_commit_report($1,$2,$3,$4)',[lease.operation_id,author,freshCatalogClaims.iat,doc]);
}
test('identity upgrade preserves reports, assigns stable person IDs, and the account matcher is admin-only',async()=>{
 const before=(await db.query('select id,data,revision from public.berry_inspections order by id')).rows;
 await db.exec(identityMigration);
 for(const lease of (await db.query('select operation_id,actor_id from berry_private.report_leases')).rows) await as('service_role',null,'select public.berry_cancel_report($1,$2)',[lease.operation_id,lease.actor_id]);
 assert.deepEqual((await db.query('select id,data,revision from public.berry_inspections order by id')).rows,before);
 assert.ok((await db.query('select id,person_id,contact_email,email from public.berry_profiles')).rows.every(p=>p.id===p.person_id && p.email===p.contact_email));
 await denied(()=>as('authenticated',catalogUser,'select public.berry_account_matches($1,$2)',[identityInput.email,identityInput.full_name]));
 await db.query('insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)values($1,$2,now(),$3)',[oldIdentity,identityInput.email,{full_name:identityInput.full_name}]);
 await db.query('update public.berry_profiles set enabled=true,must_change_password=false,can_create_inspections=true,can_receive_inspections=true where id in($1,$2)',[oldIdentity,catalogUser]);
 originalPerson=(await db.query('select person_id from public.berry_profiles where id=$1',[oldIdentity])).rows[0].person_id;
 await identityReport(oldIdentity,identityOwnReport,catalogUser);await identityReport(catalogUser,identityReceivedReport,oldIdentity);
 assert.equal((await as('authenticated',oldIdentity,'select id from public.berry_inspections where id in($1,$2)',[identityOwnReport,identityReceivedReport],freshCatalogClaims)).rows.length,2);
 const revision=(await db.query('select access_revision from public.berry_profiles where id=$1',[oldIdentity])).rows[0].access_revision;
 await identityRpc('berry_manage_account',[oldIdentity,revision,'delete',{}]);
 const profile=(await db.query('select * from public.berry_profiles where id=$1',[oldIdentity])).rows[0];assert.equal(profile.deleted_access.can_create_inspections,true);assert.equal(profile.deleted_access.can_receive_inspections,true);
 const matches=(await identityRpc('berry_account_matches',[identityInput.email,' PERSONA   COINCIDENTE '])).rows[0].value;
 assert.equal(matches.length,1);assert.equal(matches[0].can_restore,true);assert.equal(matches[0].can_rehire,true);
});
async function resolveIdentity(operation,previous,user,mode) {
 const revision=(await db.query('select access_revision from public.berry_profiles where id=$1',[previous])).rows[0].access_revision;
 const reserved=(await identityRpc('berry_begin_account_resolution',[operation,previous,revision,mode,identityInput])).rows[0].value;
 if(reserved.needs_archive){
  await assert.rejects(()=>identityRpc('berry_release_resolution_email',[reserved.operation_id]),error=>error.code==='42501');
  await db.query("update auth.users set email=$1,raw_app_meta_data=raw_app_meta_data||jsonb_build_object('berry_retired_operation',$2::text) where id=$3",[reserved.archive_email,reserved.operation_id,previous]);
  await identityRpc('berry_release_resolution_email',[reserved.operation_id]);
 }
 const prepared=(await identityRpc('berry_prepare_account',[reserved.operation_id,identityInput])).rows[0].value;
 await db.query('insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data,raw_app_meta_data)values($1,$2,now(),$3,$4)',[user,identityInput.email,{full_name:identityInput.full_name},{berry_request_id:prepared.request_id}]);
 await identityRpc('berry_finish_account',[prepared.request_id,user]);
 await identityRpc('berry_finish_account_resolution',[reserved.operation_id,user]);
 await db.query('update public.berry_profiles set must_change_password=false where id=$1',[user]);
 return reserved;
}
test('same-person return uses a fresh Auth account, one historical identity, and no access to authored reports, assignments or files from before',async()=>{
 const reportsBefore=(await db.query('select id,data,revision from public.berry_inspections where id in($1,$2) order by id',[identityOwnReport,identityReceivedReport])).rows;
 const operation=await resolveIdentity(rehireOperation,oldIdentity,rehireIdentity,'rehire');
 rehirePerson=(await db.query('select person_id from public.berry_profiles where id=$1',[rehireIdentity])).rows[0].person_id;assert.equal(rehirePerson,originalPerson);
 assert.equal((await as('authenticated',rehireIdentity,'select id from public.berry_inspections where id in($1,$2)',[identityOwnReport,identityReceivedReport],freshCatalogClaims)).rows.length,0);
 assert.equal((await as('authenticated',rehireIdentity,'select name from storage.objects',[],freshCatalogClaims)).rows.length,0);
 await denied(()=>as('authenticated',rehireIdentity,'select public.berry_admin_inspection($1)',[identityOwnReport],freshCatalogClaims));
 await denied(()=>as('authenticated',rehireIdentity,'select public.berry_prepare_report($1,1,$2)',[identityOwnReport,sourceHash],freshCatalogClaims));
 assert.deepEqual((await db.query('select id,data,revision from public.berry_inspections where id in($1,$2) order by id',[identityOwnReport,identityReceivedReport])).rows,reportsBefore);
 const links=(await identityRpc('berry_admin_dashboard',[])).rows[0].value.find(row=>row.id===identityOwnReport).identityLinks;
 assert.equal(links[oldIdentity].personId,rehirePerson);assert.equal(links[oldIdentity].current,true);assert.equal(links[oldIdentity].email,identityInput.email);
 const resumed=(await identityRpc('berry_begin_account_resolution',[rehireOperation,oldIdentity,1,'rehire',identityInput])).rows[0].value;
 assert.equal(resumed.new_user_id,rehireIdentity);assert.equal((await identityRpc('berry_finish_account_resolution',[operation.operation_id,rehireIdentity])).rows[0].value.id,rehireIdentity);
 const ownNew='99800000-0000-4000-8000-000000000008';await as('authenticated',rehireIdentity,'select public.berry_ensure_draft($1)',[ownNew],freshCatalogClaims);
 assert.equal((await as('authenticated',rehireIdentity,'select id from public.berry_inspections',[],freshCatalogClaims)).rows.length,1);
});
test('a distinct person reusing exactly the same name and email gets another identity and never inherits prior work',async()=>{
 const revision=(await db.query('select access_revision from public.berry_profiles where id=$1',[rehireIdentity])).rows[0].access_revision;
 await identityRpc('berry_manage_account',[rehireIdentity,revision,'delete',{}]);
 await resolveIdentity(otherOperation,rehireIdentity,otherIdentity,'new_person');
 const other=(await db.query('select person_id from public.berry_profiles where id=$1',[otherIdentity])).rows[0];assert.notEqual(other.person_id,originalPerson);
 assert.equal((await as('authenticated',otherIdentity,'select id from public.berry_inspections',[],freshCatalogClaims)).rows.length,0);
 assert.equal((await as('authenticated',otherIdentity,'select name from storage.objects',[],freshCatalogClaims)).rows.length,0);
 await as('authenticated',otherIdentity,'select public.berry_ensure_draft($1)',['99800000-0000-4000-8000-000000000009'],freshCatalogClaims);
 assert.equal((await as('authenticated',otherIdentity,'select id from public.berry_inspections',[],freshCatalogClaims)).rows.length,1);
 const match=(await identityRpc('berry_account_matches',[identityInput.email,identityInput.full_name])).rows[0].value;
 assert.equal(match.filter(p=>p.deleted_at===null).length,1);assert.ok(match.filter(p=>p.deleted_at!==null).every(p=>p.can_restore===false));
});
test('identity operations validate admin rights, reject active-email takeovers and preserve person links on replay',async()=>{
 await denied(()=>as('authenticated',otherIdentity,'select public.berry_begin_account_resolution($1,$2,1,$3,$4)',['99800000-0000-4000-8000-000000000010',oldIdentity,'new_person',identityInput],freshCatalogClaims));
 const revision=(await db.query('select access_revision from public.berry_profiles where id=$1',[oldIdentity])).rows[0].access_revision;
 await assert.rejects(()=>identityRpc('berry_begin_account_resolution',['99800000-0000-4000-8000-000000000010',oldIdentity,revision,'rehire',identityInput]),error=>error.code==='23505');
 const before=(await db.query('select id,person_id,email,contact_email,deleted_at from public.berry_profiles order by id')).rows;
 await db.exec(identityMigration);assert.deepEqual((await db.query('select id,person_id,email,contact_email,deleted_at from public.berry_profiles order by id')).rows,before);
});

const restoreIdentity='99700000-0000-4000-8000-000000000001',restoreOperation='99700000-0000-4000-8000-000000000002';
const restorePending='99700000-0000-4000-8000-000000000003',restoreClosed='99700000-0000-4000-8000-000000000004';
const expiredIdentity='99700000-0000-4000-8000-000000000005',expiredOperation='99700000-0000-4000-8000-000000000006';
test('an accidental deletion within three calendar months restores only pending personal reports and rejects old closed reports and direct workflow bypasses',async()=>{
 await db.query('insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)values($1,$2,now(),$3)',[restoreIdentity,'restaurar@example.invalid',{full_name:'Cuenta por restablecer'}]);
 await db.query('update public.berry_profiles set enabled=true,must_change_password=false,can_create_inspections=true,can_receive_inspections=true where id=$1',[restoreIdentity]);
 await identityReport(restoreIdentity,restorePending,catalogUser);await identityReport(catalogUser,restoreClosed,restoreIdentity);
 let row=(await db.query('select * from public.berry_inspections where id=$1',[restoreClosed])).rows[0];
 row=(await as('authenticated',restoreIdentity,'select public.berry_change_correction($1,$2,$3,$4,$5) as value',[restoreClosed,cloudObservation,row.revision,'submit',{responsibleName:'Cuenta por restablecer',action:'Acción realizada',date:'2026-11-15',photos:[],state:'Pendiente'}],freshCatalogClaims)).rows[0].value;
 row=(await as('authenticated',catalogUser,'select public.berry_change_correction($1,$2,$3,$4,$5) as value',[restoreClosed,cloudObservation,row.revision,'approve',{note:'Aprobado'}],freshCatalogClaims)).rows[0].value;assert.equal(row.workflow,'closed');
 const previous=(await db.query('select access_revision,person_id from public.berry_profiles where id=$1',[restoreIdentity])).rows[0];
 const deleted=(await identityRpc('berry_manage_account',[restoreIdentity,previous.access_revision,'delete',{}])).rows[0].value;
 const input={...identityInput,email:'restaurar@example.invalid',full_name:'Cuenta por restablecer'};
 await identityRpc('berry_begin_account_restore',[restoreOperation,restoreIdentity,deleted.access_revision,input]);
 await denied(()=>identityRpc('berry_finish_account_restore',[restoreOperation]));
 await db.query("update auth.users set raw_app_meta_data=raw_app_meta_data||jsonb_build_object('berry_restore_operation',$1::text) where id=$2",[restoreOperation,restoreIdentity]);
 const restored=(await identityRpc('berry_finish_account_restore',[restoreOperation])).rows[0].value;
 assert.equal(restored.id,restoreIdentity);assert.equal(restored.person_id,previous.person_id);assert.equal(restored.must_change_password,true);assert.equal(restored.can_create_inspections,true);assert.equal(restored.can_receive_inspections,true);
 assert.equal((await as('authenticated',restoreIdentity,'select id from public.berry_inspections',[],freshCatalogClaims)).rows.length,0);
 await db.query('update public.berry_profiles set must_change_password=false where id=$1',[restoreIdentity]);
 assert.deepEqual((await as('authenticated',restoreIdentity,'select id from public.berry_inspections order by id',[],freshCatalogClaims)).rows,[{id:restorePending}]);
 await denied(()=>as('authenticated',restoreIdentity,'select public.berry_prepare_report($1,$2,null)',[restoreClosed,row.revision],freshCatalogClaims));
 await denied(()=>as('authenticated',restoreIdentity,'select public.berry_change_correction($1,$2,$3,$4,$5)',[restoreClosed,cloudObservation,row.revision,'state',{state:'Pendiente'}],freshCatalogClaims));
 const files=(await as('authenticated',restoreIdentity,'select name from storage.objects',[],freshCatalogClaims)).rows;assert.ok(files.some(file=>file.name.includes(restorePending)));assert.ok(!files.some(file=>file.name.includes(restoreClosed)));
 const future='99700000-0000-4000-8000-000000000007';await as('authenticated',restoreIdentity,'select public.berry_ensure_draft($1)',[future],freshCatalogClaims);
 assert.deepEqual((await as('authenticated',restoreIdentity,'select id from public.berry_inspections order by id',[],freshCatalogClaims)).rows,[{id:restorePending},{id:future}]);
 const replay=(await identityRpc('berry_finish_account_restore',[restoreOperation])).rows[0].value;assert.equal(replay.must_change_password,false);assert.equal(replay.id,restoreIdentity);
});
test('the three-month restore deadline is enforced by PostgreSQL and an expired request cannot enable an account',async()=>{
 const boundary=(await db.query("select berry_private.account_restore_until('2026-01-31T04:30:00Z') as value")).rows[0].value;assert.equal(new Date(boundary).toISOString(),'2026-05-01T04:30:00.000Z');
 await db.query('insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)values($1,$2,now(),$3)',[expiredIdentity,'vencida@example.invalid',{full_name:'Cuenta vencida'}]);
 await db.query('update public.berry_profiles set enabled=true,must_change_password=false where id=$1',[expiredIdentity]);
 const revision=(await db.query('select access_revision from public.berry_profiles where id=$1',[expiredIdentity])).rows[0].access_revision;
 const deleted=(await identityRpc('berry_manage_account',[expiredIdentity,revision,'delete',{}])).rows[0].value;
 await db.query("update public.berry_profiles set deleted_at=now()-interval '4 months' where id=$1",[expiredIdentity]);
 const input={...identityInput,email:'vencida@example.invalid',full_name:'Cuenta vencida'};
 await assert.rejects(()=>identityRpc('berry_begin_account_restore',[expiredOperation,expiredIdentity,deleted.access_revision,input]),error=>error.code==='22023' && error.message==='RESTORE_EXPIRED');
 const matches=(await identityRpc('berry_account_matches',[input.email,input.full_name])).rows[0].value;assert.equal(matches[0].can_restore,false);assert.equal(matches[0].can_rehire,true);
 assert.equal((await db.query('select enabled from public.berry_profiles where id=$1',[expiredIdentity])).rows[0].enabled,false);
});

test('a pending identity operation is visible and resumes under a fresh request without duplicating reservations',async()=>{
 const target='99600000-0000-4000-8000-000000000001',operation='99600000-0000-4000-8000-000000000002',retry='99600000-0000-4000-8000-000000000003',secondAdmin='99600000-0000-4000-8000-000000000004';
 const input={...identityInput,email:'pendiente@example.invalid',full_name:'Solicitud pendiente'};
 await db.query('insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)values($1,$2,now(),$3)',[target,input.email,{full_name:input.full_name}]);
 await db.query('update public.berry_profiles set enabled=true,must_change_password=false where id=$1',[target]);
 const before=(await db.query('select access_revision from public.berry_profiles where id=$1',[target])).rows[0].access_revision;
 const removed=(await identityRpc('berry_manage_account',[target,before,'delete',{}])).rows[0].value;
 await identityRpc('berry_begin_account_resolution',[operation,target,removed.access_revision,'rehire',input]);
 const match=(await identityRpc('berry_account_matches',[input.email,input.full_name])).rows[0].value[0];assert.equal(match.pending.mode,'rehire');assert.deepEqual(match.pending.input,input);
 const resumed=(await identityRpc('berry_begin_account_resolution',[retry,target,removed.access_revision,'rehire',input])).rows[0].value;assert.equal(resumed.operation_id,operation);
 assert.equal((await db.query('select count(*)::int as n from berry_private.account_resolutions where input->>\'email\'=$1',[input.email])).rows[0].n,1);
 await db.query('insert into auth.users(id,email,email_confirmed_at)values($1,$2,now())',[secondAdmin,'segunda-admin@example.invalid']);
 await db.query("update public.berry_profiles set enabled=true,must_change_password=false,role='admin',can_create_inspections=true,can_receive_inspections=true where id=$1",[secondAdmin]);
 const transferred=(await as('authenticated',secondAdmin,'select public.berry_begin_account_resolution($1,$2,$3,$4,$5) as value',[retry,target,removed.access_revision,'rehire',input],freshCatalogClaims)).rows[0].value;assert.equal(transferred.operation_id,operation);assert.equal(transferred.actor_id,secondAdmin);
 assert.equal((await db.query("select count(*)::int as n from public.berry_audit where entity_type='account_resolutions' and entity_id=$1 and action='resume'",[operation])).rows[0].n,1);
});

const nomenclatureMigration = await readFile(new URL('../migrations/202611150016_area_nomenclature.sql', import.meta.url), 'utf8');
const sigmaArea = '704e6e57-4856-5c77-8de9-63c7cbb15cae', viverosArea = '84270532-994a-5747-8145-f78ae1516b72', viverosManagement = '45d5faeb-c5bf-561b-a6b4-7ddddee55c6b';
test('area nomenclature migration preserves profiles, reports and position identities while moving Viveros', async()=>{
 const profiles=(await db.query('select * from public.berry_profiles order by id')).rows;
 const records=(await db.query('select * from public.berry_inspections order by id')).rows;
 const jobs=(await db.query('select id,parent_id,name from public.berry_organization where parent_id=$1 order by id',[viverosArea])).rows;
 await db.exec(nomenclatureMigration);
 assert.equal((await db.query('select parent_id from public.berry_organization where id=$1',[viverosArea])).rows[0].parent_id,viverosManagement);
 assert.deepEqual((await db.query('select id,parent_id,name from public.berry_organization where parent_id=$1 order by id',[viverosArea])).rows,jobs);
 assert.equal(jobs.length,5);
 assert.deepEqual((await db.query('select * from public.berry_profiles order by id')).rows,profiles);
 assert.deepEqual((await db.query('select * from public.berry_inspections order by id')).rows,records);
 const catalog=(await identityRpc('berry_organization_catalog',[])).rows[0].value;
 assert.ok(catalog.find(entry=>entry.management==='GERENCIA CORPORATIVA DE VIVEROS, HUBS Y LICENCIAS').areas.includes('VIVEROS'));
 assert.ok(!catalog.find(entry=>entry.management==='GERENCIA DE PRODUCCION').areas.includes('VIVEROS'));
 assert.equal(catalog.find(entry=>entry.management==='GERENCIA DE RECURSOS HUMANOS').areaNomenclatures['SEGURIDAD INDUSTRIAL Y GESTION MEDIO AMBIENTAL'],'SIGMA');
});
test('only administrators manage area nomenclatures, with revision checks and no aliases on managements or positions', async()=>{
 const original=(await db.query('select * from public.berry_organization where id=$1',[sigmaArea])).rows[0];
 const args=[sigmaArea,'area',original.parent_id,original.name,true,original.revision,'SIGMA 2'];
 await denied(()=>as('authenticated',catalogUser,'select public.berry_manage_organization_v2($1,$2,$3,$4,$5,$6,$7)',args));
 await denied(()=>as('anon',null,'select public.berry_manage_organization_v2($1,$2,$3,$4,$5,$6,$7)',args));
 const updated=(await identityRpc('berry_manage_organization_v2',args)).rows[0].value;
 assert.equal(updated.name,original.name);assert.equal(updated.nomenclature,'SIGMA 2');assert.equal(updated.revision,original.revision+1);
 assert.deepEqual((await identityRpc('berry_manage_organization_v2',args)).rows[0].value,updated);
 await assert.rejects(()=>identityRpc('berry_manage_organization_v2',[...args.slice(0,6),'Otra']),error=>error.code==='40001');
 for(const row of (await db.query("select * from public.berry_organization where kind in('management','position') limit 2")).rows) await assert.rejects(()=>identityRpc('berry_manage_organization_v2',[row.id,row.kind,row.parent_id,row.name,row.enabled,row.revision,'Alias']),error=>error.code==='22023');
 await assert.rejects(()=>identityRpc('berry_manage_organization_v2',[...args.slice(0,5),updated.revision,'x'.repeat(51)]),error=>error.code==='22023');
 const cleared=(await identityRpc('berry_manage_organization_v2',[...args.slice(0,5),updated.revision,''])).rows[0].value;
 assert.equal(cleared.nomenclature,'');
 await db.exec(nomenclatureMigration);
 assert.equal((await db.query('select nomenclature from public.berry_organization where id=$1',[sigmaArea])).rows[0].nomenclature,'');
});
test('participant nomenclatures come from their real profile and location snapshots remain stable after catalog edits', async()=>{
 const row=(await db.query('select * from public.berry_organization where id=$1',[sigmaArea])).rows[0];
 await identityRpc('berry_manage_organization_v2',[row.id,row.kind,row.parent_id,row.name,true,row.revision,'SIGMA']);
 await db.query("update public.berry_profiles set management='GERENCIA DE RECURSOS HUMANOS',area=$1,job_title='SUPERVISOR SIGMA' where id=$2",[row.name,catalogUser]);
 const person=(await db.query('select berry_private.report_person($1) as value',[{id:'snapshot',personId:catalogUser,areaNomenclature:'Falso'}])).rows[0].value;
 assert.equal(person.area,row.name);assert.equal(person.areaNomenclature,'SIGMA');
 const location={site:'Fundo',zone:'Armonía II',detail:'Taller',management:'GERENCIA DE RECURSOS HUMANOS',department:row.name,departmentNomenclature:'SIGMA'};
 assert.equal((await db.query('select berry_private.location_area($1) as value',[location])).rows[0].value,'Fundo – SIGMA – Armonía II – Taller');
 const {departmentNomenclature,...historical}=location;
 assert.equal((await db.query('select berry_private.location_area($1) as value',[historical])).rows[0].value,`Fundo – ${row.name} – Armonía II – Taller`);
 for(const invalid of [12,'x'.repeat(51),null]) await assert.rejects(()=>db.query('select berry_private.location_area($1)',[{...location,departmentNomenclature:invalid}]),error=>error.code==='22023');
 const latest=(await db.query('select revision from public.berry_organization where id=$1',[sigmaArea])).rows[0];
 await identityRpc('berry_manage_organization_v2',[row.id,row.kind,row.parent_id,row.name,true,latest.revision,'Nueva sigla']);
 assert.equal((await db.query('select berry_private.location_area($1) as value',[location])).rows[0].value,'Fundo – SIGMA – Armonía II – Taller');
});

const accountEmailMigration = await readFile(new URL('../migrations/202611150017_account_email.sql', import.meta.url), 'utf8');
const emailUser='99500000-0000-4000-8000-000000000001',emailOp='99500000-0000-4000-8000-000000000002';
test('email upgrade preserves all records and ordinary accounts cannot request or write an email change',async()=>{
 const reports=(await db.query('select * from public.berry_inspections order by id')).rows;
 const profiles=(await db.query('select * from public.berry_profiles order by id')).rows;
 await db.exec(accountEmailMigration);
 assert.deepEqual((await db.query('select * from public.berry_inspections order by id')).rows,reports);
 assert.deepEqual((await db.query('select * from public.berry_profiles order by id')).rows,profiles);
 await db.query('insert into auth.users(id,email,email_confirmed_at,encrypted_password)values($1,$2,now(),$3)',[emailUser,'anterior-correo@example.invalid','unchanged-password']);
 await db.query('update public.berry_profiles set enabled=true,must_change_password=false where id=$1',[emailUser]);
 await denied(()=>as('authenticated',emailUser,'select public.berry_begin_account_email($1,$2,1,$3)',[emailOp,emailUser,'nuevo-correo@example.invalid'],freshCatalogClaims));
 await denied(()=>as('anon',null,'select public.berry_begin_account_email($1,$2,1,$3)',[emailOp,emailUser,'nuevo-correo@example.invalid']));
 await denied(()=>as('authenticated',emailUser,"update public.berry_profiles set email='forjado@example.invalid' where id=$1",[emailUser],freshCatalogClaims));
});
test('Auth and profile emails commit atomically with stable identity, access, password and historical inspection data',async()=>{
 const before=(await db.query('select * from public.berry_profiles where id=$1',[emailUser])).rows[0];
 const history=(await db.query('select id,author_id,data,revision from public.berry_inspections order by id')).rows;
 const recipients=(await db.query('select * from public.berry_recipients order by inspection_id,user_id')).rows;
 await db.query('insert into berry_private.account_requests(request_id,actor_id,email,input,user_id,completed_at)values($1,$2,$3,$4,$5,now())',['99500000-0000-4000-8000-000000000003',users.author,before.email,{},emailUser]);
 const args=[emailOp,emailUser,before.access_revision,' NUEVO-CORREO@example.invalid '];
 const operation=(await identityRpc('berry_begin_account_email',args)).rows[0].value;
 assert.equal(operation.email,'nuevo-correo@example.invalid');assert.equal(operation.completed_at,null);
 assert.equal((await db.query('select email from public.berry_profiles where id=$1',[emailUser])).rows[0].email,before.email);
 await db.query("update auth.users set email=$1,raw_app_meta_data=raw_app_meta_data||jsonb_build_object('berry_email_operation',$2::text) where id=$3",[operation.email,emailOp,emailUser]);
 const after=(await db.query('select * from public.berry_profiles where id=$1',[emailUser])).rows[0];
 for(const key of ['id','person_id','full_name','management','area','job_title','role','enabled','must_change_password','credentials_valid_after','can_create_inspections','can_receive_inspections','supervisor_emails']) assert.deepEqual(after[key],before[key]);
 assert.equal(after.email,operation.email);assert.equal(after.contact_email,operation.email);assert.equal(after.access_revision,before.access_revision+1);
 assert.equal((await db.query('select encrypted_password from auth.users where id=$1',[emailUser])).rows[0].encrypted_password,'unchanged-password');
 assert.deepEqual((await db.query('select id,author_id,data,revision from public.berry_inspections order by id')).rows,history);
 assert.deepEqual((await db.query('select * from public.berry_recipients order by inspection_id,user_id')).rows,recipients);
 const retry=(await identityRpc('berry_begin_account_email',args)).rows[0].value;assert.ok(retry.completed_at);assert.equal(retry.account.email,operation.email);
 assert.equal((await db.query("select count(*)::int as n from berry_private.account_requests where email='anterior-correo@example.invalid'")).rows[0].n,0);
 assert.equal((await db.query("select actor_id from public.berry_audit where entity_type='account_email' and entity_id=$1",[emailUser])).rows[0].actor_id,users.author);
});
test('email changes reject duplicates and stale revisions and reserve the address against a conflicting Auth creation',async()=>{
 const revision=(await db.query('select access_revision from public.berry_profiles where id=$1',[emailUser])).rows[0].access_revision;
 const op='99500000-0000-4000-8000-000000000004';
 const used=(await db.query('select email from public.berry_profiles where id=$1',[users.author])).rows[0].email;
 await assert.rejects(()=>identityRpc('berry_begin_account_email',[op,emailUser,revision,used]),error=>error.code==='23505');
 await assert.rejects(()=>identityRpc('berry_begin_account_email',[op,emailUser,revision-1,'libre@example.invalid']),error=>error.code==='40001');
 await identityRpc('berry_begin_account_email',[op,emailUser,revision,'reservado@example.invalid']);
 await assert.rejects(()=>db.query('insert into auth.users(id,email)values($1,$2)',['99500000-0000-4000-8000-000000000005','reservado@example.invalid']),error=>error.code==='23505');
 await db.query('update public.berry_profiles set access_revision=access_revision+1 where id=$1',[emailUser]);
 await assert.rejects(()=>db.query("update auth.users set email='reservado@example.invalid',raw_app_meta_data=raw_app_meta_data||jsonb_build_object('berry_email_operation',$1::text) where id=$2",[op,emailUser]),error=>error.code==='40001');
 assert.equal((await db.query('select email from auth.users where id=$1',[emailUser])).rows[0].email,'nuevo-correo@example.invalid');
});
test('expired email attempts and revoked administrators cannot commit Auth or profile changes, and replays preserve the migration',async()=>{
 await db.query('update berry_private.account_email_operations set expires_at=clock_timestamp()-interval \'1 second\' where completed_at is null');
 const revision=(await db.query('select access_revision from public.berry_profiles where id=$1',[emailUser])).rows[0].access_revision;
 const op='99500000-0000-4000-8000-000000000006';
 await identityRpc('berry_begin_account_email',[op,emailUser,revision,'otro@example.invalid']);
 await db.query("update public.berry_profiles set role='inspector' where id=$1",[users.author]);
 await assert.rejects(()=>db.query("update auth.users set email='otro@example.invalid',raw_app_meta_data=raw_app_meta_data||jsonb_build_object('berry_email_operation',$1::text) where id=$2",[op,emailUser]),error=>error.code==='42501');
 await db.query("update public.berry_profiles set role='admin' where id=$1",[users.author]);
 await db.query('update berry_private.account_email_operations set expires_at=clock_timestamp()-interval \'1 second\' where operation_id=$1',[op]);
 await assert.rejects(()=>db.query("update auth.users set email='otro@example.invalid',raw_app_meta_data=raw_app_meta_data||jsonb_build_object('berry_email_operation',$1::text) where id=$2",[op,emailUser]),error=>error.code==='22023');
 const profiles=(await db.query('select * from public.berry_profiles order by id')).rows;
 await db.exec(accountEmailMigration);
 assert.deepEqual((await db.query('select * from public.berry_profiles order by id')).rows,profiles);
 const fresh='99500000-0000-4000-8000-000000000007';
 await identityRpc('berry_begin_account_email',[fresh,emailUser,revision,'confirmado@example.invalid']);
 // Auth can persist email and metadata in separate statements. The database
 // reservation authorizes the exact email independently of provider ordering.
 await db.query("update auth.users set email='confirmado@example.invalid' where id=$1",[emailUser]);
 assert.equal((await db.query('select email from public.berry_profiles where id=$1',[emailUser])).rows[0].email,'confirmado@example.invalid');
});

const locationOrderMigration = await readFile(new URL('../migrations/202611150018_location_order.sql', import.meta.url), 'utf8');
test('new location order matches the client while historical locations and reports retain their recorded text',async()=>{
 const before=(await db.query('select * from public.berry_inspections order by id')).rows;
 await db.exec(locationOrderMigration);
 assert.deepEqual((await db.query('select * from public.berry_inspections order by id')).rows,before);
 const location={site:'Fundo',zone:'Armonía II',department:'Seguridad Industrial y Gestión Medio Ambiental',departmentNomenclature:'SIGMA',detail:'Taller'};
 assert.equal((await db.query('select berry_private.location_area($1) as value',[location])).rows[0].value,'Fundo – SIGMA – Armonía II – Taller');
 const current={...location,textOrder:'site-zone-area'};
 assert.equal((await db.query('select berry_private.location_area($1) as value',[current])).rows[0].value,'Fundo – Armonía II – SIGMA – Taller');
 assert.equal((await db.query('select berry_private.location_area($1) as value',[{...current,site:'Packing Chao',zone:'Packing Chao',department:'Operaciones Industriales',departmentNomenclature:''}])).rows[0].value,'Packing Chao – Packing Chao – Operaciones Industriales – Taller');
 for(const invalid of [false,12,null,'otro']) await assert.rejects(()=>db.query('select berry_private.location_area($1)',[{...location,textOrder:invalid}]),error=>error.code==='22023');
 const id='99400000-0000-4000-8000-000000000001';
 await identityRpc('berry_ensure_draft',[id]);
 const saved=(await identityRpc('berry_save_draft',[id,1,{...cloudData(),id,areaLocation:current,responsibles:[{id:'self',personId:users.author}]}])).rows[0].value;
 assert.equal(saved.data.area,'Fundo – Armonía II – SIGMA – Taller');assert.equal(saved.data.areaLocation.textOrder,'site-zone-area');
 const after=(await db.query('select * from public.berry_inspections order by id')).rows;
 await db.exec(locationOrderMigration);
 assert.deepEqual((await db.query('select * from public.berry_inspections order by id')).rows,after);
});

const locationCatalogMigration = await readFile(new URL('../migrations/202611150019_location_catalog.sql', import.meta.url), 'utf8');
const locationSite='99300000-0000-4000-8000-000000000001',locationZone='99300000-0000-4000-8000-000000000002',locationInstallation='99300000-0000-4000-8000-000000000003';
const locationRpc=(values,actor=users.author)=>as('authenticated',actor,'select public.berry_manage_location($1,$2,$3,$4,$5,$6) as value',values,freshCatalogClaims);
let physicalLocation,pendingPhysicalReport;
test('physical catalog imports the existing sites and zones without inventing installations or changing any records',async()=>{
 const before=(await db.query('select * from public.berry_inspections order by id')).rows;
 const profiles=(await db.query('select * from public.berry_profiles order by id')).rows;
 await db.exec(locationCatalogMigration);
 assert.deepEqual((await db.query('select * from public.berry_inspections order by id')).rows,before);
 assert.deepEqual((await db.query('select * from public.berry_profiles order by id')).rows,profiles);
 const catalog=(await identityRpc('berry_location_catalog',[])).rows[0].value;
 assert.equal(catalog.installationsReady,false);assert.equal(catalog.nodes.filter(node=>node.kind==='site').length,5);assert.equal(catalog.nodes.filter(node=>node.kind==='zone').length,19);assert.equal(catalog.nodes.filter(node=>node.kind==='installation').length,0);
 await denied(()=>as('anon',null,'select public.berry_location_catalog()'));
 await denied(()=>as('authenticated',catalogUser,'select public.berry_admin_locations()',[],freshCatalogClaims));
 await denied(()=>as('authenticated',users.author,'select * from public.berry_locations',[],freshCatalogClaims));
 await denied(()=>locationRpc([locationSite,'site',null,'No permitido',true,null],catalogUser));
});
test('administrators manage sites and zones with valid parents, revisions, duplicate checks, retirement and restoration while installations stay locked',async()=>{
 const site=(await locationRpc([locationSite,'site',null,'Sede de prueba',true,null])).rows[0].value;assert.equal(site.revision,1);
 await locationRpc([locationZone,'zone',locationSite,'Zona de prueba',true,null]);
 await assert.rejects(()=>locationRpc([locationInstallation,'installation',locationZone,'Instalación no autorizada',true,null]),error=>error.code==='22023');
 await assert.rejects(()=>locationRpc(['99300000-0000-4000-8000-000000000004','zone',locationSite,'Zona de prueba',true,null]),error=>error.code==='23505');
 await assert.rejects(()=>locationRpc([locationZone,'zone',locationZone,'Ciclo inválido',true,1]),error=>error.code==='22023');
 const updated=(await locationRpc([locationZone,'zone',locationSite,'Zona corregida',true,1])).rows[0].value;assert.equal(updated.revision,2);
 await assert.rejects(()=>locationRpc([locationZone,'zone',locationSite,'Otra edición',true,1]),error=>error.code==='40001');
 await locationRpc([locationSite,'site',null,'Sede de prueba',false,1]);assert.ok(!(await identityRpc('berry_location_catalog',[])).rows[0].value.nodes.some(node=>node.id===locationZone));
 await locationRpc([locationSite,'site',null,'Sede de prueba',true,2]);assert.ok((await identityRpc('berry_location_catalog',[])).rows[0].value.nodes.some(node=>node.id===locationZone));
});
test('pending installation catalog permits a complete inspection using only site, zone and area and binds names to actual catalog IDs',async()=>{
 physicalLocation={source:'catalog',siteId:locationSite,zoneId:locationZone,site:'Nombre forjado',zone:'Otro nombre',detail:'Instalación inventada',installationPending:false,management:'Gerencia de prueba',department:'Área de prueba',departmentDisplay:'Área de Prueba',textOrder:'site-zone-area'};
 const id='99300000-0000-4000-8000-000000000005';await identityRpc('berry_ensure_draft',[id]);
 const saved=(await identityRpc('berry_save_draft',[id,1,{...cloudData(),id,areaLocation:physicalLocation,responsibles:[{id:'self',personId:users.author}]}])).rows[0].value;
 assert.equal(saved.data.area,'Sede de prueba – Zona corregida – Área de Prueba');assert.equal(saved.data.areaLocation.detail,'');assert.equal(saved.data.areaLocation.installationPending,true);
 await db.query('select berry_private.require_location($1)',[saved.data]);
 pendingPhysicalReport='99300000-0000-4000-8000-000000000006';
 await identityReport(users.author,pendingPhysicalReport,users.author,{areaLocation:{...physicalLocation,detail:''}});
});
test('loading the official installation list enables dependent installations and cannot be bypassed with a pending flag or an installation from another zone',async()=>{
 // Fixture-only activation simulates the later official import; production is left pending.
 await db.query('update berry_private.location_settings set installations_ready=true where singleton');
 await locationRpc([locationInstallation,'installation',locationZone,'Taller de prueba',true,null]);
 const location={...physicalLocation,site:'Sede de prueba',zone:'Zona corregida',installationId:locationInstallation,detail:'Texto forjado',installationPending:true};
 const normalized=(await db.query('select berry_private.canonical_location($1,$2) as value',['99300000-0000-4000-8000-000000000007',location])).rows[0].value;
 assert.equal(normalized.detail,'Taller de prueba');assert.equal(normalized.installationPending,false);
 await db.query('select berry_private.require_location($1)',[{id:'99300000-0000-4000-8000-000000000007',areaLocation:normalized}]);
 const oldPending=(await db.query('select data from public.berry_inspections where id=$1',[pendingPhysicalReport])).rows[0].data;
 await db.query('select berry_private.require_location($1)',[oldPending]);
 const historical=(await db.query('select berry_private.canonical_location($1,$2) as value',[pendingPhysicalReport,oldPending.areaLocation])).rows[0].value;assert.deepEqual(historical,oldPending.areaLocation);
 await assert.rejects(()=>db.query('select berry_private.require_location($1)',[{id:'99300000-0000-4000-8000-000000000007',areaLocation:{...normalized,detail:'',installationId:undefined,installationPending:true}}]),error=>error.code==='22023');
 await assert.rejects(()=>db.query('select berry_private.canonical_location($1,$2)',['99300000-0000-4000-8000-000000000007',{...location,zoneId:'49b49753-a8d6-571e-a064-c9f0c961d1d9'}]),error=>error.code==='22023');
});
test('catalog reinstallation preserves administrator edits, the later activation and all historical snapshots',async()=>{
 await locationRpc([locationInstallation,'installation',locationZone,'Taller corregido',true,1]);
 const nodes=(await db.query('select * from public.berry_locations order by id')).rows,records=(await db.query('select * from public.berry_inspections order by id')).rows;
 await db.exec(await readFile(new URL('../operations/activate-locations-20261115.sql',import.meta.url),'utf8'));
 assert.deepEqual((await db.query('select * from public.berry_locations order by id')).rows,nodes);assert.deepEqual((await db.query('select * from public.berry_inspections order by id')).rows,records);
 assert.equal((await identityRpc('berry_location_catalog',[])).rows[0].value.installationsReady,true);
});

const catalogOrderMigration=await readFile(new URL('../migrations/202611150020_catalog_order.sql',import.meta.url),'utf8');
const orderRpc=(catalog,nodes,actor=users.author)=>as('authenticated',actor,'select public.berry_reorder_catalog($1,$2,$3) as value',[catalog,nodes.map(node=>node.id),nodes.map(node=>node.revision)],freshCatalogClaims);
const siblings=async(table,id)=>(await db.query(`select n.* from public.${table} n join public.${table} item on item.id=$1 where n.kind=item.kind and n.parent_id is not distinct from item.parent_id order by n.sort_order,n.name,n.id`,[id])).rows;
test('manual order migration preserves profiles, historical inspections, names and existing catalog selection',async()=>{
 const records=(await db.query('select * from public.berry_inspections order by id')).rows,profiles=(await db.query('select * from public.berry_profiles order by id')).rows;
 const catalog=(await identityRpc('berry_organization_catalog',[])).rows[0].value;
 await db.exec(catalogOrderMigration);
 assert.deepEqual((await db.query('select * from public.berry_inspections order by id')).rows,records);
 assert.deepEqual((await db.query('select * from public.berry_profiles order by id')).rows,profiles);
 assert.deepEqual((await identityRpc('berry_organization_catalog',[])).rows[0].value,catalog);
 for(const table of ['berry_organization','berry_locations']) assert.equal((await db.query(`select count(*)::int n from public.${table} where sort_order is null or sort_order<1`)).rows[0].n,0);
 assert.equal((await db.query('select public.berry_schema_status() value')).rows[0].value.catalog_order_version,'202611150020');
});
test('administrators reorder every hierarchy level and regular selection catalogs expose the chosen order',async()=>{
 for(const [catalog,table] of [['organization','berry_organization'],['locations','berry_locations']]) {
  const groups=(await db.query(`select distinct on(kind) id,kind from public.${table} n where (select count(*) from public.${table} s where s.kind=n.kind and s.parent_id is not distinct from n.parent_id)>1 order by kind,id`)).rows;
  // Ensure each hierarchy has a multi-element child list for the same parent.
  if(catalog==='locations') {
   await locationRpc(['99300000-0000-4000-8000-000000000021','zone',locationSite,'Segunda zona',true,null]);
   await locationRpc(['99300000-0000-4000-8000-000000000022','installation',locationZone,'Segunda instalación',true,null]);
   groups.push({id:locationInstallation,kind:'installation'});
  }
  for(const group of groups) {
   const before=await siblings(table,group.id),next=[...before].reverse();
   const saved=(await orderRpc(catalog,next)).rows[0].value;
   assert.deepEqual(saved.map(n=>n.id),next.map(n=>n.id));
   assert.deepEqual((await siblings(table,group.id)).map(n=>n.id),next.map(n=>n.id));
   assert.ok(saved.some(n=>n.revision>before.find(b=>b.id===n.id).revision));
   assert.ok((await db.query("select count(*)::int n from public.berry_audit where entity_id=$1",[saved[0].id])).rows[0].n>0);
  }
 }
 const nodes=(await identityRpc('berry_admin_organization',[])).rows[0].value;
 const catalog=(await identityRpc('berry_organization_catalog',[])).rows[0].value;
 const expectedManagements=nodes.filter(n=>n.kind==='management'&&n.enabled).sort((a,b)=>a.sort_order-b.sort_order).map(n=>n.name).filter(name=>catalog.some(e=>e.management===name));
 assert.deepEqual(catalog.map(e=>e.management),expectedManagements);
 for(const entry of catalog) {
  const m=nodes.find(n=>n.kind==='management'&&n.name===entry.management);
  const areas=nodes.filter(n=>n.kind==='area'&&n.parent_id===m.id&&n.enabled).sort((a,b)=>a.sort_order-b.sort_order).filter(n=>entry.areas.includes(n.name));
  assert.deepEqual(entry.areas,areas.map(n=>n.name));
  for(const a of areas) assert.deepEqual(entry.positions[a.name],nodes.filter(n=>n.kind==='position'&&n.parent_id===a.id&&n.enabled).sort((a,b)=>a.sort_order-b.sort_order).map(n=>n.name));
 }
 const locations=(await identityRpc('berry_location_catalog',[])).rows[0].value.nodes;
 assert.deepEqual(locations.filter(n=>n.kind==='installation'&&n.parent_id===locationZone).map(n=>n.id),(await siblings('berry_locations',locationInstallation)).filter(n=>n.enabled).map(n=>n.id));
});
test('ordering is administrator-only and rejects incomplete lists, duplicates and mixed parents without partial updates',async()=>{
 const nodes=await siblings('berry_locations',locationZone),before=(await db.query('select * from public.berry_locations order by id')).rows;
 await denied(()=>as('anon',null,'select public.berry_reorder_catalog($1,$2,$3)',['locations',nodes.map(n=>n.id),nodes.map(n=>n.revision)]));
 await denied(()=>orderRpc('locations',nodes,catalogUser));
 for(const [ids,revisions] of [[[],[]],[[nodes[0].id,nodes[0].id],[1,1]],[[nodes[0].id],[null]],[[null],[1]]]) await assert.rejects(()=>identityRpc('berry_reorder_catalog',['locations',ids,revisions]),e=>e.code==='22023');
 await assert.rejects(()=>orderRpc('unknown',nodes),e=>e.code==='22023');
 await assert.rejects(()=>orderRpc('locations',nodes.slice(1)),e=>e.code==='40001');
 await assert.rejects(()=>orderRpc('locations',[...nodes.slice(1),{id:locationSite,revision:1}]),e=>e.code==='40001');
 assert.deepEqual((await db.query('select * from public.berry_locations order by id')).rows,before);
});
test('ordering retries are idempotent and a stale edit or a concurrent addition cannot overwrite another session',async()=>{
 const nodes=await siblings('berry_locations',locationZone),desired=[...nodes].reverse();
 const first=(await orderRpc('locations',desired)).rows[0].value;
 assert.deepEqual((await orderRpc('locations',desired)).rows[0].value,first);
 await assert.rejects(()=>orderRpc('locations',nodes),e=>e.code==='40001');
 const latest=await siblings('berry_locations',locationZone);
 await locationRpc(['99300000-0000-4000-8000-000000000023','zone',locationSite,'Zona concurrente',true,null]);
 await assert.rejects(()=>orderRpc('locations',[...latest].reverse()),e=>e.code==='40001');
 const current=await siblings('berry_locations',locationZone),target=current[0];
 await locationRpc([target.id,'zone',locationSite,target.name+' editada',true,target.revision]);
 await assert.rejects(()=>orderRpc('locations',[...current].reverse()),e=>e.code==='40001');
});
test('new and reparented entries append while renaming, retiring and restoring retain the chosen position',async()=>{
 const list=await siblings('berry_locations',locationZone),target=list[0];
 const rename=(await locationRpc([target.id,'zone',locationSite,target.name+' corregida',true,target.revision])).rows[0].value;
 assert.equal(rename.sort_order,target.sort_order);
 const retired=(await locationRpc([rename.id,'zone',locationSite,rename.name,false,rename.revision])).rows[0].value;
 const restored=(await locationRpc([retired.id,'zone',locationSite,retired.name,true,retired.revision])).rows[0].value;
 assert.equal(restored.sort_order,target.sort_order);
 const inserted=(await locationRpc(['99300000-0000-4000-8000-000000000024','zone',locationSite,'A nueva zona al final',true,null])).rows[0].value;
 assert.equal((await siblings('berry_locations',locationZone)).at(-1).id,inserted.id);
 const otherSite=(await locationRpc(['99300000-0000-4000-8000-000000000025','site',null,'Otra sede',true,null])).rows[0].value;
 await locationRpc(['99300000-0000-4000-8000-000000000026','zone',otherSite.id,'Zona existente',true,null]);
 const moved=(await locationRpc([inserted.id,'zone',otherSite.id,inserted.name,true,inserted.revision])).rows[0].value;
 assert.equal((await siblings('berry_locations',moved.id)).at(-1).id,moved.id);
});
test('ordering cannot enable the pending installation catalog and reinstallation preserves chosen orders and all reports',async()=>{
 const list=await siblings('berry_locations',locationInstallation);
 await db.query('update berry_private.location_settings set installations_ready=false where singleton');
 await assert.rejects(()=>orderRpc('locations',[...list].reverse()),e=>e.code==='22023');
 const locations=(await db.query('select * from public.berry_locations order by id')).rows,org=(await db.query('select * from public.berry_organization order by id')).rows;
 const reports=(await db.query('select * from public.berry_inspections order by id')).rows,profiles=(await db.query('select * from public.berry_profiles order by id')).rows;
 await db.exec(catalogOrderMigration);
 await db.exec(await readFile(new URL('../operations/activate-catalog-order-20261115.sql',import.meta.url),'utf8'));
 assert.deepEqual((await db.query('select * from public.berry_locations order by id')).rows,locations);
 assert.deepEqual((await db.query('select * from public.berry_organization order by id')).rows,org);
 assert.deepEqual((await db.query('select * from public.berry_inspections order by id')).rows,reports);
 assert.deepEqual((await db.query('select * from public.berry_profiles order by id')).rows,profiles);
 assert.equal((await identityRpc('berry_location_catalog',[])).rows[0].value.installationsReady,false);
});

const fundoImportMigration=await readFile(new URL('../migrations/202611150021_fundo_installations.sql',import.meta.url),'utf8');
const fundoSource=JSON.parse(await readFile(new URL('../../src/fundo-installations.json',import.meta.url),'utf8'));
const fundoSite=fundoSource.siteId,fundoZone=fundoSource.zones.find(z=>z.name==='Armonía II'),fundoPoint=fundoZone.installations[0];
const priorFundoReport='99100000-0000-4000-8000-000000000001',priorJabas='99100000-0000-4000-8000-000000000002';
let originalFundoLocation;
test('Fundo import uses 178 reviewed points and 15 source zones without rewriting profiles, reports or other sites',async()=>{
 originalFundoLocation={source:'catalog',siteId:fundoSite,zoneId:fundoZone.id,site:'Fundo',zone:fundoZone.name,detail:'',installationPending:true,textOrder:'site-zone-area'};
 await identityReport(users.author,priorFundoReport,users.author,{areaLocation:originalFundoLocation});
 const armoniaIII=fundoSource.zones.find(z=>z.name==='Armonía III');
 await db.query("insert into public.berry_locations(id,parent_id,kind,name,enabled)values($1,$2,'installation','ALMACEN DE JABAS',false)",[priorJabas,armoniaIII.id]);
 await db.query('update public.berry_locations set sort_order=77 where id=$1',[priorJabas]);
 const profiles=(await db.query('select * from public.berry_profiles order by id')).rows,reports=(await db.query('select * from public.berry_inspections order by id')).rows;
 const outside=(await db.query('select * from public.berry_locations where kind=\'site\' or parent_id is distinct from $1 and kind=\'zone\' order by id',[fundoSite])).rows;
 await db.exec(fundoImportMigration);
 assert.deepEqual((await db.query('select * from public.berry_profiles order by id')).rows,profiles);
 assert.deepEqual((await db.query('select * from public.berry_inspections order by id')).rows,reports);
 assert.deepEqual((await db.query('select * from public.berry_locations where kind=\'site\' or parent_id is distinct from $1 and kind=\'zone\' order by id',[fundoSite])).rows,outside);
 assert.equal((await db.query("select count(*)::int n from public.berry_locations i join public.berry_locations z on z.id=i.parent_id where i.kind='installation' and z.parent_id=$1",[fundoSite])).rows[0].n,178);
 const reused=(await db.query('select * from public.berry_locations where id=$1',[priorJabas])).rows[0];assert.equal(reused.name,'Almacén de Jabas');assert.equal(reused.enabled,false);assert.equal(reused.sort_order,77);
 const catalog=(await identityRpc('berry_location_catalog',[])).rows[0].value;
 assert.equal(catalog.installationsReady,false);assert.deepEqual(catalog.installationSiteIds,[fundoSite]);assert.equal(catalog.installationZoneIds.length,15);
 assert.equal((await db.query('select public.berry_schema_status() value')).rows[0].value.fundo_installations_version,'202611150021');
 assert.equal((await db.query("select berry_private.location_import_key('RESERVORIO 100 000 M3')=berry_private.location_import_key('Reservorio 100 000 m³') as same")).rows[0].same,true);
 assert.equal((await db.query("select berry_private.location_import_key('FILTRADO MODULO C,D,E,F,Q')=berry_private.location_import_key('Filtrado Módulo C, D, E, F, Q') as same")).rows[0].same,true);
});
test('Fundo locations follow Ubicación even when the inspection point mentions a different zone or an existing exterior locality',async()=>{
 const ilusion=fundoSource.zones.find(z=>z.name==='Ilusión I');
 const namedElsewhere=ilusion.installations.find(i=>i.name==='Tratamiento de Agua (Ilusión II)');
 assert.equal((await db.query('select parent_id from public.berry_locations where id=$1',[namedElsewhere.id])).rows[0].parent_id,ilusion.id);
 const chao=fundoSource.zones.find(z=>z.name==='Chao');
 assert.equal((await db.query('select parent_id from public.berry_locations where id=$1',[chao.id])).rows[0].parent_id,fundoSite);
 assert.equal((await db.query("select count(*)::int n from public.berry_locations where kind='zone' and name='Chao'")).rows[0].n,2);
 assert.equal((await db.query("select count(*)::int n from public.berry_locations where kind='installation' and name in('Cosecha','Poda','Labores','Reporte de Peligro')")).rows[0].n,0);
 const pending=(await db.query("select id from public.berry_locations where parent_id=$1 and name='Ilusión II'",[fundoSite])).rows[0].id;
 const catalog=(await identityRpc('berry_location_catalog',[])).rows[0].value;assert.ok(!catalog.installationZoneIds.includes(pending));
});
test('new Fundo reports require a valid installation for the selected zone and cannot forge a pending flag or physical names',async()=>{
 const id='99100000-0000-4000-8000-000000000003';await identityRpc('berry_ensure_draft',[id]);
 const forged={...originalFundoLocation,site:'Forjado',zone:'Forjada',detail:'Inventada',installationId:fundoPoint.id,installationPending:true};
 const saved=(await identityRpc('berry_save_draft',[id,1,{...cloudData(),id,areaLocation:forged,responsibles:[{id:'self',personId:users.author}]}])).rows[0].value;
 assert.equal(saved.data.areaLocation.site,'Fundo');assert.equal(saved.data.areaLocation.zone,fundoZone.name);assert.equal(saved.data.areaLocation.detail,fundoPoint.name);assert.equal(saved.data.areaLocation.installationPending,false);
 await db.query('select berry_private.require_location($1)',[saved.data]);
 await identityReport(users.author,'99100000-0000-4000-8000-000000000009',users.author,{areaLocation:saved.data.areaLocation});
 const empty=(await db.query('select berry_private.canonical_location($1,$2) value',[id,{...originalFundoLocation,installationPending:true}])).rows[0].value;
 assert.equal(empty.installationPending,false);
 await assert.rejects(()=>db.query('select berry_private.require_location($1)',[{...saved.data,areaLocation:empty}]),e=>e.code==='22023');
 const another=fundoSource.zones.find(z=>z.name==='Esperanza I').installations[0];
 await assert.rejects(()=>db.query('select berry_private.canonical_location($1,$2)',[id,{...forged,installationId:another.id}]),e=>e.code==='22023');
 const prior=(await db.query('select data from public.berry_inspections where id=$1',[priorFundoReport])).rows[0].data;
 await db.query('select berry_private.require_location($1)',[prior]);
 assert.deepEqual((await db.query('select berry_private.canonical_location($1,$2) value',[priorFundoReport,prior.areaLocation])).rows[0].value,prior.areaLocation);
});
test('unprovided sites stay pending and only administrators can add an installation to activate a new Fundo zone',async()=>{
 await assert.rejects(()=>locationRpc(['99100000-0000-4000-8000-000000000004','installation',locationZone,'No autorizado fuera de Fundo',true,null]),e=>e.code==='22023');
 const draft=(await db.query('select berry_private.canonical_location($1,$2) value',['99100000-0000-4000-8000-000000000005',{...physicalLocation,siteId:locationSite,zoneId:locationZone,detail:'',installationPending:false}])).rows[0].value;
 assert.equal(draft.installationPending,true);await db.query('select berry_private.require_location($1)',[{id:'99100000-0000-4000-8000-000000000005',areaLocation:draft}]);
 const zone='99100000-0000-4000-8000-000000000006',installation='99100000-0000-4000-8000-000000000007';
 await locationRpc([zone,'zone',fundoSite,'Zona añadida por administrador',true,null]);
 assert.ok(!(await identityRpc('berry_location_catalog',[])).rows[0].value.installationZoneIds.includes(zone));
 await denied(()=>locationRpc([installation,'installation',zone,'Instalación autorizada',true,null],catalogUser));
 await locationRpc([installation,'installation',zone,'Instalación autorizada',true,null]);
 assert.ok((await identityRpc('berry_location_catalog',[])).rows[0].value.installationZoneIds.includes(zone));
 await denied(()=>as('authenticated',users.author,'select * from berry_private.location_installation_scopes',[],freshCatalogClaims));
});
test('Fundo import replay preserves administrator names, retirements, manual ordering, scope settings and recorded inspections',async()=>{
 const zone=fundoSource.zones.find(z=>z.name==='Armonía I'),node=(await db.query('select * from public.berry_locations where id=$1',[zone.installations[0].id])).rows[0];
 await locationRpc([node.id,'installation',node.parent_id,'Nombre actualizado por administración',false,node.revision]);
 await orderRpc('locations',[...(await siblings('berry_locations',node.id))].reverse());
 const nodes=(await db.query('select * from public.berry_locations order by id')).rows,scopes=(await db.query('select * from berry_private.location_installation_scopes order by node_id')).rows;
 const reports=(await db.query('select * from public.berry_inspections order by id')).rows;
 await db.exec(fundoImportMigration);
 await db.exec(await readFile(new URL('../operations/activate-fundo-installations-20261115.sql',import.meta.url),'utf8'));
 assert.deepEqual((await db.query('select * from public.berry_locations order by id')).rows,nodes);
 assert.deepEqual((await db.query('select * from berry_private.location_installation_scopes order by node_id')).rows,scopes);
 assert.deepEqual((await db.query('select * from public.berry_inspections order by id')).rows,reports);
 assert.equal((await identityRpc('berry_location_catalog',[])).rows[0].value.installationsReady,false);
});

const manualInstallationsMigration=await readFile(new URL('../migrations/202611160022_manual_installations.sql',import.meta.url),'utf8');
const manualPoint='99000000-0000-4000-8000-000000000001',secondManualPoint='99000000-0000-4000-8000-000000000002';
test('manual installation upgrade leaves catalogs, imported Fundo points, scopes, profiles and inspection history unchanged',async()=>{
 const locations=(await db.query('select * from public.berry_locations order by id')).rows,scopes=(await db.query('select * from berry_private.location_installation_scopes order by node_id')).rows;
 const profiles=(await db.query('select * from public.berry_profiles order by id')).rows,reports=(await db.query('select * from public.berry_inspections order by id')).rows;
 await db.exec(manualInstallationsMigration);
 assert.deepEqual((await db.query('select * from public.berry_locations order by id')).rows,locations);
 assert.deepEqual((await db.query('select * from berry_private.location_installation_scopes order by node_id')).rows,scopes);
 assert.deepEqual((await db.query('select * from public.berry_profiles order by id')).rows,profiles);
 assert.deepEqual((await db.query('select * from public.berry_inspections order by id')).rows,reports);
 assert.equal((await db.query("select relrowsecurity from pg_class where oid='berry_private.location_installation_scopes'::regclass")).rows[0].relrowsecurity,true);
});
test('administrator can manually add the first installation outside Fundo and activate only that site and zone',async()=>{
 const before=(await identityRpc('berry_location_catalog',[])).rows[0].value;
 assert.ok(!before.installationSiteIds.includes(locationSite));assert.ok(!before.installationZoneIds.includes(locationZone));
 await denied(()=>locationRpc([manualPoint,'installation',locationZone,'Taller añadido manualmente',true,null],catalogUser));
 const added=(await locationRpc([manualPoint,'installation',locationZone,'Taller añadido manualmente',true,null])).rows[0].value;
 assert.equal(added.parent_id,locationZone);
 const next=(await identityRpc('berry_location_catalog',[])).rows[0].value;
 assert.equal(next.installationsReady,false);assert.deepEqual(new Set(next.installationSiteIds),new Set([...before.installationSiteIds,locationSite]));
 assert.deepEqual(new Set(next.installationZoneIds),new Set([...before.installationZoneIds,locationZone]));
 const point={source:'catalog',siteId:locationSite,zoneId:locationZone,site:'Nombre del cliente',zone:'Nombre del cliente',installationId:manualPoint,detail:'Nombre del cliente',installationPending:true};
 const location=(await db.query('select berry_private.canonical_location($1,$2) value',['99000000-0000-4000-8000-000000000003',point])).rows[0].value;
 assert.equal(location.detail,'Taller añadido manualmente');assert.equal(location.installationPending,false);
 await db.query('select berry_private.require_location($1)',[{id:'99000000-0000-4000-8000-000000000003',areaLocation:location}]);
});
test('manual installation changes validate parents, duplicates and revisions and allow move, reorder, retirement and restoration',async()=>{
 await assert.rejects(()=>locationRpc(['99000000-0000-4000-8000-000000000004','installation',locationSite,'Sin zona válida',true,null]),e=>e.code==='22023');
 await assert.rejects(()=>locationRpc(['99000000-0000-4000-8000-000000000005','installation',locationZone,'Taller añadido manualmente',true,null]),e=>e.code==='23505');
 const renamed=(await locationRpc([manualPoint,'installation',locationZone,'Taller actualizado',true,1])).rows[0].value;
 await assert.rejects(()=>locationRpc([manualPoint,'installation',locationZone,'Edición obsoleta',true,1]),e=>e.code==='40001');
 const zone='99000000-0000-4000-8000-000000000006',site='99000000-0000-4000-8000-000000000007';
 await locationRpc([site,'site',null,'Sede sin lista importada',true,null]);await locationRpc([zone,'zone',site,'Zona sin lista importada',true,null]);
 const moved=(await locationRpc([manualPoint,'installation',zone,renamed.name,true,renamed.revision])).rows[0].value;
 const catalog=(await identityRpc('berry_location_catalog',[])).rows[0].value;assert.ok(catalog.installationSiteIds.includes(site));assert.ok(catalog.installationZoneIds.includes(zone));
 await locationRpc([secondManualPoint,'installation',zone,'Segunda instalación manual',true,null]);
 const reordered=(await orderRpc('locations',[...(await siblings('berry_locations',manualPoint))].reverse())).rows[0].value;
 assert.equal(reordered[0].id,secondManualPoint);
 const current=reordered.find(n=>n.id===manualPoint);
 const retired=(await locationRpc([manualPoint,'installation',zone,current.name,false,current.revision])).rows[0].value;
 const restored=(await locationRpc([manualPoint,'installation',zone,current.name,true,retired.revision])).rows[0].value;assert.equal(restored.id,moved.id);
 await locationRpc([site,'site',null,'Sede sin lista importada',false,1]);
 await assert.rejects(()=>locationRpc(['99000000-0000-4000-8000-000000000008','installation',zone,'En sede retirada',true,null]),e=>e.code==='22023');
});
test('a disabled manual installation does not activate an empty zone, and upgrade replays preserve all changes',async()=>{
 const site='99000000-0000-4000-8000-000000000009',zone='99000000-0000-4000-8000-000000000010',point='99000000-0000-4000-8000-000000000011';
 await locationRpc([site,'site',null,'Otra sede pendiente',true,null]);await locationRpc([zone,'zone',site,'Otra zona pendiente',true,null]);
 await locationRpc([point,'installation',zone,'Instalación retirada',false,null]);
 const before=(await identityRpc('berry_location_catalog',[])).rows[0].value;assert.ok(!before.installationSiteIds.includes(site));assert.ok(!before.installationZoneIds.includes(zone));
 await locationRpc([point,'installation',zone,'Instalación retirada',true,1]);
 const locations=(await db.query('select * from public.berry_locations order by id')).rows,scopes=(await db.query('select * from berry_private.location_installation_scopes order by node_id')).rows;
 await db.exec(manualInstallationsMigration);
 assert.deepEqual((await db.query('select * from public.berry_locations order by id')).rows,locations);
 assert.deepEqual((await db.query('select * from berry_private.location_installation_scopes order by node_id')).rows,scopes);
 await denied(()=>as('authenticated',users.author,'select * from berry_private.location_installation_scopes',[],freshCatalogClaims));
});

const productivityUsers={author:'ab000000-0000-4000-8000-000000000001',recipient:'ab000000-0000-4000-8000-000000000002',outsider:'ab000000-0000-4000-8000-000000000003'};
const productivityReport='ac000000-0000-4000-8000-000000000001',productivityObservation='ad000000-0000-4000-8000-000000000001',offlineOperation='ae000000-0000-4000-8000-000000000001';
const productivityRpc=(actor,query,values=[])=>as('authenticated',actor,query,values,freshCatalogClaims);
test('productivity upgrade is repeatable and does not manufacture historical messages or alter reports',async()=>{
 const before=(await db.query('select id,revision,data from public.berry_inspections order by id')).rows;
 const sql=await readFile(new URL('../migrations/202611170023_productivity.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);
 assert.deepEqual((await db.query('select id,revision,data from public.berry_inspections order by id')).rows,before);
 assert.equal((await db.query('select count(*)::integer n from public.berry_followup_events')).rows[0].n,0);
 assert.equal((await db.query('select enabled from berry_private.reminder_settings')).rows[0].enabled,false);
 assert.equal((await as('anon',null,'select public.berry_schema_status() value')).rows[0].value.productivity_version,'202611170023');
 for(const [name,id]of Object.entries(productivityUsers)){
  await db.query('insert into auth.users(id,email,raw_user_meta_data)values($1,$2,$3)',[id,`${name}-productivity@example.invalid`,{full_name:name}]);
  const organization=(await db.query("select m.name management,a.name area,p.name position from public.berry_organization m join public.berry_organization a on a.parent_id=m.id join public.berry_organization p on p.parent_id=a.id where m.enabled and a.enabled and p.enabled limit 1")).rows[0];
  await db.query("update public.berry_profiles set enabled=true,must_change_password=false,can_create_inspections=true,can_receive_inspections=true,full_name=$2,role=$3,management=$4,area=$5,job_title=$6 where id=$1",[id,name,name==='author'?'admin':'inspector',organization.management,organization.area,organization.position]);
 }
 const date=(await db.query("select to_char((now() at time zone 'America/Lima')::date-2,'YYYY-MM-DD') value")).rows[0].value;
 const data={id:productivityReport,date,area:'Taller',inspector:'author',inspectorEmail:'author-productivity@example.invalid',responsibles:[{personId:productivityUsers.recipient,name:'recipient',email:'recipient-productivity@example.invalid'}],observations:[{id:productivityObservation,dueDate:date,description:'Hallazgo',photos:[]}],delivery:{recipientIds:[productivityUsers.recipient],corrections:{},revision:1}};
 await db.query("insert into public.berry_inspections(id,author_id,code,workflow,data,sent_at)values($1,$2,'IH-2031-901','sent',$3,now()-interval '2 days')",[productivityReport,productivityUsers.author,data]);
 await db.query('insert into public.berry_recipients(inspection_id,user_id,assigned_by)values($1,$2,$3)',[productivityReport,productivityUsers.recipient,productivityUsers.author]);
});
test('conversation retains both participants, rejects outsiders and deduplicates an uncertain retry',async()=>{
 const id='af000000-0000-4000-8000-000000000001',query='select public.berry_add_followup_comment($1,$2,$3,$4) value',args=[productivityReport,productivityObservation,id,'Consulta del responsable'];
 const first=(await productivityRpc(productivityUsers.recipient,query,args)).rows[0].value;
 const again=(await productivityRpc(productivityUsers.recipient,query,args)).rows[0].value;assert.equal(first.id,again.id);
 await productivityRpc(productivityUsers.author,query,[productivityReport,productivityObservation,'af000000-0000-4000-8000-000000000002','Respuesta del inspector']);
 assert.equal((await productivityRpc(productivityUsers.recipient,'select body from public.berry_followup_events where inspection_id=$1',[productivityReport])).rows.length,2);
 assert.equal((await productivityRpc(productivityUsers.outsider,'select * from public.berry_followup_events where inspection_id=$1',[productivityReport])).rows.length,0);
 await denied(()=>productivityRpc(productivityUsers.outsider,query,[productivityReport,productivityObservation,'af000000-0000-4000-8000-000000000003','No autorizado']));
 await assert.rejects(()=>productivityRpc(productivityUsers.recipient,query,[...args.slice(0,3),'Otro contenido']),e=>e.code==='40001');
 await denied(()=>productivityRpc(productivityUsers.recipient,'delete from public.berry_followup_events'));
});
test('offline synchronization commits once and rejects stale or foreign edits without losing conversation history',async()=>{
 const revision=(await db.query('select revision from public.berry_inspections where id=$1',[productivityReport])).rows[0].revision;
 const value={responsibleName:'recipient',state:'Pendiente',action:'Acción guardada sin conexión',date:'2026-11-16',photos:[]};
 const query='select public.berry_apply_offline_correction($1,$2,$3,$4,$5,$6) value',args=[offlineOperation,productivityReport,productivityObservation,revision,'submit',value];
 const first=(await productivityRpc(productivityUsers.recipient,query,args)).rows[0].value;
 const again=(await productivityRpc(productivityUsers.recipient,query,args)).rows[0].value;assert.equal(first.revision,again.revision);
 assert.equal(first.data.delivery.corrections[productivityObservation].decision,'review');
 const events=(await productivityRpc(productivityUsers.recipient,'select action from public.berry_followup_events where inspection_id=$1',[productivityReport])).rows;
 assert.equal(events.filter(e=>e.action==='submit').length,1);assert.equal(events.filter(e=>e.action==='comment').length,2);
 await denied(()=>productivityRpc(productivityUsers.outsider,query,args));
 await assert.rejects(()=>productivityRpc(productivityUsers.recipient,query,['ae000000-0000-4000-8000-000000000002',...args.slice(1,4),'save',value]),e=>e.code==='40001');
});
test('mail tracking requires server events, isolates recipients and cannot regress from delivered to submitted',async()=>{
 const request='b0000000-0000-4000-8000-000000000001';
 await db.query('select public.berry_initialize_mail($1,$2,$3)',[productivityReport,request,['recipient-productivity@example.invalid','copy@example.invalid']]);
 await denied(()=>productivityRpc(productivityUsers.recipient,"select public.berry_record_mail_event('forged',$1,$2,'delivered',null,'',now())",[request,'recipient-productivity@example.invalid']));
 const time=(await db.query('select now() value')).rows[0].value;
 const query='select public.berry_record_mail_event($1,$2,$3,$4,$5,$6,$7) value',args=['delivery-1',request,'recipient-productivity@example.invalid','delivered','provider-id','',time];
 assert.equal((await db.query(query,args)).rows[0].value.duplicate,false);assert.equal((await db.query(query,args)).rows[0].value.duplicate,true);
 await db.query(query,['submitted-late',request,'recipient-productivity@example.invalid','submitted',null,'',time]);
 const own=(await productivityRpc(productivityUsers.recipient,'select email,state from public.berry_mail_recipients where inspection_id=$1',[productivityReport])).rows;
 assert.deepEqual(own,[{email:'recipient-productivity@example.invalid',state:'delivered'}]);
 assert.equal((await productivityRpc(productivityUsers.author,'select * from public.berry_mail_recipients where inspection_id=$1',[productivityReport])).rows.length,2);
 assert.equal((await productivityRpc(productivityUsers.outsider,'select * from public.berry_mail_recipients where inspection_id=$1',[productivityReport])).rows.length,0);
 await assert.rejects(()=>db.query(query,['delivery-1',request,'recipient-productivity@example.invalid','bounced',null,'',time]),e=>e.code==='40001');
});
test('reminders default off, are admin-configurable, target the correct role and claim each period once',async()=>{
 await db.query("insert into public.berry_documents(inspection_id,kind,revision,filename,storage_path,mime_type,byte_size,sha256,created_by)values($1,'excel',1,'Informe.xlsx','record/informe.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',100,$2,$3)",[productivityReport,'a'.repeat(64),productivityUsers.author]);
 assert.deepEqual((await db.query('select public.berry_claim_reminders(50) value')).rows[0].value,[]);
 await denied(()=>productivityRpc(productivityUsers.recipient,'select public.berry_reminder_settings($1)',[{enabled:true,lead_days:3,cadence_days:3}]));
 await productivityRpc(productivityUsers.author,'select public.berry_reminder_settings($1)',[{enabled:true,lead_days:3,cadence_days:3}]);
 const jobs=(await db.query('select public.berry_claim_reminders(50) value')).rows[0].value;
 const own=jobs.filter(j=>j.id===productivityReport);assert.equal(own.length,1);assert.equal(own[0].actor_id,productivityUsers.author);assert.equal(own[0].reason,'review');
 assert.equal((await db.query('select public.berry_claim_reminders(50) value')).rows[0].value.filter(j=>j.id===productivityReport).length,0);
 await db.query("select public.berry_finish_reminder($1,'unconfirmed','{}')",[own[0].request_id]);
 assert.equal((await db.query('select public.berry_claim_reminders(50) value')).rows[0].value.filter(j=>j.id===productivityReport).length,0);
 await denied(()=>productivityRpc(productivityUsers.recipient,'select public.berry_claim_reminders(50)'));
});

test('administrative pages preserve identity links and stable cursor boundaries without exposing photos or regular-user access',async()=>{
 const query='select public.berry_admin_dashboard_page($1,$2,$3) value';
 await denied(()=>productivityRpc(productivityUsers.recipient,query,[null,null,2]));
 const first=(await productivityRpc(productivityUsers.author,query,[null,null,2])).rows[0].value;assert.equal(first.length,2);assert.ok(first[0].identityLinks);
 const last=first[first.length-1],next=(await productivityRpc(productivityUsers.author,query,[last.data.date||'',last.id,2])).rows[0].value;
 assert.ok(!next.some(row=>first.some(previous=>previous.id===row.id)));assert.ok(first.every(row=>(row.data.observations||[]).every(o=>!o.photos||o.photos.length===0)));
});
test('reminders respect rehire history boundaries and only restored pending access permits notifying the former report',async()=>{
 const revision=(await db.query('select revision from public.berry_inspections where id=$1',[productivityReport])).rows[0].revision;
 await productivityRpc(productivityUsers.author,"select public.berry_change_correction($1,$2,$3,'changes',$4)",[productivityReport,productivityObservation,revision,{note:'Completar la corrección'}]);
 await db.query('delete from berry_private.reminder_jobs where inspection_id=$1',[productivityReport]);
 await db.query("update public.berry_profiles set history_access_from=now()+interval '1 day' where id=$1",[productivityUsers.recipient]);
 let jobs=(await db.query('select public.berry_claim_reminders(50) value')).rows[0].value;assert.equal(jobs.filter(j=>j.id===productivityReport).length,0);
 await db.query('insert into berry_private.restored_pending_access(user_id,inspection_id)values($1,$2)',[productivityUsers.recipient,productivityReport]);
 jobs=(await db.query('select public.berry_claim_reminders(50) value')).rows[0].value;assert.equal(jobs.filter(j=>j.id===productivityReport).length,1);assert.equal(jobs.find(j=>j.id===productivityReport).actor_id,productivityUsers.recipient);
});

test('rehire boundaries also deny historical conversation writes and replayed offline receipts',async()=>{
 await db.query('delete from berry_private.restored_pending_access where user_id=$1 and inspection_id=$2',[productivityUsers.recipient,productivityReport]);
 await denied(()=>productivityRpc(productivityUsers.recipient,'select public.berry_add_followup_comment($1,$2,$3,$4)',[productivityReport,productivityObservation,'af000000-0000-4000-8000-000000000009','Comentario sin acceso histórico']));
 await denied(()=>productivityRpc(productivityUsers.recipient,'select public.berry_apply_offline_correction($1,$2,$3,$4,$5,$6)',[offlineOperation,productivityReport,productivityObservation,1,'submit',{responsibleName:'recipient',state:'Pendiente',action:'Acción guardada sin conexión',date:'2026-11-16',photos:[]}]));
});


const safetyUsers={worker:'cc000000-0000-4000-8000-000000000001',other:'cc000000-0000-4000-8000-000000000002',admin:'cc000000-0000-4000-8000-000000000003',disabled:'cc000000-0000-4000-8000-000000000004'};
const safetyId='cc100000-0000-4000-8000-000000000001';
const safetyPath=safetyUsers.worker+'/'+safetyId+'/documento.pdf';
const safetyAs=(user,sql,args=[])=>as('authenticated',safetyUsers[user],sql,args,{iat:Math.floor(Date.now()/1000)});
const safetySubmit=(user='worker',id=safetyId)=>safetyAs(user,'select public.berry_submit_safety_document($1,$2,$3,$4,$5,$6,$7) value',[id,'ATS','Mantenimiento seguro','2026-11-22','Armonía I','ats.pdf','application/pdf']);
test('safety documents migration is repeatable, uses private storage and rejects anonymous access',async()=>{
 await db.exec('alter table storage.objects add column if not exists metadata jsonb; grant delete on storage.objects to authenticated');
 const sql=await readFile(new URL('../migrations/202611220024_safety_documents.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);
 for(const [name,id] of Object.entries(safetyUsers)){await db.query('insert into auth.users(id,email)values($1,$2)',[id,name+'@safety.invalid']);await db.query("update public.berry_profiles set enabled=$2,must_change_password=false,full_name=$3,role=$4,can_create_inspections=($4='admin'),can_receive_inspections=($4='admin') where id=$1",[id,name!=='disabled',name,name==='admin'?'admin':'inspector']);}
 assert.equal((await db.query("select public from storage.buckets where id='berry-safety-documents'")).rows[0].public,false);
 await denied(()=>as('anon',null,'select * from public.berry_safety_documents'));
 await denied(()=>as('anon',null,'select public.berry_safety_document_status()'));
 await denied(()=>safetyAs('disabled','select public.berry_safety_document_status()'));
});
test('workers cannot upload into another account folder or register a file that was not stored',async()=>{
 await denied(()=>safetyAs('other',"insert into storage.objects(bucket_id,name,metadata)values('berry-safety-documents',$1,$2)",[safetyPath,{size:100,mimetype:'application/pdf'}]));
 await assert.rejects(()=>safetySubmit(),e=>e.message.includes('FILE_NOT_STORED'));
 await safetyAs('worker',"insert into storage.objects(bucket_id,name,metadata)values('berry-safety-documents',$1,$2)",[safetyPath,{size:100,mimetype:'application/pdf'}]);
});
test('private document registration is idempotent and preserves server author identity',async()=>{
 const first=(await safetySubmit()).rows[0].value;const second=(await safetySubmit()).rows[0].value;
 assert.equal(first.owner_id,safetyUsers.worker);assert.equal(first.owner_name,'worker');assert.equal(first.status,'pending');assert.deepEqual(first,second);
 await denied(()=>safetyAs('worker',"update public.berry_safety_documents set status='approved' where id=$1",[safetyId]));
 await denied(()=>safetyAs('worker',"insert into public.berry_safety_documents(id)values(gen_random_uuid())"));
});
test('unrelated workers cannot read documents or files and cannot approve a document',async()=>{
 assert.equal((await safetyAs('other','select * from public.berry_safety_documents')).rows.length,0);
 assert.equal((await safetyAs('other',"select * from storage.objects where bucket_id='berry-safety-documents'")).rows.length,0);
 assert.equal((await safetyAs('worker','select * from public.berry_safety_documents')).rows.length,1);
 assert.equal((await safetyAs('admin','select * from public.berry_safety_documents')).rows.length,1);
 await denied(()=>safetyAs('worker',"select public.berry_review_safety_document($1,1,'approved','')",[safetyId]));
 await denied(()=>safetyAs('other','select public.berry_archive_safety_document($1,1)',[safetyId]));
});
test('administrative review requires a correction reason, guards concurrent changes and audits decisions',async()=>{
 await assert.rejects(()=>safetyAs('admin',"select public.berry_review_safety_document($1,1,'corrections','')",[safetyId]),e=>e.message.includes('REVIEW_NOTE_REQUIRED'));
 const value=(await safetyAs('admin',"select public.berry_review_safety_document($1,1,'corrections','Falta firma') value",[safetyId])).rows[0].value;
 assert.equal(value.revision,2);assert.equal(value.reviewer_id,safetyUsers.admin);
 await assert.rejects(()=>safetyAs('admin',"select public.berry_review_safety_document($1,1,'approved','')",[safetyId]),e=>e.code==='40001');
 await safetyAs('admin',"select public.berry_review_safety_document($1,2,'approved','Validado')",[safetyId]);
 assert.equal((await db.query("select count(*)::int n from public.berry_audit where entity_type='berry_safety_documents' and entity_id=$1",[safetyId])).rows[0].n,3);
});
test('approved and archived file bytes cannot be removed or overwritten by the uploader',async()=>{
 await denied(()=>safetyAs('worker','select public.berry_archive_safety_document($1,3)',[safetyId]));
 assert.equal((await safetyAs('worker',"delete from storage.objects where name=$1 returning id",[safetyPath])).rows.length,0);
 await safetyAs('admin','select public.berry_archive_safety_document($1,3)',[safetyId]);
 assert.equal((await safetyAs('worker','select * from public.berry_safety_documents')).rows.length,0);
 assert.equal((await safetyAs('worker',"delete from storage.objects where name=$1 returning id",[safetyPath])).rows.length,0);
});


test('document registration rejects forged MIME and size metadata even when the object exists',async()=>{
 const id='cc100000-0000-4000-8000-000000000002',path=safetyUsers.worker+'/'+id+'/documento.pdf';
 await db.query("insert into storage.objects(bucket_id,name,metadata)values('berry-safety-documents',$1,$2)",[path,{size:100,mimetype:'text/html'}]);
 await assert.rejects(()=>safetySubmit('worker',id),e=>e.message.includes('INVALID_FILE_METADATA'));
 await db.query('update storage.objects set metadata=$2 where name=$1',[path,{size:10485761,mimetype:'application/pdf'}]);
 await assert.rejects(()=>safetySubmit('worker',id),e=>e.message.includes('INVALID_FILE_METADATA'));
});
test('rehire history boundaries also hide private safety records and files and deny replayed submissions',async()=>{
 const id='cc100000-0000-4000-8000-000000000003',path=safetyUsers.worker+'/'+id+'/documento.pdf';
 await db.query("insert into storage.objects(bucket_id,name,metadata)values('berry-safety-documents',$1,$2)",[path,{size:100,mimetype:'application/pdf'}]);
 await safetySubmit('worker',id);
 await db.query("update public.berry_profiles set history_access_from=now()+interval '1 day' where id=$1",[safetyUsers.worker]);
 assert.equal((await safetyAs('worker','select * from public.berry_safety_documents')).rows.length,0);
 assert.equal((await safetyAs('worker',"select * from storage.objects where bucket_id='berry-safety-documents'")).rows.length,0);
 await denied(()=>safetySubmit('worker',id));await denied(()=>safetyAs('worker','select public.berry_archive_safety_document($1,1)',[id]));
 assert.equal((await safetyAs('admin','select * from public.berry_safety_documents')).rows.length,1);
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
