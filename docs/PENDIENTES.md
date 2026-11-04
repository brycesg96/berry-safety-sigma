# Pendientes de Berry

Esta lista es la referencia de trabajo y se resumirá al cerrar cada avance. Se distinguen implementaciones de interfaz, referencias técnicas probadas e integraciones operativas. Una prueba local no equivale a un servicio conectado en la web.

## Implementado y disponible para pruebas

- [x] Código de inspección sin edición manual. El borrador muestra un código tentativo numérico, como `IH-2026-001`, con aviso de que puede variar según el orden de envío. No reserva correlativos.
- [x] Año según la fecha de aceptación del envío en Perú, con reinicio anual del correlativo y un mínimo de tres dígitos (después de 999 continúa 1000).
- [x] Referencia de base de datos con transacción, códigos únicos, archivo Excel y cola de envío guardados juntos; pruebas de concurrencia, reintentos, cambio de año y fallos. **No está conectada a la app.**
- [x] Retirar el texto y candado de Solo lectura del bloque del empleador, manteniendo sus datos sin edición y compactando espacios.
- [x] Reducir aproximadamente a la mitad la altura inicial del objetivo, conservando ancho y límite de 560 caracteres.
- [x] Retirar la explicación bajo el correo; se mantiene el relleno automático al seleccionar una cuenta.

- [x] Administración debajo de Mis inspecciones, con cuentas permitidas, opción Microsoft desactivada y espacio de funciones/permisos.
- [x] Dos cuentas locales Bryan: administrador `bryx.96@gmail.com` e inspector `bcespedes@hortifrut.com`, configurables en la compilación.
- [x] Directorio local de cuentas habilitadas: búsqueda por nombre, correo automático y altas, edición y desactivación desde Administración.
- [x] Cambio de cuenta de prueba sin login, correo de perfil no editable, área y nombre por cuenta, y borradores separados en el navegador.

- [x] Ejemplo de área con ubicación: «Ej. Taller de Maquinaria - Armonía 2».
- [x] Hora en 12 horas con selección AM/PM, ambas inicialmente vacías y obligatorias; migración de horas antiguas de 24 horas.
- [x] Mis inspecciones muestra el espacio del código definitivo, pendiente hasta recibir un registro confirmado del servidor.

- [x] Simplificar el mensaje inicial de observaciones y retirar «Las fotos son opcionales» y la opción de inspección sin observaciones. Se requiere al menos una observación para continuar; los campos de cada hallazgo se conservan.

- [x] Observaciones compactas: textos junto a criticidad, Fecha de Cierre y fotos en pantallas amplias; distribución vertical en el teléfono.
- [x] La primera Fecha de Cierre se comparte una sola vez con todas las observaciones y se conserva como fecha inicial para nuevas observaciones. Los cambios posteriores son individuales y persisten al recargar. Los borradores antiguos conservan sus fechas.

- [x] Inspecciones recibidas después de Mis inspecciones: entrega local entre las cuentas destinatarias, levantamientos con acción, responsable, Estado y Fecha de Cierre, fotos separadas y guardado de avances.
- [x] Revisión por el autor, solicitud de ajustes y cierre solo al quedar todos los estados aprobados en Ejecutado. Contadores/filtros Inspecciones a revisar e Inspecciones cerradas. Descargar un informe no lo cierra.
- [x] Protección local contra sobrescritura o eliminación del informe enviado y rechazo de revisiones obsoletas. Exportación provisional con datos y evidencias del levantamiento. [Guía de prueba y límites](SEGUIMIENTO.md).

- [x] Realizado por admite hasta tres personas: usuario autor con nombre/correo bloqueados y hasta dos inspectores adicionales del directorio, sin duplicados. Se conservan en el borrador, la revisión, el seguimiento y la descarga provisional del Excel. Los datos del autor se actualizan desde su perfil en los borradores; los informes enviados conservan su autor original.

- [x] Vista de levantamiento más compacta: textos y responsable junto a fecha, estado y evidencias; márgenes y cuadros reducidos, con distribución vertical en teléfonos.

- [x] Inspecciones recibidas separadas mediante botones Pendientes y Cerradas. El número del menú cuenta solo las recibidas sin cerrar y desaparece al quedar en cero.

- [x] Código compacto junto a Información general con ayuda emergente; DATOS DEL EMPLEADOR desplegable y contraído por defecto; OBJETIVO DE LA INSPECCIÓN INTERNA como sección con icono y divisores.

- [x] Etiqueta N° REGISTRO: encima del código, con estilo discreto y compacto.

- [x] Cargo editable en el perfil y leyenda Área — Cargo bajo las personas seleccionadas del directorio, con compatibilidad para perfiles antiguos y datos incompletos.

- [x] Añadir hasta dos inspectores adicionales desde Responsable de la inspección en el primer paso, sincronizados con Realizado por y con validación del equipo al continuar.

- [x] Resumen de observaciones en dos columnas de tarjetas compactas cuando hay ancho suficiente y una columna en teléfonos; sin recortar textos ni perder acceso a fotos y edición.

