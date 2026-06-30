-- ============================================================
-- MIGRATION v18: Modelo "fuente" multiplataforma en reportes mensuales
-- ============================================================
-- Objetivo: permitir que un mismo vehículo/conductor tenga UNA fila por
-- plataforma satelital (COLTRACK | FAGOR | GEOTAB | PLANTILLA) dentro del
-- mismo período. La capa de lectura (reportService.getReporte*) YA suma
-- múltiples filas por entidad+período, de modo que con una fila por fuente:
--   • Las métricas (km, excesos, etc.) se SUMAN entre plataformas.
--   • Re-cargar el archivo de una plataforma SOBREESCRIBE solo su propia
--     fila (upsert idempotente) → imposible duplicar.
--
-- Contexto: la flota está migrando GPS de Fagor/Coltrack a Geotab, por lo que
-- durante la transición una placa puede aparecer en varias plataformas y sus
-- valores deben sumarse en el informe mensual.
--
-- NOTA OPERATIVA: las filas existentes se etiquetan como 'COLTRACK' (origen
-- histórico dominante). Si un período ya cargado se vuelve a procesar tras esta
-- migración con OTRA plataforma, conviene limpiar ese período primero para
-- evitar filas paralelas mal atribuidas. Para el período en curso se recomienda
-- re-cargar cada plataforma una vez aplicada la migración.
-- ============================================================

-- 1. Columna `fuente` (NOT NULL con default → backfilla filas existentes)
ALTER TABLE public.reportes_conductores
  ADD COLUMN IF NOT EXISTS fuente TEXT NOT NULL DEFAULT 'COLTRACK';

ALTER TABLE public.reportes_vehiculos
  ADD COLUMN IF NOT EXISTS fuente TEXT NOT NULL DEFAULT 'COLTRACK';

-- 2. Validación de valores permitidos
ALTER TABLE public.reportes_conductores DROP CONSTRAINT IF EXISTS reportes_conductores_fuente_check;
ALTER TABLE public.reportes_conductores
  ADD CONSTRAINT reportes_conductores_fuente_check
  CHECK (fuente IN ('COLTRACK', 'FAGOR', 'GEOTAB', 'PLANTILLA', 'LEGACY'));

ALTER TABLE public.reportes_vehiculos DROP CONSTRAINT IF EXISTS reportes_vehiculos_fuente_check;
ALTER TABLE public.reportes_vehiculos
  ADD CONSTRAINT reportes_vehiculos_fuente_check
  CHECK (fuente IN ('COLTRACK', 'FAGOR', 'GEOTAB', 'PLANTILLA', 'LEGACY'));

-- 3. Reemplazar la llave única por una que incluya `fuente`
DROP INDEX IF EXISTS public.reportes_conductores_period_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS reportes_conductores_period_fuente_uidx
  ON public.reportes_conductores(conductor_id, periodo_inicio, periodo_fin, fuente);

DROP INDEX IF EXISTS public.reportes_vehiculos_period_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS reportes_vehiculos_period_fuente_uidx
  ON public.reportes_vehiculos(vehiculo_id, periodo_inicio, periodo_fin, fuente);

-- 4. Recargar el esquema de PostgREST
NOTIFY pgrst, 'reload schema';
