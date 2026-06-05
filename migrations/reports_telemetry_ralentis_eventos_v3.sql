-- ============================================================
-- MIGRATION: ralentis_eventos — Tabla + RLS completo
-- Versión: v3 - 2026-06-05
-- Descripción: Crea la tabla ralentis_eventos si no existe para
--              almacenar eventos individuales detallados de ralentí.
--              Aplica las políticas RLS para los roles anon y
--              authenticated que permiten lectura y escritura.
--              Clave única placa + fecha_inicio + proveedor para
--              garantizar idempotencia en el upsert.
-- Ejecutar en: Supabase SQL Editor con rol de administrador
-- ============================================================

-- ── 1. CREAR TABLA (idempotente) ──────────────────────────────

CREATE TABLE IF NOT EXISTS public.ralentis_eventos (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Relaciones maestros
    vehiculo_id          UUID REFERENCES public.vehiculos(id) ON DELETE CASCADE,
    conductor_id         UUID REFERENCES public.conductores(id) ON DELETE CASCADE,

    -- Datos crudos de identificación
    placa                TEXT NOT NULL,
    conductor_nombre     TEXT,

    -- Detalles de tiempo
    fecha_inicio         TIMESTAMPTZ NOT NULL,
    fecha_fin            TIMESTAMPTZ,
    duracion_segundos    INTEGER DEFAULT 0,

    -- Métricas del evento
    galones_consumidos   NUMERIC(10,4) DEFAULT 0,
    ubicacion            TEXT,
    latitud              NUMERIC(9,6),
    longitud             NUMERIC(9,6),
    alerta_fecha         TIMESTAMPTZ,
    proveedor            TEXT NOT NULL, -- 'COLTRACK' o 'FAGOR'

    -- Período del lote / quincena
    periodo_inicio       DATE NOT NULL,
    periodo_fin          DATE NOT NULL,

    -- Auditoría
    created_at           TIMESTAMPTZ DEFAULT NOW(),
    updated_at           TIMESTAMPTZ DEFAULT NOW(),

    -- Restricción única para upsert idempotente
    CONSTRAINT uq_ralentis_eventos_placa_inicio_proveedor
        UNIQUE (placa, fecha_inicio, proveedor)
);

-- Índices de consulta frecuente
CREATE INDEX IF NOT EXISTS idx_ralentis_eventos_vehiculo
    ON public.ralentis_eventos (vehiculo_id);

CREATE INDEX IF NOT EXISTS idx_ralentis_eventos_conductor
    ON public.ralentis_eventos (conductor_id);

CREATE INDEX IF NOT EXISTS idx_ralentis_eventos_fecha_inicio
    ON public.ralentis_eventos (fecha_inicio);

CREATE INDEX IF NOT EXISTS idx_ralentis_eventos_periodo
    ON public.ralentis_eventos (periodo_inicio, periodo_fin);

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_ralentis_eventos_updated_at ON public.ralentis_eventos;
CREATE TRIGGER trg_ralentis_eventos_updated_at
    BEFORE UPDATE ON public.ralentis_eventos
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 2. HABILITAR RLS ──────────────────────────────────────────

ALTER TABLE public.ralentis_eventos ENABLE ROW LEVEL SECURITY;

-- ── 3. POLÍTICAS PARA ROL authenticated ──────────────────────

DROP POLICY IF EXISTS "Usuarios autenticados pueden leer ralentis_eventos"
    ON public.ralentis_eventos;
CREATE POLICY "Usuarios autenticados pueden leer ralentis_eventos"
    ON public.ralentis_eventos
    FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Usuarios autenticados pueden insertar ralentis_eventos"
    ON public.ralentis_eventos;
CREATE POLICY "Usuarios autenticados pueden insertar ralentis_eventos"
    ON public.ralentis_eventos
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

DROP POLICY IF EXISTS "Usuarios autenticados pueden actualizar ralentis_eventos"
    ON public.ralentis_eventos;
CREATE POLICY "Usuarios autenticados pueden actualizar ralentis_eventos"
    ON public.ralentis_eventos
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Usuarios autenticados pueden eliminar ralentis_eventos"
    ON public.ralentis_eventos;
CREATE POLICY "Usuarios autenticados pueden eliminar ralentis_eventos"
    ON public.ralentis_eventos
    FOR DELETE
    TO authenticated
    USING (true);

-- ── 4. POLÍTICAS PARA ROL anon (anon key del frontend) ───────

DROP POLICY IF EXISTS "Anon puede leer ralentis_eventos"
    ON public.ralentis_eventos;
CREATE POLICY "Anon puede leer ralentis_eventos"
    ON public.ralentis_eventos
    FOR SELECT
    TO anon
    USING (true);

DROP POLICY IF EXISTS "Anon puede insertar ralentis_eventos"
    ON public.ralentis_eventos;
CREATE POLICY "Anon puede insertar ralentis_eventos"
    ON public.ralentis_eventos
    FOR INSERT
    TO anon
    WITH CHECK (true);

DROP POLICY IF EXISTS "Anon puede actualizar ralentis_eventos"
    ON public.ralentis_eventos;
CREATE POLICY "Anon puede actualizar ralentis_eventos"
    ON public.ralentis_eventos
    FOR UPDATE
    TO anon
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Anon puede eliminar ralentis_eventos"
    ON public.ralentis_eventos;
CREATE POLICY "Anon puede eliminar ralentis_eventos"
    ON public.ralentis_eventos
    FOR DELETE
    TO anon
    USING (true);
