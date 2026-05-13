-- ============================================================
-- MIGRATION v16: Acciones completas para modulos de ALERTAS
-- Execute after alerts_realtime_reliability_v10.sql
-- ============================================================
-- Corrige el contrato usado por:
--   - Centro de Alertas: guardar alertas manualmente
--   - Alertas Guardadas: mover, actualizar y eliminar
--   - Historial: cambiar estado, eliminar, planes de accion
--   - Adjuntos de planes: Supabase Storage
--
-- La app usa la anon key desde el frontend, por eso se habilitan
-- politicas explicitas para anon y authenticated.
-- ============================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.saved_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id TEXT NOT NULL,
  vehicle_id TEXT NOT NULL,
  plate TEXT NOT NULL,
  driver TEXT NOT NULL,
  type TEXT NOT NULL,
  severity TEXT NOT NULL,
  "timestamp" TIMESTAMPTZ NOT NULL,
  location TEXT NOT NULL,
  speed NUMERIC(10, 2) NOT NULL DEFAULT 0,
  details TEXT NOT NULL,
  contract TEXT,
  source TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  saved_at TIMESTAMPTZ DEFAULT NOW(),
  saved_by TEXT DEFAULT 'Sistema (Auto)',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.saved_alerts
  ADD COLUMN IF NOT EXISTS moved_to_history BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS moved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS moved_by TEXT;

UPDATE public.saved_alerts
SET
  status = COALESCE(status, 'pending'),
  moved_to_history = COALESCE(moved_to_history, FALSE),
  saved_at = COALESCE(saved_at, created_at, NOW()),
  created_at = COALESCE(created_at, saved_at, NOW()),
  updated_at = COALESCE(updated_at, created_at, NOW());

ALTER TABLE public.saved_alerts
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN moved_to_history SET DEFAULT FALSE,
  ALTER COLUMN moved_to_history SET NOT NULL,
  ALTER COLUMN saved_at SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;

CREATE TABLE IF NOT EXISTS public.alert_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id TEXT NOT NULL,
  vehicle_id TEXT NOT NULL,
  plate TEXT NOT NULL,
  driver TEXT NOT NULL,
  type TEXT NOT NULL,
  severity TEXT NOT NULL,
  "timestamp" TIMESTAMPTZ NOT NULL,
  location TEXT NOT NULL,
  speed NUMERIC(10, 2) NOT NULL DEFAULT 0,
  details TEXT NOT NULL,
  contract TEXT,
  source TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  saved_by TEXT DEFAULT 'Usuario',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.alert_history
  ADD COLUMN IF NOT EXISTS saved_alert_id UUID,
  ADD COLUMN IF NOT EXISTS saved_at TIMESTAMPTZ DEFAULT NOW();

UPDATE public.alert_history
SET
  status = COALESCE(status, 'pending'),
  saved_at = COALESCE(saved_at, created_at, NOW()),
  created_at = COALESCE(created_at, saved_at, NOW()),
  updated_at = COALESCE(updated_at, created_at, NOW());

