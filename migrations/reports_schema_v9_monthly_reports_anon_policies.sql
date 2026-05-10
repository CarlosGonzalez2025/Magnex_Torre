-- ============================================================
-- MIGRATION v9: Permisos anon para el módulo de informes mensuales
-- Execute after reports_schema_v8_alertas_pendientes.sql
-- ============================================================
-- La aplicación usa la anon key de Supabase en el frontend. Las migraciones
-- iniciales dejaron estas tablas solo para authenticated, por lo que el módulo
-- puede cargar datos en la consola pero no verlos desde la UI.

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'conductores',
    'vehiculos',
    'contratos',
    'coltrack_datos_vehiculo',
    'coltrack_datos_conductor',
    'ralentis',
    'reportes_conductores',
    'reportes_vehiculos',
    'cargas_excel'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = t
        AND policyname = 'Acceso anon'
    ) THEN
      EXECUTE format(
        'CREATE POLICY "Acceso anon" ON public.%I FOR ALL TO anon USING (true) WITH CHECK (true)',
        t
      );
    END IF;
  END LOOP;
END $$;

UPDATE public.reportes_conductores
SET mes = to_char(periodo_inicio, 'YYYY-MM')
WHERE (mes IS NULL OR btrim(mes) = '')
  AND periodo_inicio IS NOT NULL;

UPDATE public.reportes_vehiculos
SET mes = to_char(periodo_inicio, 'YYYY-MM')
WHERE (mes IS NULL OR btrim(mes) = '')
  AND periodo_inicio IS NOT NULL;
