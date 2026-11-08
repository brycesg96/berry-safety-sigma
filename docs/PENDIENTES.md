# Pendientes de Berry

Esta lista es la referencia de trabajo y se resumirá al cerrar cada avance. Se distinguen implementaciones de interfaz, referencias técnicas probadas e integraciones operativas. Una prueba local no equivale a un servicio conectado en la web.

## Implementado y disponible para pruebas

- [x] Código de inspección sin edición manual. El borrador muestra un código tentativo numérico, como `IH-2026-001`, con aviso de que puede variar según el orden de envío. No reserva correlativos.
- [x] Año según la fecha de aceptación del envío en Perú, con reinicio anual del correlativo y un mínimo de tres dígitos (después de 999 continúa 1000).
- [x] Referencia de base de datos con transacción, códigos únicos, archivo Excel y cola de envío guardados juntos; pruebas de concurrencia, reintentos, cambio de año y fallos. **No está conectada a la app.**
- [x] Retirar el texto y candado de Solo lectura del bloque del empleador, manteniendo sus datos sin edición y compactando espacios.
- [x] Reducir aproximadamente a la mitad la altura inicial del objetivo, conservando ancho y límite de 560 caracteres.
- [x] Retirar la explicación bajo el correo; se mantiene el relleno automático al seleccionar una cuenta.

- [x] Administración debajo de Mis inspecciones, con cuentas permitidas y espacio de funciones/permisos. Retirada la opción de Microsoft por decisión del propietario; el acceso real usa Supabase.
- [x] Dos cuentas locales Bryan: administrador `bryx.96@gmail.com` e inspector `bcespedes@hortifrut.com`, configurables en la compilación.
- [x] Directorio local de cuentas habilitadas: búsqueda por nombre, correo automático y altas, edición y desactivación desde Administración.
- [x] Cambio de cuenta de prueba sin login, correo de perfil no editable, área y nombre por cuenta, y borradores separados en el navegador.

- [x] Ejemplo de área con ubicación: «Ej. Taller de Maquinaria - Armonía 2».
- [x] Hora en 12 horas con selección AM/PM, ambas inicialmente vacías y obligatorias; migración de horas antiguas de 24 horas.
- [x] Mis inspecciones muestra el espacio del código definitivo, pendiente hasta recibir un registro confirmado del servidor.

- [x] Simplificar el mensaje inicial de observaciones y retirar «Las fotos son opcionales» y la opción de inspección sin observaciones. Se requiere al menos una observación para continuar; los campos de cada hallazgo se conservan.

- [x] Observaciones compactas: textos junto a criticidad, Fecha de Cierre y fotos en pantallas amplias; distribución vertical en el teléfono.
- [x] La primera Fecha de Cierre se comparte una sola vez con todas las observaciones y se conserva como fecha inicial para nuevas observaciones. Los cambios posteriores son individuales y persisten al recargar. Los borradores antiguos conservan sus fechas.

- [x] Inspecciones recibidas después de Mis inspecciones: entrega local entre las cuentas destinatarias, levantamientos con acción, responsable, Estado y Fecha de Cierre, fotos separadas y guardado de avances.
- [x] Responsable inicial del levantamiento consistente entre autor y destinatario: se toma del primer responsable seleccionado para recibir el informe, no de la cuenta que lo consulta. Se conserva el nombre guardado al registrar avances y el Excel muestra el mismo valor.
- [x] Revisión por el autor, solicitud de ajustes y cierre solo al quedar todos los estados aprobados en Ejecutado. Contadores/filtros Inspecciones a revisar e Inspecciones cerradas. Descargar un informe no lo cierra.
- [x] Selector Estado editable por el autor y los destinatarios hasta el cierre completo, incluso durante la revisión o después de una aprobación individual. Aprobar establece Ejecutado; solicitar ajustes establece Pendiente. El cierre exige todos los hallazgos aprobados en Ejecutado, no basta con cambiar los selectores. Cambiar un aprobado a Pendiente lo devuelve a revisión; Guardar estado conserva los demás datos del levantamiento.
- [x] Protección local contra sobrescritura o eliminación del informe enviado y rechazo de revisiones obsoletas. Exportación provisional con datos y evidencias del levantamiento. [Guía de prueba y límites](SEGUIMIENTO.md).

- [x] Realizado por admite hasta tres personas: usuario autor con nombre/correo bloqueados y hasta dos inspectores adicionales del directorio, sin duplicados. Se conservan en el borrador, la revisión, el seguimiento y la descarga provisional del Excel. Los datos del autor se actualizan desde su perfil en los borradores; los informes enviados conservan su autor original.

