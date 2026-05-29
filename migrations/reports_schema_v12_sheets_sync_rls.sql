-- ============================================================
-- MIGRATION v12: RLS para sincronizacion de maestros desde Sheets
-- Execute after reports_schema_v9_monthly_reports_anon_policies.sql
-- ============================================================
-- La sincronizacion de Google Sheets se ejecuta desde el frontend con la anon
-- key de Supabase. Por eso necesita permisos anon para leer, insertar y
-- actualizar las tablas maestras usadas por el proceso:
--   contratos, vehiculos, conductores y configuracion.
--
-- No habilita DELETE. Las bajas se hacen por soft-delete cambiando estado.
-- ============================================================

ALTER TABLE IF EXISTS public.contratos ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.vehiculos ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.conductores ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.configuracion ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.contratos TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.vehiculos TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.conductores TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.configuracion TO anon, authenticated;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['contratos', 'vehiculos', 'conductores', 'configuracion']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Sheets sync anon select" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Sheets sync anon insert" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Sheets sync anon update" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Sheets sync authenticated select" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Sheets sync authenticated insert" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Sheets sync authenticated update" ON public.%I', t);

    EXECUTE format(
      'CREATE POLICY "Sheets sync anon select" ON public.%I FOR SELECT TO anon USING (true)',
      t
    );
    EXECUTE format(
      'CREATE POLICY "Sheets sync anon insert" ON public.%I FOR INSERT TO anon WITH CHECK (true)',
      t
    );
    EXECUTE format(
      'CREATE POLICY "Sheets sync anon update" ON public.%I FOR UPDATE TO anon USING (true) WITH CHECK (true)',
      t
    );

    EXECUTE format(
      'CREATE POLICY "Sheets sync authenticated select" ON public.%I FOR SELECT TO authenticated USING (true)',
      t
    );
    EXECUTE format(
      'CREATE POLICY "Sheets sync authenticated insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (true)',
      t
    );
    EXECUTE format(
      'CREATE POLICY "Sheets sync authenticated update" ON public.%I FOR UPDATE TO authenticated USING (true) WITH CHECK (true)',
      t
    );
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

