-- ==================== SCRIPT SQL PARA AUDITORÍA DE FLOTA ====================
-- Ejecuta este script en el SQL Editor de Supabase
-- https://supabase.com/dashboard/project/YOUR_PROJECT/sql

-- ==================== TABLA: file_uploads ====================
-- Registra cada archivo cargado (FAGOR o COLTRACK)

CREATE TABLE IF NOT EXISTS file_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('FAGOR', 'COLTRACK')),
  upload_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_rows INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para mejorar rendimiento
CREATE INDEX IF NOT EXISTS idx_file_uploads_source ON file_uploads(source);
CREATE INDEX IF NOT EXISTS idx_file_uploads_upload_date ON file_uploads(upload_date DESC);

-- ==================== TABLA: batch_alerts ====================
-- Almacena todas las alertas procesadas de los archivos batch

CREATE TABLE IF NOT EXISTS batch_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id UUID NOT NULL REFERENCES file_uploads(id) ON DELETE CASCADE,
  plate TEXT NOT NULL,
  alert_type TEXT NOT NULL,
  speed NUMERIC(6, 2),
  timestamp TIMESTAMPTZ NOT NULL,
  driver TEXT,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  is_grave BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para mejorar rendimiento
CREATE INDEX IF NOT EXISTS idx_batch_alerts_upload_id ON batch_alerts(upload_id);
CREATE INDEX IF NOT EXISTS idx_batch_alerts_plate ON batch_alerts(plate);
CREATE INDEX IF NOT EXISTS idx_batch_alerts_is_grave ON batch_alerts(is_grave);
CREATE INDEX IF NOT EXISTS idx_batch_alerts_timestamp ON batch_alerts(timestamp DESC);

-- ==================== RLS (Row Level Security) ====================
-- Habilitar RLS en ambas tablas

ALTER TABLE file_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE batch_alerts ENABLE ROW LEVEL SECURITY;

-- ==================== POLÍTICAS RLS ====================
-- Permitir todas las operaciones para usuarios autenticados

-- file_uploads: SELECT
DROP POLICY IF EXISTS "Allow authenticated users to select file_uploads" ON file_uploads;
CREATE POLICY "Allow authenticated users to select file_uploads"
  ON file_uploads FOR SELECT
  TO authenticated
  USING (true);

-- file_uploads: INSERT
DROP POLICY IF EXISTS "Allow authenticated users to insert file_uploads" ON file_uploads;
CREATE POLICY "Allow authenticated users to insert file_uploads"
  ON file_uploads FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- file_uploads: UPDATE
DROP POLICY IF EXISTS "Allow authenticated users to update file_uploads" ON file_uploads;
CREATE POLICY "Allow authenticated users to update file_uploads"
  ON file_uploads FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- file_uploads: DELETE
DROP POLICY IF EXISTS "Allow authenticated users to delete file_uploads" ON file_uploads;
CREATE POLICY "Allow authenticated users to delete file_uploads"
  ON file_uploads FOR DELETE
  TO authenticated
  USING (true);

-- batch_alerts: SELECT
DROP POLICY IF EXISTS "Allow authenticated users to select batch_alerts" ON batch_alerts;
CREATE POLICY "Allow authenticated users to select batch_alerts"
  ON batch_alerts FOR SELECT
  TO authenticated
  USING (true);

-- batch_alerts: INSERT
DROP POLICY IF EXISTS "Allow authenticated users to insert batch_alerts" ON batch_alerts;
CREATE POLICY "Allow authenticated users to insert batch_alerts"
  ON batch_alerts FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- batch_alerts: UPDATE
DROP POLICY IF EXISTS "Allow authenticated users to update batch_alerts" ON batch_alerts;
CREATE POLICY "Allow authenticated users to update batch_alerts"
  ON batch_alerts FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- batch_alerts: DELETE
DROP POLICY IF EXISTS "Allow authenticated users to delete batch_alerts" ON batch_alerts;
CREATE POLICY "Allow authenticated users to delete batch_alerts"
  ON batch_alerts FOR DELETE
  TO authenticated
  USING (true);

-- ==================== VISTA PARA CONSULTAS RÁPIDAS ====================
-- Vista que une file_uploads con conteo de alertas

CREATE OR REPLACE VIEW audit_summary AS
SELECT
  fu.id,
  fu.filename,
  fu.source,
  fu.upload_date,
  fu.processed_rows,
  COUNT(ba.id) AS total_alerts,
  COUNT(CASE WHEN ba.is_grave = TRUE THEN 1 END) AS total_graves
FROM file_uploads fu
LEFT JOIN batch_alerts ba ON fu.id = ba.upload_id
GROUP BY fu.id, fu.filename, fu.source, fu.upload_date, fu.processed_rows
ORDER BY fu.upload_date DESC;

-- Permitir SELECT en la vista
GRANT SELECT ON audit_summary TO authenticated;

-- ==================== MENSAJE DE CONFIRMACIÓN ====================
-- Si ves este mensaje sin errores, las tablas fueron creadas correctamente

DO $$
BEGIN
  RAISE NOTICE '✅ Tablas creadas correctamente: file_uploads, batch_alerts';
  RAISE NOTICE '✅ Políticas RLS configuradas';
  RAISE NOTICE '✅ Vista audit_summary creada';
  RAISE NOTICE '🚀 Ya puedes usar el módulo de Auditoría de Flota';
END $$;
