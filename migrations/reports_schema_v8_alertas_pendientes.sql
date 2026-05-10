-- ============================================================
-- MIGRATION v8: Alertas GPS pendientes (placa no en base activa)
-- Execute after reports_schema_v7_daily_alerts.sql
-- ============================================================
-- Lógica:
--   Al cargar alertas diarias, los registros con vehículo activo entran a
--   alertas_diarias_gps.
--   Si la placa no existe o está inactiva en vehiculos, el registro queda solo
--   en esta tabla de novedades para trazabilidad.
--   Cuando esa placa se registra o activa en vehiculos, el trigger
--   fn_migrar_alertas_pendientes pasa la novedad a alertas_diarias_gps y marca
--   la novedad como migrada.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.alertas_diarias_pendientes (
  id                         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  carga_id                   UUID REFERENCES public.cargas_excel(id) ON DELETE SET NULL,

  placa                      TEXT NOT NULL,
  conductor                  TEXT,
  conductor_identificado     BOOLEAN DEFAULT FALSE,
  lugar                      TEXT,
  latitud                    DOUBLE PRECISION,
  longitud                   DOUBLE PRECISION,
  fecha                      TIMESTAMPTZ NOT NULL,
  fecha_dia                  DATE NOT NULL,
  velocidad                  NUMERIC(10,2) DEFAULT 0,
  estado                     TEXT,
  infraccion_80_kmh          INTEGER DEFAULT 0,
  excesos_varios_parametros  INTEGER DEFAULT 0,
  excesos_50_80_kmh          INTEGER DEFAULT 0,
  frenadas_bruscas           INTEGER DEFAULT 0,
  contrato_nombre            TEXT,
  gps                        TEXT,
  raw_data                   JSONB,

  estado_migracion           TEXT NOT NULL DEFAULT 'pendiente',  -- pendiente | enriquecido
  migrado_at                 TIMESTAMPTZ,
  created_at                 TIMESTAMPTZ DEFAULT NOW()
);

-- Mismo índice único que la tabla principal
CREATE UNIQUE INDEX IF NOT EXISTS alertas_pendientes_unique_event_uidx
  ON public.alertas_diarias_pendientes(
    placa,
    fecha,
    conductor,
    lugar,
    velocidad,
    infraccion_80_kmh,
    excesos_varios_parametros,
    excesos_50_80_kmh,
    frenadas_bruscas
  );

CREATE INDEX IF NOT EXISTS idx_alertas_pendientes_placa_estado
  ON public.alertas_diarias_pendientes(placa, estado_migracion);

-- RLS
ALTER TABLE public.alertas_diarias_pendientes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'alertas_diarias_pendientes'
      AND policyname = 'Alertas pendientes authenticated all'
  ) THEN
    CREATE POLICY "Alertas pendientes authenticated all"
    ON public.alertas_diarias_pendientes
    FOR ALL TO authenticated
    USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'alertas_diarias_pendientes'
      AND policyname = 'Alertas pendientes anon all'
  ) THEN
    CREATE POLICY "Alertas pendientes anon all"
    ON public.alertas_diarias_pendientes
    FOR ALL TO anon
    USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================
-- Función: mueve/enriquece pendientes hacia alertas_diarias_gps
-- al momento que la placa se registra o activa en vehiculos
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_migrar_alertas_pendientes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _contrato_id     UUID;
  _contrato_nombre TEXT;
BEGIN
  -- Solo actuar cuando el vehículo queda ACTIVO
  IF UPPER(TRIM(COALESCE(NEW.estado, ''))) <> 'ACTIVO' THEN
    RETURN NEW;
  END IF;

  -- Resolver contrato del vehículo
  _contrato_id := NEW.contrato_id;
  _contrato_nombre := NULL;
  IF _contrato_id IS NOT NULL THEN
    SELECT nombre INTO _contrato_nombre
    FROM public.contratos
    WHERE id = _contrato_id
    LIMIT 1;
  END IF;

  -- Pasar las novedades pendientes a la tabla de alertas del informe diario.
  -- Si una versión anterior ya insertó la alerta sin vehiculo_id, el conflicto
  -- la enriquece en lugar de duplicarla.
  INSERT INTO public.alertas_diarias_gps (
    carga_id,
    vehiculo_id,
    conductor_id,
    contrato_id,
    placa,
    conductor,
    conductor_identificado,
    lugar,
    latitud,
    longitud,
    fecha,
    fecha_dia,
    velocidad,
    estado,
    infraccion_80_kmh,
    excesos_varios_parametros,
    excesos_50_80_kmh,
    frenadas_bruscas,
    contrato_nombre,
    gps,
    tipo_activo,
    cliente,
    raw_data
  )
  SELECT
    p.carga_id,
    NEW.id,
    c.id,
    COALESCE(_contrato_id, NEW.contrato_id),
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
    COALESCE(_contrato_nombre, p.contrato_nombre),
    COALESCE(NULLIF(p.gps, ''), NEW.gps_compañia),
    NEW.tipo_activo,
    NEW.cliente,
    p.raw_data
  FROM public.alertas_diarias_pendientes p
  LEFT JOIN LATERAL (
    SELECT id
    FROM public.conductores c
    WHERE UPPER(TRIM(COALESCE(c.nombres, ''))) = UPPER(TRIM(COALESCE(p.conductor, '')))
      AND UPPER(TRIM(COALESCE(c.estado, ''))) = 'ACTIVO'
    LIMIT 1
  ) c ON TRUE
  WHERE UPPER(TRIM(p.placa)) = UPPER(TRIM(NEW.placa))
    AND p.estado_migracion = 'pendiente'
  ON CONFLICT (
    placa,
    fecha,
    conductor,
    lugar,
    velocidad,
    infraccion_80_kmh,
    excesos_varios_parametros,
    excesos_50_80_kmh,
    frenadas_bruscas
  ) DO UPDATE
     SET vehiculo_id     = EXCLUDED.vehiculo_id,
         conductor_id    = COALESCE(EXCLUDED.conductor_id, alertas_diarias_gps.conductor_id),
         contrato_id     = COALESCE(EXCLUDED.contrato_id, alertas_diarias_gps.contrato_id),
         contrato_nombre = COALESCE(EXCLUDED.contrato_nombre, alertas_diarias_gps.contrato_nombre),
         gps             = COALESCE(EXCLUDED.gps, alertas_diarias_gps.gps),
         tipo_activo     = COALESCE(EXCLUDED.tipo_activo, alertas_diarias_gps.tipo_activo),
         cliente         = COALESCE(EXCLUDED.cliente, alertas_diarias_gps.cliente);

  -- Marcar las novedades correspondientes como enriquecidas
  UPDATE public.alertas_diarias_pendientes
     SET estado_migracion = 'enriquecido',
         migrado_at       = NOW()
   WHERE UPPER(TRIM(placa)) = UPPER(TRIM(NEW.placa))
     AND estado_migracion = 'pendiente';

  RETURN NEW;
END;
$$;

-- Trigger: se dispara al INSERT o cuando cambian datos que enriquecen el informe
DROP TRIGGER IF EXISTS trg_migrar_alertas_pendientes ON public.vehiculos;
CREATE TRIGGER trg_migrar_alertas_pendientes
  AFTER INSERT OR UPDATE OF estado, contrato_id, cliente, tipo_activo, gps_compañia
  ON public.vehiculos
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_migrar_alertas_pendientes();
