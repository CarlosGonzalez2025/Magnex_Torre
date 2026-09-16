-- ============================================================
-- MIGRATION: geotab_daily_metrics — columna `galones_ralenti`
-- Versión: v1 - 2026-09-16
--
-- Motivo: hasta ahora Geotab no aportaba combustible al informe de ralentí y
-- `ralentis_periodos.consumo_combustible` quedaba en 0 para todos sus vehículos,
-- con el efecto de que el CO₂ y el costo salían en $0. La sonda
-- (/api/geotab action:'fuelDiagnostics') encontró que las ECU de esta flota SÍ
-- publican el diagnóstico `DiagnosticDeviceTotalIdleFuelId` — «Combustible total
-- utilizado al ralentí (desde la instalación del dispositivo telemático)»—, un
-- contador ACUMULATIVO de por vida. El consumo de un período es la resta entre
-- lecturas: medición, no estimación.
--
-- Medido el 2026-09-16 sobre 3 días y 369 vehículos: 311 con dato (84%), 564
-- galones sobre 2.015 h de ralentí = 0,28 gal/h. Fagor, midiendo la misma flota
-- con sus propios sensores, daba 0,27 gal/h. Dos plataformas independientes
-- coinciden, así que el contador es lo que dice ser.
--
-- Se guarda por día y vehículo, igual que km y horas, porque una quincena entera
-- son ~143.000 lecturas de StatusData y el tope de la API de Geotab es 50.000:
-- no cabe en una sola pasada. El cron horario lo calcula día a día y el sync
-- quincenal lo suma.
--
-- NULL ≠ 0, a propósito:
--   NULL = el vehículo no publicó lecturas ese día (equipo sin lectura de ECU, o
--          sin actividad). El informe debe mostrarlo como «sin medición».
--   0    = hubo lecturas y el consumo medido fue cero.
-- Por eso la columna NO lleva DEFAULT 0: un cero por defecto haría que un vehículo
-- sin sensor se leyera como «no consumió nada», que es justo el malentendido a
-- evitar.
--
-- Ejecutar en: Supabase SQL Editor con rol de administrador
-- ============================================================

ALTER TABLE public.geotab_daily_metrics
    ADD COLUMN IF NOT EXISTS galones_ralenti NUMERIC(12,4);

COMMENT ON COLUMN public.geotab_daily_metrics.galones_ralenti IS
    'Galones quemados en ralentí ese día, por diferencia del contador acumulativo DiagnosticDeviceTotalIdleFuelId de la ECU. NULL = el vehículo no publicó lecturas ese día (no es lo mismo que cero).';

CREATE INDEX IF NOT EXISTS idx_geotab_daily_galones_ralenti
    ON public.geotab_daily_metrics (fecha)
    WHERE galones_ralenti IS NOT NULL;

NOTIFY pgrst, 'reload schema';

-- Verificación:
-- SELECT fecha,
--        count(*)                                  AS vehiculos,
--        count(galones_ralenti)                    AS con_medicion,
--        round(sum(galones_ralenti)::numeric, 1)   AS galones
-- FROM public.geotab_daily_metrics
-- WHERE fecha >= current_date - 7
-- GROUP BY fecha
-- ORDER BY fecha;
