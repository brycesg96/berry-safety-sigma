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

La publicación automática exige la compilación, las pruebas de API, SQL y scripts, las referencias Python y todos los recorridos del navegador. Los informes y el monitor posterior a la publicación se explican en [CALIDAD.md](CALIDAD.md).

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

El flujo ejecuta el monitor público después de publicar. Para una revisión manual, verificar el formulario en móvil y escritorio, las fotografías y la descarga de Excel sobre HTTPS. Los borradores del espacio de pruebas pertenecen a su navegador y dominio; las cuentas internas usan la sincronización de Supabase. La disponibilidad de las rutas de correo no confirma la entrega al buzón corporativo; véanse [ENVIO_INFORMES.md](ENVIO_INFORMES.md) y [PRODUCTIVIDAD.md](PRODUCTIVIDAD.md).
