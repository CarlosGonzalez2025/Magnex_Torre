-- ============================================================
-- MÓDULO: INTELIGENCIA (ML) — Capa de aprendizaje controlado
-- Versión: v1 - 2026-07-16
-- Descripción: Tablas que soportan la capa de inteligencia del sistema.
--              El cómputo pesado (pandas/numpy/scikit-learn) corre OFFLINE en
--              ml/train_driver_risk.py (GitHub Actions, cron diario) y deja aquí
--              los resultados precalculados. El agente serverless (api/agent.py,
--              stdlib puro) y el Dashboard solo LEEN estas tablas.
--
--              Arquitectura deliberada: ninguna dependencia de ML entra al
--              bundle de Vercel. El modelo viaja como datos, no como librería.
--
-- Tablas:
--   ml_driver_scores    -> scoring de riesgo por conductor (recalculado a diario)
--   ml_fleet_baselines  -> líneas base robustas (mediana/MAD) por segmento
--   agent_interactions  -> instrumentación del router del asistente
--   ml_model_registry   -> versionado de modelos + aprobación humana explícita
--
-- Ejecutar en: Supabase SQL Editor con rol de administrador
-- ============================================================

-- ============================================================
-- 1) SCORING DE RIESGO POR CONDUCTOR
-- Una fila por (conductor, fecha_calculo). Se conserva el histórico para poder
-- medir si el conductor mejora o empeora en el tiempo.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ml_driver_scores (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    fecha_calculo       DATE NOT NULL,             -- día en que se calculó (hora Colombia)
    conductor           TEXT NOT NULL,             -- grafía más frecuente, para mostrar
    -- Clave canónica (mayúsculas, sin acentos, espacios colapsados). La base trae
    -- a la misma persona con varias grafías ('YORGUIN ROBLES PEÑA' vs 'Yorguin
    -- Robles Peña'): agrupar por el nombre crudo parte su exposición en dos y
    -- mete al mismo conductor dos veces en el ranking, con cifras falsas ambas.
    conductor_key       TEXT NOT NULL,
    contrato_nombre     TEXT DEFAULT '',
    cliente             TEXT DEFAULT '',

    -- Ventana observada
    ventana_dias        INTEGER NOT NULL DEFAULT 90,
    dias_activos        INTEGER NOT NULL DEFAULT 0, -- días con al menos un evento (exposición)

    -- Métricas crudas (misma definición de exceso que api/agent.py)
    eventos_exceso      INTEGER DEFAULT 0,
    eventos_graves      INTEGER DEFAULT 0,
    frenadas_bruscas    INTEGER DEFAULT 0,
    velocidad_max       NUMERIC(6,2) DEFAULT 0,
    velocidad_p95       NUMERIC(6,2) DEFAULT 0,

    -- Métricas normalizadas por exposición (comparables entre conductores)
    excesos_por_dia     NUMERIC(8,3) DEFAULT 0,
    graves_por_dia      NUMERIC(8,3) DEFAULT 0,
    frenadas_por_dia    NUMERIC(8,3) DEFAULT 0,

    -- Resultado del modelo
    risk_score          NUMERIC(5,2) NOT NULL DEFAULT 0,  -- 0..100 (100 = mayor riesgo)
    risk_percentil      NUMERIC(5,2) DEFAULT 0,           -- posición dentro de la flota
    risk_nivel          TEXT DEFAULT 'BAJO',              -- BAJO | MEDIO | ALTO | CRITICO
    es_anomalia         BOOLEAN DEFAULT FALSE,            -- IsolationForest
    anomaly_score       NUMERIC(6,4) DEFAULT 0,

    -- Tendencia (pendiente de regresión sobre cubos semanales)
    tendencia           TEXT DEFAULT 'ESTABLE',           -- MEJORANDO | ESTABLE | EMPEORANDO
    tendencia_slope     NUMERIC(8,4) DEFAULT 0,

    -- Explicabilidad: por qué este conductor tiene este score.
    -- [{ "factor": "excesos_graves", "contribucion": 34.2, "detalle": "..." }, ...]
    factores            JSONB DEFAULT '[]'::jsonb,

    modelo_version      TEXT DEFAULT '',           -- FK lógica a ml_model_registry.version
    created_at          TIMESTAMPTZ DEFAULT NOW(),

    -- Única por la clave canónica, no por la grafía.
    CONSTRAINT uq_ml_driver_scores UNIQUE (fecha_calculo, conductor_key)
);

CREATE INDEX IF NOT EXISTS idx_ml_scores_fecha      ON public.ml_driver_scores (fecha_calculo DESC);
CREATE INDEX IF NOT EXISTS idx_ml_scores_conductor  ON public.ml_driver_scores (conductor_key);
CREATE INDEX IF NOT EXISTS idx_ml_scores_riesgo     ON public.ml_driver_scores (fecha_calculo DESC, risk_score DESC);
CREATE INDEX IF NOT EXISTS idx_ml_scores_contrato   ON public.ml_driver_scores (contrato_nombre);

COMMENT ON TABLE public.ml_driver_scores IS
    'Scoring de riesgo por conductor. Lo escribe ml/train_driver_risk.py (service_role). Solo lectura desde el front.';

-- ============================================================
-- 2) LÍNEAS BASE ROBUSTAS POR SEGMENTO
-- "Anómalo" deja de ser un umbral fijo: es relativo al histórico del segmento.
-- Se usa mediana + MAD (desviación absoluta mediana) porque la media y la
-- desviación estándar se distorsionan con los outliers propios de telemetría.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ml_fleet_baselines (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    fecha_calculo       DATE NOT NULL,
    segmento_tipo       TEXT NOT NULL,             -- 'FLOTA' | 'CONTRATO' | 'TIPO_ACTIVO'
    segmento_valor      TEXT NOT NULL DEFAULT '',  -- '' para FLOTA
    metrica             TEXT NOT NULL,             -- 'excesos_por_dia' | 'frenadas_por_dia' | ...

    mediana             NUMERIC(10,4) DEFAULT 0,
    mad                 NUMERIC(10,4) DEFAULT 0,   -- desviación absoluta mediana
    p75                 NUMERIC(10,4) DEFAULT 0,
    p90                 NUMERIC(10,4) DEFAULT 0,
    p95                 NUMERIC(10,4) DEFAULT 0,
    umbral_anomalia     NUMERIC(10,4) DEFAULT 0,   -- mediana + 3 * MAD escalado
    n_muestras          INTEGER DEFAULT 0,

    created_at          TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT uq_ml_baselines UNIQUE (fecha_calculo, segmento_tipo, segmento_valor, metrica)
);

