-- =====================================================
-- Migration: Bitácora de Gestión de Alertas y Novedades (v2)
-- Incluye campos para adjuntar evidencia (imágenes/archivos/PDF)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.bitacora_gestion (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha                   DATE NOT NULL,
  hora_alerta             TEXT,
  hora_aviso_supervisor   TEXT,
  tipo_novedad            TEXT NOT NULL,
  placa                   TEXT,
  contrato                TEXT,
  plataforma              TEXT,
  conductor               TEXT,
  gestion_realizada       TEXT,
  cierre_alerta           TEXT,
  es_alerta               BOOLEAN DEFAULT true,
  observacion             TEXT,
  evidencia_url           TEXT,
  evidencia_nombre        TEXT,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  created_by              UUID REFERENCES auth.users(id),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- Si la tabla ya existía, añadir columnas de evidencia sin error
ALTER TABLE public.bitacora_gestion ADD COLUMN IF NOT EXISTS evidencia_url TEXT;
ALTER TABLE public.bitacora_gestion ADD COLUMN IF NOT EXISTS evidencia_nombre TEXT;

-- Índices para optimizar filtros de fecha, placa y contrato
CREATE INDEX IF NOT EXISTS idx_bitacora_fecha ON public.bitacora_gestion(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_bitacora_placa ON public.bitacora_gestion(placa);
CREATE INDEX IF NOT EXISTS idx_bitacora_contrato ON public.bitacora_gestion(contrato);
CREATE INDEX IF NOT EXISTS idx_bitacora_plataforma ON public.bitacora_gestion(plataforma);

-- RLS
ALTER TABLE public.bitacora_gestion ENABLE ROW LEVEL SECURITY;

-- Políticas de acceso
DROP POLICY IF EXISTS "bitacora_read_policy" ON public.bitacora_gestion;
DROP POLICY IF EXISTS "bitacora_write_policy" ON public.bitacora_gestion;

CREATE POLICY "bitacora_read_policy"
  ON public.bitacora_gestion FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "bitacora_write_policy"
  ON public.bitacora_gestion FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
