# Administración y cuentas de prueba

## Disponible ahora

La opción **Administración** aparece debajo de **Mis inspecciones** al usar la cuenta administradora de prueba. Tiene tres apartados:

- **Cuentas permitidas:** añadir nombre y correo, elegir uno de los dos roles básicos, editar el nombre y habilitar o desactivar cuentas. No permite duplicar correos. Los correos existentes se conservan como identidad de cada cuenta; el del administrador inicial se cambia en la configuración de compilación.
- **Inicio de sesión:** opción de Microsoft visible y desactivada. No hay redirecciones, peticiones a Microsoft ni comprobación de identidad durante las pruebas.
- **Funciones y permisos:** espacio preparado para definir permisos adicionales. Solo están modelados los roles de administración e inspecciones; no se inventa una matriz de permisos avanzados.

Cuentas iniciales, según lo confirmado por Brian:

| Nombre básico | Correo | Rol de prueba |
| --- | --- | --- |
| Bryan | bryx.96@gmail.com | Administrador |
| Bryan | bcespedes@hortifrut.com | Inspecciones |

Las dos están habilitadas y aparecen al buscar «Bryan» en responsables. Se distinguen por el correo. Las cuentas adicionales habilitadas también aparecen en ese directorio local.

## Probar ambas cuentas sin iniciar sesión

Abrir **Tu perfil → Cuenta de prueba** y seleccionar el correo. La selección persiste al recargar. La cuenta de inspecciones no muestra Administración. Cada cuenta dispone de su nombre, área y borradores propios dentro del navegador; los borradores anteriores sin propietario se conservan para la cuenta administradora inicial.

En el perfil, nombre completo y área se pueden completar, mientras que el correo procede de la cuenta y no se escribe manualmente. El área de perfil es distinta del área inspeccionada. Para evitar perder archivos a medio procesar, no se cambia de cuenta mientras se procesa una foto o se genera un Excel.

## Configuración del entorno

Variables **públicas y no secretas** de compilación:

```dotenv
VITE_DEMO_ADMIN_EMAIL=bryx.96@gmail.com
VITE_DEMO_ADMIN_NAME=Bryan
VITE_DEMO_INSPECTOR_EMAIL=bcespedes@hortifrut.com
VITE_DEMO_INSPECTOR_NAME=Bryan
```

Para desarrollo pueden establecerse en el proceso de Vite o en un archivo `.env.local` ignorado por Git. Para la publicación automática, el flujo toma las variables de igual nombre de **GitHub → Settings → Secrets and variables → Actions → Variables**. Después de cambiarlas se debe ejecutar una compilación/publicación; cambiar una variable solo en el entorno de este chat no modifica por sí solo la web que compila GitHub Actions.

Si no se proporcionan variables, se usan las dos cuentas anteriores. El correo y rol de las cuentas iniciales se resuelven de la configuración en cada carga, manteniendo identificadores estables para conservar sus borradores. Los nombres configurados son los valores iniciales; después de completar el perfil se conserva el nombre del perfil de ese navegador. Correos inválidos o iguales en ambas cuentas muestran un error de configuración.

## Alcance local de las pruebas

Las cuentas nuevas se guardan en `localStorage` del navegador y los informes en IndexedDB con su propietario de prueba. No se crean identidades en Microsoft, no se envían invitaciones y no se sincronizan las cuentas creadas con otros dispositivos. No se publica un directorio completo de usuarios nuevos en archivos estáticos.

El directorio ofrece las cuentas locales habilitadas. Si se configura `VITE_DIRECTORY_URL`, consulta además ese directorio, con deduplicación de identificadores/correos. El conector remoto sigue siendo opcional y no convierte las cuentas de prueba en cuentas autenticadas.

**Los roles actuales son una simulación para pruebas, no una barrera de seguridad.** Cualquiera que abra esta demostración puede elegir una cuenta de prueba. La separación de pantallas y borradores permite validar el recorrido, pero un navegador no puede proteger los datos contra alguien que modifique su almacenamiento o código.

## Antes de activar Microsoft

Pendiente: registrar la aplicación y sus redirecciones en Microsoft Entra, conectar la autenticación real, validar la identidad y los permisos en el servidor, guardar usuarios/invitaciones en la base de datos y exigir completar el perfil en el primer ingreso autenticado. La cuenta Gmail del administrador deberá ser una identidad Microsoft compatible o un invitado autorizado en el tenant que se elija. No se debe autenticar a nadie por el texto de un correo recibido del navegador.

No existe un interruptor que active una conexión real ya implementada: el botón visible es la opción preparada para esa integración futura, mantenida desactivada por petición del usuario. Los permisos adicionales se definirán con Brian antes de implementarse.
