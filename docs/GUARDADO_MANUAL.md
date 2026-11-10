# Guardado manual

Las inspecciones se conservan al pulsar **Guardar**, sin salir del formulario. Los levantamientos se conservan con **Guardar avance**, por observación. Escribir, cambiar de paso, adjuntar evidencias o editar una foto no guarda la inspección por su cuenta.

La interfaz indica **Cambios sin guardar** y bloquea la salida hacia otra sección, cuenta o cierre de sesión hasta guardar. El cierre de sesión ofrece **Salir sin guardar** con una advertencia explícita; esa opción descarta los cambios que solo están en pantalla y conserva los datos ya guardados. Al cerrar o recargar una pestaña con cambios pendientes, el navegador solicita confirmación; si se acepta salir sin guardar, esos cambios pueden perderse. Al confirmar **Enviar inspección**, se guarda el contenido actual y después se registra y envía el informe a sus responsables, con Excel adjunto al correo. Si falla el guardado, no se inicia el envío. Los levantamientos conservan **Guardar avance** antes de enviar a revisión.

Un guardado fallido no se muestra como confirmado. El formulario permanece abierto; los borradores de inspección pendientes que ya estaban en la caché de recuperación se conservan y requieren un nuevo guardado explícito. Los cambios escritos mientras se procesa Guardar siguen pendientes y exigen pulsar Guardar otra vez. No hay reintentos de escritura mediante temporizadores. Las peticiones a Supabase, incluidas las evidencias, se interrumpen a los 30 segundos si no responden; la interfaz deja de indicar Guardando y conserva la edición como pendiente. Un tiempo agotado no confirma si el servidor llegó a aplicar la operación: se puede consultar la versión guardada antes de reintentar.

Enviar, aprobar, solicitar ajustes, guardar el estado y completar el archivo final continúan siendo acciones explícitas del flujo existente. Consultar listas o abrir informes no inicia guardados del formulario ni del Excel final.

Este cambio no modifica el esquema, los permisos, la asignación transaccional de códigos ni los borradores e inspecciones existentes. No requiere ejecutar SQL. La revisión integral de estabilidad y rendimiento queda pendiente.
