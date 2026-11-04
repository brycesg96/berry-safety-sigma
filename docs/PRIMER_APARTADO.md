# Primer apartado: datos de la inspección

Esta actualización se limita al primer apartado. Los pasos posteriores y la exportación genérica existente continúan como base para las siguientes revisiones; no se afirma que se haya recuperado la adaptación anterior del Excel completo.

## Información fija

El bloque de empleador muestra razón social, RUC, domicilio, actividad económica y número de trabajadores del formato recibido. No contiene entradas editables. La revisión y la exportación toman estos valores desde `src/employer.ts`, nunca desde los datos editables del borrador.

Los valores de empresa guardados en borradores antiguos no se borran, pero no reemplazan el bloque fijo al revisar o exportar.

## Información editable

- Área inspeccionada con ejemplo de instalación y ubicación («Ej. Taller de Maquinaria - Armonía 2»), fecha, responsable de la inspección y hora de 12 horas con AM/PM. El código ya no se escribe: se asignará de forma única al registrar el envío; véase [CODIGOS_INSPECCION.md](CODIGOS_INSPECCION.md).
- Tipo: Planeada, No planeada u Otro. Se selecciona una opción. Otro habilita un campo de detalle obligatorio; al cambiar de opción se conserva el texto, pero no se exporta mientras Otro no esté seleccionado.
- Objetivo de hasta 560 caracteres, con contador y validación antes de continuar y antes de exportar. Los objetivos antiguos más largos se conservan completos para que la persona los revise, sin recortes automáticos.

La hora y el período comienzan vacíos. Se exige una hora de 01:00 a 12:59 y elegir AM o PM antes de continuar. La revisión y el Excel incluyen el período. Los borradores antiguos que guardaban hora de 24 horas se convierten sin perder el momento: 00:05 pasa a 12:05 AM y 23:59 a 11:59 PM. Un campo nuevo todavía sin período no se completa automáticamente al recargar.

## Responsables

El usuario escribe al menos dos letras del nombre y selecciona un resultado del directorio de cuentas habilitadas por el administrador. Se guarda el identificador de la persona junto a la instantánea de su nombre y correo. El correo aparece automáticamente y es de solo lectura.

Editar el nombre después de seleccionar una persona borra la selección y el correo anterior. Escribir un nombre sin seleccionar un resultado no habilita la continuación. Los homónimos se distinguen por sus correos y sus identificadores. Las personas ya añadidas no vuelven a ofrecerse en otra fila.

### Conexión pendiente

El modo de prueba ya incluye el directorio local de las dos cuentas solicitadas por el usuario y las cuentas que se añadan desde Administración. No hay autenticación real ni sincronización de cuentas entre dispositivos. Véase [ADMINISTRACION.md](ADMINISTRACION.md).

El buscador se conecta mediante la variable de compilación no secreta `VITE_DIRECTORY_URL`. Ejemplo de configuración para un backend que sirva el directorio en el mismo dominio:

```bash
VITE_DIRECTORY_URL=/api/people npm run build:pages
```

El frontend realiza un GET a ese endpoint con `search=<texto>`, acepta JSON y usa las credenciales de sesión mediante cookies. Si el backend está en otro dominio, necesita HTTPS y CORS configurado para el origen de la app y sus credenciales. Nunca poner tokens o secretos en variables `VITE_*`.

Contrato de respuesta:

```json
{
  "people": [
    { "id": "identificador-estable", "name": "Nombre completo de la cuenta", "email": "correo-asignado-a-la-cuenta" }
  ]
}
```

Los datos del ejemplo describen el contrato y no son una lista de usuarios. El servicio debe autenticar la sesión, devolver únicamente cuentas activas y autorizadas de la empresa, buscar por nombre y revalidar identificadores y correos en el servidor al guardar o enviar la inspección. La selección y el almacenamiento local del frontend no sustituyen esas comprobaciones.

Sin endpoint configurado se usan las cuentas locales habilitadas de prueba. Ante error, hay una opción de reintento; si no hay coincidencias, se informa sin permitir escribir un correo alternativo. En las pruebas se intercepta la API con identidades ficticias que solo existen en `tests/directory-fixture.ts`.

## Persistencia y publicación

Los borradores siguen en IndexedDB. Se añaden los nuevos campos al cargar borradores anteriores sin descartar sus textos o fotografías. El tipo antiguo de inspección se conserva como referencia en `legacyType` y se pide elegir uno de los tres tipos nuevos.

Esta actualización no publica la web ni modifica la configuración de GitHub Pages. Para usarlo como control de acceso real y compartir las altas entre dispositivos sigue siendo necesario conectar Microsoft y el servicio de cuentas del administrador.
