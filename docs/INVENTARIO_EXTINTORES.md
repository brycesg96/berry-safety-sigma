# Inventario de extintores · Paso 31

El inventario separa la **gerencia responsable** de la **gerencia y área usuarias**. La primera conserva la referencia del consolidado; las usuarias se completan en campo desde ¡Yo Reviso! y se guardan únicamente al terminar una inspección con firma. No se deducen a partir del propietario.

## Preparación privada

`scripts/prepare-emergency-import.py` lee el consolidado de 32 columnas y el catálogo vigente de gerencias. Requiere Python y `openpyxl`. No conecta con la base ni modifica el archivo original. La salida debe estar fuera del repositorio, porque contiene información real de equipos y antecedentes.

```sh
python3 scripts/prepare-emergency-import.py /ruta/consolidado.xlsx \
  --catalog /ruta/catalogo.json --output /ruta/privada/confirmado \
  --exclude T9J-834 A11773
```

El catálogo JSON tiene la propiedad `catalog` con las gerencias vigentes (`id`, `name`). Las coincidencias desconocidas conservan el nombre original sin inventar un vínculo. Las exclusiones se aplican por código y serie juntos; un código duplicado sin resolver detiene la preparación.

La columna **H** es la última inspección oficial. **Noviembre** repite H, incluso si corresponde a otro mes o está vacía. Enero a octubre conservan su información y sus años. Los años de fabricación y prueba hidrostática no se convierten en fechas ficticias; los valores inválidos quedan disponibles en el antecedente original. Los registros identificados como PRUEBA permanecen deshabilitados para revisión.

La preparación produce el Excel confirmado, el JSON de carga, las decisiones y cambios de Noviembre, y `31-cargar-extintores.sql`. El original se conserva aparte como respaldo.

## Activación en Supabase

Requiere las migraciones anteriores hasta el paso 30. El SQL privado generado incluye `supabase/migrations/202611270031_emergency_inventory.sql` y la carga real. Ejecutarlo completo en **Supabase → SQL Editor**, con el rol propietario de la base. La carga privada no se concede a las claves públicas ni a las cuentas de la aplicación.

El último resultado devuelve `yo_reviso_version: 202611270031`, la cantidad `extintores_importados` y `noviembre_igual_a_h: true`. La carga es atómica y repetible: repetir el mismo lote no duplica equipos ni reemplaza asignaciones o inspecciones nuevas. Si un código ya tiene una ficha nativa, se conserva y se incorpora su antecedente por separado.

No subir el SQL real, el Excel ni los JSON privados a GitHub, Pages o los assets de la app. El repositorio contiene únicamente el esquema, el preparador y datos ficticios de prueba.

## Consulta e inspección

La búsqueda admite diferencias de mayúsculas, espacios y guiones en el código completo. Devuelve la ficha técnica y la última fecha/condición: para el antecedente importado se utiliza H, nunca el máximo de los meses. Una inspección nueva conserva su propio responsable, firma, fotos y ficha capturada.

Cuando falta la asignación usuaria, el formulario permite seleccionar gerencia y área del catálogo vigente; también solicita la ubicación si falta. Se confirma junto con la inspección firmada. No cambia la gerencia responsable ni permite reemplazar una asignación conocida desde el recorrido público.

Las cuentas autorizadas pueden desplegar **Datos de la base anterior** según su gerencia y límite de historial. Los códigos de inspectores antiguos, notas, meses y filas originales no se exponen en el recorrido sin cuenta. Las referencias personales de ubicación de vehículos quedan disponibles en la consulta privada; el acceso público muestra tipo de unidad y código.

La app sigue siendo compatible con el paso 30 mientras se ejecuta la carga privada. Las opciones de inventario se habilitan al detectar el paso 31.

## Verificación

`python3 -m unittest discover -s reference -p 'test_emergency_import.py'` verifica exclusiones, duplicados, H/Noviembre y conservación de datos. `npm run test:supabase` comprueba la importación, las políticas, la asignación firmada y los reintentos en PostgreSQL. `npx playwright test tests/emergency-inspections.spec.ts` recorre la interfaz en móvil, tablet y escritorio con datos ficticios.
