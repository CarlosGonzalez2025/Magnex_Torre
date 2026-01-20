-- ==================== FIX PARA POLÍTICAS RLS ====================
-- Este script corrige las políticas RLS para garantizar acceso completo
-- Ejecuta este script en el SQL Editor de Supabase

-- OPCIÓN 1: Permitir acceso público (más simple, menos seguro)
-- Descomentar si quieres permitir acceso sin autenticación

-- DROP POLICY IF EXISTS "file_uploads_select_public" ON file_uploads;
-- DROP POLICY IF EXISTS "batch_alerts_select_public" ON batch_alerts;

-- CREATE POLICY "file_uploads_select_public" ON file_uploads FOR SELECT TO public USING (true);
-- CREATE POLICY "batch_alerts_select_public" ON batch_alerts FOR SELECT TO public USING (true);


-- OPCIÓN 2: Permitir acceso a autenticados Y anónimos (recomendado)

-- Eliminar políticas restrictivas existentes
DROP POLICY IF EXISTS "file_uploads_select" ON file_uploads;
DROP POLICY IF EXISTS "batch_alerts_select" ON batch_alerts;

-- Crear nuevas políticas más permisivas
CREATE POLICY "file_uploads_select_all" ON file_uploads
  FOR SELECT
  USING (true);

CREATE POLICY "batch_alerts_select_all" ON batch_alerts
  FOR SELECT
  USING (true);


-- OPCIÓN 3: Deshabilitar RLS completamente (solo para desarrollo)
-- Descomentar SOLO si estás en desarrollo y nada más funciona

-- ALTER TABLE file_uploads DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE batch_alerts DISABLE ROW LEVEL SECURITY;


-- Verificar que las políticas estén activas
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE tablename IN ('file_uploads', 'batch_alerts')
ORDER BY tablename, policyname;
