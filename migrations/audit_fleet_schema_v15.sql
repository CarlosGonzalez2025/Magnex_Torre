-- ============================================================
-- MIGRATION v15: Esquema y RLS para Auditoria de Flota
-- Execute after reports_schema_v14_daily_upload_rls.sql
-- ============================================================
-- El modulo components/BatchUpload.tsx escribe desde el frontend usando
-- la anon key de Supabase. Necesita:
--   - registrar cada archivo en file_uploads
--   - insertar las alertas procesadas en batch_alerts
--   - leer, filtrar y eliminar registros desde la UI
--
-- Esta migracion es idempotente y corrige proyectos donde las tablas ya
-- existen pero no tienen las columnas que espera auditService.ts.
-- ============================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated;

CREATE TABLE IF NOT EXISTS public.file_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL
);

ALTER TABLE public.file_uploads
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS upload_date TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS processed_rows INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

UPDATE public.file_uploads
SET
  source = COALESCE(source, 'FAGOR'),
  upload_date = COALESCE(upload_date, created_at, NOW()),
  processed_rows = COALESCE(processed_rows, 0),
  created_at = COALESCE(created_at, upload_date, NOW());

ALTER TABLE public.file_uploads
  ALTER COLUMN source SET NOT NULL,
  ALTER COLUMN upload_date SET NOT NULL,
  ALTER COLUMN processed_rows SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'file_uploads_source_check'
      AND conrelid = 'public.file_uploads'::regclass
  ) THEN
    ALTER TABLE public.file_uploads
      ADD CONSTRAINT file_uploads_source_check
      CHECK (source IN ('FAGOR', 'COLTRACK'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.batch_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);

ALTER TABLE public.batch_alerts
  ADD COLUMN IF NOT EXISTS upload_id UUID,
  ADD COLUMN IF NOT EXISTS plate TEXT,
  ADD COLUMN IF NOT EXISTS type TEXT,
  ADD COLUMN IF NOT EXISTS alert_type TEXT,
  ADD COLUMN IF NOT EXISTS speed NUMERIC(6, 2),
  ADD COLUMN IF NOT EXISTS "timestamp" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS driver TEXT,
  ADD COLUMN IF NOT EXISTS severity TEXT DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS is_grave BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 8),
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(11, 8),
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

UPDATE public.batch_alerts
SET
  type = COALESCE(type, alert_type, 'Sin especificar'),
  alert_type = COALESCE(alert_type, type, 'Sin especificar'),
  severity = COALESCE(severity, 'medium'),
  is_grave = COALESCE(is_grave, FALSE),
  created_at = COALESCE(created_at, NOW());

ALTER TABLE public.batch_alerts
  ALTER COLUMN type SET NOT NULL,
  ALTER COLUMN alert_type SET NOT NULL,
  ALTER COLUMN severity SET NOT NULL,
  ALTER COLUMN is_grave SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'batch_alerts_upload_id_fkey'
      AND conrelid = 'public.batch_alerts'::regclass
  ) THEN
    ALTER TABLE public.batch_alerts
      ADD CONSTRAINT batch_alerts_upload_id_fkey
      FOREIGN KEY (upload_id)
      REFERENCES public.file_uploads(id)
      ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'batch_alerts_severity_check'
      AND conrelid = 'public.batch_alerts'::regclass
  ) THEN
    ALTER TABLE public.batch_alerts
      ADD CONSTRAINT batch_alerts_severity_check
      CHECK (severity IN ('low', 'medium', 'high', 'critical'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_file_uploads_source
  ON public.file_uploads(source);
CREATE INDEX IF NOT EXISTS idx_file_uploads_upload_date
  ON public.file_uploads(upload_date DESC);
CREATE INDEX IF NOT EXISTS idx_batch_alerts_upload_id
  ON public.batch_alerts(upload_id);
CREATE INDEX IF NOT EXISTS idx_batch_alerts_plate
  ON public.batch_alerts(plate);
CREATE INDEX IF NOT EXISTS idx_batch_alerts_is_grave
  ON public.batch_alerts(is_grave);
CREATE INDEX IF NOT EXISTS idx_batch_alerts_timestamp
  ON public.batch_alerts("timestamp" DESC);
CREATE INDEX IF NOT EXISTS idx_batch_alerts_plate_timestamp
  ON public.batch_alerts(UPPER(TRIM(plate)), "timestamp" DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.file_uploads TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.batch_alerts TO anon, authenticated;

ALTER TABLE public.file_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batch_alerts ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['file_uploads', 'batch_alerts']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Audit fleet select anon" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Audit fleet insert anon" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Audit fleet update anon" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Audit fleet delete anon" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Audit fleet select authenticated" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Audit fleet insert authenticated" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Audit fleet update authenticated" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Audit fleet delete authenticated" ON public.%I', t);

    EXECUTE format(
      'CREATE POLICY "Audit fleet select anon" ON public.%I FOR SELECT TO anon USING (true)',
      t
    );
    EXECUTE format(
      'CREATE POLICY "Audit fleet insert anon" ON public.%I FOR INSERT TO anon WITH CHECK (true)',
      t
    );
    EXECUTE format(
      'CREATE POLICY "Audit fleet update anon" ON public.%I FOR UPDATE TO anon USING (true) WITH CHECK (true)',
      t
    );
    EXECUTE format(
      'CREATE POLICY "Audit fleet delete anon" ON public.%I FOR DELETE TO anon USING (true)',
      t
    );

    EXECUTE format(
      'CREATE POLICY "Audit fleet select authenticated" ON public.%I FOR SELECT TO authenticated USING (true)',
      t
    );
    EXECUTE format(
      'CREATE POLICY "Audit fleet insert authenticated" ON public.%I FOR INSERT TO authenticated WITH CHECK (true)',
      t
    );
    EXECUTE format(
      'CREATE POLICY "Audit fleet update authenticated" ON public.%I FOR UPDATE TO authenticated USING (true) WITH CHECK (true)',
      t
    );
    EXECUTE format(
      'CREATE POLICY "Audit fleet delete authenticated" ON public.%I FOR DELETE TO authenticated USING (true)',
      t
    );
  END LOOP;
END $$;

CREATE OR REPLACE VIEW public.audit_summary AS
SELECT
  fu.id,
  fu.filename,
  fu.source,
  fu.upload_date,
  fu.processed_rows,
  COUNT(ba.id) AS total_alerts,
  COUNT(CASE WHEN ba.is_grave = TRUE THEN 1 END) AS total_graves
FROM public.file_uploads fu
LEFT JOIN public.batch_alerts ba ON fu.id = ba.upload_id
GROUP BY fu.id, fu.filename, fu.source, fu.upload_date, fu.processed_rows
ORDER BY fu.upload_date DESC;

GRANT SELECT ON public.audit_summary TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
