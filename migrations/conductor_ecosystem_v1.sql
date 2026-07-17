-- ============================================================
-- MÓDULO: ECOSISTEMA DEL CONDUCTOR — v1 (2026-07-17)
-- Hoja de Vida + Carnet Digital + Puntaje/Semáforo + Registro en campo (QR)
--
-- REGLA DE ORO: esta migración es ADITIVA. No modifica ni elimina ninguna
-- columna, tabla, política ni dato existente. Solo:
--   1) Añade columnas nuevas a `conductores` (carnet_token, updated_from_sheet_at)
--   2) Crea tablas nuevas del ecosistema
--   3) Siembra parámetros de puntaje
--
-- La tabla `conductores` (sincronizada desde Google Sheets) sigue siendo la
-- única fuente de identidad. Nada aquí toca el flujo de sincronización.
--
-- Ejecutar en: Supabase SQL Editor con rol de administrador.
-- ============================================================

-- ------------------------------------------------------------
-- 0) Extensiones (idempotente; ya suelen estar activas en Supabase)
-- ------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()

-- ============================================================
-- 1) CONDUCTORES: columnas del sistema (NUNCA las sobrescribe el Sheet)
-- ------------------------------------------------------------
-- carnet_token: identificador OPACO para el QR. El QR resuelve por este token,
--               nunca por la cédula. La sincronización arma un payload explícito
--               que NO incluye esta columna → el upsert jamás la pisa.
-- updated_from_sheet_at: marca de la última vez que el Sheet tocó la fila
--               (se cableará en el servicio de sync; hoy queda disponible).
-- ============================================================
ALTER TABLE public.conductores
  ADD COLUMN IF NOT EXISTS carnet_token          UUID,
  ADD COLUMN IF NOT EXISTS updated_from_sheet_at TIMESTAMPTZ;

-- Backfill de tokens para los conductores ya existentes (una sola vez).
UPDATE public.conductores
   SET carnet_token = gen_random_uuid()
 WHERE carnet_token IS NULL;

-- A partir de aquí, cada conductor nuevo recibe token por defecto.
ALTER TABLE public.conductores
  ALTER COLUMN carnet_token SET DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS uq_conductores_carnet_token
  ON public.conductores (carnet_token);

-- ============================================================
-- 2) CONDUCTOR_SCORES — snapshot del puntaje (100→0) + semáforo
-- Caché computado con histórico (mismo patrón que ml_driver_scores).
-- El Carnet LEE de aquí; no es una copia manual desincronizada.
-- El cálculo real se implementa en la Fase 4.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.conductor_scores (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conductor_id    UUID NOT NULL REFERENCES public.conductores(id) ON DELETE CASCADE,
    conductor_key   TEXT NOT NULL,              -- clave canónica (mayúsculas, sin acentos)
    fecha_calculo   DATE NOT NULL DEFAULT CURRENT_DATE,

    puntaje         NUMERIC(5,2) NOT NULL DEFAULT 100,  -- 0..100 (100 = mejor)
    semaforo        TEXT NOT NULL DEFAULT 'VERDE',      -- VERDE | AMARILLO | ROJO
    ventana_dias    INTEGER NOT NULL DEFAULT 90,

    -- Detonadores críticos activos: ["no_ibutton","simit_vigente","reincidencia_grave",...]
    detonadores     JSONB DEFAULT '[]'::jsonb,
    -- Desglose de cómo se llegó al puntaje (auditable):
    -- [{ "factor":"exceso_grave","cantidad":3,"puntos":-24 }, ...]
    desglose        JSONB DEFAULT '[]'::jsonb,

    created_at      TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT uq_conductor_scores UNIQUE (conductor_id, fecha_calculo)
);

CREATE INDEX IF NOT EXISTS idx_conductor_scores_fecha     ON public.conductor_scores (fecha_calculo DESC);
CREATE INDEX IF NOT EXISTS idx_conductor_scores_conductor ON public.conductor_scores (conductor_id);
CREATE INDEX IF NOT EXISTS idx_conductor_scores_semaforo  ON public.conductor_scores (fecha_calculo DESC, semaforo);

COMMENT ON TABLE public.conductor_scores IS
  'Puntaje (100->0) y semáforo por conductor. Caché computado por reglas (Fase 4). El carnet solo lee.';

