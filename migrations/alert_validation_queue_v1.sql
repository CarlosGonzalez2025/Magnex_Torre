-- ============================================================
-- MÓDULO: ALERTAS — Cola de validación (reemplaza el disparo desde el navegador)
-- Versión: v1 - 2026-07-16
-- Descripción: Sustituye el fetch a /api/validate-alert que se lanzaba desde el
--              navegador del usuario por cada alerta de velocidad. Ese diseño
--              perdía la validación si cerraban la pestaña y no tenía reintentos.
--
--              Ahora la alerta se ENCOLA y un worker Python (alerts/validate_alerts.py)
--              la procesa por lotes contra el informe diario del proveedor que el
--              sistema ya ingiere en `alertas_diarias_gps`.
--
--              La cola es lo que hace posible el reintento, y el reintento es
--              imprescindible: el informe diario llega con retraso, así que una
--              alerta puede quedar sin verificar durante horas. Sin cola, ese
--              caso obligaría a inventar un veredicto (que es justo lo que hacía
--              el agente RPA anterior con Math.random()).
--
-- Ejecutar en: Supabase SQL Editor con rol de administrador
-- ============================================================

CREATE TABLE IF NOT EXISTS public.alert_validation_queue (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    alert_id        TEXT NOT NULL,
    plate           TEXT NOT NULL,
    source          TEXT NOT NULL,             -- COLTRACK | FAGOR | GEOTAB
    alert_timestamp TIMESTAMPTZ NOT NULL,      -- momento del evento a verificar

    estado          TEXT NOT NULL DEFAULT 'pendiente',
                    -- pendiente | procesando | completado | inconcluyente | error
    intentos        INTEGER NOT NULL DEFAULT 0,
    ultimo_error    TEXT DEFAULT NULL,

    -- Resultado (se llena solo cuando hay veredicto REAL; nunca se inventa)
    veredicto       TEXT DEFAULT NULL,         -- confirmada | descartada
    motivo          TEXT DEFAULT NULL,
    velocidad_max   NUMERIC(6,2) DEFAULT NULL,
    -- Traza de los eventos del informe del proveedor alrededor de la alerta: la
    -- evidencia que sustenta el veredicto y que un supervisor puede revisar.
    -- [{ "fecha": "...", "velocidad": 87, "lat": .., "lon": .., "lugar": ".." }, ...]
    traza           JSONB DEFAULT NULL,
    screenshot_url  TEXT DEFAULT NULL,

    -- Los CHECK van más abajo, en un bloque idempotente: así se aplican también
    -- si la tabla ya existía de una corrida anterior de esta migración.

    created_at      TIMESTAMPTZ DEFAULT NOW(),
    processed_at    TIMESTAMPTZ DEFAULT NULL,

    -- Una sola entrada en cola por alerta: si el front reintenta el encolado
    -- (recarga, doble render), no se valida dos veces contra el portal.
    CONSTRAINT uq_alert_validation_queue UNIQUE (alert_id)
);

-- Índice parcial: el worker solo consulta lo pendiente. Sin el WHERE, el índice
-- crecería con todo el histórico ya procesado y dejaría de servir.
CREATE INDEX IF NOT EXISTS idx_avq_pendientes
    ON public.alert_validation_queue (created_at)
    WHERE estado = 'pendiente';

CREATE INDEX IF NOT EXISTS idx_avq_alert_id ON public.alert_validation_queue (alert_id);
CREATE INDEX IF NOT EXISTS idx_avq_estado   ON public.alert_validation_queue (estado);

COMMENT ON COLUMN public.alert_validation_queue.veredicto IS
    'NULL = no verificado. Nunca se escribe un veredicto que el worker no haya comprobado contra el informe del proveedor.';

-- ============================================================
-- CONSTRAINTS (idempotente)
-- CREATE TABLE IF NOT EXISTS no agrega constraints a una tabla que ya existe,
-- así que si esta migración se corrió antes de que se añadieran los CHECK, la
-- tabla se quedaría sin ellos y en silencio. Este bloque los aplica siempre.
-- ============================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_avq_estado') THEN
        ALTER TABLE public.alert_validation_queue ADD CONSTRAINT ck_avq_estado
            CHECK (estado IN ('pendiente','procesando','completado','inconcluyente','error'));
    END IF;

    -- El blindaje que importa: 'completado' obliga a tener veredicto, y un
    -- veredicto solo puede existir si el estado es 'completado'. Ninguna versión
    -- futura del worker puede marcar una alerta como resuelta sin haber verificado.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_avq_veredicto') THEN
        ALTER TABLE public.alert_validation_queue ADD CONSTRAINT ck_avq_veredicto
            CHECK (
                (estado = 'completado' AND veredicto IN ('confirmada','descartada'))
                OR (estado <> 'completado' AND veredicto IS NULL)
            );
    END IF;
END $$;

-- ============================================================
-- ÍNDICES DE RENDIMIENTO EN saved_alerts
-- Medido el 2026-07-16: saved_alerts tiene ~64.000 filas y cualquier consulta
-- que filtre por is_real_alert u ordene por updated_at revienta con
-- "canceling statement due to statement timeout" (57014). Sin esto, el panel de
-- alertas no puede mostrar el estado de validación.
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_saved_alerts_updated_at
    ON public.saved_alerts (updated_at DESC);

-- Parcial: solo interesan las alertas que YA tienen veredicto.
CREATE INDEX IF NOT EXISTS idx_saved_alerts_validadas
    ON public.saved_alerts (is_real_alert)
    WHERE is_real_alert IS NOT NULL;

-- ============================================================
-- ROW LEVEL SECURITY
-- El front (anon) encola. El worker usa SERVICE_ROLE y bypassa RLS.
-- ============================================================
ALTER TABLE public.alert_validation_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "avq insert anon" ON public.alert_validation_queue;
CREATE POLICY "avq insert anon"
    ON public.alert_validation_queue FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "avq insert authenticated" ON public.alert_validation_queue;
CREATE POLICY "avq insert authenticated"
    ON public.alert_validation_queue FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "avq lectura authenticated" ON public.alert_validation_queue;
CREATE POLICY "avq lectura authenticated"
    ON public.alert_validation_queue FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "avq lectura anon" ON public.alert_validation_queue;
CREATE POLICY "avq lectura anon"
    ON public.alert_validation_queue FOR SELECT TO anon USING (true);

NOTIFY pgrst, 'reload schema';

-- Verificación:
--   SELECT estado, COUNT(*) FROM public.alert_validation_queue GROUP BY estado;
