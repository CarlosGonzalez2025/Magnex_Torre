-- ============================================================
-- MIGRATION v17: Add GEOTAB source to file_uploads check constraint
-- ============================================================

-- 1. Eliminar check constraint antiguo si existe
ALTER TABLE public.file_uploads DROP CONSTRAINT IF EXISTS file_uploads_source_check;

-- 2. Crear nuevo check constraint que incluye 'GEOTAB'
ALTER TABLE public.file_uploads ADD CONSTRAINT file_uploads_source_check CHECK (source IN ('FAGOR', 'COLTRACK', 'GEOTAB'));

-- 3. Notificar a PostgREST para recargar el esquema
NOTIFY pgrst, 'reload schema';
