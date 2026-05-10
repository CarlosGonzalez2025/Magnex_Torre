-- ============================================================
-- MIGRATION v7: Daily GPS alerts report
-- Execute after reports_schema_v6_import_integrity.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS public.alertas_diarias_gps (
  id                         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  carga_id                   UUID REFERENCES public.cargas_excel(id) ON DELETE SET NULL,
  vehiculo_id                UUID REFERENCES public.vehiculos(id) ON DELETE SET NULL,
  conductor_id               UUID REFERENCES public.conductores(id) ON DELETE SET NULL,
  contrato_id                UUID REFERENCES public.contratos(id) ON DELETE SET NULL,

  placa                      TEXT NOT NULL,
  conductor                  TEXT,
  conductor_identificado     BOOLEAN DEFAULT FALSE,
  lugar                      TEXT,
  latitud                    NUMERIC(12,8),
  longitud                   NUMERIC(12,8),
  fecha                      TIMESTAMPTZ NOT NULL,
  fecha_dia                  DATE NOT NULL,
  velocidad                  NUMERIC(8,2) DEFAULT 0,
  estado                     TEXT,
  infraccion_80_kmh          INTEGER DEFAULT 0,
  excesos_varios_parametros  INTEGER DEFAULT 0,
  excesos_50_80_kmh          INTEGER DEFAULT 0,
  frenadas_bruscas           INTEGER DEFAULT 0,
  contrato_nombre            TEXT,
  gps                        TEXT,
  tipo_activo                TEXT,
  cliente                    TEXT,
  raw_data                   JSONB,
  created_at                 TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alertas_diarias_fecha
  ON public.alertas_diarias_gps(fecha_dia);

CREATE INDEX IF NOT EXISTS idx_alertas_diarias_placa_fecha
  ON public.alertas_diarias_gps(placa, fecha_dia);

CREATE INDEX IF NOT EXISTS idx_alertas_diarias_contrato_fecha
  ON public.alertas_diarias_gps(contrato_id, fecha_dia);

CREATE UNIQUE INDEX IF NOT EXISTS alertas_diarias_gps_unique_event_uidx
  ON public.alertas_diarias_gps(
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

ALTER TABLE public.alertas_diarias_gps ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'alertas_diarias_gps'
      AND policyname = 'Alertas diarias authenticated all'
  ) THEN
    CREATE POLICY "Alertas diarias authenticated all"
    ON public.alertas_diarias_gps
    FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'alertas_diarias_gps'
      AND policyname = 'Alertas diarias anon all'
  ) THEN
    CREATE POLICY "Alertas diarias anon all"
    ON public.alertas_diarias_gps
    FOR ALL TO anon
    USING (true)
    WITH CHECK (true);
  END IF;
END $$;
