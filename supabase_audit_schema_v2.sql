-- ==================== SCRIPT SQL PARA AUDITORÍA DE FLOTA ====================
-- Ejecuta este script completo en el SQL Editor de Supabase
-- https://supabase.com/dashboard/project/YOUR_PROJECT/sql

-- PASO 1: Eliminar tablas existentes (si las hay)
DROP TABLE IF EXISTS batch_alerts CASCADE;
DROP TABLE IF EXISTS file_uploads CASCADE;
DROP VIEW IF EXISTS audit_summary CASCADE;

-- PASO 2: Crear tabla file_uploads
CREATE TABLE file_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('FAGOR', 'COLTRACK')),
  upload_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_rows INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- PASO 3: Crear tabla batch_alerts
CREATE TABLE batch_alerts (
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

-- PASO 4: Crear índices
CREATE INDEX idx_file_uploads_source ON file_uploads(source);
CREATE INDEX idx_file_uploads_upload_date ON file_uploads(upload_date DESC);
CREATE INDEX idx_batch_alerts_upload_id ON batch_alerts(upload_id);
CREATE INDEX idx_batch_alerts_plate ON batch_alerts(plate);
CREATE INDEX idx_batch_alerts_is_grave ON batch_alerts(is_grave);
CREATE INDEX idx_batch_alerts_timestamp ON batch_alerts(timestamp DESC);

-- PASO 5: Habilitar RLS
ALTER TABLE file_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE batch_alerts ENABLE ROW LEVEL SECURITY;

-- PASO 6: Crear políticas RLS (permitir todo a usuarios autenticados)

-- file_uploads policies
CREATE POLICY "file_uploads_select" ON file_uploads FOR SELECT TO authenticated USING (true);
CREATE POLICY "file_uploads_insert" ON file_uploads FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "file_uploads_update" ON file_uploads FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "file_uploads_delete" ON file_uploads FOR DELETE TO authenticated USING (true);

-- batch_alerts policies
CREATE POLICY "batch_alerts_select" ON batch_alerts FOR SELECT TO authenticated USING (true);
CREATE POLICY "batch_alerts_insert" ON batch_alerts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "batch_alerts_update" ON batch_alerts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "batch_alerts_delete" ON batch_alerts FOR DELETE TO authenticated USING (true);

-- PASO 7: Crear vista de resumen
CREATE VIEW audit_summary AS
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

-- PASO 8: Permisos en la vista
GRANT SELECT ON audit_summary TO authenticated;
