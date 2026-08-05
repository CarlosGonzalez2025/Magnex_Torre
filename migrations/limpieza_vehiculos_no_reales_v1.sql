-- ============================================================
-- MIGRATION: limpieza de "vehículos" que no son vehículos
-- Versión: v1 - 2026-08-05
--
-- Origen: `asegurarVehiculoEnMaestro` auto-creaba un vehículo por cada placa
-- desconocida encontrada en los archivos satelitales, sin validar el formato.
-- Las filas de cierre de los consolidados entraron como si fueran unidades.
--
-- Caso detectado: la placa "TOTAL" acumulaba 1.470,18 h de ralentí en la
-- quincena 2026-07-16→31 — más que las 384 h que físicamente tiene el período —
-- con 0 h de motor y 282,42 galones. Al no tener horas de motor quedaba fuera
-- del % Ralentí (numerador y denominador), pero SÍ sumaba a galones, CO₂ y
-- costo, y engordaba el conteo de "vehículos activos".
--
-- El guard preventivo ya está en services/importService.ts (esPlacaDeVehiculo),
-- así que estas filas no se vuelven a crear. Esta migración limpia lo existente.
--
-- Ejecutar en: Supabase SQL Editor con rol de administrador
-- ============================================================

-- ── 1. INSPECCIONAR ANTES DE BORRAR ───────────────────────────
-- Revise esta lista y confirme que ninguna es un vehículo real:
--
-- SELECT v.id, v.placa, v.cliente, v.tipo_activo,
--        (SELECT count(*) FROM public.ralentis_periodos rp WHERE rp.vehiculo_id = v.id)  AS filas_ralenti,
--        (SELECT count(*) FROM public.ralentis_eventos  re WHERE re.vehiculo_id = v.id)  AS filas_eventos,
--        (SELECT count(*) FROM public.reportes_vehiculos rv WHERE rv.vehiculo_id = v.id) AS filas_reportes
-- FROM public.vehiculos v
-- WHERE upper(regexp_replace(v.placa, '[^A-Za-z0-9]', '', 'g'))
--       IN ('TOTAL','TOTALES','SUMA','SUMATORIA','PROMEDIO','PROMEDIOS',
--           'SUBTOTAL','SUBTOTALES','GENERAL','RESUMEN','NA','NINGUNO',
--           'SINPLACA','PRUEBA','PRUEBAS','PRUEBASIBUTTON','TEST')
-- ORDER BY v.placa;

-- ── 2. BORRAR ─────────────────────────────────────────────────
-- ralentis_periodos / ralentis_eventos / reportes_vehiculos tienen
-- ON DELETE CASCADE sobre vehiculo_id, así que borrar el vehículo arrastra
-- sus filas derivadas. Ejecute el paso 1 primero.

DELETE FROM public.vehiculos v
WHERE upper(regexp_replace(v.placa, '[^A-Za-z0-9]', '', 'g'))
      IN ('TOTAL','TOTALES','SUMA','SUMATORIA','PROMEDIO','PROMEDIOS',
          'SUBTOTAL','SUBTOTALES','GENERAL','RESUMEN','NA','NINGUNO',
          'SINPLACA','PRUEBA','PRUEBAS','PRUEBASIBUTTON','TEST');

-- ── 3. VERIFICAR ──────────────────────────────────────────────
-- No deben quedar filas de ralentí que superen el tope físico del período:
--
-- SELECT v.placa, rp.periodo_inicio, rp.periodo_fin,
--        rp.horas_motor_ralenti,
--        (rp.periodo_fin - rp.periodo_inicio + 1) * 24 AS tope_horas
-- FROM public.ralentis_periodos rp
-- JOIN public.vehiculos v ON v.id = rp.vehiculo_id
-- WHERE rp.horas_motor_ralenti > (rp.periodo_fin - rp.periodo_inicio + 1) * 24
-- ORDER BY rp.horas_motor_ralenti DESC;
