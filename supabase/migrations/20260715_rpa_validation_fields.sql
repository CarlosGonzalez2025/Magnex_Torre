-- =============================================================================
-- MIGRACIÓN: Columnas para Agente RPA y Capturas de Pantalla (saved_alerts & alert_history)
-- =============================================================================

-- 1. Agregar columnas a la tabla de alertas auto-guardadas (saved_alerts)
ALTER TABLE saved_alerts ADD COLUMN IF NOT EXISTS screenshot_url TEXT;
ALTER TABLE saved_alerts ADD COLUMN IF NOT EXISTS validation_reason TEXT;
ALTER TABLE saved_alerts ADD COLUMN IF NOT EXISTS is_real_alert BOOLEAN;

-- 2. Agregar columnas a la tabla de historial de seguimiento (alert_history)
ALTER TABLE alert_history ADD COLUMN IF NOT EXISTS screenshot_url TEXT;
ALTER TABLE alert_history ADD COLUMN IF NOT EXISTS validation_reason TEXT;
ALTER TABLE alert_history ADD COLUMN IF NOT EXISTS is_real_alert BOOLEAN;

-- 3. Crear el bucket de almacenamiento público para las capturas de GPS si no existe
-- Nota: Esto requiere que las políticas de storage lo permitan.
-- En Supabase es recomendado crearlo desde el Dashboard de Storage con el nombre 'gps-alerts-screenshots' y acceso Público.
