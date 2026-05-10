-- ============================================================
-- MIGRACIÓN v4: Agrega contrato_id a conductores
-- Ejecutar después de reports_schema_v3.sql
-- ============================================================

ALTER TABLE public.conductores
  ADD COLUMN IF NOT EXISTS contrato_id UUID REFERENCES public.contratos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_conductores_contrato
  ON public.conductores(contrato_id);
