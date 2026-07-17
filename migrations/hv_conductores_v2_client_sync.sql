-- ============================================================
-- HOJA DE VIDA — v2: permitir sincronización desde el cliente (2026-07-17)
--
-- La sincronización de `hv_conductores` corre en el navegador (mismo patrón
-- que googleSheetsService para `conductores`), no en una función serverless,
-- porque el server local no la enruta y no hay service_role en local.
-- Por eso se habilita INSERT autenticado (el UPDATE ya se habilitó en v1).
--
-- Ejecutar en: Supabase SQL Editor (rol admin).
-- ============================================================

DROP POLICY IF EXISTS "hv insert auth" ON public.hv_conductores;
CREATE POLICY "hv insert auth" ON public.hv_conductores
  FOR INSERT TO authenticated WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