- [x] Vista de levantamiento más compacta: textos y responsable junto a fecha, estado y evidencias; márgenes y cuadros reducidos, con distribución vertical en teléfonos.
- [x] Seguimiento centrado en los hallazgos: retirado el bloque de envío por correo y los avisos técnicos de sincronización local de esta vista. El envío sigue disponible en su formulario y conserva su recibo en los datos del informe.

- [x] Inspecciones recibidas separadas mediante botones Pendientes y Cerradas. El número del menú cuenta solo las recibidas sin cerrar y desaparece al quedar en cero.

- [x] Código compacto junto a Información general con ayuda emergente; DATOS DEL EMPLEADOR desplegable y contraído por defecto; OBJETIVO DE LA INSPECCIÓN INTERNA como sección con icono y divisores.

- [x] Etiqueta N° REGISTRO: encima del código, con estilo discreto y compacto.

- [x] Cargo editable en el perfil y leyenda Área — Cargo bajo las personas seleccionadas del directorio, con compatibilidad para perfiles antiguos y datos incompletos.

- [x] Añadir hasta dos inspectores adicionales desde Responsable de la inspección en el primer paso, sincronizados con Realizado por y con validación del equipo al continuar.

- [x] Resumen de observaciones en dos columnas de tarjetas compactas cuando hay ancho suficiente y una columna en teléfonos; sin recortar textos ni perder acceso a fotos y edición.

- [x] Cierre con descripción de causas primero y conclusiones/recomendaciones en un solo campo, ambos compactos y con máximo 1200 caracteres. Migración de textos antiguos sin recortes.
- [x] RESPONSABLE DEL REGISTRO con nombre, cargo, fecha y firma adjunta por imagen para hasta tres personas, conservados en revisión y exportación provisional. Firma y cargo no se inventan; la firma no se genera automáticamente.
- [x] Cargo del responsable del registro y de los inspectores adicionales de solo lectura, con candado y obtenido de su perfil. Los borradores actualizan el cargo si cambia el perfil, incluso si antes se escribió manualmente, conservando fecha y firma. Un cargo vacío en el perfil queda vacío; los informes enviados conservan el cargo registrado en el envío.
- [x] Etiqueta Responsable de la inspección unificada en el cierre, la revisión y el seguimiento, coincidiendo con el primer paso. El encabezado del Excel conserva el texto de la plantilla proporcionada.
- [x] Rutas de navegación conservando la sección de origen: Espacio de trabajo → Mis inspecciones → En levantamiento / Inspecciones a revisar / Inspecciones cerradas, y Espacio de trabajo → Inspecciones recibidas → Pendientes / Cerradas. El menú mantiene activa la sección y el enlace de regreso conserva sus filtros.
- [x] Descarga directa del PDF del registro cerrado, junto a Descargar Excel, para autores y destinatarios. Usa el área de impresión de V.01 del mismo Excel completado, con imágenes, firmas, colores y saltos por registros, sin convertir ni modificar los datos del informe. [Detalles](PDF.md).
- [x] Corrector ortográfico nativo del navegador habilitado en español de Perú solo en objetivo, descripción, acción a tomar, causa ante resultados desfavorables y conclusiones/recomendaciones. Los demás campos no lo heredan. El subrayado y las sugerencias dependen del diccionario y la configuración de cada navegador; la app no cambia el texto automáticamente.
- [x] Confirmación al intentar salir con Atrás del navegador en teléfono o computadora: Seguir en la aplicación conserva la pantalla y los textos; Salir vuelve a la página anterior. Se reutiliza la protección al recargar, sin acumular entradas al cancelar. Cerrar/recargar usa el aviso nativo cuando el navegador lo permite; el sistema operativo puede cerrar una aplicación móvil sin emitir ese aviso.

- [x] RESULTADO DE LA INSPECCIÓN con etiquetas Descripción, Acción a tomar y Nivel de riesgo.
- [x] Editor básico de evidencias del borrador: recorte, flechas y círculos, selección de color/grosor, movimiento, tamaño con puntos y botones, deshacer y restaurar original. Guarda imagen editada y conserva original y marcas para reabrir; los informes enviados siguen sin edición.

- [x] No crear borradores al abrir una inspección vacía: se ignoran fecha/usuario automáticos y filas vacías. El guardado inicia con contenido ingresado; si se vacía un borrador en edición, se retira de la lista. Los registros anteriores no se eliminan de forma masiva.

