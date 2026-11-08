# Código definitivo de inspección

Formato: `IH-{año de registro en America/Lima}-{secuencia anual con un mínimo de tres dígitos}`. Empieza en `IH-2026-001`, sigue `002`, `003` y al cambiar el año de registro reinicia en `IH-2027-001`. La secuencia 1000 no se recorta.

## Registro compartido preparado

La tercera migración y `/api/reports/send` implementan la numeración para el espacio autenticado. [Activación y límites](SUPABASE.md#tercera-etapa-espacio-de-trabajo-compartido-y-archivo-mensual). Requieren ejecutar el script 3 y desplegar Render; la instalación remota de esa etapa aún debe confirmarse.

El navegador envía el UUID estable de la inspección y su revisión, con la sesión real y el Excel sin código definitivo. Supabase valida autoría, datos y destinatarios y bloquea el contador anual para reservar temporalmente el siguiente candidato. La reserva no consume un número. Render valida el ZIP y sus CRC, cambia únicamente B5, guarda el archivo privado y finaliza una transacción que incrementa el contador y confirma inspección, código único, documento, asignaciones y trabajo de correo juntos. El archivo debe existir antes de confirmar. No se mantienen bloqueos de base mientras se llama al correo.

La carpeta depende de la **fecha de inspección**, por decisión del propietario. Una inspección de noviembre enviada en diciembre se guarda en noviembre; el contador es anual, no mensual. Una inspección de 2026 registrada en 2027 conserva carpeta 2026 y código del registro 2027.

Si falla el guardado o la transacción, no se consume un número. Un reintento del mismo UUID conserva su código y archivo. Cambiar los bytes de un informe registrado genera conflicto. El correo se reclama una sola vez desde una cola persistente: su rechazo o resultado ambiguo no genera otro código ni un envío automático duplicado. Un código confirmado se conserva aunque se reintente después de Año Nuevo.

## Borradores y espacio de pruebas

El campo de Información general sigue mostrando una estimación, inicialmente 001; puede variar según el orden de registro. Los borradores y las descargas no consumen correlativos. El definitivo aparece después de la transacción, en Mis inspecciones, el seguimiento y el Excel archivado.

El prototipo local no reserva códigos oficiales. Los números manuales antiguos se conservan como `legacyRegistrationNumber` y no se presentan como definitivos. Los registros antiguos del navegador no se importan silenciosamente.

La interfaz reconoce el recibo `inspectionId`, `code`, `acceptedAt`, pero la validación de forma no sustituye al servidor: identidad, permisos y código oficial se comprueban en Supabase y Render.

## Pruebas

`npm run test:supabase` comprueba permisos, revisión, contador, reintentos, archivo antes de confirmar, meses, cambio anual en Perú y secuencia 1000. `npm run test:api` verifica que el archivo adjunto coincide byte por byte con el archivado y que B5 contiene el código confirmado. Se usan datos y proveedores ficticios; no se envían correos reales.

La referencia SQLite original permanece en `reference/registry.py`, con pruebas de concurrencia ejecutables mediante `python3 -m unittest discover -s reference -p 'test_*.py' -v`. No es la base operativa de la aplicación.
