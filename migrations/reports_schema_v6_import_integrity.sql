-- ============================================================
-- MIGRATION v6: Import integrity for reports module
-- Execute after reports_schema_v5.sql
-- ============================================================

-- v5 already adds UNIQUE constraints for operational upserts:
--   coltrack_datos_conductor(conductor_id, fecha)
--   coltrack_datos_vehiculo(vehiculo_id, fecha)
--   ralentis(vehiculo_id, fecha)
--
-- v6 adds the missing integrity pieces used by Sheets sync, report history,
-- and Excel/PDF file uploads.

UPDATE public.contratos
SET nombre = btrim(nombre)
WHERE nombre IS NOT NULL AND nombre <> btrim(nombre);

WITH ranked AS (
  SELECT
    id,
    first_value(id) OVER (PARTITION BY nombre ORDER BY created_at NULLS LAST, id) AS keep_id,
    row_number() OVER (PARTITION BY nombre ORDER BY created_at NULLS LAST, id) AS rn
  FROM public.contratos
  WHERE nombre IS NOT NULL
)
UPDATE public.vehiculos v
SET contrato_id = r.keep_id
FROM ranked r
WHERE v.contrato_id = r.id AND r.rn > 1;

WITH ranked AS (
  SELECT
    id,
    first_value(id) OVER (PARTITION BY nombre ORDER BY created_at NULLS LAST, id) AS keep_id,
    row_number() OVER (PARTITION BY nombre ORDER BY created_at NULLS LAST, id) AS rn
  FROM public.contratos
  WHERE nombre IS NOT NULL
)
UPDATE public.conductores c
SET contrato_id = r.keep_id
FROM ranked r
WHERE c.contrato_id = r.id AND r.rn > 1;

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (PARTITION BY nombre ORDER BY created_at NULLS LAST, id) AS rn
  FROM public.contratos
  WHERE nombre IS NOT NULL
)
DELETE FROM public.contratos c
USING ranked r
WHERE c.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS contratos_nombre_uidx
  ON public.contratos(nombre);

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY conductor_id, periodo_inicio, periodo_fin
      ORDER BY created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM public.reportes_conductores
  WHERE conductor_id IS NOT NULL
)
DELETE FROM public.reportes_conductores r0
USING ranked r
WHERE r0.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS reportes_conductores_period_uidx
  ON public.reportes_conductores(conductor_id, periodo_inicio, periodo_fin);

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY vehiculo_id, periodo_inicio, periodo_fin
      ORDER BY created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM public.reportes_vehiculos
  WHERE vehiculo_id IS NOT NULL
)
DELETE FROM public.reportes_vehiculos r0
USING ranked r
WHERE r0.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS reportes_vehiculos_period_uidx
  ON public.reportes_vehiculos(vehiculo_id, periodo_inicio, periodo_fin);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Reportes authenticated read'
  ) THEN
    CREATE POLICY "Reportes authenticated read"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (bucket_id = 'reportes');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Reportes authenticated insert'
  ) THEN
    CREATE POLICY "Reportes authenticated insert"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'reportes');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Reportes authenticated update'
  ) THEN
    CREATE POLICY "Reportes authenticated update"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (bucket_id = 'reportes')
    WITH CHECK (bucket_id = 'reportes');
  END IF;
END $$;