- [x] Cierre con descripción de causas primero y conclusiones/recomendaciones en un solo campo, ambos compactos y con máximo 1200 caracteres. Migración de textos antiguos sin recortes.
- [x] RESPONSABLE DEL REGISTRO con nombre, cargo, fecha y firma adjunta por imagen para hasta tres personas, conservados en revisión y exportación provisional. Firma y cargo no se inventan; la firma no se genera automáticamente.

- [x] RESULTADO DE LA INSPECCIÓN con etiquetas Descripción, Acción a tomar y Nivel de riesgo.
- [x] Editor básico de evidencias del borrador: recorte, flechas y círculos, selección de color/grosor, movimiento, tamaño con puntos y botones, deshacer y restaurar original. Guarda imagen editada y conserva original y marcas para reabrir; los informes enviados siguen sin edición.

- [x] No crear borradores al abrir una inspección vacía: se ignoran fecha/usuario automáticos y filas vacías. El guardado inicia con contenido ingresado; si se vacía un borrador en edición, se retira de la lista. Los registros anteriores no se eliminan de forma masiva.

- [x] El número del menú Mis inspecciones cuenta únicamente Inspecciones a revisar y se oculta cuando ese contador está en cero.

- [x] Revisar arquitectura y preparar API servidor de prueba para Make, con secreto solo en servidor, clave de acceso, CORS, JSON ficticio, sin correos reales y con estados de aceptación/rechazo/recepción no confirmada.
- [x] Administración → Integraciones, configuración de despliegue Render y pruebas sin afectar inspecciones existentes. [Guía y resultado real](MAKE.md).
- [x] Webhook confirmado: tras el rechazo HTTP 410 inicial, una nueva prueba autorizada el 4 de noviembre de 2026 recibió HTTP 200 de Make, con datos ficticios y `send_email:false`. Confirma aceptación HTTP, no ejecución completa del escenario ni entrega de correo.
- [x] Botón temporal «Probar conexión con Make» y guía de configuración segura de `MAKE_WEBHOOK_URL`, adaptados al escenario con Outlook y filtro para excluir pruebas.
- [ ] Confirmar el filtro de Make antes de Outlook (`send_email = true` Y `mode != test`) antes de repetir una prueba real con el escenario actualizado.
- [x] Backend Render creado en `https://berry-safety-api.onrender.com`: health HTTP 200 y CORS HTTP 204 verificados; endpoint público configurado para la publicación de Pages.
- [ ] Confirmar filtro de Outlook y secretos en Render; habilitar `MAKE_TEST_ENABLED=true` y comprobar la prueba autenticada desde la web pública. Health y CORS no verifican los secretos ni el envío.

## Pendientes operativos, por orden de dependencia

1. [ ] Elegir y conectar el sistema de automatización y la base de datos real. Confirmar alojamiento y credenciales mediante configuración segura, sin claves en el navegador.
2. [ ] Microsoft real: registrar la aplicación, conectar el inicio de sesión y aplicar en el servidor la lista de cuentas habilitadas. Las altas y perfiles actuales son locales de prueba; completar el perfil en el primer ingreso autenticado sigue pendiente.
3. [ ] Sincronizar cuentas, perfiles y directorio con la base de datos real entre dispositivos. Las dos cuentas solicitadas ya aparecen en la demostración, pero no representan identidades verificadas por Microsoft.
4. [ ] Integrar el registro de envío autenticado: validar los datos, asignar el código una sola vez, generar el Excel con ese código y guardar ambos en la misma operación. La referencia transaccional está probada; el servicio real sigue pendiente.
5. [ ] Recuperar e incorporar la exportación sobre el Excel proporcionado y revisar los apartados segundo y tercero. El código actual conserva todavía el exportador genérico provisional; no se debe confundir con la adaptación completa anterior.
6. [ ] Conectar almacenamiento compartido y evidencias para retomar inspecciones entre dispositivos. Los borradores actuales permanecen en cada navegador.
7. [ ] Conectar el envío de correo y el seguimiento de entrega, con reintentos sin duplicados. Aceptar y registrar una inspección no significa que el correo ya fue entregado.
8. [ ] Conectar entregas y levantamientos al backend autenticado: permisos por destinatario y revisor, auditoría y versiones, avisos, sincronización entre dispositivos y resolución de concurrencia del servidor. El flujo actual es una demostración en el mismo navegador.
9. [ ] Definir con Brian los permisos adicionales del apartado Administración.
10. [ ] Revisar con Brian el informe final, las firmas, las reglas de acceso y la conservación de documentos antes del uso operativo.

## Regla de numeración acordada

`IH-2026-001`, `IH-2026-002`, …; al comenzar 2027: `IH-2027-001`.

Los borradores y las descargas de prueba no consumen correlativos. El primer envío válido confirmado por la base de datos recibe el siguiente número disponible. Dos informes distintos simultáneos reciben números distintos. Repetir el mismo envío por un doble clic o un corte de conexión devuelve el mismo código; no crea un segundo informe. Un envío rechazado o un Excel que no pudo guardarse no consume un número. Una inspección aceptada conserva para siempre su código, aunque se reintente después de Año Nuevo.