- [x] El número del menú Mis inspecciones cuenta únicamente Inspecciones a revisar y se oculta cuando ese contador está en cero.
- [x] Mis inspecciones muestra área inspeccionada, responsables, áreas de los responsables y fecha/hora con cantidad de observaciones. La búsqueda admite instalación, área inspeccionada, nombres/correos de responsables y sus áreas, sin distinguir mayúsculas ni tildes, junto con los filtros de estado. Se conserva el código del informe.

- [x] Revisar arquitectura y preparar API servidor de prueba para Make, con secreto solo en servidor, clave de acceso, CORS, JSON ficticio, sin correos reales y con estados de aceptación/rechazo/recepción no confirmada.
- [x] Administración → Integraciones, configuración de despliegue Render y pruebas sin afectar inspecciones existentes. [Guía y resultado real](MAKE.md).
- [x] Webhook confirmado: tras el rechazo HTTP 410 inicial, una nueva prueba autorizada el 4 de noviembre de 2026 recibió HTTP 200 de Make, con datos ficticios y `send_email:false`. Confirma aceptación HTTP, no ejecución completa del escenario ni entrega de correo.
- [x] Botón temporal «Probar conexión con Make» y guía de configuración segura de `MAKE_WEBHOOK_URL`, adaptados al escenario con Outlook y filtro para excluir pruebas.
- [x] Filtro de Make comprobado por captura: webhook procesó una solicitud, cero datos pasaron a Outlook.
- [x] Backend Render creado en `https://berry-safety-api.onrender.com`: health HTTP 200 y CORS HTTP 204 verificados; endpoint público configurado para la publicación de Pages.
- [x] Prueba autenticada desde la web pública aceptada por Make (HTTP 200), mostrada por el usuario.
- [x] Conectar Enviar inspección con API, correo general, Excel provisional adjunto y recibo de aceptación separado del resultado de Outlook.
- [x] Asociar correos de jefes/gerentes a cuentas y añadirlos en CC de los responsables, con validación y deduplicación. Asociaciones locales de prueba.
- [x] Ejemplo con campos de Outlook y Excel ficticio enviado al webhook que esperaba datos: HTTP 200, sin solicitar correo.
- [x] Campos de Make mapeados (Para, CC y adjunto) y `MAKE_REPORTS_ENABLED=true` en Render. El usuario mostró una ejecución con webhook, filtro y Outlook completados. [Guía](ENVIO_INFORMES.md).
- [ ] Confirmar en el buzón receptor que el Excel llegó y se abre correctamente; probar las copias reales a jefes/gerentes.
- [x] Diagnosticar y recuperar el adjunto ilegible proporcionado por el propietario: contenía Base64 y el sufijo literal `; base64`; su decodificación recuperó un XLSX íntegro con dos hojas y cuatro imágenes.
- [ ] Corregir en Make → Outlook → Attachments → Data la función `toBinary(...; base64)`, aplicada al contenido del primer adjunto; confirmar que un nuevo archivo recibido se abre. El cambio del escenario requiere acceso del propietario; no precisa cambiar el generador ni desplegar Render.
- [x] Prototipo global sin claves ni activación de envíos en ningún navegador, PC o teléfono. Retirado el bloqueo del botón de envío; el backend conserva la configuración privada de Make, validación, límites y deduplicación. La autorización de ocho horas queda sustituida por petición del propietario.
- [ ] Journal persistente/compartido para deduplicación entre despliegues y réplicas, y devolución autenticada del resultado de Outlook a la app.

- [x] Navegación del asistente desde «SEGURIDAD Y SALUD EN EL TRABAJO» al cambiar de paso; Editar en el resumen abre y enfoca la observación elegida, sin buscarla manualmente.

