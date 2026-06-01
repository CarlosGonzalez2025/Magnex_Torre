-- ============================================================
-- MIGRATION: ralentis_periodos — Tabla + RLS completo
-- Versión: v2 - 2026-05-30
-- Descripción: Crea la tabla ralentis_periodos si no existe y
--              aplica las políticas RLS para los roles anon y
--              authenticated que permiten lectura y escritura.
--              La tabla almacena métricas de ralentí por vehículo
--              y período, con clave única vehiculo_id+periodo_inicio+
--              periodo_fin para garantizar idempotencia en el upsert.
-- Ejecutar en: Supabase SQL Editor con rol de administrador
-- ============================================================

-- ── 1. CREAR TABLA (idempotente) ──────────────────────────────

CREATE TABLE IF NOT EXISTS public.ralentis_periodos (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Relación con vehículo maestro
    vehiculo_id           UUID NOT NULL REFERENCES public.vehiculos(id) ON DELETE CASCADE,

    -- Período del reporte
    periodo_inicio        DATE NOT NULL,
    periodo_fin           DATE NOT NULL,

    -- Métricas de ralentí y motor
    ralentis_excesivos    NUMERIC(10,2) DEFAULT 0,
    horas_motor_encendido NUMERIC(10,2) DEFAULT 0,
    horas_motor_ralenti   NUMERIC(10,2) DEFAULT 0,
    kms_recorridos        NUMERIC(12,2) DEFAULT 0,
    consumo_combustible   NUMERIC(12,4) DEFAULT 0,
    encendidos_apagados   NUMERIC(10,2) DEFAULT 0,

    -- Auditoría
    created_at            TIMESTAMPTZ   DEFAULT NOW(),
    updated_at            TIMESTAMPTZ   DEFAULT NOW(),

    -- Clave única para upsert idempotente
    CONSTRAINT uq_ralentis_periodos_vehiculo_periodo
        UNIQUE (vehiculo_id, periodo_inicio, periodo_fin)
);

-- Índices de consulta frecuente
CREATE INDEX IF NOT EXISTS idx_ralentis_periodos_vehiculo_id
    ON public.ralentis_periodos (vehiculo_id);

CREATE INDEX IF NOT EXISTS idx_ralentis_periodos_periodo
    ON public.ralentis_periodos (periodo_inicio, periodo_fin);

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_ralentis_periodos_updated_at ON public.ralentis_periodos;
CREATE TRIGGER trg_ralentis_periodos_updated_at
    BEFORE UPDATE ON public.ralentis_periodos
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 2. HABILITAR RLS ──────────────────────────────────────────

ALTER TABLE public.ralentis_periodos ENABLE ROW LEVEL SECURITY;

-- ── 3. POLÍTICAS PARA ROL authenticated ──────────────────────

DROP POLICY IF EXISTS "Usuarios autenticados pueden leer ralentis_periodos"
    ON public.ralentis_periodos;
CREATE POLICY "Usuarios autenticados pueden leer ralentis_periodos"
    ON public.ralentis_periodos
    FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Usuarios autenticados pueden insertar ralentis_periodos"
    ON public.ralentis_periodos;
CREATE POLICY "Usuarios autenticados pueden insertar ralentis_periodos"
    ON public.ralentis_periodos
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

DROP POLICY IF EXISTS "Usuarios autenticados pueden actualizar ralentis_periodos"
    ON public.ralentis_periodos;
CREATE POLICY "Usuarios autenticados pueden actualizar ralentis_periodos"
    ON public.ralentis_periodos
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Usuarios autenticados pueden eliminar ralentis_periodos"
    ON public.ralentis_periodos;
CREATE POLICY "Usuarios autenticados pueden eliminar ralentis_periodos"
    ON public.ralentis_periodos
    FOR DELETE
    TO authenticated
    USING (true);

-- ── 4. POLÍTICAS PARA ROL anon (anon key del frontend) ───────

DROP POLICY IF EXISTS "Anon puede leer ralentis_periodos"
    ON public.ralentis_periodos;
CREATE POLICY "Anon puede leer ralentis_periodos"
    ON public.ralentis_periodos
    FOR SELECT
    TO anon
    USING (true);

DROP POLICY IF EXISTS "Anon puede insertar ralentis_periodos"
    ON public.ralentis_periodos;
CREATE POLICY "Anon puede insertar ralentis_periodos"
    ON public.ralentis_periodos
    FOR INSERT
    TO anon
    WITH CHECK (true);

DROP POLICY IF EXISTS "Anon puede actualizar ralentis_periodos"
    ON public.ralentis_periodos;
CREATE POLICY "Anon puede actualizar ralentis_periodos"
    ON public.ralentis_periodos
    FOR UPDATE
    TO anon
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Anon puede eliminar ralentis_periodos"
    ON public.ralentis_periodos;
CREATE POLICY "Anon puede eliminar ralentis_periodos"
    ON public.ralentis_periodos
    FOR DELETE
    TO anon
    USING (true);

-- ── 5. VERIFICACIÓN ───────────────────────────────────────────
-- Ejecuta esto para confirmar que las políticas quedaron activas:
-- SELECT policyname, roles, cmd
-- FROM pg_policies
-- WHERE tablename = 'ralentis_periodos'
-- ORDER BY policyname;
