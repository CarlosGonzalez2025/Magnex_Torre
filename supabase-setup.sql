-- =====================================================
-- CONFIGURACIÓN DE BASE DE DATOS PARA SISTEMA DE ALERTAS
-- Ejecuta este script en Supabase SQL Editor
-- =====================================================

-- 1. TABLA: alert_history
-- Almacena el historial completo de alertas guardadas
CREATE TABLE IF NOT EXISTS alert_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  alert_id VARCHAR(100) NOT NULL,
  vehicle_id VARCHAR(100) NOT NULL,
  plate VARCHAR(50) NOT NULL,
  driver VARCHAR(200) NOT NULL,
  type VARCHAR(100) NOT NULL,
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  timestamp TIMESTAMPTZ NOT NULL,
  location VARCHAR(500) NOT NULL,
  speed NUMERIC(10, 2) NOT NULL DEFAULT 0,
  details TEXT NOT NULL,
  contract VARCHAR(200),
  source VARCHAR(50) NOT NULL CHECK (source IN ('COLTRACK', 'FAGOR')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'resolved')),
  saved_at TIMESTAMPTZ DEFAULT NOW(),
  saved_by VARCHAR(200) DEFAULT 'Sistema',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. TABLA: action_plans
-- Almacena los planes de acción aplicados a cada alerta
CREATE TABLE IF NOT EXISTS action_plans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  alert_history_id UUID NOT NULL REFERENCES alert_history(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  responsible VARCHAR(200) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  observations TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by VARCHAR(200) DEFAULT 'Sistema'
);

-- 3. ÍNDICES para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_alert_history_plate ON alert_history(plate);
CREATE INDEX IF NOT EXISTS idx_alert_history_timestamp ON alert_history(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_alert_history_status ON alert_history(status);
CREATE INDEX IF NOT EXISTS idx_alert_history_severity ON alert_history(severity);
CREATE INDEX IF NOT EXISTS idx_action_plans_alert_id ON action_plans(alert_history_id);

-- 4. FUNCIÓN: Actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. TRIGGERS: Actualizar updated_at en ambas tablas
DROP TRIGGER IF EXISTS update_alert_history_updated_at ON alert_history;
CREATE TRIGGER update_alert_history_updated_at
  BEFORE UPDATE ON alert_history
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_action_plans_updated_at ON action_plans;
CREATE TRIGGER update_action_plans_updated_at
  BEFORE UPDATE ON action_plans
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 6. POLÍTICAS DE SEGURIDAD (Row Level Security - RLS)
-- IMPORTANTE: Por ahora, permitimos acceso público de lectura/escritura
-- En producción, deberías configurar autenticación y permisos más estrictos

ALTER TABLE alert_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_plans ENABLE ROW LEVEL SECURITY;

-- Política: Permitir todas las operaciones (temporal para desarrollo)
CREATE POLICY "Enable all access for alert_history" ON alert_history
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Enable all access for action_plans" ON action_plans
  FOR ALL USING (true) WITH CHECK (true);

-- =====================================================
-- ¡CONFIGURACIÓN COMPLETA!
-- =====================================================

-- VERIFICACIÓN: Consulta para ver las tablas creadas
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('alert_history', 'action_plans');
