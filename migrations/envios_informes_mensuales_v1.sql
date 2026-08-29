-- ============================================================
-- MIGRATION: Control de envío de los informes mensuales por contrato
-- ============================================================
-- El analista procesa y envía el informe mensual contrato por contrato. Hasta
-- ahora ese control vivía fuera del sistema (un Excel aparte), así que nadie
-- podía saber desde la Torre qué contratos ya salieron y cuáles faltan.
--
-- Esta tabla guarda una marca por contrato y por MES LÓGICO del período. Los
-- períodos corren del 29 al 28, de modo que el mes lógico es el del fin de
-- período (misma convención que `etiquetaMesPeriodo`). Se indexa por `mes` en
-- lugar de por el par de fechas exactas para que la marca sobreviva a un ajuste
-- de un día en el rango: lo que el usuario marca es "el informe de AGOSTO 2026
-- de este contrato", no "el informe del 2026-07-29 al 2026-08-28".
--
-- Las fechas del período se conservan como referencia de con qué rango se
-- generó el informe que se marcó.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.envios_informes_mensuales (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contrato_id     UUID NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
    -- Mes lógico del período en formato 'YYYY-MM' (el del fin de período).
    mes             TEXT NOT NULL,
    periodo_inicio  DATE,
    periodo_fin     DATE,
    enviado         BOOLEAN NOT NULL DEFAULT TRUE,
    enviado_at      TIMESTAMPTZ,
    -- Nombre o correo de quien marcó. Texto y no FK a auth.users porque la app
    -- admite sesiones demo que no existen en auth.
    enviado_por     TEXT,
    observacion     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT envios_informes_mensuales_contrato_mes_key UNIQUE (contrato_id, mes)
);

CREATE INDEX IF NOT EXISTS idx_envios_informes_mensuales_mes
    ON public.envios_informes_mensuales(mes);
CREATE INDEX IF NOT EXISTS idx_envios_informes_mensuales_contrato
    ON public.envios_informes_mensuales(contrato_id);

-- `updated_at` al día en los UPSERT que solo cambian el estado.
CREATE OR REPLACE FUNCTION public.envios_informes_mensuales_touch()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_envios_informes_mensuales_touch ON public.envios_informes_mensuales;
CREATE TRIGGER trg_envios_informes_mensuales_touch
    BEFORE UPDATE ON public.envios_informes_mensuales
    FOR EACH ROW EXECUTE FUNCTION public.envios_informes_mensuales_touch();

-- ── Permisos ────────────────────────────────────────────────────────────────
-- El frontend trabaja con la anon key (ver migración v9), así que anon necesita
-- los mismos permisos que authenticated.
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.envios_informes_mensuales TO anon, authenticated;

ALTER TABLE public.envios_informes_mensuales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "envios_mensuales_anon" ON public.envios_informes_mensuales;
DROP POLICY IF EXISTS "envios_mensuales_authenticated" ON public.envios_informes_mensuales;

CREATE POLICY "envios_mensuales_anon"
    ON public.envios_informes_mensuales FOR ALL
    TO anon
    USING (true) WITH CHECK (true);

CREATE POLICY "envios_mensuales_authenticated"
    ON public.envios_informes_mensuales FOR ALL
    TO authenticated
    USING (true) WITH CHECK (true);