-- ============================================================
-- 3) CONDUCTOR_CAMPO_REGISTROS — comportamientos registrados en campo (QR)
-- INMUTABLE: solo INSERT. Sin UPDATE/DELETE (no hay política que los permita
-- → RLS los deniega por defecto). El seguimiento se hace agregando notas.
-- Trazabilidad obligatoria: quién (auth.uid), cuándo (servidor), dónde (geo).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.conductor_campo_registros (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conductor_id          UUID NOT NULL REFERENCES public.conductores(id) ON DELETE CASCADE,
    conductor_key         TEXT,

    tipo_evento           TEXT NOT NULL,          -- catálogo: exceso_velocidad, no_ibutton, epp, protocolo, otro...
    severidad             TEXT NOT NULL DEFAULT 'leve',   -- leve | grave | critico
    descripcion           TEXT NOT NULL,
    evidencia_url         TEXT,                   -- foto en storage (opcional)

    latitud               NUMERIC(12,8),
    longitud              NUMERIC(12,8),

    registrado_por        UUID REFERENCES auth.users(id),
    registrado_por_nombre TEXT,
    registrado_por_email  TEXT,
    dispositivo           TEXT,

    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campo_reg_conductor ON public.conductor_campo_registros (conductor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campo_reg_fecha      ON public.conductor_campo_registros (created_at DESC);

COMMENT ON TABLE public.conductor_campo_registros IS
  'Registros de comportamiento en campo vía QR. Append-only e inmutable. Alimenta el puntaje.';

-- ============================================================
-- 4) CONDUCTOR_REGISTRO_NOTAS — seguimiento append-only de un registro
-- Permite "agregar notas" sin editar ni borrar el registro original.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.conductor_registro_notas (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    registro_id  UUID NOT NULL REFERENCES public.conductor_campo_registros(id) ON DELETE CASCADE,
    nota         TEXT NOT NULL,
    autor_id     UUID REFERENCES auth.users(id),
    autor_nombre TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_registro_notas_registro ON public.conductor_registro_notas (registro_id, created_at);

-- ============================================================
-- 5) EPP_ENTREGAS — entregas de EPP / dotación (tabla nueva; no existía)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.epp_entregas (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conductor_id        UUID NOT NULL REFERENCES public.conductores(id) ON DELETE CASCADE,
    tipo_elemento       TEXT NOT NULL,           -- casco, botas, guantes, uniforme...
    cantidad            INTEGER NOT NULL DEFAULT 1,
    talla               TEXT,
    fecha_entrega       DATE NOT NULL DEFAULT CURRENT_DATE,
    entregado_por       UUID REFERENCES auth.users(id),
    entregado_por_nombre TEXT,
    evidencia_url       TEXT,
    observaciones       TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_epp_conductor ON public.epp_entregas (conductor_id, fecha_entrega DESC);

-- ============================================================
-- 6) CONFIG_PUNTAJE — pesos parametrizables del puntaje (tunear sin redeploy)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.config_puntaje (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clave       TEXT NOT NULL UNIQUE,
    valor       NUMERIC(8,3) NOT NULL,
    categoria   TEXT DEFAULT 'penalizacion',     -- penalizacion | recuperacion | umbral | ventana
    descripcion TEXT,
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Semilla con la tabla de pesos aprobada en Fase 2 (§8).
INSERT INTO public.config_puntaje (clave, valor, categoria, descripcion) VALUES
    ('base_inicial',            100, 'umbral',       'Puntaje base de partida'),
    ('ventana_dias',             90, 'ventana',      'Ventana móvil de evaluación (días)'),
    ('umbral_ok',                85, 'umbral',       'Puntaje mínimo para semáforo VERDE'),
    ('umbral_alerta',            60, 'umbral',       'Puntaje mínimo para semáforo AMARILLO'),
    ('pen_exceso_grave',         -8, 'penalizacion', 'Exceso grave (>=80 km/h) por evento'),
    ('pen_exceso_moderado',      -3, 'penalizacion', 'Exceso moderado (50-80 km/h) por evento'),
    ('pen_no_ibutton',          -15, 'penalizacion', 'No uso de iButton (detonador crítico)'),
    ('pen_simit_vigente',       -20, 'penalizacion', 'Sanción SIMIT / comparendo vigente (detonador crítico)'),
    ('pen_frenada_brusca',       -1, 'penalizacion', 'Frenada brusca por evento'),
    ('pen_ralenti_exceso',       -2, 'penalizacion', 'Ralentí sobre umbral por evento'),
    ('pen_inspeccion_fallida',   -5, 'penalizacion', 'Inspección Sin/Fuera de tiempo'),
    ('pen_doc_vencido',         -10, 'penalizacion', 'Documento (licencia/capacitación) vencido'),
    ('pen_campo_leve',           -5, 'penalizacion', 'Registro de campo QR severidad leve'),
    ('pen_campo_grave',         -15, 'penalizacion', 'Registro de campo QR severidad grave'),
    ('pen_campo_critico',       -25, 'penalizacion', 'Registro de campo QR severidad crítica'),
    ('mult_reincidencia',       1.5, 'penalizacion', 'Multiplicador por reincidencia en evento crítico'),
    ('rec_capacitacion',          5, 'recuperacion', 'Capacitación vigente/completada'),
    ('rec_mes_sin_excesos',      10, 'recuperacion', 'Mes cerrado sin excesos')
ON CONFLICT (clave) DO NOTHING;

-- ============================================================
-- 7) ROW LEVEL SECURITY
-- Criterio: el ecosistema del conductor lo opera personal AUTENTICADO.
-- Los registros de campo son inmutables (solo INSERT). Nada aquí abre
-- permisos sobre tablas existentes.
-- ============================================================
ALTER TABLE public.conductor_scores            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conductor_campo_registros   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conductor_registro_notas    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.epp_entregas                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.config_puntaje              ENABLE ROW LEVEL SECURITY;

-- conductor_scores: lectura anon+auth; escritura authenticated (recálculo in-app).
DROP POLICY IF EXISTS "scores select anon"     ON public.conductor_scores;
CREATE POLICY "scores select anon"  ON public.conductor_scores FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "scores select auth"     ON public.conductor_scores;
CREATE POLICY "scores select auth"  ON public.conductor_scores FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "scores write auth"      ON public.conductor_scores;
CREATE POLICY "scores write auth"   ON public.conductor_scores FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "scores update auth"     ON public.conductor_scores;
CREATE POLICY "scores update auth"  ON public.conductor_scores FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- conductor_campo_registros: INMUTABLE. Solo SELECT + INSERT autenticado.
-- (Ausencia deliberada de políticas UPDATE/DELETE => denegadas por RLS.)
DROP POLICY IF EXISTS "campo select auth" ON public.conductor_campo_registros;
CREATE POLICY "campo select auth" ON public.conductor_campo_registros
    FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "campo insert auth" ON public.conductor_campo_registros;
CREATE POLICY "campo insert auth" ON public.conductor_campo_registros
    FOR INSERT TO authenticated WITH CHECK (registrado_por = auth.uid());

-- conductor_registro_notas: SELECT + INSERT autenticado (append-only).
DROP POLICY IF EXISTS "notas select auth" ON public.conductor_registro_notas;
CREATE POLICY "notas select auth" ON public.conductor_registro_notas
    FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "notas insert auth" ON public.conductor_registro_notas;
CREATE POLICY "notas insert auth" ON public.conductor_registro_notas
    FOR INSERT TO authenticated WITH CHECK (autor_id = auth.uid());

-- epp_entregas: gestionadas por personal autenticado (lectura + escritura).
DROP POLICY IF EXISTS "epp all auth" ON public.epp_entregas;
CREATE POLICY "epp all auth" ON public.epp_entregas
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- config_puntaje: lectura anon+auth; escritura authenticated (panel admin, Fase 4).
DROP POLICY IF EXISTS "config select anon" ON public.config_puntaje;
CREATE POLICY "config select anon" ON public.config_puntaje FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "config select auth" ON public.config_puntaje;
CREATE POLICY "config select auth" ON public.config_puntaje FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "config write auth" ON public.config_puntaje;
CREATE POLICY "config write auth" ON public.config_puntaje FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- Verificación:
--   SELECT COUNT(*) FROM public.conductores WHERE carnet_token IS NOT NULL;
--   SELECT clave, valor FROM public.config_puntaje ORDER BY categoria, clave;
--   SELECT COUNT(*) FROM public.conductor_scores;          -- 0 hasta Fase 4
--   SELECT COUNT(*) FROM public.conductor_campo_registros; -- 0 hasta Fase 5
-- ============================================================
