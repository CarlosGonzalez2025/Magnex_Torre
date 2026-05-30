-- Migration: Create alert_severity_config table
-- Description: Allow admins to configure which alert types are critical/high/medium/low
-- Date: 2026-01-06

-- Create table for alert severity configuration
CREATE TABLE IF NOT EXISTS alert_severity_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type TEXT NOT NULL UNIQUE,
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_alert_severity_config_type ON alert_severity_config(alert_type);
CREATE INDEX IF NOT EXISTS idx_alert_severity_config_active ON alert_severity_config(is_active);

-- Insert default configuration
INSERT INTO alert_severity_config (alert_type, severity, description) VALUES
  ('Exceso de Velocidad', 'critical', 'Vehículo superando límite de velocidad configurado'),
  ('Botón de Pánico', 'critical', 'Conductor activó el botón de pánico'),
  ('Frenada Brusca', 'high', 'Desaceleración brusca detectada'),
  ('Aceleración Brusca', 'high', 'Aceleración brusca detectada'),
  ('Salida de Geocerca', 'high', 'Vehículo salió de zona autorizada'),
  ('Entrada a Geocerca', 'medium', 'Vehículo entró a zona de interés'),
  ('Motor Apagado', 'low', 'Motor del vehículo apagado'),
  ('Batería Desconectada', 'critical', 'GPS desconectado - posible manipulación'),
  ('Ralentí Excesivo', 'medium', 'Vehículo en ralentí por tiempo prolongado'),
  ('Alerta General', 'low', 'Evento general sin categoría específica')
ON CONFLICT (alert_type) DO NOTHING;

-- Add RLS policies
ALTER TABLE alert_severity_config ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone authenticated can read
CREATE POLICY "Allow authenticated read access to alert_severity_config"
ON alert_severity_config FOR SELECT
TO authenticated
USING (true);

-- Policy: Only admins can insert/update/delete
CREATE POLICY "Allow admin write access to alert_severity_config"
ON alert_severity_config FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_profiles.id = auth.uid()
    AND user_profiles.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_profiles.id = auth.uid()
    AND user_profiles.role = 'admin'
  )
);

-- Add comments
COMMENT ON TABLE alert_severity_config IS 'Configuration table to define severity levels for each alert type';
COMMENT ON COLUMN alert_severity_config.alert_type IS 'Type of alert (must match AlertType enum)';
COMMENT ON COLUMN alert_severity_config.severity IS 'Severity level: critical, high, medium, or low';
COMMENT ON COLUMN alert_severity_config.description IS 'Description of what this alert type means';
COMMENT ON COLUMN alert_severity_config.is_active IS 'Whether this alert type is currently enabled';
