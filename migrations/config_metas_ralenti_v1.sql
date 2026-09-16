-- ============================================================
-- MIGRATION: config_metas_ralenti — metas del informe de ralentí
-- Versión: v1 - 2026-09-16
--
-- Motivo: las metas estaban escritas a mano en el código, en TRES sitios
-- (RalentiReports.tsx, y dos veces en pdfTemplates.tsx), y estaban mal
-- dimensionadas: eran valores de UN vehículo aplicados al TOTAL de la flota.
--
--     deltaGalones     = totalGalones - 37        -- 37 galones... ¿para 650 vehículos?
--     deltaCostoDiario = costAvgDaily - 28000     -- $28.000/día para toda la flota
--     deltaPct         = pctRalenti - 10          -- 10% contra una flota real al 42,8%
--
-- El resultado salía impreso en el PDF del cliente: en Q1 de abril decía
-- "3.228 gal sobre meta" y "+$2.400.000 sobre meta". Y como el ralentí real está
-- entre 37% y 47%, el semáforo marcaba "Alto" y "FAP Crítico" el 100% de las veces
-- — una alarma que nunca se apaga no informa nada.
--
-- Ahora las metas se NORMALIZAN por vehículo y por día, así escalan con la flota:
--
--     galones_por_vehiculo_dia = total_galones / (vehículos × días del período)
--     costo_por_vehiculo_dia   = costo_total   / (vehículos × días del período)
--
-- VALORES SEMBRADOS = LÍNEA BASE MEDIDA, no una meta acordada.
-- Se calcularon sobre las cuatro quincenas de abril y mayo de 2026, que son las
-- únicas con cobertura de combustible representativa de toda la flota:
--
--     Q1 abr: 0,333 gal/veh/día · Q2 abr: 0,324 · Q1 may: 0,320 · Q2 may: 0,324
--     Agregado: 0,325 gal/veh/día · $3.644/veh/día · 42,8% de ralentí
--
-- Se siembran con `provisional = TRUE` justamente para que la UI pueda advertir que
-- todavía no hay meta acordada con el cliente. En cuanto se acuerde, se edita el
-- valor y se baja la bandera: no hay que tocar código.
--
-- Ejecutar en: Supabase SQL Editor con rol de administrador
-- ============================================================

CREATE TABLE IF NOT EXISTS public.config_metas_ralenti (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clave        TEXT NOT NULL UNIQUE,
    valor        NUMERIC(14,4) NOT NULL,
    unidad       TEXT NOT NULL,
    etiqueta     TEXT NOT NULL,
    descripcion  TEXT,
    -- TRUE = es la línea base observada, no una meta acordada con el cliente.
    provisional  BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_by   TEXT
);

CREATE INDEX IF NOT EXISTS idx_config_metas_ralenti_clave
    ON public.config_metas_ralenti (clave);

COMMENT ON TABLE public.config_metas_ralenti IS
    'Metas del informe de ralentí, normalizadas por vehículo y día para que escalen con el tamaño de la flota. provisional=TRUE significa que el valor es la línea base medida y no una meta acordada.';

INSERT INTO public.config_metas_ralenti (clave, valor, unidad, etiqueta, descripcion, provisional) VALUES
  ('pct_ralenti', 42.8, '%', 'Ralentí sobre motor encendido',
   'Línea base agregada de abril-mayo 2026 (42,8%). La meta anterior era 10%, inalcanzable para esta operación: el semáforo marcaba Alto siempre.', TRUE),
  ('galones_vehiculo_dia', 0.325, 'gal/vehículo/día', 'Consumo en ralentí por vehículo y día',
   'Línea base agregada de abril-mayo 2026. Sustituye la meta plana de 37 galones para toda la flota.', TRUE),
  ('costo_vehiculo_dia', 3644, 'COP/vehículo/día', 'Costo del ralentí por vehículo y día',
   'Línea base agregada de abril-mayo 2026, valorada a precio de diésel. Sustituye la meta plana de $28.000/día para toda la flota.', TRUE)
ON CONFLICT (clave) DO NOTHING;

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE public.config_metas_ralenti ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lectura de metas de ralentí" ON public.config_metas_ralenti;
CREATE POLICY "Lectura de metas de ralentí"
    ON public.config_metas_ralenti FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Escritura de metas de ralentí" ON public.config_metas_ralenti;
CREATE POLICY "Escritura de metas de ralentí"
    ON public.config_metas_ralenti FOR ALL TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';

-- Verificación:
-- SELECT clave, valor, unidad, provisional FROM public.config_metas_ralenti ORDER BY clave;
