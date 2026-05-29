-- ============================================================
-- LIMPIEZA DE PERÍODO: 29/04/2026 al 28/05/2026
-- Elimina todos los registros del período para reprocesar
--
-- EJECUTAR EN: https://supabase.com/dashboard/project/cmzeijcyykzdmvisojte/sql/new
-- ============================================================

-- 1. Ver cuántos registros hay ANTES de eliminar (verificación previa)
SELECT 
    'reportes_conductores' AS tabla,
    COUNT(*) AS total_registros,
    MIN(periodo_inicio) AS periodo_inicio,
    MAX(periodo_fin) AS periodo_fin
FROM public.reportes_conductores
WHERE periodo_inicio >= '2026-04-29' AND periodo_fin <= '2026-05-28'

UNION ALL

SELECT 
    'reportes_vehiculos' AS tabla,
    COUNT(*) AS total_registros,
    MIN(periodo_inicio) AS periodo_inicio,
    MAX(periodo_fin) AS periodo_fin
FROM public.reportes_vehiculos
WHERE periodo_inicio >= '2026-04-29' AND periodo_fin <= '2026-05-28';

-- ============================================================
-- 2. ELIMINAR registros del período
--    (descomenta las líneas DELETE cuando estés listo)
-- ============================================================

-- DELETE FROM public.reportes_conductores
-- WHERE periodo_inicio >= '2026-04-29' AND periodo_fin <= '2026-05-28';

-- DELETE FROM public.reportes_vehiculos
-- WHERE periodo_inicio >= '2026-04-29' AND periodo_fin <= '2026-05-28';

-- ============================================================
-- 3. Verificar que quedó limpio (ejecutar después del DELETE)
-- ============================================================
-- SELECT 
--     'reportes_conductores' AS tabla, COUNT(*) AS registros_restantes
-- FROM public.reportes_conductores
-- WHERE periodo_inicio >= '2026-04-29' AND periodo_fin <= '2026-05-28'
-- UNION ALL
-- SELECT 
--     'reportes_vehiculos', COUNT(*)
-- FROM public.reportes_vehiculos
-- WHERE periodo_inicio >= '2026-04-29' AND periodo_fin <= '2026-05-28';
