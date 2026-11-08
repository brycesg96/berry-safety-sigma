# Administración de usuarios

## Gestión única con Supabase

Administración → Usuarios ofrece una única entrada: **Administrar usuarios**. Abre el portal autenticado y lleva directamente a la gestión real de usuarios cuando la cuenta tiene rol administrador. Si no existe sesión, solicita el correo y la contraseña y conserva ese destino después del acceso y al recargar.

El formulario de añadir cuentas locales, su lista con edición/activación y la pestaña duplicada de Inicio de sesión se retiraron el 8 de noviembre de 2026. Las altas nuevas se realizan únicamente en la gestión de Supabase. Las pestañas Funciones y permisos e Integraciones se conservan.

El portal permite crear y consultar usuarios reales, con nombre, correo, área, cargo, rol y correos en copia. La contraseña temporal es `0123456789` y el primer ingreso exige cambiarla. Correo, permisos y acceso se verifican con Auth y la base de datos; una cuenta de inspecciones no obtiene acceso administrativo por abrir el enlace de Usuarios. La edición de accesos y el restablecimiento de contraseñas de otros usuarios por el administrador permanecen como trabajo separado.

Acceso directo: `https://brycesg96.github.io/berry-safety-sigma/?acceso=cuenta&seccion=usuarios`.

Este ajuste de interfaz usa las rutas de cuentas existentes. No requiere SQL, nuevas variables ni otro despliegue de Render. [Gestión de cuentas, contraseña temporal y recuperación](USUARIOS.md).

## Datos del espacio de pruebas anterior

La retirada de la gestión local no borra cuentas, perfiles o inspecciones existentes del navegador ni crea cuentas remotas automáticamente. Sus identidades y borradores siguen disponibles en el espacio de pruebas para conservar el historial hasta preparar la importación revisable. El directorio local conserva los registros anteriores; el espacio autenticado consulta los usuarios habilitados reales.

El selector Tu perfil → Cuenta de prueba se mantiene para consultar esos datos históricos. Ese selector y los roles locales no autentican al usuario de Supabase. La cuenta real del propietario es `bryx96@gmail.com`; el correo de demostración anterior contiene un punto y corresponde a otra identidad.

Las variables públicas `VITE_DEMO_ADMIN_EMAIL`, `VITE_DEMO_ADMIN_NAME`, `VITE_DEMO_INSPECTOR_EMAIL` y `VITE_DEMO_INSPECTOR_NAME` siguen describiendo las identidades históricas del prototipo. No crean ni habilitan usuarios de Auth. Las cuentas nuevas deben registrarse desde Administrar usuarios con una sesión administradora real.

## Verificación

Las pruebas de interfaz comprueban la ausencia del formulario local, conservación del borrador y las cuentas previas, acceso al portal desde el botón único, restauración del destino al recargar y rechazo de la vista administrativa para inspectores. Las pruebas de altas y correo usan proveedores simulados; no crean usuarios ni envían mensajes reales.
