-- ============================================================
-- FIX: statement timeout al cargar / borrar saved_alerts
-- Causa: falta un índice PURO sobre "timestamp". Los índices
-- existentes son compuestos (status, timestamp) / (moved_to_history,
-- timestamp), que NO sirven para ordenar o filtrar por timestamp solo.
-- Ejecutar en: Supabase SQL Editor
-- ============================================================

-- ── PASO 1: ÍNDICES (resuelve el timeout de ORDER BY / rango) ──
-- El bloqueo de escritura es breve. Si la tabla es muy grande y no
-- quieres bloqueo, ejecuta cada CREATE INDEX CONCURRENTLY por separado
-- (no dentro de una transacción).

CREATE INDEX IF NOT EXISTS idx_saved_alerts_timestamp
  ON public.saved_alerts ("timestamp" DESC);

CREATE INDEX IF NOT EXISTS idx_alert_history_timestamp
  ON public.alert_history ("timestamp" DESC);

ANALYZE public.saved_alerts;
ANALYZE public.alert_history;


-- ── PASO 2 (OPCIONAL): DIAGNÓSTICO DE TAMAÑO ──────────────────
-- Cuántas alertas hay y de qué rango de fechas.
SELECT
  COUNT(*)                       AS total_alertas,
  MIN("timestamp")               AS mas_antigua,
  MAX("timestamp")               AS mas_reciente,
  COUNT(*) FILTER (WHERE moved_to_history) AS movidas_a_historial
FROM public.saved_alerts;


-- ── PASO 3 (OPCIONAL): LIMPIEZA POR PERIODO ───────────────────
-- Borra un periodo directamente en la BD (útil si la UI no carga).
-- Ajusta las fechas. Las movidas al Historial se conservan en alert_history.
--
-- 3a. Previsualizar cuántas se borrarían:
-- SELECT COUNT(*) FROM public.saved_alerts
-- WHERE "timestamp" >= '2026-01-01T00:00:00-05:00'
--   AND "timestamp" <= '2026-05-28T23:59:59-05:00';
--
-- 3b. Borrar (ejecutar tras confirmar el conteo):
-- DELETE FROM public.saved_alerts
-- WHERE "timestamp" >= '2026-01-01T00:00:00-05:00'
--   AND "timestamp" <= '2026-05-28T23:59:59-05:00';

NOTIFY pgrst, 'reload schema';
