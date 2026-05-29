-- ============================================================
-- FIX: Agregar columnas faltantes a reportes_vehiculos
-- + Agregar políticas RLS para rol anon
-- 
-- EJECUTAR EN: https://supabase.com/dashboard/project/cmzeijcyykzdmvisojte/sql/new
-- ============================================================

-- 1. Agregar columnas faltantes a reportes_vehiculos
-- (usa ADD COLUMN IF NOT EXISTS para que sea idempotente)

ALTER TABLE public.reportes_vehiculos
    ADD COLUMN IF NOT EXISTS km_recorridos_ralenti   NUMERIC(12,2)  DEFAULT 0,
    ADD COLUMN IF NOT EXISTS horas_motor_encendido   NUMERIC(10,2)  DEFAULT 0,
    ADD COLUMN IF NOT EXISTS horas_motor_ralenti     NUMERIC(10,2)  DEFAULT 0,
    ADD COLUMN IF NOT EXISTS consumo_combustible     NUMERIC(12,4)  DEFAULT 0,
    ADD COLUMN IF NOT EXISTS ralentis_excesivos      NUMERIC(10,2)  DEFAULT 0,
    ADD COLUMN IF NOT EXISTS dispositivo_gps         TEXT           DEFAULT '',
    ADD COLUMN IF NOT EXISTS base                    TEXT           DEFAULT '',
    ADD COLUMN IF NOT EXISTS estado_gps              TEXT           DEFAULT 'ACTIVO',
    ADD COLUMN IF NOT EXISTS proyecto                TEXT           DEFAULT '';

-- También asegurar columnas en reportes_conductores
ALTER TABLE public.reportes_conductores
    ADD COLUMN IF NOT EXISTS excesos_10_kph        NUMERIC(10,2)  DEFAULT 0,
    ADD COLUMN IF NOT EXISTS excesos_20_kph        NUMERIC(10,2)  DEFAULT 0,
    ADD COLUMN IF NOT EXISTS excesos_30_kph        NUMERIC(10,2)  DEFAULT 0,
    ADD COLUMN IF NOT EXISTS excesos_40_kph        NUMERIC(10,2)  DEFAULT 0,
    ADD COLUMN IF NOT EXISTS excesos_50_kph        NUMERIC(10,2)  DEFAULT 0,
    ADD COLUMN IF NOT EXISTS excesos_60_kph        NUMERIC(10,2)  DEFAULT 0,
    ADD COLUMN IF NOT EXISTS excesos_80_kph        NUMERIC(10,2)  DEFAULT 0,
    ADD COLUMN IF NOT EXISTS aceleraciones_bruscas NUMERIC(10,2)  DEFAULT 0,
    ADD COLUMN IF NOT EXISTS frenadas_bruscas      NUMERIC(10,2)  DEFAULT 0,
    ADD COLUMN IF NOT EXISTS ibutton               TEXT           DEFAULT '',
    ADD COLUMN IF NOT EXISTS estado_conductor      TEXT           DEFAULT 'ACTIVO',
    ADD COLUMN IF NOT EXISTS proyecto              TEXT           DEFAULT '';

-- 2. Forzar refresco del schema cache de Supabase
NOTIFY pgrst, 'reload schema';

-- 3. Políticas RLS para rol anon (necesario para que la app funcione sin login)

-- REPORTES_CONDUCTORES
DROP POLICY IF EXISTS "Anon puede leer reportes_conductores" ON public.reportes_conductores;
CREATE POLICY "Anon puede leer reportes_conductores"
    ON public.reportes_conductores FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Anon puede insertar reportes_conductores" ON public.reportes_conductores;
CREATE POLICY "Anon puede insertar reportes_conductores"
    ON public.reportes_conductores FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "Anon puede actualizar reportes_conductores" ON public.reportes_conductores;
CREATE POLICY "Anon puede actualizar reportes_conductores"
    ON public.reportes_conductores FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- REPORTES_VEHICULOS
DROP POLICY IF EXISTS "Anon puede leer reportes_vehiculos" ON public.reportes_vehiculos;
CREATE POLICY "Anon puede leer reportes_vehiculos"
    ON public.reportes_vehiculos FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Anon puede insertar reportes_vehiculos" ON public.reportes_vehiculos;
CREATE POLICY "Anon puede insertar reportes_vehiculos"
    ON public.reportes_vehiculos FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "Anon puede actualizar reportes_vehiculos" ON public.reportes_vehiculos;
CREATE POLICY "Anon puede actualizar reportes_vehiculos"
    ON public.reportes_vehiculos FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- 4. Verificar resultado
SELECT 
    column_name, 
    data_type, 
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'reportes_vehiculos'
ORDER BY ordinal_position;
