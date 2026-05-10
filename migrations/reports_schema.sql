-- ============================================================
-- MÓDULO DE INFORMES DIARIOS Y MENSUALES
-- Ejecutar en Supabase SQL Editor (requiere extensión pgcrypto o uuid-ossp)
-- ============================================================

-- Habilitar extensión UUID si no está activa
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABLA: conductores
-- ============================================================
CREATE TABLE IF NOT EXISTS public.conductores (
    id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombres                     TEXT NOT NULL,
    cedula                      TEXT NOT NULL UNIQUE,
    cargo                       TEXT,
    base                        TEXT,
    estado                      TEXT DEFAULT 'ACTIVO',
    proyecto                    TEXT,
    tipo_licencia               TEXT,
    -- Licencias
    fecha_exp_particular        DATE,
    fecha_venc_particular       DATE,
    fecha_exp_publica           DATE,
    fecha_venc_publica          DATE,
    fecha_exp_moto              DATE,
    fecha_venc_moto             DATE,
    -- Capacitaciones
    fecha_cap_manejo_def        DATE,
    fecha_cap_peligrosas        DATE,
    fecha_cap_alturas           DATE,
    fecha_cap_otro              DATE,
    -- Pruebas y competencias
    resultado_prueba_ingreso    TEXT,
    resultado_prueba_periodica  TEXT,
    tipo_competencias           TEXT,
    vigencia_competencias       DATE,
    -- SIMIT / Comparendos
    fecha_revision_simit        DATE,
    tipo_comparendo             TEXT,
    valor_comparendo            NUMERIC(12,2),
    -- GPS / Ibutton
    ibutton                     TEXT,
    -- Archivos
    foto_url                    TEXT,
    pdf_url                     TEXT,
    created_at                  TIMESTAMPTZ DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLA: contratos
-- ============================================================
CREATE TABLE IF NOT EXISTS public.contratos (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre                TEXT NOT NULL,
    cliente               TEXT,
    proyecto              TEXT,
    fecha_inicio          DATE,
    fecha_fin             DATE,
    tipo                  TEXT,
    kilometraje_pactado   NUMERIC(12,2),
    created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLA: vehiculos
-- ============================================================
CREATE TABLE IF NOT EXISTS public.vehiculos (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    placa                   TEXT NOT NULL UNIQUE,
    estado                  TEXT DEFAULT 'ACTIVO',
    clase_activo            TEXT,
    contrato_id             UUID REFERENCES public.contratos(id) ON DELETE SET NULL,
    cliente                 TEXT,
    marca                   TEXT,
    linea                   TEXT,
    carroceria              TEXT,
    tipo_activo             TEXT,
    tipo_combustible        TEXT,
    modelo                  TEXT,
    -- Documentos
    fecha_matricula         DATE,
    fecha_venc_soat         DATE,
    fecha_venc_rtm          DATE,
    fecha_venc_certificacion DATE,
    poliza_todo_riesgo      TEXT,
    tipo_servicio           TEXT,
    tarjeta_operacion       TEXT,
    -- Identificadores
    vin                     TEXT,
    motor                   TEXT,
    chasis                  TEXT,
    -- Centro de costo
    centro_costo_nombre     TEXT,
    centro_costo_numero     TEXT,
    -- Ubicación
    lugar                   TEXT,
    zona                    TEXT,
    coordinador             TEXT,
    -- Contrato
    id_proveedor            TEXT,
    tipo_contrato           TEXT,
    numero_contrato         TEXT,
    fecha_inicio_contrato   DATE,
    fecha_fin_contrato      DATE,
    kilometraje_pactado     NUMERIC(12,2),
    km_actual               NUMERIC(12,2),
    km_semana_actual        NUMERIC(12,2),
    -- GPS
    gps_compañia            TEXT,
    fecha_actualizacion     DATE,
    -- Archivos
    foto_url                TEXT,
    pdf_url                 TEXT,
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLA: coltrack_datos_vehiculo
-- ============================================================
CREATE TABLE IF NOT EXISTS public.coltrack_datos_vehiculo (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vehiculo_id           UUID NOT NULL REFERENCES public.vehiculos(id) ON DELETE CASCADE,
    grupo                 TEXT,
    calificacion          NUMERIC(5,2),
    kms                   NUMERIC(10,2),
    horas_conduccion      NUMERIC(8,2),
    -- Excesos 10 kph
    excesos_10_kph        INTEGER DEFAULT 0,
    maxima_vel_10_kph     NUMERIC(6,2),
    duracion_10_kph       NUMERIC(8,2),
    -- Excesos 20 kph
    excesos_20_kph        INTEGER DEFAULT 0,
    maxima_vel_20_kph     NUMERIC(6,2),
    duracion_20_kph       NUMERIC(8,2),
    -- Excesos 30 kph
    excesos_30_kph        INTEGER DEFAULT 0,
    maxima_vel_30_kph     NUMERIC(6,2),
    duracion_30_kph       NUMERIC(8,2),
    -- Excesos 40 kph
    excesos_40_kph        INTEGER DEFAULT 0,
    maxima_vel_40_kph     NUMERIC(6,2),
    duracion_40_kph       NUMERIC(8,2),
    -- Excesos 50 kph
    excesos_50_kph        INTEGER DEFAULT 0,
    maxima_vel_50_kph     NUMERIC(6,2),
    duracion_50_kph       NUMERIC(8,2),
    -- Excesos 60 kph
    excesos_60_kph        INTEGER DEFAULT 0,
    maxima_vel_60_kph     NUMERIC(6,2),
    duracion_60_kph       NUMERIC(8,2),
    -- Excesos 80 kph
    excesos_80_kph        INTEGER DEFAULT 0,
    maxima_vel_80_kph     NUMERIC(6,2),
    duracion_80_kph       NUMERIC(8,2),
    -- Conducción
    aceleraciones         INTEGER DEFAULT 0,
    frenadas              INTEGER DEFAULT 0,
    -- Período
    fecha                 DATE NOT NULL,
    ibutton               TEXT,
    gps_proveedor         TEXT,
    created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coltrack_veh_vehiculo_fecha
    ON public.coltrack_datos_vehiculo(vehiculo_id, fecha);

-- ============================================================
-- TABLA: coltrack_datos_conductor
-- ============================================================
CREATE TABLE IF NOT EXISTS public.coltrack_datos_conductor (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conductor_id          UUID NOT NULL REFERENCES public.conductores(id) ON DELETE CASCADE,
    grupo                 TEXT,
    calificacion          NUMERIC(5,2),
    kms                   NUMERIC(10,2),
    horas_conduccion      NUMERIC(8,2),
    excesos_10_kph        INTEGER DEFAULT 0,
    maxima_vel_10_kph     NUMERIC(6,2),
    duracion_10_kph       NUMERIC(8,2),
    excesos_20_kph        INTEGER DEFAULT 0,
    maxima_vel_20_kph     NUMERIC(6,2),
    duracion_20_kph       NUMERIC(8,2),
    excesos_30_kph        INTEGER DEFAULT 0,
    maxima_vel_30_kph     NUMERIC(6,2),
    duracion_30_kph       NUMERIC(8,2),
    excesos_40_kph        INTEGER DEFAULT 0,
    maxima_vel_40_kph     NUMERIC(6,2),
    duracion_40_kph       NUMERIC(8,2),
    excesos_50_kph        INTEGER DEFAULT 0,
    maxima_vel_50_kph     NUMERIC(6,2),
    duracion_50_kph       NUMERIC(8,2),
    excesos_60_kph        INTEGER DEFAULT 0,
    maxima_vel_60_kph     NUMERIC(6,2),
    duracion_60_kph       NUMERIC(8,2),
    excesos_80_kph        INTEGER DEFAULT 0,
    maxima_vel_80_kph     NUMERIC(6,2),
    duracion_80_kph       NUMERIC(8,2),
    aceleraciones         INTEGER DEFAULT 0,
    frenadas              INTEGER DEFAULT 0,
    fecha                 DATE NOT NULL,
    ibutton               TEXT,
    created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coltrack_cond_conductor_fecha
    ON public.coltrack_datos_conductor(conductor_id, fecha);

-- ============================================================
-- TABLA: ralentis
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ralentis (
    id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vehiculo_id              UUID NOT NULL REFERENCES public.vehiculos(id) ON DELETE CASCADE,
    user_group               TEXT,
    fecha                    DATE NOT NULL,
    kms_recorridos           NUMERIC(10,2),
    encendidos_apagados      INTEGER DEFAULT 0,
    ralentis_excesivos       INTEGER DEFAULT 0,
    horas_motor_encendido    NUMERIC(8,2),
    horas_motor_ralenti      NUMERIC(8,2),
    consumo_combustible      NUMERIC(10,2),
    created_at               TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ralentis_vehiculo_fecha
    ON public.ralentis(vehiculo_id, fecha);

-- ============================================================
-- TABLA: reportes_conductores
-- ============================================================
CREATE TABLE IF NOT EXISTS public.reportes_conductores (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conductor_id            UUID REFERENCES public.conductores(id) ON DELETE SET NULL,
    periodo_inicio          DATE NOT NULL,
    periodo_fin             DATE NOT NULL,
    calificacion            NUMERIC(5,2),
    kms                     NUMERIC(10,2),
    horas_conduccion        NUMERIC(8,2),
    excesos_10_kph          INTEGER DEFAULT 0,
    excesos_20_kph          INTEGER DEFAULT 0,
    excesos_30_kph          INTEGER DEFAULT 0,
    excesos_40_kph          INTEGER DEFAULT 0,
    excesos_50_kph          INTEGER DEFAULT 0,
    excesos_60_kph          INTEGER DEFAULT 0,
    excesos_80_kph          INTEGER DEFAULT 0,
    aceleraciones_bruscas   INTEGER DEFAULT 0,
    frenadas_bruscas        INTEGER DEFAULT 0,
    placa_relacionada       TEXT,
    ibutton                 TEXT,
    vehiculos_con_gps       INTEGER DEFAULT 0,
    vehiculos_sin_gps       INTEGER DEFAULT 0,
    estado_conductor        TEXT,
    proyecto                TEXT,
    mes                     TEXT,
    fecha_reporte           DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at              TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLA: reportes_vehiculos
-- ============================================================
CREATE TABLE IF NOT EXISTS public.reportes_vehiculos (
    id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vehiculo_id               UUID REFERENCES public.vehiculos(id) ON DELETE SET NULL,
    contrato_id               UUID REFERENCES public.contratos(id) ON DELETE SET NULL,
    periodo_inicio            DATE NOT NULL,
    periodo_fin               DATE NOT NULL,
    calificacion              NUMERIC(5,2),
    kms                       NUMERIC(10,2),
    horas_conduccion          NUMERIC(8,2),
    excesos_10_kph            INTEGER DEFAULT 0,
    excesos_20_kph            INTEGER DEFAULT 0,
    excesos_30_kph            INTEGER DEFAULT 0,
    excesos_40_kph            INTEGER DEFAULT 0,
    excesos_50_kph            INTEGER DEFAULT 0,
    excesos_60_kph            INTEGER DEFAULT 0,
    excesos_80_kph            INTEGER DEFAULT 0,
    aceleraciones_bruscas     INTEGER DEFAULT 0,
    frenadas_bruscas          INTEGER DEFAULT 0,
    dispositivo_gps           TEXT,
    base                      TEXT,
    estado_gps                TEXT,
    km_recorridos_ralenti     NUMERIC(10,2),
    horas_motor_encendido     NUMERIC(8,2),
    horas_motor_ralenti       NUMERIC(8,2),
    consumo_combustible       NUMERIC(10,2),
    proyecto                  TEXT,
    mes                       TEXT,
    fecha_reporte             DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at                TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLA: cargas_excel
-- ============================================================
CREATE TABLE IF NOT EXISTS public.cargas_excel (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    usuario_id        UUID,
    tipo              TEXT NOT NULL CHECK (tipo IN ('daily', 'monthly')),
    archivo_url       TEXT,
    nombre_archivo    TEXT,
    fecha_carga       TIMESTAMPTZ DEFAULT NOW(),
    estado_validacion TEXT DEFAULT 'pendiente' CHECK (estado_validacion IN ('pendiente','valido','invalido','procesado')),
    errores_json      JSONB,
    registros_json    JSONB,
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- RLS: habilitar y crear políticas básicas
-- ============================================================
ALTER TABLE public.conductores           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehiculos             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contratos             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coltrack_datos_vehiculo  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coltrack_datos_conductor ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ralentis              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reportes_conductores  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reportes_vehiculos    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cargas_excel          ENABLE ROW LEVEL SECURITY;

-- Política permisiva para usuarios autenticados (ajustar según roles en producción)
CREATE POLICY "Acceso autenticado" ON public.conductores
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Acceso autenticado" ON public.vehiculos
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Acceso autenticado" ON public.contratos
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Acceso autenticado" ON public.coltrack_datos_vehiculo
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Acceso autenticado" ON public.coltrack_datos_conductor
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Acceso autenticado" ON public.ralentis
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Acceso autenticado" ON public.reportes_conductores
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Acceso autenticado" ON public.reportes_vehiculos
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Acceso autenticado" ON public.cargas_excel
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Bucket de almacenamiento para archivos Excel y PDF
INSERT INTO storage.buckets (id, name, public)
VALUES ('reportes', 'reportes', false)
ON CONFLICT (id) DO NOTHING;
