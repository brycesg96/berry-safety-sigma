# Plantilla original del informe

Archivo proporcionado por el usuario el 5 de noviembre de 2026: `REGISTRO DE INSPECCIONES INTERNAS.xlsx`.

SHA-256: `bf3295c4ce4e86982ef7b344fd6d093f4bf2336249ae12b19739d37c0a98e892`. Tamaño original: 2807240 bytes.

## Estructura revisada

- Hojas: `V.01` y `Matriz de Valoracion`.
- Hoja principal: dimensión A1:P36, con área de impresión A1:L36.
- Papel A4, orientación vertical; escala 30 % en V.01 y 36 % en la matriz.
- Celdas combinadas: 73 en V.01 y 21 en la matriz.
- El archivo contiene 23 imágenes y un dibujo; hay configuraciones de impresora binarias que deben conservarse. No tiene vínculos externos.

## Requisitos recibidos

Utilizar el documento original como plantilla, conservar medidas de filas/columnas salvo la ampliación de firmas solicitada posteriormente, combinaciones, estilos, bordes, colores, imágenes fijas, márgenes y configuración de impresión. Descargar y enviar por correo el mismo archivo rellenado.

El usuario entregó una copia con instrucciones rojas y pidió explicar el mapeo antes de implementar el llenado. Tras revisar esa interpretación, el 6 de noviembre autorizó cambiar el generador. La hoja de valoración se conserva, salvo instrucciones expresas posteriores.

El archivo original sigue en los adjuntos del espacio de trabajo. La versión distribuida en `public/templates/inspection.xlsx` se obtiene con `scripts/prepare-inspection-template.py`: conserva la plantilla y el logotipo, retira las evidencias/datos de ejemplo (incluidas imágenes fuera del área de impresión), cadenas de ejemplo no utilizadas y metadatos personales de edición. El original poblado no se publica.

## Copia anotada y aclaración posterior

Archivo de instrucciones: `REGISTRO DE INSPECCIONES INTERNAS - copia.xlsx`, recibido el 5 de noviembre de 2026. Las instrucciones rojas son una referencia para rellenar el original limpio: no se imprimen ni se conservan como contenido del informe.

La aclaración posterior del usuario sustituye la petición de ampliar el ancho de las fotografías y la referencia a 550 píxeles: las imágenes pueden ser pequeñas y deben acomodarse dentro del recuadro, como en la plantilla original. Se conservan los anchos y las alturas originales de las observaciones. Las filas de responsables registrados se amplían según la solicitud posterior de firmas descrita más abajo. No se amplían columnas para que quepan fotografías ni se fija una altura de 550 píxeles.

## Mapeo leído para revisión con el usuario

Las referencias inferiores corresponden a la plantilla de cinco observaciones. Al insertar más observaciones, los apartados de cierre se desplazan completos y el área de impresión se extiende; sus posiciones no deben quedar codificadas como filas invariables.

### Datos generales

| Celdas | Contenido |
| --- | --- |
| B5:L6 | Número de registro de la inspección. No inventar un correlativo definitivo antes de su asignación real. |
| A9:C9 | Razón social fija del empleador. |
| D9:E9 | RUC fijo del empleador. |
| F9:H9 | Domicilio fijo del empleador. |
| I9:J9 | Actividad económica fija del empleador. |
| K9:L9 | Número de trabajadores fijo del empleador. |
| A11:C11 | Área inspeccionada indicada en el aplicativo. |
| D11:F11 | Fecha de inspección indicada en el aplicativo. |
| G11:I11 | Nombres de los responsables del área inspeccionada. |
| J11:L11 | Nombres de los inspectores participantes. |
| A14:C14 | Hora de inspección, con AM/PM. |
| D14:E14 | X cuando el tipo sea Planeada. |
| F14:H14 | X cuando el tipo sea No planeada. |
| I14:L14 | Texto introducido cuando se elija Otro. |
| A16:L17 | Objetivo de la inspección. |

### Observaciones y levantamientos

Cada observación ocupa un registro completo, comenzando en la fila 20, y conserva alineadas todas sus columnas. La plantilla contiene cinco registros, filas 20 a 24. Si son necesarios más, se insertan con el formato original antes del cierre. Los datos e imágenes de ejemplo se sustituyen por los de la inspección; las imágenes fijas de la plantilla se conservan.

| Celdas del primer registro | Contenido |
| --- | --- |
| A20:C20 | Descripción de la observación. |
| D20 | Hasta ocho fotografías de esa observación, pequeñas y distribuidas dentro de su recuadro, sin deformación ni mezcla con otras observaciones. |
| E20 | Nivel de riesgo de la app escrito exactamente como una opción del desplegable original: baja → Bajo, media → Medio, alta → Alto. Se conservan sus fórmulas y colores originales, sin añadir cálculos de la matriz. |
| F20 | Acción a tomar para esa observación. |
| G20:H20 | Inicialmente, nombre del primer responsable seleccionado como destinatario en el aplicativo, según la nota roja. No escribir su dirección de correo en este campo. |
| I20 | Pendiente en el informe inicial; estado guardado del levantamiento cuando se exporte una versión actualizada. |
| J20 | Fecha de cierre establecida para esa observación en el aplicativo. |
| K20:L20 | Fotografías aportadas al levantar esa observación, acomodadas dentro del recuadro y separadas de las evidencias iniciales. |

