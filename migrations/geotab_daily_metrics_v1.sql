-- ============================================================
-- MÓDULO: GEOTAB — Métricas diarias (km / horas) por vehículo
-- Versión: v1 - 2026-06-25
-- Descripción: Almacena el histórico diario sincronizado desde Geotab
--              (entidad Trip, paginada vía GetFeed). Alimenta el módulo
--              de consulta "Geotab" del frontend (lectura instantánea).
--              Los conteos de vehículos/conductores son en vivo (no se guardan).
-- Sincroniza: supabase/functions/geotab-sync (cron) -> /api/geotab dailyMetrics
-- Ejecutar en: Supabase SQL Editor con rol de administrador
-- ============================================================

CREATE TABLE IF NOT EXISTS public.geotab_daily_metrics (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    fecha           DATE  NOT NULL,            -- fecha local Colombia (YYYY-MM-DD)
    device_id       TEXT  NOT NULL,            -- Geotab Device.id
    placa           TEXT  NOT NULL DEFAULT '',

    km              NUMERIC(12,2) DEFAULT 0,   -- suma Trip.distance
    horas_conduccion NUMERIC(10,2) DEFAULT 0,  -- suma Trip.drivingDuration
    horas_ralenti   NUMERIC(10,2) DEFAULT 0,   -- suma Trip.idlingDuration
    viajes          INTEGER       DEFAULT 0,

    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),

    -- Llave de upsert: una fila por (día, dispositivo)
    CONSTRAINT uq_geotab_daily UNIQUE (fecha, device_id)
);

CREATE INDEX IF NOT EXISTS idx_geotab_daily_fecha
    ON public.geotab_daily_metrics (fecha);
CREATE INDEX IF NOT EXISTS idx_geotab_daily_placa
    ON public.geotab_daily_metrics (placa);

-- Trigger updated_at (reutiliza la función global set_updated_at del proyecto)
DROP TRIGGER IF EXISTS trg_geotab_daily_updated_at ON public.geotab_daily_metrics;
CREATE TRIGGER trg_geotab_daily_updated_at
    BEFORE UPDATE ON public.geotab_daily_metrics
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- El worker de sync usa SERVICE_ROLE (bypassa RLS). El frontend lee con anon.
-- ============================================================
ALTER TABLE public.geotab_daily_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "geotab_daily lectura authenticated" ON public.geotab_daily_metrics;
CREATE POLICY "geotab_daily lectura authenticated"
    ON public.geotab_daily_metrics FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "geotab_daily lectura anon" ON public.geotab_daily_metrics;
CREATE POLICY "geotab_daily lectura anon"
    ON public.geotab_daily_metrics FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "geotab_daily escritura authenticated" ON public.geotab_daily_metrics;
CREATE POLICY "geotab_daily escritura authenticated"
    ON public.geotab_daily_metrics FOR ALL TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';

-- Verificación:
-- SELECT COUNT(*) FROM public.geotab_daily_metrics;
