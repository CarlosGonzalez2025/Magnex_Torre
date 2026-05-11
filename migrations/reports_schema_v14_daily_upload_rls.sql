-- ============================================================
-- MIGRATION v14: RLS para carga de Informes Diarios desde Vercel
-- Execute after reports_schema_v13_storage_reportes_anon_policies.sql
-- ============================================================
-- La importacion diaria se ejecuta desde el frontend con anon/authenticated.
-- Necesita:
--   - leer maestros: conductores, vehiculos, contratos
--   - registrar y actualizar cargas_excel
--   - insertar/actualizar alertas_diarias_gps y alertas_diarias_pendientes
-- ============================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated;

GRANT SELECT ON public.conductores TO anon, authenticated;
GRANT SELECT ON public.vehiculos TO anon, authenticated;
GRANT SELECT ON public.contratos TO anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON public.cargas_excel TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.alertas_diarias_gps TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.alertas_diarias_pendientes TO anon, authenticated;

ALTER TABLE IF EXISTS public.conductores ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.vehiculos ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.contratos ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.cargas_excel ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.alertas_diarias_gps ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.alertas_diarias_pendientes ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['conductores', 'vehiculos', 'contratos']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Daily upload read anon" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Daily upload read authenticated" ON public.%I', t);

    EXECUTE format(
      'CREATE POLICY "Daily upload read anon" ON public.%I FOR SELECT TO anon USING (true)',
      t
    );
    EXECUTE format(
      'CREATE POLICY "Daily upload read authenticated" ON public.%I FOR SELECT TO authenticated USING (true)',
      t
    );
  END LOOP;

  FOREACH t IN ARRAY ARRAY['cargas_excel', 'alertas_diarias_gps', 'alertas_diarias_pendientes']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Daily upload select anon" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Daily upload insert anon" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Daily upload update anon" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Daily upload select authenticated" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Daily upload insert authenticated" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Daily upload update authenticated" ON public.%I', t);

    EXECUTE format(
      'CREATE POLICY "Daily upload select anon" ON public.%I FOR SELECT TO anon USING (true)',
      t
    );
    EXECUTE format(
      'CREATE POLICY "Daily upload insert anon" ON public.%I FOR INSERT TO anon WITH CHECK (true)',
      t
    );
    EXECUTE format(
      'CREATE POLICY "Daily upload update anon" ON public.%I FOR UPDATE TO anon USING (true) WITH CHECK (true)',
      t
    );

    EXECUTE format(
      'CREATE POLICY "Daily upload select authenticated" ON public.%I FOR SELECT TO authenticated USING (true)',
      t
    );
    EXECUTE format(
      'CREATE POLICY "Daily upload insert authenticated" ON public.%I FOR INSERT TO authenticated WITH CHECK (true)',
      t
    );
    EXECUTE format(
      'CREATE POLICY "Daily upload update authenticated" ON public.%I FOR UPDATE TO authenticated USING (true) WITH CHECK (true)',
      t
    );
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