Los responsables adicionales seleccionados siguen siendo destinatarios del correo aunque aquí se muestre el primero. La nota identifica a este primer responsable como valor inicial; no exige sobrescribir la identidad del responsable de un levantamiento ya registrado.

### Cierre y firmas

| Celdas originales | Contenido |
| --- | --- |
| A26:L27 | Descripción de la causa ante resultados desfavorables. |
| A29:L30 | Conclusiones y recomendaciones. |
| A34:D34 | Nombre de la primera persona responsable del registro. |
| E34:G34 | Cargo de esa persona. |
| H34:I34 | Fecha correspondiente a esa persona. |
| J34:L34 | Firma de esa persona. |
| Filas 35 y 36 | Los mismos campos para las demás personas participantes. |

Conservar los encabezados y el apartado ADJUNTAR. Todas estas secciones bajan juntas cuando se insertan observaciones. Las firmas transparentes se insertan en su recuadro; PNG es el formato recomendado. Si se admite GIF, su representación en Excel será una imagen fija y debe conservar la transparencia.

## Generador implementado

- Generar el informe rellenando el archivo original limpio y conservando estilos, bordes, celdas combinadas, logotipos, medidas y configuración de impresión.
- Usar el mismo archivo generado para la descarga y el adjunto de correo.
- Mantener la hoja `Matriz de Valoracion` sin cambios.
- Nombre solicitado el 6 de noviembre, todavía modificable: `REG_INS_ÁREA INSPECCIONADA_DD.MM.AAAA.xlsx`. Se utiliza la fecha de inspección; el área va en mayúsculas y solo se sustituyen caracteres no válidos para nombres de archivo. Ejemplo: `REG_INS_TALLER DE MAQUINARIA_06.11.2026.xlsx`.
- `src/excel-template.ts` rellena el paquete OOXML con JSZip y conserva sin reserializar la matriz, los ajustes binarios de impresora, el tema y el logotipo. Copia registros adicionales antes del cierre, conserva el borde inferior y extiende las combinaciones y el área de impresión.
- Hasta ocho imágenes iniciales y ocho del levantamiento por observación, sin solaparse ni salir de sus recuadros. Se ajustan proporcionalmente y se reduce su resolución al tamaño de impresión. Las firmas se insertan como PNG transparente; la carga también admite GIF como imagen fija.
- Los desplegables y las fórmulas de color de la plantilla se conservan. Al añadir observaciones, se amplían sus rangos para incluir los nuevos registros; las fórmulas y sus estilos no se sustituyen. Riesgo usa exactamente las opciones originales Bajo, Medio y Alto.
- Sin registro central confirmado, B5 indica `PENDIENTE DE REGISTRO`; no se inventa un código definitivo.
- El navegador y la API comparten `shared/report-filename.mjs`. El generador produce bytes reproducibles: una inspección sin cambios se descarga con los mismos bytes que su adjunto. Cambiar el nombre del adjunto en producción requiere actualizar el backend Render.
- Pruebas: informes de una, cinco y siete observaciones; celdas generales, marcas de tipo, cierres desplazados, tamaños originales, ocho fotografías, firmas transparentes, hoja de valoración y partes de impresión conservadas, más recorrido de descarga/envío con comparación de bytes. No se envían correos reales en las pruebas.
- Ejemplo con textos e ilustraciones ficticios: `public/examples/REG_INS_TALLER DE MAQUINARIA_06.11.2026.xlsx`. Incluye fotografías de ejemplo y un levantamiento para revisar ambos recuadros. Comprobado también con un lector independiente: dos hojas, 18 imágenes y firma PNG con transparencia real.

- Al registrar levantamientos, la celda F conserva la medida original y añade «Acción realizada» y, cuando exista, «Observación del revisor». El cierre completo genera ese Excel final y el paso 4 de Supabase sustituye el inicial por ese único archivo alojado. Responsable, fecha, estado y fotografías del levantamiento permanecen en sus posiciones de la plantilla.


## Firma en pantalla y ampliación autorizada

El 8 de noviembre el propietario solicitó **Firmar en pantalla**, disponible junto a Adjuntar firma. Permite registrar trazos con mouse, dedo o lápiz táctil, deshacer y limpiar antes de guardar. Se conserva como PNG transparente, con el margen vacío recortado, y sigue el mismo guardado de borrador, sincronización y generación del informe que una firma adjunta.

El campo de fecha ocupa menos ancho para dejar espacio a ambos botones. La firma tiene una vista previa ampliada. En cada Excel nuevo, la altura de las filas de los responsables registrados pasa de 35,1 a 105,3 puntos. Las filas de responsables vacías mantienen su altura original en Excel y se omiten al generar el PDF cerrado para evitar páginas adicionales vacías. Las firmas se ajustan proporcionalmente y se insertan como imágenes flotantes de DrawingML sobre la cuadrícula, conservando la transparencia. Los anchos de columnas, la hoja de valoración, los recuadros de fotografías y las fórmulas de colores mantienen su configuración. La plantilla fuente no se sobrescribe.

Por aclaración expresa del propietario, el rótulo del Excel vuelve a **Cargo:**; los formularios de la aplicación mantienen **Puesto**. Los archivos históricos ya almacenados no se reescriben por este cambio de formato.
