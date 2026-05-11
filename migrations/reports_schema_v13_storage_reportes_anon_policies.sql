-- ============================================================
-- MIGRATION v13: Storage RLS para bucket reportes desde frontend
-- Execute after reports_schema_v9_monthly_reports_anon_policies.sql
-- ============================================================
-- La carga de Informes Diarios sube el Excel desde el frontend usando
-- supabase.storage.from('reportes').upload('excel/...').
--
-- En produccion/Vercel el cliente puede llegar a Storage con rol anon
-- aunque exista usuario visual en la app, por eso el bucket necesita
-- politicas explicitas para anon ademas de authenticated.
--
-- Se limita al bucket reportes y a la carpeta excel/.
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('reportes', 'reportes', false)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  DROP POLICY IF EXISTS "Reportes frontend read excel" ON storage.objects;
  DROP POLICY IF EXISTS "Reportes frontend insert excel" ON storage.objects;
  DROP POLICY IF EXISTS "Reportes frontend update excel" ON storage.objects;

  CREATE POLICY "Reportes frontend read excel"
    ON storage.objects
    FOR SELECT
    TO anon, authenticated
    USING (
      bucket_id = 'reportes'
      AND (storage.foldername(name))[1] = 'excel'
    );

  CREATE POLICY "Reportes frontend insert excel"
    ON storage.objects
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (
      bucket_id = 'reportes'
      AND (storage.foldername(name))[1] = 'excel'
    );

  CREATE POLICY "Reportes frontend update excel"
    ON storage.objects
    FOR UPDATE
    TO anon, authenticated
    USING (
      bucket_id = 'reportes'
      AND (storage.foldername(name))[1] = 'excel'
    )
    WITH CHECK (
      bucket_id = 'reportes'
      AND (storage.foldername(name))[1] = 'excel'
    );
END $$;

NOTIFY pgrst, 'reload schema';
