-- ============================================================
-- MIGRATION: ralentis_periodos — columna `fuente`
-- Versión: v1 - 2026-08-05
--
-- Motivo: al incorporar Geotab al informe de ralentí aparecen vehículos que ya
-- tienen fila de Coltrack o Fagor en la misma quincena (25 placas medidas en
-- Q2 julio 2026). Como la clave única es (vehiculo_id, periodo_inicio,
-- periodo_fin) SIN proveedor, un upsert de Geotab sobrescribiría en silencio
-- datos de las otras plataformas — que son más ricos (traen eventos reales y
-- galones de ralentí, cosas que Geotab no exporta).
--
-- Se añade `fuente` como MARCA DE PROCEDENCIA, deliberadamente SIN tocar la
-- clave única: se mantiene una sola fila por vehículo y período para que el
-- informe no pueda sumar dos veces las horas de motor del mismo vehículo
-- (algo físicamente imposible, a diferencia de reportes_vehiculos donde el
-- modelo v18 sí suma entre plataformas).
--
-- Regla de precedencia que implementa el sync de Geotab:
--   • Geotab escribe SOLO si la fila no existe o si ya es suya (fuente='GEOTAB').
--   • Coltrack y Fagor siguen escribiendo siempre y ahora estampan su fuente.
--   • fuente NULL = fila anterior a esta migración (Coltrack/Fagor histórico);
--     se trata como NO-Geotab, así que Geotab tampoco la pisa.
--
-- Ejecutar en: Supabase SQL Editor con rol de administrador
-- ============================================================

ALTER TABLE public.ralentis_periodos
    ADD COLUMN IF NOT EXISTS fuente TEXT;

COMMENT ON COLUMN public.ralentis_periodos.fuente IS
    'Plataforma que escribió la fila: COLTRACK | FAGOR | GEOTAB. NULL = histórico previo a ago-2026 (Coltrack/Fagor). No forma parte de la clave única a propósito: una sola fila por vehículo y período.';

CREATE INDEX IF NOT EXISTS idx_ralentis_periodos_fuente
    ON public.ralentis_periodos (fuente);

-- Verificación:
-- SELECT fuente, count(*) FROM public.ralentis_periodos GROUP BY fuente ORDER BY 2 DESC;
