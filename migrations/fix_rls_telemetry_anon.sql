-- ============================================================
-- FIX: Políticas RLS para rol anon en tablas de telemetría
-- Ejecutar en: Supabase SQL Editor
-- Contexto: La aplicación Magnex Torre usa anon key para todas
--           las operaciones, incluyendo usuarios "autenticados"
--           via Supabase Auth en el cliente. Las políticas 
--           'authenticated' aplican cuando hay un JWT de Auth.
--           Las políticas 'anon' aplican cuando no hay sesión.
--           Esta app usa ambas situaciones, por lo que necesitamos
--           ambos conjuntos de políticas.
-- ============================================================

-- ── REPORTES_CONDUCTORES ─────────────────────────────────────

DROP POLICY IF EXISTS "Anon puede leer reportes_conductores" ON public.reportes_conductores;
CREATE POLICY "Anon puede leer reportes_conductores"
    ON public.reportes_conductores
    FOR SELECT
    TO anon
    USING (true);

DROP POLICY IF EXISTS "Anon puede insertar reportes_conductores" ON public.reportes_conductores;
CREATE POLICY "Anon puede insertar reportes_conductores"
    ON public.reportes_conductores
    FOR INSERT
    TO anon
    WITH CHECK (true);

DROP POLICY IF EXISTS "Anon puede actualizar reportes_conductores" ON public.reportes_conductores;
CREATE POLICY "Anon puede actualizar reportes_conductores"
    ON public.reportes_conductores
    FOR UPDATE
    TO anon
    USING (true)
    WITH CHECK (true);

-- ── REPORTES_VEHICULOS ────────────────────────────────────────

DROP POLICY IF EXISTS "Anon puede leer reportes_vehiculos" ON public.reportes_vehiculos;
CREATE POLICY "Anon puede leer reportes_vehiculos"
    ON public.reportes_vehiculos
    FOR SELECT
    TO anon
    USING (true);

DROP POLICY IF EXISTS "Anon puede insertar reportes_vehiculos" ON public.reportes_vehiculos;
CREATE POLICY "Anon puede insertar reportes_vehiculos"
    ON public.reportes_vehiculos
    FOR INSERT
    TO anon
    WITH CHECK (true);

DROP POLICY IF EXISTS "Anon puede actualizar reportes_vehiculos" ON public.reportes_vehiculos;
CREATE POLICY "Anon puede actualizar reportes_vehiculos"
    ON public.reportes_vehiculos
    FOR UPDATE
    TO anon
    USING (true)
    WITH CHECK (true);

-- ── VERIFICACIÓN ──────────────────────────────────────────────
-- Confirmar políticas activas:
-- SELECT schemaname, tablename, policyname, roles, cmd
-- FROM pg_policies 
-- WHERE tablename IN ('reportes_conductores', 'reportes_vehiculos')
-- ORDER BY tablename, policyname;
