# Recuperación y reinicio del piloto

Son operaciones preparadas para el propietario. Crear estos archivos y pasar las pruebas locales no ejecuta cambios en el proyecto remoto. La cuenta real que se conserva es **bryx96@gmail.com**, sin punto; `bryx.96@gmail.com` pertenece al prototipo anterior.

## Recuperar la contraseña sin correo

Si Supabase limita temporalmente los correos, el propietario puede ejecutar el contenido completo de [restore-owner-access.sql](../supabase/operations/restore-owner-access.sql) en una consulta nueva de SQL Editor. No pegar el enlace del archivo.

El script actúa únicamente sobre el administrador confirmado y habilitado indicado arriba. Devuelve una contraseña aleatoria en la columna `temporary_password` del resultado: copiarla en privado, entrar a Berry y elegir una contraseña personal. No compartir ese resultado ni una captura. La contraseña no está escrita en el archivo SQL y no se envía por correo. Se revocan las sesiones anteriores y se exige cambiarla al ingresar. Cero filas significa que no encontró al administrador esperado y no modificó una cuenta distinta.

El correo integrado de Supabase Auth tiene un límite de 2 envíos por hora, además de la espera entre solicitudes. Un error 429 no permite conocer por sí solo cuál límite se alcanzó. Estos límites son diferentes de las cuotas de herramientas de ChatGPT. Los informes enviados mediante Make/Outlook siguen su propio servicio.

## Activar permisos y cierre de sesión

1. Si todavía no se instaló, ejecutar el contenido de [paso 4: archivo final](../supabase/migrations/202611080004_final_archive.sql). No repetir pasos antiguos sobre una versión posterior.
2. Ejecutar [paso 5: accesos independientes](../supabase/migrations/202611080005_access_controls.sql). Conserva cuentas, informes y números existentes. No realiza el reinicio.
3. En Render, desplegar el último commit de `main`, conservando las variables actuales. El navegador requiere también la nueva publicación de GitHub Pages.
4. Entrar con el administrador: Administración muestra Usuarios y Todas las inspecciones. Cada cuenta tiene dos interruptores independientes: Administrador e Inspecciones. Verde significa activado y rojo desactivado. Inspecciones habilita realizar y recibir inspecciones al mismo tiempo. Ambos accesos pueden activarse juntos. Administrador permite gestionar cuentas, accesos e inspecciones. Si una cuenta anterior tenía solo una de las dos funciones de inspección, se indica su acceso actual y se conserva hasta que el administrador cambie el interruptor.

Se puede modificar accesos, habilitar/deshabilitar y eliminar cuentas. Eliminar una cuenta retira su acceso y su aparición en la lista, conservando su identidad para la autoría histórica. El último administrador habilitado que ya cambió la contraseña está protegido; no se permite borrar ni deshabilitar la propia cuenta desde ella.

El administrador puede retirar inspecciones de cualquier autor. La eliminación normal es lógica: quedan ocultas, conservando datos de auditoría y el número reservado. Eliminar IH-2026-010 deja el hueco entre 009 y 011; no reduce el contador ni reutiliza 010. Esta función no vacía archivos de Storage.

En el espacio autenticado, Atrás o Cerrar sesión ofrecen confirmar la salida. Al confirmar, se guarda el borrador de inspección y se vuelve al ingreso con la sesión cerrada en ese dispositivo. Un envío o archivo en proceso debe terminar primero. Guardar los avances de levantamiento antes de salir. **Recordar mi cuenta** conserva solo el correo; el navegador puede completar la contraseña mediante su gestor. La aplicación no almacena la contraseña para este recordatorio. Cerrar una pestaña o terminar el proceso desde el sistema no garantiza que el navegador ejecute código de cierre de sesión; la confirmación nativa de salida depende del navegador.

La página principal abre el ingreso real. El espacio antiguo solo permanece accesible mediante `?modo=prueba`, sin migrar identidades ni informes locales a Supabase.

## Reinicio excepcional desde 001, autorizado por el propietario

Este reinicio es la excepción solicitada a la regla de conservar correlativos. Es destructivo y deja una sola cuenta real, ninguna inspección y el siguiente registro desde 001. Conservar una copia si se desea recuperar alguna prueba anterior. Cerrar las sesiones/pestañas de otros dispositivos mientras se realiza.

1. En Supabase → Storage, abrir `berry-evidence` y usar **Empty bucket**. Hacer lo mismo en `berry-documents`. Conservar ambos buckets y sus reglas. No borrar filas de `storage.objects` con SQL: eso deja archivos físicos huérfanos.
2. Ejecutar una sola vez el contenido de [reset-pilot.sql](../supabase/operations/reset-pilot.sql) en SQL Editor.
3. El resultado debe mostrar `cuentas_conservadas = 1`, `propietario = bryx96@gmail.com` e `inspecciones = 0`. Volver a iniciar sesión; el script conserva la contraseña actual del propietario y revoca las sesiones anteriores.

El SQL se detiene antes de borrar registros si no encuentra al propietario esperado o todavía quedan objetos en esos buckets. Retira las otras identidades de Auth, documentos, inspecciones, asignaciones, levantamientos, auditoría de prueba, textos compartidos y contadores del piloto. Una guarda impide repetirlo y borrar trabajo nuevo. Se retiran los UUID antiguos para que un borrador pendiente en otro dispositivo no reaparezca después del reinicio; la aplicación actualizada elimina esas copias pendientes al consultarlas.

Las pruebas automatizadas usan contratos mínimos de Auth/Storage y datos ficticios en PostgreSQL embebido. No cambian contraseñas, no vacían buckets, no borran datos remotos ni envían correos reales.

## Comprobaciones de esta entrega

Pasaron la compilación de Pages, 28 comprobaciones de SQL, las 47 pruebas de la API y 22 pruebas de navegador seleccionadas sobre acceso, recuperación, administración, dos dispositivos, borradores, cierre completo y salida. El caso de salida con guardado fallido comprueba que no se cierre la sesión ni se pierda el borrador antes de reintentar. Los contratos simulados no sustituyen comprobar la activación en el proyecto real.
