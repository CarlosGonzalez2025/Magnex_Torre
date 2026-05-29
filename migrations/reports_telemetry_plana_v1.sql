-- ============================================================
-- MÓDULO: PROCESADOR SATELITAL DIRECTO (Telemetría Plana)
-- Versión: v1 - 2026-05-29
-- Descripción: Tablas para almacenar reportes mensuales consolidados
--              generados desde archivos planos de Coltrack y Fagor.
--              Este módulo es INDEPENDIENTE del módulo de Informes Mensuales
--              basado en plantillas Excel.
-- Ejecutar en: Supabase SQL Editor con rol de administrador
-- ============================================================

-- ============================================================
-- TABLA: reportes_conductores
-- Almacena métricas consolidadas de comportamiento por conductor y período
-- Llave única: (conductor_id, periodo_inicio, periodo_fin)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.reportes_conductores (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Relación con conductor maestro
    conductor_id          UUID NOT NULL REFERENCES public.conductores(id) ON DELETE CASCADE,

    -- Período del reporte
    periodo_inicio        DATE NOT NULL,
    periodo_fin           DATE NOT NULL,
    mes                   TEXT NOT NULL,              -- Ej: '2026-05'
    fecha_reporte         DATE NOT NULL DEFAULT CURRENT_DATE,

    -- Métricas de calificación y conducción
    calificacion          NUMERIC(6,2)   DEFAULT 0,
    kms                   NUMERIC(12,2)  DEFAULT 0,
    horas_conduccion      NUMERIC(10,2)  DEFAULT 0,

    -- Excesos de velocidad por umbral
    excesos_10_kph        NUMERIC(10,2)  DEFAULT 0,
    excesos_20_kph        NUMERIC(10,2)  DEFAULT 0,
    excesos_30_kph        NUMERIC(10,2)  DEFAULT 0,
    excesos_40_kph        NUMERIC(10,2)  DEFAULT 0,
    excesos_50_kph        NUMERIC(10,2)  DEFAULT 0,
    excesos_60_kph        NUMERIC(10,2)  DEFAULT 0,
    excesos_80_kph        NUMERIC(10,2)  DEFAULT 0,

    -- Eventos de manejo brusco
    aceleraciones_bruscas NUMERIC(10,2)  DEFAULT 0,
    frenadas_bruscas      NUMERIC(10,2)  DEFAULT 0,

    -- Metadatos del conductor en el momento del reporte
    ibutton               TEXT           DEFAULT '',
    estado_conductor      TEXT           DEFAULT 'ACTIVO',
    proyecto              TEXT           DEFAULT '',

    -- Auditoría
    created_at            TIMESTAMPTZ    DEFAULT NOW(),
    updated_at            TIMESTAMPTZ    DEFAULT NOW(),

    -- Restricción de unicidad para upsert
    CONSTRAINT uq_reporte_conductor_periodo
        UNIQUE (conductor_id, periodo_inicio, periodo_fin)
);

-- Índices de búsqueda frecuentes
CREATE INDEX IF NOT EXISTS idx_reportes_conductores_conductor_id
    ON public.reportes_conductores (conductor_id);

CREATE INDEX IF NOT EXISTS idx_reportes_conductores_periodo
    ON public.reportes_conductores (periodo_inicio, periodo_fin);

CREATE INDEX IF NOT EXISTS idx_reportes_conductores_mes
    ON public.reportes_conductores (mes);

CREATE INDEX IF NOT EXISTS idx_reportes_conductores_proyecto
    ON public.reportes_conductores (proyecto);

-- Trigger para updated_at automático
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reportes_conductores_updated_at ON public.reportes_conductores;
CREATE TRIGGER trg_reportes_conductores_updated_at
    BEFORE UPDATE ON public.reportes_conductores
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- TABLA: reportes_vehiculos
-- Almacena métricas consolidadas de operación por vehículo y período
-- Llave única: (vehiculo_id, periodo_inicio, periodo_fin)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.reportes_vehiculos (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Relaciones con maestros
    vehiculo_id             UUID NOT NULL REFERENCES public.vehiculos(id) ON DELETE CASCADE,
    contrato_id             UUID REFERENCES public.contratos(id) ON DELETE SET NULL,

    -- Período del reporte
    periodo_inicio          DATE NOT NULL,
    periodo_fin             DATE NOT NULL,
    mes                     TEXT NOT NULL,            -- Ej: '2026-05'
    fecha_reporte           DATE NOT NULL DEFAULT CURRENT_DATE,

    -- Métricas de calificación y conducción
    calificacion            NUMERIC(6,2)   DEFAULT 0,
    kms                     NUMERIC(12,2)  DEFAULT 0,
    horas_conduccion        NUMERIC(10,2)  DEFAULT 0,

    -- Excesos de velocidad por umbral
    excesos_10_kph          NUMERIC(10,2)  DEFAULT 0,
    excesos_20_kph          NUMERIC(10,2)  DEFAULT 0,
    excesos_30_kph          NUMERIC(10,2)  DEFAULT 0,
    excesos_40_kph          NUMERIC(10,2)  DEFAULT 0,
    excesos_50_kph          NUMERIC(10,2)  DEFAULT 0,
    excesos_60_kph          NUMERIC(10,2)  DEFAULT 0,
    excesos_80_kph          NUMERIC(10,2)  DEFAULT 0,

    -- Eventos de manejo brusco
    aceleraciones_bruscas   NUMERIC(10,2)  DEFAULT 0,
    frenadas_bruscas        NUMERIC(10,2)  DEFAULT 0,

    -- Métricas de ralentí
    km_recorridos_ralenti   NUMERIC(12,2)  DEFAULT 0,
    horas_motor_encendido   NUMERIC(10,2)  DEFAULT 0,
    horas_motor_ralenti     NUMERIC(10,2)  DEFAULT 0,
    consumo_combustible     NUMERIC(12,4)  DEFAULT 0,
    ralentis_excesivos      NUMERIC(10,2)  DEFAULT 0,

    -- Metadatos del vehículo en el momento del reporte
    dispositivo_gps         TEXT           DEFAULT '',
    base                    TEXT           DEFAULT '',
    estado_gps              TEXT           DEFAULT 'ACTIVO',
    proyecto                TEXT           DEFAULT '',

    -- Auditoría
    created_at              TIMESTAMPTZ    DEFAULT NOW(),
    updated_at              TIMESTAMPTZ    DEFAULT NOW(),

    -- Restricción de unicidad para upsert
    CONSTRAINT uq_reporte_vehiculo_periodo
        UNIQUE (vehiculo_id, periodo_inicio, periodo_fin)
);

