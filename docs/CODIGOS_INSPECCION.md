# Código definitivo de inspección

Formato fijo: `IH-{año de registro}-{secuencia anual con un mínimo de tres dígitos}`. Se usa `America/Lima` para decidir el año del envío aceptado, no la fecha de la inspección ni el reloj del teléfono.

## Lo que está disponible en la web

El campo es de solo lectura y muestra `IH-AÑO-…`, junto a un ejemplo como `IH-2026-001`. No muestra un número provisional que dos usuarios puedan confundir con un código definitivo. Las descargas locales se identifican como borradores sin código registrado. Los números introducidos manualmente en versiones anteriores se conservan como `legacyRegistrationNumber`, pero no se validan ni se publican como códigos definitivos.

## Operación futura de registro

El cliente manda el UUID estable de la inspección (`draft.id`) como clave de idempotencia, los datos y las evidencias al servicio autenticado. No manda un código elegido por el usuario. El servidor obtiene la identidad de la sesión y valida el informe, las personas y los archivos antes de asignar numeración.

En una sola transacción:

1. Si el UUID ya se registró para la misma cuenta y el mismo contenido, devolver la respuesta original sin aumentar el contador ni volver a generar el archivo. Si cambió el contenido, responder conflicto; si pertenece a otra cuenta, rechazar.
2. Bloquear e incrementar el contador del año con una operación atómica. No usar `MAX + 1` ni un contador del navegador.
3. Generar el Excel definitivo con el código asignado. Guardar código, contenido y archivo juntos con restricciones únicas sobre código y `(año, secuencia)`.
4. Guardar un único trabajo de correo en una cola transaccional. Confirmar la transacción y devolver el código y la referencia del archivo persistido.

Si falla la generación o el guardado, se revierte la transacción, incluido el contador. El correo se procesa después; sus fallos no anulan una inspección registrada ni provocan una numeración nueva. No mantener bloqueos de la base de datos mientras se llama a servicios de correo externos. El orden corresponde a las operaciones aceptadas por la base de datos, no al orden de clics o llegada de respuestas al navegador.

Si el servicio de automatización solo admite archivos externos, se deberá adaptar este contrato para impedir que un código se confirme sin su documento definitivo (por ejemplo, almacenamiento temporal verificado y finalización transaccional). Esa integración no existe todavía y no debe presentarse como operativa.

## Referencia ejecutable

`reference/registry.py` utiliza SQLite para demostrar la transacción completa y guardar el Excel como BLOB, sin exponer un endpoint ni crear una base de datos de producción. `render_excel` es un generador del servidor; el código del informe debe figurar en el XLSX resultante. El proveedor definitivo puede implementar la misma garantía en otra base de datos. No se ha seleccionado ni impuesto un proveedor de automatización.

```bash
python3 -m unittest discover -s reference -p 'test_*.py' -v
```

Las pruebas ejercitan 30 registros concurrentes, múltiples reintentos del mismo UUID, conflictos de cuenta y contenido, fallos de generación, correspondencia entre código y Excel, reinicio anual según Perú y la secuencia 1000. La referencia no sustituye la autenticación ni la validación completa del formato o del contenido de las inspecciones.

La app publicada aún no tiene un endpoint de registro o una base de datos compartida. Conectar y desplegarlo queda en [PENDIENTES.md](PENDIENTES.md).
