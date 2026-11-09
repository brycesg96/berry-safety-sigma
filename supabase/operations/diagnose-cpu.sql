-- Berry Safety: diagnóstico de consultas activas y bloqueos.
-- Solo lectura. Ejecutar una vez en SQL Editor mientras el servicio está lento.
-- No cambia usuarios, inspecciones, archivos, permisos ni numeración.
SELECT pid, usename, state,
  round(extract(epoch FROM now() - query_start)) AS segundos,
  wait_event_type, wait_event,
  pg_blocking_pids(pid) AS bloqueada_por,
  left(query, 400) AS consulta
FROM pg_stat_activity
WHERE datname = current_database()
  AND pid <> pg_backend_pid()
  AND state <> 'idle'
ORDER BY query_start
LIMIT 10;
