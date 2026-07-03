-- ============================================================
-- FIX: corrige el desfase de `fecha_dia` por zona horaria
-- ============================================================
-- Contexto:
--   El parser antiguo derivaba `fecha_dia` a partir de la fecha en UTC
--   (`toISOString().slice(0,10)`), por lo que los eventos de la tarde/noche de un
--   día quedaban registrados con el `fecha_dia` del día SIGUIENTE. Síntoma: para ver
--   "ayer" había que poner la fecha fin en "hoy".
--
--   La columna `fecha` (TIMESTAMPTZ) guarda el INSTANTE real del evento, así que el
--   día calendario correcto de la operación es el de esa fecha en hora Colombia.
--
-- Qué hace:
--   Recalcula `fecha_dia` = fecha (en 'America/Bogota')::date SOLO en las filas que
--   están desfasadas. Es idempotente: correrla de nuevo no cambia nada.
--
-- Nota:
--   Válida para las cargas de plataforma (COLTRACK / FAGOR / GEOTAB), cuyo `fecha`
--   es un instante correcto. Si además se usó la "Plantilla Estándar" para cargar
--   alertas, revisar esos registros aparte antes de correr en producción.
--
-- Recomendado: ejecutar dentro de una transacción y revisar el conteo previo.
-- ============================================================

BEGIN;

-- Vista previa: cuántas filas se corregirán
-- SELECT count(*) FROM public.alertas_diarias_gps
-- WHERE fecha_dia <> (fecha AT TIME ZONE 'America/Bogota')::date;

UPDATE public.alertas_diarias_gps
SET fecha_dia = (fecha AT TIME ZONE 'America/Bogota')::date
WHERE fecha_dia <> (fecha AT TIME ZONE 'America/Bogota')::date;

-- Igual corrección para las alertas pendientes (no registradas en base activa),
-- que comparten el mismo esquema de fecha.
UPDATE public.alertas_diarias_pendientes
SET fecha_dia = (fecha AT TIME ZONE 'America/Bogota')::date
WHERE fecha_dia <> (fecha AT TIME ZONE 'America/Bogota')::date;

COMMIT;
