-- ============================================================
-- MIGRACIÓN v2: Añadir columnas nuevas a tablas operacionales
-- Ejecutar después de reports_schema.sql
-- ============================================================

-- ── coltrack_datos_conductor: nuevos campos ───────────────────────────────────
ALTER TABLE public.coltrack_datos_conductor
    ADD COLUMN IF NOT EXISTS nombre_conductor   TEXT,
    ADD COLUMN IF NOT EXISTS mes               TEXT,
    ADD COLUMN IF NOT EXISTS periodo           TEXT,
    ADD COLUMN IF NOT EXISTS consecutivo       TEXT,
    ADD COLUMN IF NOT EXISTS excesos_varios_params INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS estado_conductor  TEXT;

-- Renombrar duracion_*_kph → duracion_seg_*_kph si se desea (opcional)
-- Los campos existentes se mantienen con el mismo nombre.

-- ── coltrack_datos_vehiculo: nuevos campos ────────────────────────────────────
ALTER TABLE public.coltrack_datos_vehiculo
    ADD COLUMN IF NOT EXISTS mes               TEXT,
    ADD COLUMN IF NOT EXISTS periodo           TEXT,
    ADD COLUMN IF NOT EXISTS consecutivo       TEXT,
    ADD COLUMN IF NOT EXISTS excesos_varios_params INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS dispositivo_gps   TEXT,
    ADD COLUMN IF NOT EXISTS estado_gps        TEXT,
    ADD COLUMN IF NOT EXISTS tipo_activo       TEXT,
    -- Ralentís integrado (misma fila en el Excel de Operación Vehículos)
    ADD COLUMN IF NOT EXISTS encendidos_apagados  INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS ralentis_excesivos   INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS horas_motor_encendido NUMERIC(8,2),
    ADD COLUMN IF NOT EXISTS horas_motor_ralenti   NUMERIC(8,2),
    ADD COLUMN IF NOT EXISTS consumo_combustible   NUMERIC(10,2);

-- Índice adicional para búsqueda por mes/periodo
CREATE INDEX IF NOT EXISTS idx_coltrack_cond_mes
    ON public.coltrack_datos_conductor(conductor_id, mes);

CREATE INDEX IF NOT EXISTS idx_coltrack_veh_mes
    ON public.coltrack_datos_vehiculo(vehiculo_id, mes);
