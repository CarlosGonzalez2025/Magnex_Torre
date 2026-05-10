-- ============================================================
-- MIGRATION v10: Confiabilidad para alertas en tiempo real
-- Execute after alert setup scripts and reports migrations
-- ============================================================
-- Objetivo:
--   1. Blindar duplicados por placa + tipo + timestamp en saved_alerts.
--   2. Blindar duplicados en alert_history sin perder planes de accion.
--   3. Agregar indices para filtros operativos frecuentes.
--
-- Nota:
--   Este script es idempotente. Antes de crear los indices unicos, consolida
--   duplicados existentes conservando el registro mas antiguo.
-- ============================================================

-- Asegurar columnas usadas por el flujo actual.
ALTER TABLE IF EXISTS public.saved_alerts
  ADD COLUMN IF NOT EXISTS moved_to_history BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS moved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS moved_by TEXT;

ALTER TABLE IF EXISTS public.alert_history
  ADD COLUMN IF NOT EXISTS saved_alert_id UUID REFERENCES public.saved_alerts(id) ON DELETE SET NULL;

-- Consolidar duplicados en saved_alerts conservando el primer registro.
WITH ranked AS (
  SELECT
    id,
    FIRST_VALUE(id) OVER (
      PARTITION BY UPPER(TRIM(plate)), type, timestamp
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS keep_id,
    ROW_NUMBER() OVER (
      PARTITION BY UPPER(TRIM(plate)), type, timestamp
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS rn
  FROM public.saved_alerts
  WHERE plate IS NOT NULL
    AND type IS NOT NULL
    AND timestamp IS NOT NULL
),
duplicates AS (
  SELECT id, keep_id
  FROM ranked
  WHERE rn > 1
)
UPDATE public.alert_history ah
   SET saved_alert_id = d.keep_id
  FROM duplicates d
 WHERE ah.saved_alert_id = d.id;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY UPPER(TRIM(plate)), type, timestamp
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS rn
  FROM public.saved_alerts
  WHERE plate IS NOT NULL
    AND type IS NOT NULL
    AND timestamp IS NOT NULL
)
DELETE FROM public.saved_alerts s
USING ranked r
WHERE s.id = r.id
  AND r.rn > 1;

-- Consolidar duplicados en alert_history y mover sus planes de accion al registro conservado.
WITH ranked AS (
  SELECT
    id,
    FIRST_VALUE(id) OVER (
      PARTITION BY UPPER(TRIM(plate)), type, timestamp
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS keep_id,
    ROW_NUMBER() OVER (
      PARTITION BY UPPER(TRIM(plate)), type, timestamp
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS rn
  FROM public.alert_history
  WHERE plate IS NOT NULL
    AND type IS NOT NULL
    AND timestamp IS NOT NULL
),
duplicates AS (
  SELECT id, keep_id
  FROM ranked
  WHERE rn > 1
)
UPDATE public.action_plans ap
   SET alert_history_id = d.keep_id
  FROM duplicates d
 WHERE ap.alert_history_id = d.id;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY UPPER(TRIM(plate)), type, timestamp
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS rn
  FROM public.alert_history
  WHERE plate IS NOT NULL
    AND type IS NOT NULL
    AND timestamp IS NOT NULL
)
DELETE FROM public.alert_history h
USING ranked r
WHERE h.id = r.id
  AND r.rn > 1;

-- Indices unicos transaccionales: previenen carreras entre frontend/worker.
CREATE UNIQUE INDEX IF NOT EXISTS saved_alerts_unique_event_uidx
  ON public.saved_alerts (UPPER(TRIM(plate)), type, timestamp)
  WHERE plate IS NOT NULL AND type IS NOT NULL AND timestamp IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS alert_history_unique_event_uidx
  ON public.alert_history (UPPER(TRIM(plate)), type, timestamp)
  WHERE plate IS NOT NULL AND type IS NOT NULL AND timestamp IS NOT NULL;

-- Indices para consultas de operacion.
CREATE INDEX IF NOT EXISTS idx_saved_alerts_status_timestamp
  ON public.saved_alerts(status, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_saved_alerts_moved_timestamp
  ON public.saved_alerts(moved_to_history, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_saved_alerts_plate_type_timestamp
  ON public.saved_alerts(UPPER(TRIM(plate)), type, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_alert_history_status_timestamp
  ON public.alert_history(status, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_batch_alerts_plate_timestamp
  ON public.batch_alerts(UPPER(TRIM(plate)), timestamp DESC);
