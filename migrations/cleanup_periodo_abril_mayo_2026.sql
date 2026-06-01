-- ============================================================
-- LIMPIEZA: Período Abril-Mayo 2026
-- Elimina todos los registros del período 29/04/2026 - 28/05/2026
-- en reportes_vehiculos, reportes_conductores y ralentis_periodos
-- para permitir una recarga limpia desde los archivos planos.
-- Ejecutar en: Supabase SQL Editor
-- ============================================================

-- ── PASO 1: DIAGNÓSTICO (ejecutar primero, no borra nada) ────

-- Registros de vehículos del período
SELECT 'reportes_vehiculos' AS tabla,
       COUNT(*) AS total,
       MIN(periodo_inicio::text) AS desde,
       MAX(periodo_fin::text)    AS hasta
FROM public.reportes_vehiculos
WHERE mes IN ('2026-04', '2026-05')
   OR (periodo_inicio >= '2026-04-01' AND periodo_fin <= '2026-05-31')

UNION ALL

-- Registros de conductores del período
SELECT 'reportes_conductores' AS tabla,
       COUNT(*) AS total,
       MIN(periodo_inicio::text) AS desde,
       MAX(periodo_fin::text)    AS hasta
FROM public.reportes_conductores
WHERE mes IN ('2026-04', '2026-05')
   OR (periodo_inicio >= '2026-04-01' AND periodo_fin <= '2026-05-31')

UNION ALL

-- Registros de ralentís del período
SELECT 'ralentis_periodos' AS tabla,
       COUNT(*) AS total,
       MIN(periodo_inicio::text) AS desde,
       MAX(periodo_fin::text)    AS hasta
FROM public.ralentis_periodos
WHERE periodo_inicio >= '2026-04-01'
  AND periodo_fin    <= '2026-05-31';


-- ── PASO 2: BORRADO (ejecutar solo tras confirmar diagnóstico) ─

-- 2a. Eliminar reportes de vehículos de abril y mayo 2026
DELETE FROM public.reportes_vehiculos
WHERE mes IN ('2026-04', '2026-05')
   OR (periodo_inicio >= '2026-04-01' AND periodo_fin <= '2026-05-31');

-- 2b. Eliminar reportes de conductores de abril y mayo 2026
DELETE FROM public.reportes_conductores
WHERE mes IN ('2026-04', '2026-05')
   OR (periodo_inicio >= '2026-04-01' AND periodo_fin <= '2026-05-31');

-- 2c. Eliminar ralentís del período (tabla dedicada)
DELETE FROM public.ralentis_periodos
WHERE periodo_inicio >= '2026-04-01'
  AND periodo_fin    <= '2026-05-31';


-- ── PASO 3: VERIFICACIÓN FINAL ────────────────────────────────

-- Debe retornar 0 en las tres tablas
SELECT 'reportes_vehiculos' AS tabla, COUNT(*) AS quedan
FROM public.reportes_vehiculos
WHERE mes IN ('2026-04', '2026-05')
   OR (periodo_inicio >= '2026-04-01' AND periodo_fin <= '2026-05-31')

UNION ALL

SELECT 'reportes_conductores' AS tabla, COUNT(*) AS quedan
FROM public.reportes_conductores
WHERE mes IN ('2026-04', '2026-05')
   OR (periodo_inicio >= '2026-04-01' AND periodo_fin <= '2026-05-31')

UNION ALL

SELECT 'ralentis_periodos' AS tabla, COUNT(*) AS quedan
FROM public.ralentis_periodos
WHERE periodo_inicio >= '2026-04-01'
  AND periodo_fin    <= '2026-05-31';
