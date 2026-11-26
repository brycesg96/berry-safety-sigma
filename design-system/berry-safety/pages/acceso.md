# Inicio y acceso

Extiende MASTER.md. Referencia visual: Teal Treasury facilitada por el propietario, adaptada al uso de seguridad ocupacional y al estilo Hortifrut.

En escritorio, bienvenida e ilustración de documentos a la izquierda, acceso con cuenta a la derecha y atajo «Ir a Yo Seguro». El formulario mantiene su h1 «Inicia sesión», campos, recuperación, gestor de contraseñas y recordatorio de correo existentes. El atajo abre exactamente la recepción pública existente.

La bienvenida ofrece el único botón de acceso público. El formulario de inicio de sesión no repite ese botón ni su bloque explicativo.

En teléfono la bienvenida se compacta y se oculta la ilustración para priorizar el acceso y el envío de documentos. No se cargan imágenes, fuentes ni recursos de terceros. Los formularios de recuperación, cambio de contraseña, perfil y administración mantienen su distribución propia.

La ilustración se marca decorativa. Solo ella recibe perspectiva y desplazamiento al hacer scroll, con GSAP y cancelación al desmontar, cambiar de tamaño o activar movimiento reducido. Si ese módulo no carga, la página queda completamente visible y operativa. No se muestran indicadores ni registros ficticios.

## Tarjeta de cristal adjuntada por el propietario

El acceso público adopta la composición y efectos de la referencia `sign-in-card-2`, conservando la paleta original solicitada: fondo crema `#f7f6f0`, cristal blanco cálido `#fffefb`, texto verde bosque `#183f32`, ayuda `#53664f`, foco `#287452` y acción principal verde con texto blanco. Los reflejos son salvia. Se conserva la bienvenida y su único acceso público a Yo Seguro; las pantallas autenticadas conservan MASTER.md.

Los componentes viven en `src/components/ui` y se integran mediante children con la autenticación existente. Framer Motion controla exclusivamente el aura decorativa; la tarjeta y los campos no se inclinan. El marco responde al mouse fino, se restablece al enfocar un control y se desactiva al reducir movimiento. Una línea luminosa recorre el borde una sola vez, durante tres segundos. No se añaden animaciones infinitas, servicios de fuentes o imágenes externas. Se aplicó la guía verificada de UI/UX Pro Max sobre autenticación accesible, gestores de contraseña y etiquetas de controles.
