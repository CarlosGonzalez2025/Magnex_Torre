-- ============================================================
-- MIGRACIÓN v3: Tabla de configuración para tracking de sync
-- Ejecutar después de reports_schema.sql y reports_schema_v2.sql
-- ============================================================

-- Tabla clave-valor para configuración global de la app
CREATE TABLE IF NOT EXISTS public.configuracion (
    clave       TEXT PRIMARY KEY,
    valor       TEXT,
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.configuracion ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acceso autenticado" ON public.configuracion
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Permitir acceso también a anon (la app usa anon key de Supabase)
CREATE POLICY "Acceso anon" ON public.configuracion
    FOR ALL TO anon USING (true) WITH CHECK (true);

-- Valores iniciales (no sobreescribir si ya existen)
INSERT INTO public.configuracion (clave, valor) VALUES
    ('ultima_sync_conductores', NULL),
    ('ultima_sync_vehiculos',   NULL)
ON CONFLICT (clave) DO NOTHING;
