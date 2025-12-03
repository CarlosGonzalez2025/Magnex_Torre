-- =====================================================
-- TABLAS ADICIONALES PARA TORRE DE CONTROL
-- Ejecuta este script en Supabase SQL Editor
-- =====================================================

-- 1. TABLA: route_schedules
-- Almacena cronogramas de rutas planificadas
CREATE TABLE IF NOT EXISTS route_schedules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  plate VARCHAR(50) NOT NULL,
  contract VARCHAR(200),
  driver VARCHAR(200),
  route_name VARCHAR(200) NOT NULL,
  scheduled_date DATE NOT NULL,
  scheduled_start_time TIME NOT NULL,
  scheduled_end_time TIME,
  departure_location VARCHAR(500),
  arrival_location VARCHAR(500),
  estimated_distance NUMERIC(10, 2), -- en km
  notes TEXT,
  status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
  actual_start_time TIMESTAMPTZ,
  actual_end_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by VARCHAR(200) DEFAULT 'Sistema'
);

-- 2. TABLA: preoperational_inspections
-- Almacena inspecciones preoperacionales descargadas del sistema externo
CREATE TABLE IF NOT EXISTS preoperational_inspections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  inspection_key VARCHAR(100), -- "Llave" del Excel
  plate VARCHAR(50) NOT NULL,
  inspection_date DATE NOT NULL,
  inspection_datetime TIMESTAMPTZ,
  day_of_week VARCHAR(20),
  start_time TIME,
  start_location VARCHAR(500),
  end_time TIME,
  driver VARCHAR(200),
  findings_count INTEGER DEFAULT 0,
  status VARCHAR(50), -- OK, Sin inspección, Fuera de tiempo
  contract VARCHAR(200),
  vehicle_type VARCHAR(100),
  -- Campos adicionales del Excel
  raw_data JSONB, -- Almacenar datos completos del Excel
  imported_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. TABLA: vehicle_ignition_events
-- Almacena eventos de encendido/apagado para cruzar con inspecciones
CREATE TABLE IF NOT EXISTS vehicle_ignition_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  plate VARCHAR(50) NOT NULL,
  driver VARCHAR(200),
  event_type VARCHAR(20) NOT NULL CHECK (event_type IN ('ignition_on', 'ignition_off')),
  event_datetime TIMESTAMPTZ NOT NULL,
  location VARCHAR(500),
  latitude NUMERIC(10, 7),
  longitude NUMERIC(10, 7),
  source VARCHAR(50), -- COLTRACK, FAGOR
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. TABLA: idle_time_records
-- Almacena registros de tiempo en ralentí detectados
CREATE TABLE IF NOT EXISTS idle_time_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  plate VARCHAR(50) NOT NULL,
  driver VARCHAR(200),
  contract VARCHAR(200),
  start_datetime TIMESTAMPTZ NOT NULL,
  end_datetime TIMESTAMPTZ,
  duration_minutes NUMERIC(10, 2),
  location VARCHAR(500),
  latitude NUMERIC(10, 7),
  longitude NUMERIC(10, 7),
  source VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. ÍNDICES para mejorar rendimiento
CREATE INDEX IF NOT EXISTS idx_route_schedules_plate ON route_schedules(plate);
CREATE INDEX IF NOT EXISTS idx_route_schedules_date ON route_schedules(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_route_schedules_contract ON route_schedules(contract);

CREATE INDEX IF NOT EXISTS idx_inspections_plate ON preoperational_inspections(plate);
CREATE INDEX IF NOT EXISTS idx_inspections_date ON preoperational_inspections(inspection_date);
CREATE INDEX IF NOT EXISTS idx_inspections_contract ON preoperational_inspections(contract);
CREATE INDEX IF NOT EXISTS idx_inspections_status ON preoperational_inspections(status);

CREATE INDEX IF NOT EXISTS idx_ignition_plate_datetime ON vehicle_ignition_events(plate, event_datetime);
CREATE INDEX IF NOT EXISTS idx_ignition_datetime ON vehicle_ignition_events(event_datetime DESC);

CREATE INDEX IF NOT EXISTS idx_idle_plate ON idle_time_records(plate);
CREATE INDEX IF NOT EXISTS idx_idle_contract ON idle_time_records(contract);
CREATE INDEX IF NOT EXISTS idx_idle_start ON idle_time_records(start_datetime DESC);

-- 6. TRIGGERS para updated_at
DROP TRIGGER IF EXISTS update_route_schedules_updated_at ON route_schedules;
CREATE TRIGGER update_route_schedules_updated_at
  BEFORE UPDATE ON route_schedules
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_inspections_updated_at ON preoperational_inspections;
CREATE TRIGGER update_inspections_updated_at
  BEFORE UPDATE ON preoperational_inspections
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 7. POLÍTICAS RLS (Row Level Security)
ALTER TABLE route_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE preoperational_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_ignition_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE idle_time_records ENABLE ROW LEVEL SECURITY;

-- Permitir acceso completo (temporal - ajustar en producción)
CREATE POLICY "Enable all access for route_schedules" ON route_schedules
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Enable all access for preoperational_inspections" ON preoperational_inspections
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Enable all access for vehicle_ignition_events" ON vehicle_ignition_events
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Enable all access for idle_time_records" ON idle_time_records
  FOR ALL USING (true) WITH CHECK (true);

-- =====================================================
-- VISTA: Resumen de inspecciones por contrato y fecha
-- =====================================================
CREATE OR REPLACE VIEW inspection_summary AS
SELECT
  inspection_date,
  contract,
  COUNT(*) as total_vehicles,
  COUNT(CASE WHEN status = 'OK' THEN 1 END) as ok_count,
  COUNT(CASE WHEN status LIKE '%Sin inspecci%' THEN 1 END) as no_inspection_count,
  COUNT(CASE WHEN status LIKE '%Fuera de tiempo%' THEN 1 END) as late_inspection_count,
  ROUND(100.0 * COUNT(CASE WHEN status = 'OK' THEN 1 END) / NULLIF(COUNT(*), 0), 1) as ok_percentage,
  ROUND(100.0 * COUNT(CASE WHEN status LIKE '%Sin inspecci%' THEN 1 END) / NULLIF(COUNT(*), 0), 1) as no_inspection_percentage,
  ROUND(100.0 * COUNT(CASE WHEN status LIKE '%Fuera de tiempo%' THEN 1 END) / NULLIF(COUNT(*), 0), 1) as late_percentage
FROM preoperational_inspections
GROUP BY inspection_date, contract
ORDER BY inspection_date DESC, contract;

-- =====================================================
-- ¡CONFIGURACIÓN COMPLETA!
-- =====================================================

-- VERIFICACIÓN: Ver las tablas creadas
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN (
  'route_schedules',
  'preoperational_inspections',
  'vehicle_ignition_events',
  'idle_time_records'
);
