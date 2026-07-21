-- ====================================================================
-- Script de Migración Oficial: Google Sheets Bitácora -> Supabase
-- Ejecuta este script en el Editor de SQL de Supabase (SQL Editor)
-- Tabla de destino: public.bitacora_gestion
-- ====================================================================

-- 1. Crear tabla e infraestructura si aún no existe
CREATE TABLE IF NOT EXISTS public.bitacora_gestion (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha                   DATE NOT NULL,
  hora_alerta             TEXT,
  hora_aviso_supervisor   TEXT,
  tipo_novedad            TEXT NOT NULL,
  placa                   TEXT,
  contrato                TEXT,
  plataforma              TEXT,
  conductor               TEXT,
  gestion_realizada       TEXT,
  cierre_alerta           TEXT,
  es_alerta               BOOLEAN DEFAULT true,
  observacion             TEXT,
  evidencia_url           TEXT,
  evidencia_nombre        TEXT,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  created_by              UUID REFERENCES auth.users(id),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- Asegurar columnas para evidencias adjuntas
ALTER TABLE public.bitacora_gestion ADD COLUMN IF NOT EXISTS evidencia_url TEXT;
ALTER TABLE public.bitacora_gestion ADD COLUMN IF NOT EXISTS evidencia_nombre TEXT;

-- 2. Habilitar RLS y otorgar permisos de lectura/escritura (Anon & Authenticated)
ALTER TABLE public.bitacora_gestion ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bitacora_read_policy" ON public.bitacora_gestion;
DROP POLICY IF EXISTS "bitacora_write_policy" ON public.bitacora_gestion;

CREATE POLICY "bitacora_read_policy"
  ON public.bitacora_gestion FOR SELECT
  TO public
  USING (true);

CREATE POLICY "bitacora_write_policy"
  ON public.bitacora_gestion FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

-- 3. Inserción de los registros históricos migrados desde Google Sheets
INSERT INTO public.bitacora_gestion (
  fecha,
  hora_alerta,
  hora_aviso_supervisor,
  tipo_novedad,
  placa,
  contrato,
  plataforma,
  conductor,
  gestion_realizada,
  cierre_alerta,
  es_alerta,
  observacion
) VALUES
(
  '2026-07-16',
  NULL,
  NULL,
  'Exceso de velocidad',
  NULL,
  'SIN CONTRATO',
  NULL,
  NULL,
  'Sin alertas durante la jornada',
  'SI',
  true,
  'Jornada sin novedades reportadas'
),
(
  '2026-07-17',
  '09:00',
  '09:05',
  'Exceso de velocidad',
  'NGK912',
  'ENEL ZV',
  'FAGOR',
  'Sin asignar',
  'Se informa mediante whatsapp',
  'SI',
  false,
  'El supervisor informa que el vehículo va en grúa'
),
(
  '2026-07-17',
  '09:00',
  '09:05',
  'Exceso de velocidad',
  'NPY973',
  'ENEL ZV',
  'GEOTAB',
  'Sin asignar',
  'Se informa mediante whatsapp',
  NULL,
  true,
  'Buenos días, se notifica por correo electrónico al coordinador de proceso, con copia a líder, coordinador y profesional HSSEQ, coordinador de flota, especialista de logística y gerente de contrato'
),
(
  '2026-07-17',
  '09:41',
  '09:44',
  'Exceso de velocidad',
  'LHT819',
  'ECOPETROL VRC-LA CIRA',
  'COLTRACK',
  'Sin asignar',
  'Se informa mediante whatsapp',
  NULL,
  true,
  'Notificación enviada a supervisor'
),
(
  '2026-07-17',
  '01:28',
  '02:06',
  'Exceso de velocidad',
  'LUX622',
  'CERREJON BOMBAS Y TALADROS',
  'GEOTAB',
  'Sin asignar',
  'Se informa mediante whatsapp',
  NULL,
  true,
  'Notificación enviada a supervisor'
),
(
  '2026-07-17',
  '15:05',
  '14:39',
  'Exceso de velocidad',
  'JSL356',
  'SIN CONTRATO',
  'GEOTAB',
  'Sin asignar',
  'Se informa mediante whatsapp',
  NULL,
  true,
  'Notificación enviada por WhatsApp'
),
(
  '2026-07-17',
  '15:05',
  '15:12',
  'Exceso de velocidad',
  'NPY673',
  'ECOPETROL VRC MARES CENTRO',
  'FAGOR',
  'Sin asignar',
  'Se informa mediante whatsapp',
  NULL,
  true,
  'Buenas tardes, se envió correo electrónico a coordinador de proceso, con copia a líder, coordinador y profesional hsseq, coordinador de flota, especialista en logística y gerente del contrato, solicitando inicio de proceso de manejo positivo y efectivo de falta laboral por incumplimiento de política de seguridad vial por exceso de velocidad'
),
(
  '2026-07-18',
  NULL,
  NULL,
  'Exceso de velocidad',
  NULL,
  'SIN CONTRATO',
  NULL,
  NULL,
  'No se reportaron alertas',
  'SI',
  true,
  'Jornada sin novedades reportadas'
);

-- 4. Verificación final de registros en la bitácora
SELECT 
  id,
  fecha,
  hora_alerta,
  tipo_novedad,
  placa,
  contrato,
  plataforma,
  es_alerta,
  gestion_realizada
FROM public.bitacora_gestion
ORDER BY fecha DESC, created_at DESC;
