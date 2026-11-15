import { readFile, writeFile } from 'node:fs/promises';
const files = ['202611150013_organization.sql', '202611150014_organization_catalog.sql', '202611150015_account_identity.sql'];
const heading = '-- Berry Safety: activar Gerencia/Área/Puesto, Gestión de Áreas y recuperación de cuentas.\n-- Ejecutar en SQL Editor de Supabase sobre el proyecto con los pasos 1–12 instalados.\n-- No elimina informes, archivos ni cuentas. Cada paso es una transacción y conserva cambios administrativos al repetirse.\n\n';
const chunks = await Promise.all(files.map(async file => `-- ===== ${file} =====\n${await readFile(new URL('../supabase/migrations/' + file, import.meta.url), 'utf8')}\n`));
const target = new URL('../supabase/operations/activate-20261115.sql', import.meta.url);
await writeFile(target, (heading + chunks.join('\n')).trimEnd() + '\n');
console.log('Preparado: supabase/operations/activate-20261115.sql');