- [x] Recibida y revisada la nueva plantilla original `REGISTRO DE INSPECCIONES INTERNAS.xlsx`: dos hojas, medidas, estilos, imágenes y configuración de impresión identificados. [Referencia](PLANTILLA_EXCEL.md).
- [x] Recibida y leída la copia con instrucciones rojas; registrado el mapeo para explicarlo al usuario. Aclaración posterior: acomodar fotos pequeñas dentro del recuadro y conservar anchos y alturas originales, sin imponer 550 píxeles. [Mapeo](PLANTILLA_EXCEL.md).
- [x] Sustituir el exportador genérico por el llenado de la plantilla: datos en sus celdas, fotografías pequeñas en sus recuadros, firmas transparentes y registros adicionales que desplazan el cierre. Nombre solicitado: `REG_INS_ÁREA EN MAYÚSCULAS_DD.MM.AAAA.xlsx`, todavía modificable. La descarga y el adjunto utilizan el mismo generador y los mismos bytes para una inspección sin cambios.
- [x] Escribir el riesgo con las opciones exactas del desplegable original del Excel: Bajo, Medio o Alto. Se conservan las fórmulas y colores de la plantilla; sus rangos acompañan las observaciones adicionales.
- [x] Precargar objetivo, causa ante resultados desfavorables y conclusiones/recomendaciones de la última inspección enviada, conservando la edición libre. Los envíos aceptados actualizan una copia compartida en la API; no sobrescribe borradores existentes ni lo escrito mientras llega la respuesta. La precarga sola no crea borradores vacíos. La copia local permite continuar cuando falla la consulta.
- [x] Visor de evidencias compacto: botón de edición con lápiz en la esquina superior derecha de la imagen, con nombre accesible y área táctil de 44 píxeles.
- [x] Texto del formulario de envío simplificado: «Las personas seleccionadas recibirán un correo con el mensaje y el informe de inspección en Excel adjunto».
- [x] Correo del responsable del registro e inspectores adicionales rellenado automáticamente y de solo lectura, con candado visible. Comprobado que escribir en el campo no modifica la dirección seleccionada.
- [x] Corregir el fallo de carga del generador al enviar desde una pestaña abierta durante una publicación: JSZip se carga con la aplicación y Pages conserva JavaScript/CSS recientes durante siete días, recuperados de las publicaciones anteriores. No recarga la página ni reenvía informes automáticamente.
- [x] Cuerpo del correo sustituido por la redacción del propietario: área e instalación, fecha DD.MM.AAAA y hasta tres responsables de inspección bajo «Compañero SIGMA» o «Compañeros SIGMA», referencia al Excel adjunto y firma «Berry Safety». Asunto: `Informe de inspección de seguridad - [Área] - [AAAA-MM-DD]`. Se conserva el mapeo de Make; activar con el último despliegue de Render.
- [ ] Actualizar el backend Render para activar el nombre nuevo del adjunto y la consulta de textos compartidos. El almacenamiento SQLite actual requiere un volumen persistente o una base compartida para sobrevivir a la sustitución de la instancia de Render; las copias locales no sustituyen esa persistencia entre dispositivos.

## Pendientes operativos, por orden de dependencia

El propietario creó la organización Free Berry Safety y el proyecto `berry-safety`, ejecutó la migración inicial de siete tablas, dos buckets privados y RLS y habilitó su primera cuenta confirmada como administradora. La API pública confirmó versión `202611070001`, etapa `foundation`, `sync_ready: false`, HTTP 200. La ruta `?acceso=cuenta` conecta Auth y el perfil propio; las inspecciones del espacio de pruebas siguen locales. Faltan las escrituras de informes, documentos, seguimiento e importación para conservar borradores, documentos enviados, evidencias y trazabilidad entre dispositivos. [Alcance y estado real](SUPABASE.md).

- [x] Acceso mediante correo/contraseña de Supabase, sesión persistente y cierre de sesión, con identidad validada por Auth y rol/habilitación del perfil del servidor.
- [x] Perfil propio conectado: nombre, área y cargo; correo de solo lectura. El portal y los registros del espacio de pruebas no se mezclan; entrar desde el editor guarda su borrador local antes de cambiar de vista.
- [ ] Confirmar el inicio de sesión del propietario desde la web publicada y desactivar el registro público si el piloto utilizará altas manuales.
- [x] Preparar altas reales desde el portal de cuenta: formulario y lista, API con JWT verificado y rol administrador del servidor, identificación de solicitudes y auditoría. Contraseña temporal `0123456789` de solo lectura y cambio obligatorio sin permisos de datos hasta finalizarlo en servidor. Los reintentos conservan identidad y contraseña personal ya establecida.
- [ ] Activar la segunda migración y configurar la clave privada de Auth en Render una sola vez; desplegar su API y comprobar un alta real y el cambio de contraseña desde otro dispositivo. [Configuración y límites](USUARIOS.md). No se ha configurado ni solicitado una clave privada por chat.

