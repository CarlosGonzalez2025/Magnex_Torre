-- ============================================================
-- LIMPIEZA de alertas diarias — dejar listo para re-cargar
-- ============================================================
-- Borra TODAS las alertas diarias ya registradas para volver a cargarlas desde
-- las plantillas con el parser corregido (categoría por velocidad real, fecha_dia
-- en hora Colombia y sin el ruido de eventos que no son alerta).
--
-- ⚠️ DESTRUCTIVO. NO toca la base maestra (vehículos/conductores/contratos), ni
--    los informes mensuales, ni la Auditoría de Flota (batch_alerts).
--
-- IMPORTANTE: cierra la app (localhost/Vercel) antes de correrlo, para que nada
-- esté consultando la tabla (si no, el TRUNCATE espera el lock y expira).
-- ============================================================

-- ---------- OPCIÓN A: rápida (base con recursos) ----------
-- Falla rápido si no consigue el lock en 5s (en vez de colgarse).
SET lock_timeout = '5s';
SET statement_timeout = '120s';

TRUNCATE public.alertas_diarias_gps;
TRUNCATE public.alertas_diarias_pendientes;


-- ---------- OPCIÓN B: por lotes (base lenta / sobre cuota) ----------
-- Si la Opción A se cae por timeout, ejecuta ESTAS sentencias UNA POR UNA y
-- REPITE cada una varias veces hasta que diga "0 rows" (cada corrida borra 5.000
-- filas, así ninguna sentencia se pasa del tiempo aunque la base esté lenta):
--
-- DELETE FROM public.alertas_diarias_gps
-- WHERE id IN (SELECT id FROM public.alertas_diarias_gps LIMIT 5000);
--
-- DELETE FROM public.alertas_diarias_pendientes
-- WHERE id IN (SELECT id FROM public.alertas_diarias_pendientes LIMIT 5000);


-- ---------- (Opcional) si el lock no se libera por conexiones activas ----------
-- Termina las consultas activas de la app y reintenta el TRUNCATE:
-- SELECT pg_terminate_backend(pid) FROM pg_stat_activity
--  WHERE datname = current_database() AND pid <> pg_backend_pid() AND state <> 'idle';
