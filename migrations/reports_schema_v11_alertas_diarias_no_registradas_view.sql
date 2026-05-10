-- ============================================================
-- MIGRATION v11: Vista de alertas diarias no registradas
-- Execute after reports_schema_v8_alertas_pendientes.sql
-- ============================================================
-- Esta vista expone las alertas que quedaron como novedad porque la placa no
-- existe o no esta activa en la base maestra de vehiculos. Cuando el vehiculo
-- se cree/active, el trigger de v8 migra el registro a alertas_diarias_gps.
-- ============================================================

CREATE OR REPLACE VIEW public.vw_alertas_diarias_no_registradas AS
SELECT
  p.id,
  p.carga_id,
  p.placa,
  p.conductor,
  p.conductor_identificado,
  p.lugar,
  p.latitud,
  p.longitud,
  p.fecha,
  p.fecha_dia,
  p.velocidad,
  p.estado,
  p.infraccion_80_kmh,
  p.excesos_varios_parametros,
  p.excesos_50_80_kmh,
  p.frenadas_bruscas,
  (
    COALESCE(p.infraccion_80_kmh, 0) +
    COALESCE(p.excesos_varios_parametros, 0) +
    COALESCE(p.excesos_50_80_kmh, 0) +
    COALESCE(p.frenadas_bruscas, 0)
  ) AS total_eventos,
  p.contrato_nombre,
  p.gps,
  p.estado_migracion,
  p.created_at,
  CASE
    WHEN v.id IS NULL THEN 'PLACA_NO_EXISTE_EN_BASE_VEHICULOS'
    WHEN UPPER(TRIM(COALESCE(v.estado, ''))) <> 'ACTIVO' THEN 'VEHICULO_INACTIVO'
    ELSE 'PENDIENTE_DE_MIGRACION'
  END AS motivo_no_registro,
  v.id AS vehiculo_id_en_base,
  v.estado AS estado_vehiculo_base,
  v.contrato_id AS contrato_id_vehiculo_base
FROM public.alertas_diarias_pendientes p
LEFT JOIN public.vehiculos v
  ON UPPER(TRIM(v.placa)) = UPPER(TRIM(p.placa))
WHERE p.estado_migracion = 'pendiente';

GRANT SELECT ON public.vw_alertas_diarias_no_registradas TO anon, authenticated;

