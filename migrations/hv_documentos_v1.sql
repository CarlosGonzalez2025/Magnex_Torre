-- ============================================================
-- HOJA DE VIDA — Verificación documental + Capacitaciones (v1, 2026-07-17)
--
-- Dos fuentes vivas en Google Sheets que la Hoja de Vida debe consumir en vez
-- de las columnas (desactualizadas) de la base de conductores:
--   1) hv_verificacion_documental: última validación documental por cédula
--      (licencias, comparendos/SIMIT, evidencias RUNT/SIMIT).
--   2) hv_capacitaciones: TODAS las intervenciones de manejo defensivo por
--      cédula (fecha certificado, vigencia, vencimiento, 2 certificados).
--
-- Se llavean por CÉDULA (join con hv_conductores.cedula). Refresco a demanda
-- desde la app (client-side, mismo patrón que hv_conductores).
--
-- Ejecutar en: Supabase SQL Editor (rol admin).
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ------------------------------------------------------------
-- 1) VERIFICACIÓN DOCUMENTAL — última validación por cédula
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hv_verificacion_documental (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cedula                TEXT NOT NULL UNIQUE,
    nombre                TEXT,
    contrato              TEXT,
    fecha_validacion      TIMESTAMPTZ,          -- "Fecha y hora de validación" (la más reciente)
    usuario               TEXT,

    -- Licencia particular
    lic_part_categoria    TEXT,
    lic_part_estado       TEXT,
    lic_part_fecha_venc   DATE,
    lic_part_alerta       TEXT,                 -- Vigente | Vencido | Por vencer
    -- Licencia pública
    lic_pub_categoria     TEXT,
    lic_pub_estado        TEXT,
    lic_pub_fecha_venc    DATE,
    lic_pub_alerta        TEXT,
    -- Licencia moto
    lic_moto_categoria    TEXT,
    lic_moto_estado       TEXT,
    lic_moto_fecha_venc   DATE,
    lic_moto_alerta       TEXT,

    -- SIMIT / comparendos
    tiene_comparendos     TEXT,
    numero_comparendos    INTEGER DEFAULT 0,
    valor_comparendos     NUMERIC(14,2) DEFAULT 0,
    acuerdos_pago         TEXT,
    estado_acuerdos       TEXT,
    comparendos           JSONB DEFAULT '[]'::jsonb,   -- [{fecha,codigo,descripcion}]

    -- Evidencias
    link_runt             TEXT,
    link_simit            TEXT,
    link_pdf              TEXT,

    raw                   JSONB DEFAULT '{}'::jsonb,
    synced_at             TIMESTAMPTZ DEFAULT NOW(),
    created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hv_verif_cedula ON public.hv_verificacion_documental (cedula);

COMMENT ON TABLE public.hv_verificacion_documental IS
  'Última validación documental por cédula (fuente: Google Sheet de verificación). Reemplaza las columnas de licencia de la base de conductores.';

-- ------------------------------------------------------------
-- 2) CAPACITACIONES — todas las intervenciones de manejo defensivo
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hv_capacitaciones (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sheet_key             TEXT NOT NULL UNIQUE,        -- clave estable de la intervención
    cedula                TEXT NOT NULL,
    nombre                TEXT,
    contrato              TEXT,
    ubicacion             TEXT,
    vehiculo              TEXT,
    tipo                  TEXT,
    fecha_certificado     DATE,
    duracion              TEXT,
    vigencia_anios        NUMERIC(5,2),
    fecha_vencimiento     DATE,
    estado                TEXT,
    validacion_nombres    TEXT,
    consecutivo           TEXT,
    anio                  TEXT,
    link_certificado      TEXT,                        -- "Link"
    link_certificado_ayg  TEXT,                        -- "Link Certificado AYG"

    raw                   JSONB DEFAULT '{}'::jsonb,
    synced_at             TIMESTAMPTZ DEFAULT NOW(),
    created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hv_capac_cedula ON public.hv_capacitaciones (cedula);
CREATE INDEX IF NOT EXISTS idx_hv_capac_venc   ON public.hv_capacitaciones (cedula, fecha_vencimiento DESC);

COMMENT ON TABLE public.hv_capacitaciones IS
  'Todas las intervenciones de capacitación (manejo defensivo) por cédula. El vencimiento más reciente es la alerta principal.';

-- ------------------------------------------------------------
-- 3) RLS — lectura anon+auth; escritura authenticated (sync client-side)
-- ------------------------------------------------------------
ALTER TABLE public.hv_verificacion_documental ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hv_capacitaciones          ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['hv_verificacion_documental','hv_capacitaciones'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s select anon" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "%s select anon" ON public.%I FOR SELECT TO anon USING (true)', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s select auth" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "%s select auth" ON public.%I FOR SELECT TO authenticated USING (true)', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s insert auth" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "%s insert auth" ON public.%I FOR INSERT TO authenticated WITH CHECK (true)', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s update auth" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "%s update auth" ON public.%I FOR UPDATE TO authenticated USING (true) WITH CHECK (true)', t, t);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- Verificación:
--   SELECT COUNT(*) FROM public.hv_verificacion_documental;  -- ~1685 tras sync
--   SELECT COUNT(*) FROM public.hv_capacitaciones;           -- ~4249 tras sync
-- ============================================================
