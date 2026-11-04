# Pendientes de Berry

Esta lista es la referencia de trabajo y se resumirá al cerrar cada avance. Se distinguen implementaciones de interfaz, referencias técnicas probadas e integraciones operativas. Una prueba local no equivale a un servicio conectado en la web.

## Implementado en este avance

- [x] Código de inspección sin edición manual. El borrador muestra `IH-AÑO-…`; `IH-2026-001` es un ejemplo del formato, no una reserva.
- [x] Año según la fecha de aceptación del envío en Perú, con reinicio anual del correlativo y un mínimo de tres dígitos (después de 999 continúa 1000).
- [x] Referencia de base de datos con transacción, códigos únicos, archivo Excel y cola de envío guardados juntos; pruebas de concurrencia, reintentos, cambio de año y fallos. **No está conectada a la app.**
- [x] Retirar el texto y candado de Solo lectura del bloque del empleador, manteniendo sus datos sin edición y compactando espacios.
- [x] Reducir aproximadamente a la mitad la altura inicial del objetivo, conservando ancho y límite de 560 caracteres.
- [x] Retirar la explicación bajo el correo; se mantiene el relleno automático al seleccionar una cuenta.

## Pendientes operativos, por orden de dependencia

1. [ ] Elegir y conectar el sistema de automatización y la base de datos real. Confirmar alojamiento y credenciales mediante configuración segura, sin claves en el navegador.
2. [ ] Cuentas reales: acceso por invitación del administrador, correo asignado no editable, primer ingreso con nombres completos y área. El perfil actual sigue siendo local.
3. [ ] Conectar el buscador de responsables con el directorio de esas cuentas. Actualmente está preparado y probado con datos simulados, sin personas reales disponibles.
4. [ ] Integrar el registro de envío autenticado: validar los datos, asignar el código una sola vez, generar el Excel con ese código y guardar ambos en la misma operación. La referencia transaccional está probada; el servicio real sigue pendiente.
5. [ ] Recuperar e incorporar la exportación sobre el Excel proporcionado y revisar los apartados segundo y tercero. El código actual conserva todavía el exportador genérico provisional; no se debe confundir con la adaptación completa anterior.
6. [ ] Conectar almacenamiento compartido y evidencias para retomar inspecciones entre dispositivos. Los borradores actuales permanecen en cada navegador.
7. [ ] Conectar el envío de correo y el seguimiento de entrega, con reintentos sin duplicados. Aceptar y registrar una inspección no significa que el correo ya fue entregado.
8. [ ] Revisar con Brian el informe final, las firmas, las reglas de acceso y la conservación de documentos antes del uso operativo.

## Regla de numeración acordada

`IH-2026-001`, `IH-2026-002`, …; al comenzar 2027: `IH-2027-001`.

Los borradores y las descargas de prueba no consumen correlativos. El primer envío válido confirmado por la base de datos recibe el siguiente número disponible. Dos informes distintos simultáneos reciben números distintos. Repetir el mismo envío por un doble clic o un corte de conexión devuelve el mismo código; no crea un segundo informe. Un envío rechazado o un Excel que no pudo guardarse no consume un número. Una inspección aceptada conserva para siempre su código, aunque se reintente después de Año Nuevo.
