# Descarga PDF del registro cerrado

En el seguimiento, **Descargar PDF** aparece junto a **Descargar Excel** una vez que todos los hallazgos están aprobados en Ejecutado. Está disponible para el autor y los destinatarios. La función de generación también comprueba el cierre; no basta con mostrar o habilitar un botón.

El archivo se genera en el navegador y se descarga como `REG_INS_ÁREA EN MAYÚSCULAS_DD.MM.AAAA.pdf`, con la misma convención del Excel. No abre un diálogo de impresión ni llama a un servicio de conversión. La descarga conserva el estado del informe y no consume un correlativo ni solicita un correo.

## Formato y datos

`src/pdf.ts` parte de `buildExcel` y lee el paquete XLSX generado. Representa el área de impresión de la hoja **V.01**; la hoja auxiliar Matriz de Valoracion permanece en el Excel. Conserva las medidas de columnas y filas, las combinaciones, bordes, colores de riesgo/estado, textos, logo, fotografías originales y del levantamiento y firmas que contiene el registro. La familia Liberation Sans, compatible con las medidas de Arial y con caracteres españoles, se incluye en el PDF; su licencia acompaña los archivos de fuente en `public/fonts/report`.

La salida es A4 vertical, con los márgenes y escala de la plantilla. Si se necesita otra página, se divide entre registros completos sin cortar una celda combinada o sus fotos. Se repiten el encabezado y las cabeceras de observaciones cuando corresponde y se numeran las páginas. Los textos son seleccionables y se ajustan a sus recuadros; el PDF no es una captura de la pantalla de seguimiento.

La generación utiliza los datos que ya tiene la inspección y la plantilla pública. No almacena una copia del PDF en un servidor. La conservación centralizada de documentos y versiones sigue dentro del [alcance pendiente de Supabase](SUPABASE.md).

## Validación

`tests/pdf.spec.ts` descarga registros ficticios cerrados con una y siete observaciones, verifica el archivo PDF, su nombre, textos con tildes, nombres/cargos, fotografías, tamaño A4 y paginación, y rechaza la generación de una inspección abierta. Utiliza los lectores independientes `pdftotext`, `pdfinfo` y `pdfimages` de Poppler. El recorrido de seguimiento comprueba que el botón no aparece antes del cierre y que las rutas funcionan para ambas cuentas.
