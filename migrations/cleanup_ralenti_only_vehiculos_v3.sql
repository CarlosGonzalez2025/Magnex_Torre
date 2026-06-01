-- ============================================================
-- CLEANUP: Eliminar registros kms=0 creados por import solo-Ralentí
-- Versión: v3 - 2026-05-30
-- Contexto: El primer upload de solo-Ralentí (Ralenti 1/2/3.xlsx)
--           creó filas en reportes_vehiculos con kms=0, horas=0
--           para el período 2026-04-29 / 2026-05-28. Esos registros
--           tapan los datos de Km existentes en el listado de informes
--           y bloquean el fallback a Coltrack. Deben eliminarse.
--
-- ACCIÓN: Ejecutar en Supabase SQL Editor ANTES de volver a cargar.
-- ============================================================

-- ── 1. DIAGNÓSTICO: ver cuántos registros tiene ese período ──
SELECT
    rv.id,
    v.placa,
    rv.periodo_inicio,
    rv.periodo_fin,
    rv.mes,
    rv.kms,
    rv.horas_conduccion,
    rv.horas_motor_ralenti,
    rv.ralentis_excesivos,
    rv.dispositivo_gps
FROM public.reportes_vehiculos rv
JOIN public.vehiculos v ON v.id = rv.vehiculo_id
WHERE rv.periodo_inicio = '2026-04-29'
  AND rv.periodo_fin   = '2026-05-28'
  AND rv.kms = 0
ORDER BY v.placa;

-- ── 2. ELIMINAR los registros kms=0 de ese período ───────────
-- Descomentar y ejecutar solo después de confirmar el diagnóstico:
/*
DELETE FROM public.reportes_vehiculos
WHERE periodo_inicio = '2026-04-29'
  AND periodo_fin   = '2026-05-28'
  AND kms = 0;
*/

-- ── 3. (Opcional) limpiar ralentis_periodos del mismo período ─
-- Solo si se desea reimportar desde cero con los archivos completos:
/*
DELETE FROM public.ralentis_periodos
WHERE periodo_inicio = '2026-04-29'
  AND periodo_fin   = '2026-05-28';
*/

-- ── 4. VERIFICAR qué datos quedan para los vehículos afectados ─
-- SELECT v.placa, rv.periodo_inicio, rv.periodo_fin, rv.kms, rv.mes
-- FROM public.reportes_vehiculos rv
-- JOIN public.vehiculos v ON v.id = rv.vehiculo_id
-- WHERE v.placa IN ('GKV610','NPY605','NPY631')  -- ajustar placas según screenshot
-- ORDER BY v.placa, rv.periodo_inicio;
