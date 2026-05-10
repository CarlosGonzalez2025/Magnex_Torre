-- ============================================================
-- MIGRACIÓN v5: Restricciones UNIQUE para ON CONFLICT en upserts
-- Ejecutar después de reports_schema_v4.sql
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'coltrack_datos_conductor_unique_cond_fecha'
  ) THEN
    ALTER TABLE public.coltrack_datos_conductor
      ADD CONSTRAINT coltrack_datos_conductor_unique_cond_fecha
      UNIQUE (conductor_id, fecha);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'coltrack_datos_vehiculo_unique_veh_fecha'
  ) THEN
    ALTER TABLE public.coltrack_datos_vehiculo
      ADD CONSTRAINT coltrack_datos_vehiculo_unique_veh_fecha
      UNIQUE (vehiculo_id, fecha);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ralentis_unique_veh_fecha'
  ) THEN
    ALTER TABLE public.ralentis
      ADD CONSTRAINT ralentis_unique_veh_fecha
      UNIQUE (vehiculo_id, fecha);
  END IF;
END $$;
