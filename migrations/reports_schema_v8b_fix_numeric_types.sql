-- ============================================================
-- MIGRATION v8b: Corregir tipos numéricos en alertas_diarias_gps
-- Ejecutar ANTES de reports_schema_v8_alertas_pendientes.sql
-- (o si v8 ya fue aplicado, ejecutar independientemente)
-- ============================================================
-- Problema: NUMERIC(12,8) para latitud/longitud permite máximo 4 dígitos
-- enteros (9999.99999999). Si el GPS exporta coordenadas en formato extendido
-- o en sistema DMS almacenado como decimal, desborda con "numeric field overflow".
-- NUMERIC(8,2) para velocidad puede fallar si el sistema GPS registra
-- valores acumulados o en otra escala.
-- Solución: usar DOUBLE PRECISION (float8) para coordenadas y ampliar velocidad.
-- ============================================================

-- alertas_diarias_gps (tabla de v7, ya debe existir)
ALTER TABLE public.alertas_diarias_gps
  ALTER COLUMN latitud  TYPE DOUBLE PRECISION USING latitud::DOUBLE PRECISION,
  ALTER COLUMN longitud TYPE DOUBLE PRECISION USING longitud::DOUBLE PRECISION,
  ALTER COLUMN velocidad TYPE NUMERIC(10,2)   USING velocidad::NUMERIC(10,2);

-- alertas_diarias_pendientes (tabla de v8, aplicar si ya fue creada)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name   = 'alertas_diarias_pendientes'
  ) THEN
    ALTER TABLE public.alertas_diarias_pendientes
      ALTER COLUMN latitud  TYPE DOUBLE PRECISION USING latitud::DOUBLE PRECISION,
      ALTER COLUMN longitud TYPE DOUBLE PRECISION USING longitud::DOUBLE PRECISION,
      ALTER COLUMN velocidad TYPE NUMERIC(10,2)   USING velocidad::NUMERIC(10,2);
  END IF;
END $$;
