-- ============================================================
-- MÓDULO: HOJA DE VIDA — Tabla de identidad DEDICADA (v1, 2026-07-17)
--
-- Problema que resuelve: la tabla `conductores` está compartida con el
-- proceso de telemetría (unificador satelital), que crea placeholders
-- `TEMP_CC_*` y deja inactivos. Resultado: 8.751 filas vs 1.726 reales del
-- Google Sheet.
--
-- Solución: `hv_conductores` es un ESPEJO LIMPIO del Google Sheet (1.726),
-- refrescado a demanda desde /api/sync-hv. NUNCA lo toca la telemetría.
-- La Hoja de Vida / Carnet se construyen sobre esta tabla.
--
-- Puente a telemetría: `telemetria_ref_id` guarda el id de la tabla vieja
-- `conductores` para esa cédula (las 1.726 existen 1:1), para leer alertas /
-- ralentí / mensuales SIN re-contaminar la identidad.
--
-- ADITIVO: no modifica ni borra columnas de `conductores`. Solo re-apunta
-- las FKs del ecosistema (tablas nuevas, sin datos de producción) a esta tabla.
--
-- Ejecutar en: Supabase SQL Editor (rol admin).
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ------------------------------------------------------------
-- 1) Tabla espejo del Sheet
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hv_conductores (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cedula                      TEXT NOT NULL UNIQUE,
    nombres                     TEXT NOT NULL DEFAULT '',
    cargo                       TEXT,
    base                        TEXT,
    estado                      TEXT DEFAULT 'ACTIVO',
    proyecto                    TEXT,
    tipo_licencia               TEXT,
    -- Licencias
    fecha_exp_particular        DATE,
    fecha_venc_particular       DATE,
    fecha_exp_publica           DATE,
    fecha_venc_publica          DATE,
    fecha_exp_moto              DATE,
    fecha_venc_moto             DATE,
    -- Capacitaciones
    fecha_cap_manejo_def        DATE,
    fecha_cap_peligrosas        DATE,
    fecha_cap_alturas           DATE,
    fecha_cap_otro              DATE,
    -- Pruebas y competencias
    resultado_prueba_ingreso    TEXT,
    resultado_prueba_periodica  TEXT,
    tipo_competencias           TEXT,
    vigencia_competencias       DATE,
    -- SIMIT / comparendos
    fecha_revision_simit        DATE,
    tipo_comparendo             TEXT,
    valor_comparendo            NUMERIC(12,2) DEFAULT 0,
    -- iButton
    ibutton                     TEXT,

    -- Foto: la del Sheet vive aparte; la del supervisor la sobreescribe.
    foto_sheet_url              TEXT,          -- viene del Sheet ("Foto del conductor")
    foto_url                    TEXT,          -- override subido por el supervisor (gana)

    -- Metadatos del Sheet
    sheet_row_id                TEXT,          -- columna "ID" del Sheet
    actualizado_por             TEXT,          -- columna "Usuario que actualiza"

    -- Campos del sistema (el refresco NUNCA los pisa)
    carnet_token                UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    telemetria_ref_id           UUID,          -- puente a conductores(id) por cédula
    en_sheet                    BOOLEAN NOT NULL DEFAULT TRUE,
    updated_from_sheet_at       TIMESTAMPTZ,

    created_at                  TIMESTAMPTZ DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hv_conductores_nombres   ON public.hv_conductores (nombres);
CREATE INDEX IF NOT EXISTS idx_hv_conductores_proyecto  ON public.hv_conductores (proyecto);
CREATE INDEX IF NOT EXISTS idx_hv_conductores_ensheet   ON public.hv_conductores (en_sheet);
CREATE INDEX IF NOT EXISTS idx_hv_conductores_telemref  ON public.hv_conductores (telemetria_ref_id);

COMMENT ON TABLE public.hv_conductores IS
  'Espejo limpio del Google Sheet de conductores (identidad Hoja de Vida). Refrescado desde /api/sync-hv. No lo toca la telemetría.';

-- ------------------------------------------------------------
-- 2) Re-apuntar las FKs del ecosistema a hv_conductores
-- Las tablas del ecosistema son nuevas (sin datos de producción): se limpian
-- para poder re-apuntar. conductor_scores es caché recomputable.
-- ------------------------------------------------------------
DELETE FROM public.conductor_registro_notas;
DELETE FROM public.conductor_campo_registros;
DELETE FROM public.epp_entregas;
DELETE FROM public.conductor_scores;

ALTER TABLE public.conductor_scores          DROP CONSTRAINT IF EXISTS conductor_scores_conductor_id_fkey;
ALTER TABLE public.conductor_campo_registros DROP CONSTRAINT IF EXISTS conductor_campo_registros_conductor_id_fkey;
ALTER TABLE public.epp_entregas              DROP CONSTRAINT IF EXISTS epp_entregas_conductor_id_fkey;

ALTER TABLE public.conductor_scores
  ADD CONSTRAINT conductor_scores_conductor_id_fkey
  FOREIGN KEY (conductor_id) REFERENCES public.hv_conductores(id) ON DELETE CASCADE;

ALTER TABLE public.conductor_campo_registros
  ADD CONSTRAINT conductor_campo_registros_conductor_id_fkey
  FOREIGN KEY (conductor_id) REFERENCES public.hv_conductores(id) ON DELETE CASCADE;

ALTER TABLE public.epp_entregas
  ADD CONSTRAINT epp_entregas_conductor_id_fkey
  FOREIGN KEY (conductor_id) REFERENCES public.hv_conductores(id) ON DELETE CASCADE;

-- ------------------------------------------------------------
-- 3) RLS
-- ------------------------------------------------------------
ALTER TABLE public.hv_conductores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hv select anon" ON public.hv_conductores;
CREATE POLICY "hv select anon" ON public.hv_conductores FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "hv select auth" ON public.hv_conductores;
CREATE POLICY "hv select auth" ON public.hv_conductores FOR SELECT TO authenticated USING (true);
-- Escritura de identidad: solo el endpoint (service_role, bypassa RLS). Se permite
-- UPDATE autenticado para que el supervisor pueda subir la foto (foto_url).
DROP POLICY IF EXISTS "hv update auth" ON public.hv_conductores;
CREATE POLICY "hv update auth" ON public.hv_conductores FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- Verificación:
--   SELECT COUNT(*) FROM public.hv_conductores;           -- 0 hasta el primer sync
--   -- Tras correr /api/sync-hv debería dar ~1726.
-- ============================================================
