# Instalaciones de Fundo · Programa Anual 2026

Se utiliza el archivo **Programa Anual de Inspecciones Fundo 2026.xlsx** proporcionado por el usuario. Las hojas `Zona 1`, `Zona 2` y `Zona 3 ` son fuentes de información; las zonas del catálogo proceden exclusivamente de **G: Ubicación** y los nombres de instalación de **F: Puntos a inspeccionar**. Se excluyen las filas con **E: Instalación = Actividades Fundo**. Las notas del documento y su programación no son instrucciones para la plataforma ni entradas del catálogo.

La revisión produjo 186 filas candidatas, 178 puntos únicos, 18 actividades excluidas y 8 repeticiones unificadas dentro de su misma ubicación. El nombre original, la hoja y la fila de cada relación están en `reference/fundo-installations-import.json`, junto con el SHA-256 del archivo original.

| Ubicación / zona | Instalaciones únicas |
| --- | ---: |
| Armonía I | 14 |
| Armonía II | 42 |
| Armonía III | 11 |
| Armonía IV | 5 |
| Fundo | 3 |
| Exterior e Interior Fundo | 1 |
| Chao | 3 |
| Ilusión I | 20 |
| Remanso I | 17 |
| Remanso II | 9 |
| Esperanza I | 16 |
| Esperanza II | 18 |
| Esperanza III | 5 |
| San Luis | 3 |
| Tumi | 11 |
| **Total** | **178** |

Se conserva Ubicación aunque un punto mencione otra zona en su nombre. Por ejemplo, «Tratamiento de Agua (Ilusión II)» pertenece a **Ilusión I** según la columna G. Se añade **Chao bajo Fundo** sin mover ni mezclar el Chao existente de Exteriores. Los equipos de emergencia se mantienen porque su categoría no es Actividades Fundo. La zona Ilusión II existente no se elimina; continúa pendiente porque no figura como Ubicación en este archivo.

Los nombres tienen mayúsculas iniciales y tildes revisadas, con conectores en minúscula. Se mantienen siglas, números romanos, letras de módulos y unidades como m³. El nombre de una instalación se conserva literalmente al mostrarlo y editarlo, sin convertir A en una preposición ni m³ en M³.

## Activación

El [paso 21](../supabase/migrations/202611150021_fundo_installations.sql) requiere el paso 20. El [script de activación 20–21](../supabase/operations/activate-fundo-installations-20261115.sql) sirve para proyectos en el paso 19 o 20 y puede ejecutarse completo en SQL Editor. Después se debe recargar o volver a entrar a Berry Safety. No requiere cambios en Render.

La preparación y los controles son independientes por sede y por zona. Solo Fundo permite administrar instalaciones. Las quince zonas documentadas requieren seleccionar una instalación activa; las demás zonas y sedes conservan el comportamiento pendiente. Añadir la primera instalación a una zona nueva de Fundo la habilita para su selección. Retirar todas sus instalaciones exige que administración añada o restaure alguna antes de crear nuevas inspecciones en esa zona.

La importación conserva los identificadores existentes y el orden manual, normaliza únicamente el estilo de nombres equivalentes y no restaura elementos retirados. Las siguientes ejecuciones conservan los cambios del administrador, los retiros y las nuevas instalaciones. Los informes y perfiles históricos no se reescriben. Las inspecciones enviadas cuando la instalación aún estaba pendiente mantienen su ubicación original.

## Reproducibilidad

```bash
python3 -m pip install -r scripts/requirements-import.txt
python3 scripts/import-fundo-installations.py "/ruta/Programa Anual de Inspecciones Fundo 2026.xlsx"
python3 scripts/build-fundo-migration.py
python3 -m unittest reference.test_fundo_installations -v
npm run test:supabase
```

El primer comando de importación genera el catálogo, el informe de procedencia y una lista Excel para revisión. El generador SQL solo escribe archivos locales; no conecta con Supabase ni aplica cambios externos.
