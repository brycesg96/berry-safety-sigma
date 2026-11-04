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
