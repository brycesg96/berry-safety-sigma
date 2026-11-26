# Tarjeta de inicio de sesión

Adaptación del componente `sign-in-card-2.tsx` adjuntado por el propietario. Se aplica al acceso público con correo y a la solicitud del enlace de recuperación. Conserva la bienvenida de Berry, el único acceso a Yo Seguro, las marcas oficiales y la autenticación existente con Supabase.

La superficie de cristal, los iconos de correo/contraseña, el marco luminoso y la composición proceden de la referencia. Por indicación del propietario se conserva la paleta original de Berry: fondo crema, superficie blanca, texto y acción verde bosque y reflejos salvia. El marco tiene una entrada luminosa breve y responde al puntero del mouse; los campos permanecen estables. Tocar la pantalla o activar movimiento reducido no inclina el marco. Las animaciones de GSAP de la plataforma y de Framer Motion en la decoración actúan sobre elementos distintos.

`src/components/ui/sign-in-card-2.tsx` exporta `SignInCard` y `SignInBackdrop`. La tarjeta recibe `active`, `busy` y `children`; `CloudAccess.tsx` conserva estados, validación, inicio de sesión, recordar únicamente el correo, recuperación, errores y las transiciones posteriores a la autenticación. El resto del espacio de trabajo mantiene sus componentes y distribución.

## Estructura y dependencias

Berry ya utiliza React, TypeScript, Vite, Framer Motion y Lucide. Los componentes de UI viven en `src/components/ui`, que corresponde a la carpeta `components/ui` de la referencia bajo la raíz del código fuente. Esta ubicación agrupa componentes visuales reutilizables y sus estilos, separados de las reglas de acceso y los datos de la aplicación. La adaptación usa importaciones relativas y CSS local en `sign-in-card-2.css`.

La referencia original utiliza Tailwind y `next/link`. En Berry los estilos equivalentes quedan limitados a `.berry-sign-in-page` y la navegación usa las acciones existentes del aplicativo. Las acciones de Google, registro y el envío simulado del ejemplo no se muestran: la tarjeta utiliza las funciones habilitadas de Berry.

Para usar el ejemplo original en un proyecto nuevo con su estructura Next.js/Tailwind/shadcn, los pasos son:

```bash
npx create-next-app@latest mi-app --typescript --tailwind --app --src-dir --import-alias '@/*'
cd mi-app
npx shadcn@latest init
npm install lucide-react framer-motion
```

Después se ubica el componente en `src/components/ui/sign-in-card-2.tsx` y se conecta su formulario a la autenticación del proyecto. Estos comandos describen el entorno del ejemplo original; no son pasos necesarios para ejecutar Berry.

## Accesibilidad y verificación

Se mantienen etiquetas visibles, autocomplete para gestores de contraseñas, pegado, botón accesible para mostrar la contraseña, foco visible, estados de envío y errores del servidor. Los controles tienen al menos 44 px de área táctil y los campos usan 16 px. Los reflejos son decorativos y no capturan interacciones. La superficie tiene un fondo legible aunque `backdrop-filter` no esté disponible.

Las pruebas de bienvenida y acceso comprueban recuperación, errores, recordar correo, sesiones, envío con Enter, estabilidad de los campos, zoom, movimiento reducido y su cambio en vivo, contraste con datos rellenados y acceso a Yo Seguro. El cambio no requiere SQL ni nuevas credenciales.