CREATE INDEX IF NOT EXISTS idx_ml_baselines_fecha ON public.ml_fleet_baselines (fecha_calculo DESC);
CREATE INDEX IF NOT EXISTS idx_ml_baselines_seg   ON public.ml_fleet_baselines (segmento_tipo, segmento_valor);

-- ============================================================
-- 3) INSTRUMENTACIÓN DEL ASISTENTE
-- Sin estos datos, cualquier "aprendizaje" del router es especulación.
-- Cada pregunta que cae en fallback es una intención que el usuario quiere y el
-- sistema no cubre: es el insumo del reentrenamiento.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.agent_interactions (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    pregunta            TEXT NOT NULL,
    tool_elegida        TEXT DEFAULT NULL,         -- NULL = el router no reconoció la intención
    tool_args           JSONB DEFAULT '{}'::jsonb,
    router_via          TEXT DEFAULT 'regex',      -- 'regex' | 'modelo' | 'fallback'
    router_confianza    NUMERIC(5,4) DEFAULT NULL, -- solo cuando via='modelo'
    acierto             BOOLEAN DEFAULT NULL,      -- feedback humano (pulgar arriba/abajo)
    latencia_ms         INTEGER DEFAULT NULL,
    error               TEXT DEFAULT NULL,

    -- Etiqueta curada por un humano para reentrenar (queda NULL hasta que alguien
    -- la revise). El modelo SOLO se entrena con filas etiquetadas o con acierto=true.
    etiqueta_curada     TEXT DEFAULT NULL,

    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_inter_fecha    ON public.agent_interactions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_inter_tool     ON public.agent_interactions (tool_elegida);
-- Índice parcial: las preguntas sin reconocer son la consulta más frecuente del job.
CREATE INDEX IF NOT EXISTS idx_agent_inter_fallback ON public.agent_interactions (created_at DESC)
    WHERE tool_elegida IS NULL;

COMMENT ON COLUMN public.agent_interactions.etiqueta_curada IS
    'Etiqueta revisada por un humano. Sin esto no hay reentrenamiento: el modelo no aprende de sus propias suposiciones.';

-- ============================================================
-- 4) REGISTRO DE MODELOS — el control de "que aprenda solo, pero no se despliegue solo"
-- Un modelo entrenado NO entra a producción por el hecho de existir. Debe pasar
-- por: entrenado -> sombra (predice y registra, no responde) -> aprobado por un
-- humano -> activo. El regex determinista nunca se elimina: es el suelo.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ml_model_registry (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    version             TEXT NOT NULL UNIQUE,      -- ej. 'router-2026-07-16-a'
    tipo                TEXT NOT NULL,             -- 'router_intencion' | 'driver_risk'
    estado              TEXT NOT NULL DEFAULT 'entrenado',
                        -- entrenado | sombra | activo | archivado | rechazado

    -- Pesos del modelo serializados como JSON plano. api/agent.py hace la
    -- inferencia con stdlib (producto punto); NO carga scikit-learn.
    pesos               JSONB DEFAULT '{}'::jsonb,

    metricas            JSONB DEFAULT '{}'::jsonb, -- accuracy, f1, n_muestras, matriz de confusión
    n_muestras_entreno  INTEGER DEFAULT 0,

    -- Trazabilidad de la aprobación humana
    aprobado_por        TEXT DEFAULT NULL,
    aprobado_at         TIMESTAMPTZ DEFAULT NULL,
    notas               TEXT DEFAULT NULL,

    created_at          TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT ck_ml_model_estado CHECK (estado IN ('entrenado','sombra','activo','archivado','rechazado'))
);

