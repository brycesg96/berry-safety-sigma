# Publicación web de prueba

Se preparó GitHub Pages para el repositorio `brycesg96/berry-safety-sigma`. Publicar el entorno de desarrollo no equivale a publicar esta web.

## Activación inicial

1. En GitHub, abrir **Settings → Pages** del repositorio.
2. En **Build and deployment → Source**, seleccionar **GitHub Actions**. No cambiar la visibilidad del repositorio para solucionar restricciones del plan: si GitHub Pages no está disponible para este repositorio, se debe elegir otro alojamiento con el propietario.
3. En **Actions**, abrir **Publicar Berry en GitHub Pages** y ejecutar **Run workflow** sobre `main`. Las siguientes actualizaciones de `main` se publican automáticamente.
4. Esperar a que los trabajos de compilación y publicación terminen correctamente. La URL confirmada aparece en el resultado del trabajo de publicación y en el entorno `github-pages`.

La dirección prevista es `https://brycesg96.github.io/berry-safety-sigma/`. No debe presentarse como disponible hasta comprobar una publicación correcta y abrir el formulario en esa dirección.

No se necesitan claves de alojamiento en el código: el flujo usa el token temporal de GitHub Actions con permisos limitados a leer el repositorio y publicar Pages.

## Validación antes de subir

```bash
npm run build:pages
npm run preview:pages -- --port 5174 --strictPort
```

En otra terminal, para ejecutar las pruebas sobre los archivos compilados:

```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:5174/berry-safety-sigma/ npm test
```

El prefijo `/berry-safety-sigma/` se establece durante la compilación. La configuración de desarrollo y la compilación genérica siguen usando la raíz del alojamiento.

## Después de publicar

Verificar el formulario en móvil y escritorio, las fotografías y la descarga de Excel sobre HTTPS. Los borradores pertenecen al navegador y al dominio donde fueron creados; no se transfieren desde el entorno de desarrollo ni se sincronizan entre dispositivos. El correo y la plantilla Excel oficial continúan pendientes de integración.
