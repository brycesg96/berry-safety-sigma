# Responsables del área y del levantamiento

El formulario conserva sus filas numeradas y los mismos controles de búsqueda, correo automático y área/puesto. Las inspecciones nuevas muestran al menos dos filas. Los borradores anteriores con una sola fila reciben una fila vacía al abrirse, sin escritura automática. Para continuar o enviar se deben seleccionar al menos dos personas distintas; se pueden guardar avances incompletos. No se puede reducir la lista a menos de dos filas.

El orden lo establece el inspector: primero el jefe del área, después el encargado del levantamiento y los demás participantes. No se añaden etiquetas de «encargado real» a la interfaz. Todos siguen siendo destinatarios y conservan los permisos de participación existentes.

En el Excel individual, **Responsable del área inspeccionada** muestra únicamente a la primera persona. **Apellidos y Nombres del responsable del levantamiento** muestra a la segunda y siguientes, en el orden seleccionado, en cada hallazgo. El nombre usa 14 puntos y un tono oscuro; el puesto va en el siguiente renglón, con 11 puntos y color gris. El PDF interpreta los mismos estilos del Excel. No se inventa un puesto si no está registrado.

Las inspecciones antiguas con un único destinatario conservan su representación anterior al generar una copia. No se reescriben archivos históricos almacenados, revisiones, permisos ni números de registro. No hace falta ejecutar SQL para este ajuste del formulario y la presentación.

En la revisión final, el apartado se llama **Responsables del área inspeccionada\*** y aclara: «Las siguientes personas recibirán el informe de esta inspección en sus correos electrónicos y en sus cuentas de Berry Safety. Asimismo, serán responsables de levantar las observaciones identificadas». La lista de personas y correos tiene 18 px de separación respecto a la explicación.

Los textos visibles de la aplicación, filtros, avisos, consolidado y mensajes del servicio utilizan **número de registro**. Se conservan las claves técnicas de las integraciones y el mecanismo de asignación de correlativos.