CREATE INDEX IF NOT EXISTS idx_ml_registry_tipo_estado ON public.ml_model_registry (tipo, estado);

-- Garantiza a nivel de base que NUNCA haya dos modelos activos del mismo tipo.
-- Esto no es cosmético: sin esto, un despliegue concurrente deja el router
-- respondiendo con dos cerebros distintos según a qué fila llegue primero.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ml_registry_un_activo
    ON public.ml_model_registry (tipo) WHERE estado = 'activo';

COMMENT ON TABLE public.ml_model_registry IS
    'Versionado de modelos. Un modelo solo pasa a estado=activo con aprobación humana explícita (aprobado_por). Nunca se auto-despliega.';

-- ============================================================
-- ROW LEVEL SECURITY
-- El job de ML usa SERVICE_ROLE (bypassa RLS). El frontend lee con anon.
-- Escritura de agent_interactions: permitida a anon porque el agente serverless
-- registra con la anon key. Es un log de solo-inserción, sin datos sensibles.
-- ============================================================
ALTER TABLE public.ml_driver_scores   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ml_fleet_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ml_model_registry  ENABLE ROW LEVEL SECURITY;

-- ml_driver_scores: lectura pública, escritura solo del job (service_role).
DROP POLICY IF EXISTS "ml_scores lectura anon" ON public.ml_driver_scores;
CREATE POLICY "ml_scores lectura anon"
    ON public.ml_driver_scores FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "ml_scores lectura authenticated" ON public.ml_driver_scores;
CREATE POLICY "ml_scores lectura authenticated"
    ON public.ml_driver_scores FOR SELECT TO authenticated USING (true);

-- ml_fleet_baselines: idem.
DROP POLICY IF EXISTS "ml_baselines lectura anon" ON public.ml_fleet_baselines;
CREATE POLICY "ml_baselines lectura anon"
    ON public.ml_fleet_baselines FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "ml_baselines lectura authenticated" ON public.ml_fleet_baselines;
CREATE POLICY "ml_baselines lectura authenticated"
    ON public.ml_fleet_baselines FOR SELECT TO authenticated USING (true);

-- agent_interactions: inserción abierta (log del agente), lectura solo autenticada.
-- No se expone a anon la lectura: son las preguntas de los usuarios.
DROP POLICY IF EXISTS "agent_inter insert anon" ON public.agent_interactions;
CREATE POLICY "agent_inter insert anon"
    ON public.agent_interactions FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "agent_inter insert authenticated" ON public.agent_interactions;
CREATE POLICY "agent_inter insert authenticated"
    ON public.agent_interactions FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "agent_inter lectura authenticated" ON public.agent_interactions;
CREATE POLICY "agent_inter lectura authenticated"
    ON public.agent_interactions FOR SELECT TO authenticated USING (true);

-- Feedback (pulgar arriba/abajo): el usuario marca acierto sobre su interacción.
DROP POLICY IF EXISTS "agent_inter update anon" ON public.agent_interactions;
CREATE POLICY "agent_inter update anon"
    ON public.agent_interactions FOR UPDATE TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "agent_inter update authenticated" ON public.agent_interactions;
CREATE POLICY "agent_inter update authenticated"
    ON public.agent_interactions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ml_model_registry: el agente necesita leer los pesos del modelo activo.
-- Escritura SOLO service_role: la aprobación no puede venir del navegador.
DROP POLICY IF EXISTS "ml_registry lectura anon" ON public.ml_model_registry;
CREATE POLICY "ml_registry lectura anon"
    ON public.ml_model_registry FOR SELECT TO anon USING (estado = 'activo');

DROP POLICY IF EXISTS "ml_registry lectura authenticated" ON public.ml_model_registry;
CREATE POLICY "ml_registry lectura authenticated"
    ON public.ml_model_registry FOR SELECT TO authenticated USING (true);

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- Verificación:
--   SELECT COUNT(*) FROM public.ml_driver_scores;
--   SELECT COUNT(*) FROM public.agent_interactions;
--   -- Top 10 conductores de mayor riesgo del último cálculo:
--   SELECT conductor, risk_score, risk_nivel, tendencia
--     FROM public.ml_driver_scores
--    WHERE fecha_calculo = (SELECT MAX(fecha_calculo) FROM public.ml_driver_scores)
--    ORDER BY risk_score DESC LIMIT 10;
-- ============================================================