1. [ ] Elegir y conectar el sistema de automatización y la base de datos real. Confirmar alojamiento y credenciales mediante configuración segura, sin claves en el navegador.
2. [x] Sustituir la propuesta de Microsoft por acceso con correo y contraseña de Supabase. La opción y sus referencias se retiran del perfil y Administración; no se requiere registrar una aplicación Microsoft.
3. [ ] Conectar el directorio de las inspecciones a las cuentas reales de Supabase. El acceso y el perfil reales están disponibles; la demostración conserva su propio directorio local.
4. [ ] Integrar el registro de envío autenticado: validar los datos, asignar el código una sola vez, generar el Excel con ese código y guardar ambos en la misma operación. La referencia transaccional está probada; el servicio real sigue pendiente.
5. [x] Incorporar la exportación sobre el Excel proporcionado, con las instrucciones rojas revisadas y medidas originales. [Referencia y mapeo](PLANTILLA_EXCEL.md).
6. [ ] Conectar almacenamiento compartido y evidencias para retomar inspecciones entre dispositivos. Los borradores actuales permanecen en cada navegador.
7. [ ] Conectar el envío de correo y el seguimiento de entrega, con reintentos sin duplicados. Aceptar y registrar una inspección no significa que el correo ya fue entregado.
8. [ ] Conectar entregas y levantamientos al backend autenticado: permisos por destinatario y revisor, auditoría y versiones, avisos, sincronización entre dispositivos y resolución de concurrencia del servidor. El flujo actual es una demostración en el mismo navegador.
9. [ ] Definir con Brian los permisos adicionales del apartado Administración.
10. [ ] Revisar con Brian el informe final, las firmas, las reglas de acceso y la conservación de documentos antes del uso operativo.

## Regla de numeración acordada

`IH-2026-001`, `IH-2026-002`, …; al comenzar 2027: `IH-2027-001`.

Los borradores y las descargas de prueba no consumen correlativos. El primer envío válido confirmado por la base de datos recibe el siguiente número disponible. Dos informes distintos simultáneos reciben números distintos. Repetir el mismo envío por un doble clic o un corte de conexión devuelve el mismo código; no crea un segundo informe. Un envío rechazado o un Excel que no pudo guardarse no consume un número. Una inspección aceptada conserva para siempre su código, aunque se reintente después de Año Nuevo.


## Entrega del 8 de noviembre: tercer paso de Supabase

- [x] Preparar espacio autenticado con directorio real, borradores y fotografías entre dispositivos, permisos y revisiones en servidor, levantamientos/revisión/cierre y auditoría.
- [x] Preparar correlativo anual, archivo privado por fecha de inspección (año/mes), Excel exacto enviado y cola persistente que evita duplicados. No requiere crear carpetas manuales ni modificar Make.
- [ ] Ejecutar únicamente `202611080003_reports.sql` y desplegar la nueva API en Render; comprobar el estado público de la migración y realizar una prueba desde las cuentas reales. Las etapas 1 y 2 sí están instaladas, incluida la clave privada configurada directamente en Render.
- [ ] Importación revisable de las inspecciones y cuentas locales anteriores; se conservan sin alterar en su navegador. No confundir el correo real del propietario con el correo de demostración que contiene punto.
- [ ] Pantalla de consulta del historial. Los eventos y versiones quedan guardados en auditoría protegida; la vista de historial todavía no se incorpora.

Los pendientes anteriores relativos al desarrollo del backend se consideran preparados por esta entrega para registros nuevos; la activación remota, prueba real e importación siguen separados. [Pasos de activación, verificaciones y límites](SUPABASE.md#tercera-etapa-espacio-de-trabajo-compartido-y-archivo-mensual).


## Cambio posterior: archivo final y recuperación

- [x] Recuperación por correo desde Olvidé mi contraseña, con retorno PKCE, verificación de identidad y cambio mediante la API propia. Publicado en `7238089`; requiere configurar URL de sitio y redirecciones en Supabase. El propietario realiza el envío y el cambio desde su navegador.
- [x] Paso 3 instalado por el propietario y Render `6e0639a` mostrado como Live.
- [x] Preparar paso 4: al aprobar todos los levantamientos, guardar el Excel final y retirar el inicial, manteniendo una sola fila y un solo archivo. Datos de auditoría conservados; fallos y operaciones simultáneas recuperables sin otro correo/código.
- [ ] Ejecutar únicamente `202611080004_final_archive.sql` y desplegar la API actualizada. Confirmar recuperación de la contraseña del propietario y una prueba operativa del archivo final.
