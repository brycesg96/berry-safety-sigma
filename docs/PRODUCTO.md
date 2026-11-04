# Alcance de Berry

## Objetivo

Agilizar las inspecciones de instalaciones y actividades SST desde el teléfono y la laptop, con una experiencia seria, clara y fácil de usar en campo. No requiere APK ni instalación.

## Estructura del registro

El modelo tipado de `src/model.ts` mantiene los datos de una inspección: datos generales, responsables, observaciones con fotografías, conclusiones, recomendaciones e inspector. Cada registro, responsable, observación y fotografía tiene un identificador independiente. La primera Fecha de Cierre elegida por el inspector se aplica a todas las observaciones existentes y se usa al añadir nuevas. Los cambios posteriores afectan solo a la observación editada; la fecha inicial permanece guardada en el borrador.

El progreso del asistente indica la posición del recorrido, no una evaluación de cumplimiento normativo ni del riesgo total de la instalación. La criticidad de cada hallazgo la selecciona el inspector.

## Próxima etapa: plantilla y automatización

Para adaptar la exportación, se necesita la plantilla Excel oficial y la correspondencia entre los campos y sus celdas, incluyendo cómo se repiten las observaciones y dónde se insertan las fotografías. El informe actual es provisional y lo identifica dentro del archivo.

La integración de envío necesita definir el servicio de automatización, su contrato de entrada y la autenticación. La solución de producción debe recibir el informe a través de un backend autenticado, almacenar sus fotografías y generar el archivo con la plantilla oficial. Los secretos de la automatización deben permanecer en el servidor, fuera del código del navegador.

El contrato de envío debe incluir un identificador de inspección para evitar duplicados, los correos de los responsables, los datos del registro y el archivo generado o una referencia segura al mismo. Una confirmación de recepción de la automatización no equivale a una confirmación de entrega de correo: se deben conservar por separado los estados preparado, en proceso, enviado y fallido.

## Pendientes antes de uso multiusuario

- Inicio de sesión, nombre completo real del usuario y permisos por empresa.
- Base de datos y almacenamiento de evidencias con sincronización entre dispositivos.
- Plantilla Excel oficial y revisión del informe resultante.
- Envío autenticado y seguimiento de resultados de la automatización.
- Política de acceso, conservación, respaldo y eliminación de datos y fotografías.

La publicación de prueba se prepara mediante GitHub Pages. Su activación y los criterios para confirmar el enlace se describen en [PUBLICACION.md](PUBLICACION.md).
