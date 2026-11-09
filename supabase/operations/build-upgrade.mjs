import { readFile, writeFile } from 'node:fs/promises';
const steps = [
 ['202611080005_access_controls.sql', "to_regprocedure('berry_private.storage_filename(text)') is null"],
 ['202611080006_storage_names.sql', "public.berry_schema_status()->>'storage_version' is distinct from '202611080006'"],
 ['202611080007_dashboard.sql', "public.berry_schema_status()->>'dashboard_version' is distinct from '202611080007'"],
 ['202611090008_registration_participants.sql', "public.berry_schema_status()->>'registration_version' is distinct from '202611090008'"],
 ['202611090009_correction_identity.sql', "public.berry_schema_status()->>'correction_identity_version' is distinct from '202611090009'"],
 ['202611090010_admin_edit.sql', "public.berry_schema_status()->>'admin_edit_version' is distinct from '202611090010'"],
 ['202611090011_account_copies.sql', "public.berry_schema_status()->>'account_copies_version' is distinct from '202611090011'"],
 ['202611090012_next_registration.sql', "public.berry_schema_status()->>'next_registration_version' is distinct from '202611090012'"],
];
async function buildUpgrade(selected, start, heading) {
let sql = `-- Berry Safety: ${heading}.
-- Requiere el paso ${start - 1} ya instalado. Ejecutar como propietario en SQL Editor.
-- Conserva cuentas, inspecciones, archivos y numeración. No envía correos.
-- La operación es atómica; repetirla después de terminar no cambia datos.
DO $berry_upgrade$
BEGIN
`;
for (const [index, [file, condition]] of selected.entries()) {
 const source = (await readFile(new URL('../migrations/'+file, import.meta.url),'utf8')).replace(/^begin;\s*$/m,'').replace(/^commit;\s*$/m,'').replace(/^SELECT public\.berry_schema_status\(\);\s*$/m,'').trim();
 sql += ` IF ${condition} THEN\n  EXECUTE $berry_step${index+start}$\n${source}\n$berry_step${index+start}$;\n END IF;\n`;
}
return sql+`END $berry_upgrade$;\nSELECT public.berry_schema_status();\n`;
}
await writeFile(new URL('upgrade-workspace.sql',import.meta.url),await buildUpgrade(steps,5,'instalar las actualizaciones pendientes de los pasos 5 a 12'));
await writeFile(new URL('upgrade-registration-preview.sql',import.meta.url),await buildUpgrade(steps.slice(6),11,'actualizar desde el paso 10 con los pasos 11 y 12'));
