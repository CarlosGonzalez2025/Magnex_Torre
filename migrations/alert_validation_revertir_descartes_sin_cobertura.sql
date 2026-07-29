-- ============================================================
-- MÓDULO: ALERTAS — Revertir descartes emitidos sin cobertura del informe
-- Versión: v1 - 2026-07-29
--
-- QUÉ PASÓ
--   El worker `alerts/validate_alerts.py` decidía si el informe del proveedor
--   estaba disponible con una sola pregunta: "¿hay alguna fila de este proveedor
--   este día?". Asumía que el informe diario llega completo para toda la flota,
--   así que si el informe estaba cargado y no mencionaba la placa, concluía
--   "Falso positivo".
--
--   Ese supuesto es falso. El informe de COLTRACK del 2026-07-28 trae 242 filas y
--   67 placas sobre una flota de 1.019 vehículos: es la lista de los vehículos que
--   el proveedor reportó, no un censo. PWQ878 no tiene NI UNA fila en
--   `alertas_diarias_gps` en toda la historia — no está en la ingesta de COLTRACK —
--   y aun así el worker cerró 101 de sus alertas como "Falso positivo".
--
--   Es la falla que el propio docstring del worker prohíbe: ausencia de dato
--   tratada como evidencia de ausencia. Acusa (o absuelve) a un conductor con un
--   dato que nadie verificó.
--
-- QUÉ HACE ESTA MIGRACIÓN
--   Devuelve a 'inconcluyente' (revisión manual) todo descarte cuya placa no
--   aparece en NINGÚN informe de ese proveedor en los 30 días previos a la alerta
--   — el mismo criterio que ahora aplica `placa_cubierta()` en el worker. Los
--   descartes de vehículos que el proveedor sí cubre se dejan intactos: ahí el
--   silencio del informe sí es evidencia.
--
--   Medido el 2026-07-29 contra producción: 103 de 107 descartes a revertir
--   (PWQ878/COLTRACK ×101, NGK912/FAGOR ×2). Los otros 4 son válidos.
--
-- Ejecutar en: Supabase SQL Editor con rol de administrador
-- Requiere: el fix de alerts/validate_alerts.py ya desplegado, o el worker
--           volverá a emitir los mismos descartes en la siguiente corrida.
-- ============================================================

BEGIN;

-- Placas sin cobertura del informe del proveedor en la ventana de la alerta.
-- Se materializa antes del UPDATE para poder auditar exactamente qué se tocó.
CREATE TEMP TABLE _descartes_sin_cobertura AS
SELECT q.id, q.alert_id, q.plate, q.source, q.alert_timestamp
FROM public.alert_validation_queue q
WHERE q.veredicto = 'descartada'
  AND NOT EXISTS (
      SELECT 1
      FROM public.alertas_diarias_gps a
      WHERE a.placa = q.plate
        AND a.gps ILIKE '%' || q.source || '%'
        AND a.fecha_dia >  (q.alert_timestamp AT TIME ZONE 'America/Bogota')::date - INTERVAL '30 days'
        AND a.fecha_dia <= (q.alert_timestamp AT TIME ZONE 'America/Bogota')::date
  );

SELECT plate, source, COUNT(*) AS descartes_revertidos
FROM _descartes_sin_cobertura
GROUP BY plate, source
ORDER BY descartes_revertidos DESC;

-- 1) La cola: de 'completado/descartada' a 'inconcluyente' sin veredicto.
--    El CHECK ck_avq_veredicto exige que veredicto sea NULL si estado no es
--    'completado', así que ambos campos cambian en la misma sentencia.
UPDATE public.alert_validation_queue q
SET estado       = 'inconcluyente',
    veredicto    = NULL,
    velocidad_max = NULL,
    motivo       = q.plate || ' no aparece en ningún informe diario de ' || q.source ||
                   ' en los 30 días previos, así que el informe no sirve para verificar ni' ||
                   ' desmentir esta alerta. El veredicto "falso positivo" anterior se emitió' ||
                   ' sobre un supuesto inválido (se asumía que el informe cubre toda la flota)' ||
                   ' y queda anulado. Requiere revisión manual.',
    ultimo_error = 'Veredicto anulado por migración alert_validation_revertir_descartes_sin_cobertura (2026-07-29).'
FROM _descartes_sin_cobertura d
WHERE q.id = d.id;

-- 2) Las tablas de alertas: is_real_alert vuelve a NULL = "no verificado".
--    NULL es la única respuesta honesta cuando nadie comprobó nada. Se limpia
--    aunque el conteo previo diera 0 filas: el worker crasheaba justo antes de
--    propagar, pero eso fue suerte, no diseño.
UPDATE public.saved_alerts s
SET is_real_alert     = NULL,
    validation_reason = NULL,
    updated_at        = NOW()
FROM _descartes_sin_cobertura d
WHERE s.alert_id = d.alert_id
  AND s.is_real_alert IS NOT NULL;

UPDATE public.alert_history h
SET is_real_alert     = NULL,
    validation_reason = NULL
FROM _descartes_sin_cobertura d
WHERE h.alert_id = d.alert_id
  AND h.is_real_alert IS NOT NULL;

COMMIT;

-- ============================================================
-- Verificación (debe quedar 0 en la primera consulta)
-- ============================================================
-- SELECT COUNT(*) AS descartes_sin_cobertura_restantes
-- FROM public.alert_validation_queue q
-- WHERE q.veredicto = 'descartada'
--   AND NOT EXISTS (
--       SELECT 1 FROM public.alertas_diarias_gps a
--       WHERE a.placa = q.plate AND a.gps ILIKE '%' || q.source || '%'
--         AND a.fecha_dia >  (q.alert_timestamp AT TIME ZONE 'America/Bogota')::date - INTERVAL '30 days'
--         AND a.fecha_dia <= (q.alert_timestamp AT TIME ZONE 'America/Bogota')::date);
--
-- SELECT estado, veredicto, COUNT(*) FROM public.alert_validation_queue
-- GROUP BY estado, veredicto ORDER BY 3 DESC;
