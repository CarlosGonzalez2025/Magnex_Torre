-- =====================================================
-- TABLA: drivers (Gestión de Conductores)
-- Ejecutar en Supabase SQL Editor
-- =====================================================

-- 1. Crear tabla de conductores
CREATE TABLE IF NOT EXISTS drivers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Identificación
  document_type VARCHAR(10) NOT NULL DEFAULT 'CC' CHECK (document_type IN ('CC', 'CE', 'TI', 'PAS')),
  document_number VARCHAR(50) NOT NULL UNIQUE,
  
  -- Datos personales
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(200),
  phone VARCHAR(50),
  photo_url TEXT,
  
  -- Licencia de conducción
  license_number VARCHAR(50),
  license_category VARCHAR(10), -- A1, A2, B1, B2, B3, C1, C2, C3
  license_expiry DATE,
  
  -- Estado y asignación
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'on_leave')),
  assigned_vehicle VARCHAR(50), -- Placa del vehículo asignado
  hire_date DATE,
  
  -- Notas adicionales
  notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Índices
CREATE INDEX IF NOT EXISTS idx_drivers_document ON drivers(document_number);
CREATE INDEX IF NOT EXISTS idx_drivers_status ON drivers(status);
CREATE INDEX IF NOT EXISTS idx_drivers_vehicle ON drivers(assigned_vehicle);
CREATE INDEX IF NOT EXISTS idx_drivers_name ON drivers(first_name, last_name);

-- 3. Trigger para actualizar updated_at
DROP TRIGGER IF EXISTS update_drivers_updated_at ON drivers;
CREATE TRIGGER update_drivers_updated_at
  BEFORE UPDATE ON drivers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 4. RLS (Row Level Security)
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;

-- Política temporal: acceso completo (ajustar en producción)
CREATE POLICY "Enable all access for drivers" ON drivers
  FOR ALL USING (true) WITH CHECK (true);

-- =====================================================
-- TABLA: geofences (Geocercas)
-- =====================================================

CREATE TABLE IF NOT EXISTS geofences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Identificación
  name VARCHAR(200) NOT NULL,
  description TEXT,
  
  -- Tipo de geocerca
  geofence_type VARCHAR(20) NOT NULL DEFAULT 'polygon' CHECK (geofence_type IN ('polygon', 'circle', 'rectangle')),
  
  -- Geometría (JSON con coordenadas)
  -- Para polígono: [{ lat, lng }, { lat, lng }, ...]
  -- Para círculo: { center: { lat, lng }, radius: number (metros) }
  -- Para rectángulo: { bounds: { north, south, east, west } }
  geometry JSONB NOT NULL,
  
  -- Centro y radio (para búsquedas rápidas)
  center_lat NUMERIC(10, 7),
  center_lng NUMERIC(10, 7),
  radius_meters NUMERIC(10, 2),
  
  -- Configuración de alertas
  alert_on_entry BOOLEAN DEFAULT true,
  alert_on_exit BOOLEAN DEFAULT true,
  alert_severity VARCHAR(20) DEFAULT 'medium' CHECK (alert_severity IN ('critical', 'high', 'medium', 'low')),
  
  -- Restricciones de tiempo (horarios permitidos/prohibidos)
  time_restrictions JSONB, -- { days: [1,2,3,4,5], start_time: "08:00", end_time: "18:00" }
  is_restricted_zone BOOLEAN DEFAULT false, -- Si es zona prohibida
  
  -- Asignación
  contract VARCHAR(200),
  applies_to_all BOOLEAN DEFAULT true, -- Si aplica a todos los vehículos
  vehicle_plates TEXT[], -- Placas específicas si no aplica a todos
  
  -- Estado
  is_active BOOLEAN DEFAULT true,
  
  -- Colores para visualización
  fill_color VARCHAR(20) DEFAULT '#3B82F6',
  stroke_color VARCHAR(20) DEFAULT '#1D4ED8',
  fill_opacity NUMERIC(3, 2) DEFAULT 0.2,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by VARCHAR(200) DEFAULT 'Sistema'
);

-- Índices para geofences
CREATE INDEX IF NOT EXISTS idx_geofences_active ON geofences(is_active);
CREATE INDEX IF NOT EXISTS idx_geofences_contract ON geofences(contract);
CREATE INDEX IF NOT EXISTS idx_geofences_type ON geofences(geofence_type);

-- Trigger para updated_at
DROP TRIGGER IF EXISTS update_geofences_updated_at ON geofences;
CREATE TRIGGER update_geofences_updated_at
  BEFORE UPDATE ON geofences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE geofences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable all access for geofences" ON geofences
  FOR ALL USING (true) WITH CHECK (true);

-- =====================================================
-- TABLA: geofence_events (Eventos de geocercas)
-- =====================================================

CREATE TABLE IF NOT EXISTS geofence_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  geofence_id UUID NOT NULL REFERENCES geofences(id) ON DELETE CASCADE,
  vehicle_plate VARCHAR(50) NOT NULL,
  driver VARCHAR(200),
  
  event_type VARCHAR(20) NOT NULL CHECK (event_type IN ('entry', 'exit')),
  event_datetime TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Ubicación del evento
  latitude NUMERIC(10, 7) NOT NULL,
  longitude NUMERIC(10, 7) NOT NULL,
  location_name VARCHAR(500),
  
  -- Si se generó alerta
  alert_generated BOOLEAN DEFAULT false,
  alert_id UUID REFERENCES saved_alerts(id),
  
  -- Contexto adicional
  speed NUMERIC(10, 2),
  source VARCHAR(50),
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_geofence_events_geofence ON geofence_events(geofence_id);
CREATE INDEX IF NOT EXISTS idx_geofence_events_vehicle ON geofence_events(vehicle_plate);
CREATE INDEX IF NOT EXISTS idx_geofence_events_datetime ON geofence_events(event_datetime DESC);

-- RLS
ALTER TABLE geofence_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable all access for geofence_events" ON geofence_events
  FOR ALL USING (true) WITH CHECK (true);

-- =====================================================
-- VERIFICACIÓN
-- =====================================================

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('drivers', 'geofences', 'geofence_events');