-- Índices de búsqueda frecuentes
CREATE INDEX IF NOT EXISTS idx_reportes_vehiculos_vehiculo_id
    ON public.reportes_vehiculos (vehiculo_id);

CREATE INDEX IF NOT EXISTS idx_reportes_vehiculos_periodo
    ON public.reportes_vehiculos (periodo_inicio, periodo_fin);

CREATE INDEX IF NOT EXISTS idx_reportes_vehiculos_mes
    ON public.reportes_vehiculos (mes);

CREATE INDEX IF NOT EXISTS idx_reportes_vehiculos_contrato
    ON public.reportes_vehiculos (contrato_id);

CREATE INDEX IF NOT EXISTS idx_reportes_vehiculos_proyecto
    ON public.reportes_vehiculos (proyecto);

-- Trigger para updated_at automático
DROP TRIGGER IF EXISTS trg_reportes_vehiculos_updated_at ON public.reportes_vehiculos;
CREATE TRIGGER trg_reportes_vehiculos_updated_at
    BEFORE UPDATE ON public.reportes_vehiculos
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Habilitar RLS en ambas tablas
ALTER TABLE public.reportes_conductores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reportes_vehiculos   ENABLE ROW LEVEL SECURITY;

-- Políticas para usuarios autenticados (lectura y escritura)
DROP POLICY IF EXISTS "Usuarios autenticados pueden leer reportes_conductores"
    ON public.reportes_conductores;
CREATE POLICY "Usuarios autenticados pueden leer reportes_conductores"
    ON public.reportes_conductores
    FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Usuarios autenticados pueden insertar reportes_conductores"
    ON public.reportes_conductores;
CREATE POLICY "Usuarios autenticados pueden insertar reportes_conductores"
    ON public.reportes_conductores
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

DROP POLICY IF EXISTS "Usuarios autenticados pueden actualizar reportes_conductores"
    ON public.reportes_conductores;
CREATE POLICY "Usuarios autenticados pueden actualizar reportes_conductores"
    ON public.reportes_conductores
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Usuarios autenticados pueden eliminar reportes_conductores"
    ON public.reportes_conductores;
CREATE POLICY "Usuarios autenticados pueden eliminar reportes_conductores"
    ON public.reportes_conductores
    FOR DELETE
    TO authenticated
    USING (true);

-- Políticas para reportes_vehiculos
DROP POLICY IF EXISTS "Usuarios autenticados pueden leer reportes_vehiculos"
    ON public.reportes_vehiculos;
CREATE POLICY "Usuarios autenticados pueden leer reportes_vehiculos"
    ON public.reportes_vehiculos
    FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Usuarios autenticados pueden insertar reportes_vehiculos"
    ON public.reportes_vehiculos;
CREATE POLICY "Usuarios autenticados pueden insertar reportes_vehiculos"
    ON public.reportes_vehiculos
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

DROP POLICY IF EXISTS "Usuarios autenticados pueden actualizar reportes_vehiculos"
    ON public.reportes_vehiculos;
CREATE POLICY "Usuarios autenticados pueden actualizar reportes_vehiculos"
    ON public.reportes_vehiculos
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Usuarios autenticados pueden eliminar reportes_vehiculos"
    ON public.reportes_vehiculos;
CREATE POLICY "Usuarios autenticados pueden eliminar reportes_vehiculos"
    ON public.reportes_vehiculos
    FOR DELETE
    TO authenticated
    USING (true);

-- ============================================================
-- VERIFICACIÓN FINAL
-- ============================================================
-- Ejecuta esto al finalizar para confirmar que las tablas existen:
-- SELECT table_name, table_type
-- FROM information_schema.tables
-- WHERE table_schema = 'public'
--   AND table_name IN ('reportes_conductores', 'reportes_vehiculos')
-- ORDER BY table_name;

-- Para ver los registros insertados después del primer procesamiento:
-- SELECT COUNT(*) as total_conductores FROM public.reportes_conductores;
-- SELECT COUNT(*) as total_vehiculos FROM public.reportes_vehiculos;