ALTER TABLE public.alert_history
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN saved_at SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'alert_history_saved_alert_id_fkey'
      AND conrelid = 'public.alert_history'::regclass
  ) THEN
    ALTER TABLE public.alert_history
      ADD CONSTRAINT alert_history_saved_alert_id_fkey
      FOREIGN KEY (saved_alert_id)
      REFERENCES public.saved_alerts(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.action_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_history_id UUID NOT NULL REFERENCES public.alert_history(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  responsible TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  observations TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT DEFAULT 'Sistema'
);

ALTER TABLE public.action_plans
  ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;

UPDATE public.action_plans
SET
  status = COALESCE(status, 'pending'),
  attachments = COALESCE(attachments, '[]'::jsonb),
  created_at = COALESCE(created_at, NOW()),
  updated_at = COALESCE(updated_at, created_at, NOW());

ALTER TABLE public.action_plans
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN attachments SET DEFAULT '[]'::jsonb,
  ALTER COLUMN attachments SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;

-- Reemplazar constraints antiguos para soportar el estado "invalid" del UI.
DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  FOR constraint_name IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'alert_history'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.alert_history DROP CONSTRAINT %I', constraint_name);
  END LOOP;

  FOR constraint_name IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'saved_alerts'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.saved_alerts DROP CONSTRAINT %I', constraint_name);
  END LOOP;

  FOR constraint_name IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'action_plans'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.action_plans DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

ALTER TABLE public.saved_alerts
  ADD CONSTRAINT saved_alerts_status_check
  CHECK (status IN ('pending', 'in_progress', 'resolved', 'invalid'));

ALTER TABLE public.alert_history
  ADD CONSTRAINT alert_history_status_check
  CHECK (status IN ('pending', 'in_progress', 'resolved', 'invalid'));

ALTER TABLE public.action_plans
  ADD CONSTRAINT action_plans_status_check
  CHECK (status IN ('pending', 'in_progress', 'completed'));

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  FOR constraint_name IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'saved_alerts'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%severity%'
  LOOP
    EXECUTE format('ALTER TABLE public.saved_alerts DROP CONSTRAINT %I', constraint_name);
  END LOOP;

  FOR constraint_name IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'alert_history'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%severity%'
  LOOP
    EXECUTE format('ALTER TABLE public.alert_history DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

ALTER TABLE public.saved_alerts
  ADD CONSTRAINT saved_alerts_severity_check
  CHECK (severity IN ('critical', 'high', 'medium', 'low'));

ALTER TABLE public.alert_history
  ADD CONSTRAINT alert_history_severity_check
  CHECK (severity IN ('critical', 'high', 'medium', 'low'));

CREATE INDEX IF NOT EXISTS idx_saved_alerts_status_timestamp
  ON public.saved_alerts(status, "timestamp" DESC);
CREATE INDEX IF NOT EXISTS idx_saved_alerts_moved_timestamp
  ON public.saved_alerts(moved_to_history, "timestamp" DESC);
CREATE INDEX IF NOT EXISTS idx_saved_alerts_plate_type_timestamp
  ON public.saved_alerts(UPPER(TRIM(plate)), type, "timestamp" DESC);
CREATE UNIQUE INDEX IF NOT EXISTS saved_alerts_unique_event_uidx
  ON public.saved_alerts (UPPER(TRIM(plate)), type, "timestamp")
  WHERE plate IS NOT NULL AND type IS NOT NULL AND "timestamp" IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_alert_history_status_timestamp
  ON public.alert_history(status, "timestamp" DESC);
CREATE INDEX IF NOT EXISTS idx_alert_history_plate_type_timestamp
  ON public.alert_history(UPPER(TRIM(plate)), type, "timestamp" DESC);
CREATE UNIQUE INDEX IF NOT EXISTS alert_history_unique_event_uidx
  ON public.alert_history (UPPER(TRIM(plate)), type, "timestamp")
  WHERE plate IS NOT NULL AND type IS NOT NULL AND "timestamp" IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_action_plans_alert_id
  ON public.action_plans(alert_history_id);
CREATE INDEX IF NOT EXISTS idx_action_plans_attachments
  ON public.action_plans USING GIN (attachments);

DROP TRIGGER IF EXISTS update_saved_alerts_updated_at ON public.saved_alerts;
CREATE TRIGGER update_saved_alerts_updated_at
  BEFORE UPDATE ON public.saved_alerts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_alert_history_updated_at ON public.alert_history;
CREATE TRIGGER update_alert_history_updated_at
  BEFORE UPDATE ON public.alert_history
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_action_plans_updated_at ON public.action_plans;
CREATE TRIGGER update_action_plans_updated_at
  BEFORE UPDATE ON public.action_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_alerts TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alert_history TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.action_plans TO anon, authenticated;

ALTER TABLE public.saved_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_plans ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['saved_alerts', 'alert_history', 'action_plans']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Alerts module select anon" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Alerts module insert anon" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Alerts module update anon" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Alerts module delete anon" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Alerts module select authenticated" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Alerts module insert authenticated" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Alerts module update authenticated" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Alerts module delete authenticated" ON public.%I', t);

    EXECUTE format('CREATE POLICY "Alerts module select anon" ON public.%I FOR SELECT TO anon USING (true)', t);
    EXECUTE format('CREATE POLICY "Alerts module insert anon" ON public.%I FOR INSERT TO anon WITH CHECK (true)', t);
    EXECUTE format('CREATE POLICY "Alerts module update anon" ON public.%I FOR UPDATE TO anon USING (true) WITH CHECK (true)', t);
    EXECUTE format('CREATE POLICY "Alerts module delete anon" ON public.%I FOR DELETE TO anon USING (true)', t);
    EXECUTE format('CREATE POLICY "Alerts module select authenticated" ON public.%I FOR SELECT TO authenticated USING (true)', t);
    EXECUTE format('CREATE POLICY "Alerts module insert authenticated" ON public.%I FOR INSERT TO authenticated WITH CHECK (true)', t);
    EXECUTE format('CREATE POLICY "Alerts module update authenticated" ON public.%I FOR UPDATE TO authenticated USING (true) WITH CHECK (true)', t);
    EXECUTE format('CREATE POLICY "Alerts module delete authenticated" ON public.%I FOR DELETE TO authenticated USING (true)', t);
  END LOOP;
END $$;

-- Storage para evidencias de planes de accion.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'action-plan-attachments',
  'action-plan-attachments',
  true,
  10485760,
  ARRAY[
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    'application/zip',
    'application/x-rar-compressed'
  ]::TEXT[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$
BEGIN
  DROP POLICY IF EXISTS "Action plan attachments read" ON storage.objects;
  DROP POLICY IF EXISTS "Action plan attachments insert" ON storage.objects;
  DROP POLICY IF EXISTS "Action plan attachments update" ON storage.objects;
  DROP POLICY IF EXISTS "Action plan attachments delete" ON storage.objects;

  CREATE POLICY "Action plan attachments read"
    ON storage.objects
    FOR SELECT
    TO anon, authenticated
    USING (bucket_id = 'action-plan-attachments');

  CREATE POLICY "Action plan attachments insert"
    ON storage.objects
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (bucket_id = 'action-plan-attachments');

  CREATE POLICY "Action plan attachments update"
    ON storage.objects
    FOR UPDATE
    TO anon, authenticated
    USING (bucket_id = 'action-plan-attachments')
    WITH CHECK (bucket_id = 'action-plan-attachments');

  CREATE POLICY "Action plan attachments delete"
    ON storage.objects
    FOR DELETE
    TO anon, authenticated
    USING (bucket_id = 'action-plan-attachments');
END $$;

-- Limpieza de pruebas temporales creadas por validaciones de desarrollo.
DELETE FROM public.action_plans
WHERE created_by = 'Codex Probe'
   OR description ILIKE 'Codex action plan%';

DELETE FROM public.alert_history
WHERE alert_id LIKE 'codex-alert-%'
   OR details ILIKE '%Temporary CRUD probe%';

DELETE FROM public.saved_alerts
WHERE alert_id LIKE 'codex-alert-%'
   OR details ILIKE '%Temporary CRUD probe%';

NOTIFY pgrst, 'reload schema';
