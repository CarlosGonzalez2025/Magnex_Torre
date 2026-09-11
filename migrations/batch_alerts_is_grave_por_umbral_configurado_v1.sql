-- ============================================================
-- MIGRATION: batch_alerts.is_grave por UMBRAL CONFIGURADO en el GPS
-- ============================================================
-- Objetivo: recalcular `batch_alerts.is_grave` (Auditoría de Flota) con el
-- criterio único del sistema, y dejarlo aplicado también a las filas ya
-- cargadas.
--
-- Criterio (espejo de services/speedingClassification.ts, ml/speeding_
-- classification.py y el bloque inline de api/agent.py):
--
--   El tramo de un exceso lo decide el UMBRAL CONFIGURADO en la plataforma GPS,
--   que viaja en el nombre del evento ("Exceso de Velocidad >80 km/h Magnex",
--   "Infraccion 80 Km/h"). Las reglas por umbral se solapan: un vehículo a 85
--   km/h dispara la de >80 y, si existe en esa zona, también la de >40. Marcar
--   la falta grave por la velocidad medida contaba el evento de la regla de >40
--   como infracción de >80: una falta grave que la configuración del GPS nunca
--   emitió, y doble conteo cuando ambas reglas dispararon.
--
--   Sin umbral en el nombre, depende de la PLATAFORMA:
--     GEOTAB -> no cuenta. Sus reglas genéricas contra el límite de la vía
--       ("Exceso de velocidad", "Exceso de velocidad (nuevo)") duplican el mismo
--       recorrido que la regla de umbral de Magnex. El 10/09/2026, POS648 generó
--       tres eventos del mismo paso a ~101 km/h (las dos genéricas de Geotab más
--       "Infraccion 80 Km/h" de Coltrack).
--     COLTRACK / FAGOR (y fuente desconocida) -> velocidad medida. Fagor solo
--       tiene "Alm. Exceso de velocidad en la via": exigirle umbral en el nombre
--       borraría todos sus excesos.
--
-- Efecto medido sobre el informe diario del 2026-09-10 (infracciones >=80):
--   hoy 66 -> 33. Salen: "Exceso de velocidad" de Geotab (14), "Exceso de
--   velocidad (nuevo)" de Geotab (15), "Exceso Velocidad 60 Km/h" (3) e
--   "Infraccion 50 Km/h" de Coltrack (1). Quedan: "Infraccion 80 Km/h" de
--   Coltrack (22), "Exceso de Velocidad >80 km/h Magnex" (7) y Fagor (4).
--
-- `alertas_diarias_gps` NO necesita backfill: Informes Diarios, la Hoja de Vida,
-- el asistente IA, el worker de validación y la capa ML reclasifican al LEER
-- desde `estado` + `gps`, así que la corrección alcanza al histórico sola en
-- cuanto se despliegue el código. `batch_alerts.is_grave` sí es un valor
-- guardado y se lee tal cual, por eso esta migración.
-- ============================================================

-- 1. El criterio, como función inmutable reutilizable
CREATE OR REPLACE FUNCTION public.es_exceso_grave(alert_type TEXT, speed NUMERIC, fuente TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $fn$
DECLARE
  nombre  TEXT;
  umbral  NUMERIC;
  captura TEXT;
BEGIN
  -- Minúsculas y sin tildes, sin depender de la extensión unaccent.
  nombre := lower(translate(COALESCE(alert_type, ''),
                            'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'));

  IF nombre = '' THEN
    RETURN FALSE;
  END IF;

  -- Frenada brusca: es un evento de frenado, nunca un exceso de velocidad.
  IF nombre LIKE '%frenad%' OR nombre LIKE '%brake%' OR nombre LIKE '%desaceleracion%' THEN
    RETURN FALSE;
  END IF;

  -- Que el nombre diga "exceso" no basta: "Exceso de RPM" no es velocidad.
  IF nombre LIKE '%rpm%' THEN
    RETURN FALSE;
  END IF;
  IF NOT (nombre LIKE '%velocidad%' OR nombre LIKE '%infraccion%'
          OR nombre LIKE '%speed%' OR nombre LIKE '%limite de vel%') THEN
    RETURN FALSE;
  END IF;

  -- Umbral declarado en el nombre: primero con unidad, luego pegado a la
  -- palabra clave. Fuera de 5-200 km/h no puede ser un límite de velocidad.
  captura := substring(nombre from '([0-9]{1,3})\s*(?:km\s*/?\s*h|kmh|kph|k/h)\y');
  IF captura IS NULL THEN
    captura := substring(nombre from '(?:velocidad|infraccion|speeding|speed|limite)[^0-9]{0,12}([0-9]{1,3})\y');
  END IF;

  IF captura IS NOT NULL THEN
    umbral := captura::NUMERIC;
    IF umbral BETWEEN 5 AND 200 THEN
      RETURN umbral >= 80;
    END IF;
  END IF;

  -- Sin umbral declarado: en Geotab no cuenta; en el resto manda la velocidad.
  IF lower(COALESCE(fuente, '')) = 'geotab' THEN
    RETURN FALSE;
  END IF;

  RETURN COALESCE(speed, 0) >= 80;
END;
$fn$;

COMMENT ON FUNCTION public.es_exceso_grave(TEXT, NUMERIC, TEXT) IS
  'Falta grave = exceso de >=80 km/h segun la regla que disparo el GPS. El umbral del nombre manda sobre la velocidad medida; sin umbral, Geotab no cuenta. Espejo de services/speedingClassification.ts.';

-- 2. Autotest: si el criterio no reproduce los casos conocidos de las tres
--    plataformas, la migración ABORTA y no toca ni una fila. Los valores
--    esperados son los mismos que verifica el lado TypeScript/Python.
DO $test$
DECLARE
  caso   RECORD;
  fallos TEXT := '';
  actual BOOLEAN;
BEGIN
  FOR caso IN
    SELECT * FROM (VALUES
      -- nombre del evento,                   plataforma,  velocidad, grave?
      ('Exceso de Velocidad >80 km/h Magnex', 'GEOTAB',        85.0, TRUE),
      ('Exceso de Velocidad >80 km/h Magnex', 'GEOTAB',        30.0, TRUE),
      ('Exceso Velocidad 40 Km/h',            'GEOTAB',        85.0, FALSE),
      ('Exceso Velocidad 60 Km/h',            'GEOTAB',        85.0, FALSE),
      ('Exceso Velocidad 10 Km/h',            'GEOTAB',        23.0, FALSE),
      ('Exceso de velocidad',                 'GEOTAB',       101.0, FALSE),
      ('Exceso de velocidad (nuevo)',         'GEOTAB',       127.0, FALSE),
      ('Infraccion 80 Km/h',                  'COLTRACK',      92.1, TRUE),
      ('Infraccion 30 Km/h',                  'COLTRACK',      85.0, FALSE),
      ('Infraccion 50 Km/h',                  'COLTRACK',      90.3, FALSE),
      ('Alm. Exceso de velocidad en la via',  'FAGOR',         86.0, TRUE),
      ('Alm. Exceso de velocidad en la via',  'FAGOR',         40.0, FALSE),
      ('Exceso de RPM',                       'COLTRACK',      85.0, FALSE),
      ('Frenada Brusca',                      'COLTRACK',      85.0, FALSE),
      ('Alarma ACL Frenada Brusca',           'FAGOR',         85.0, FALSE),
      ('Giro brusco',                         'GEOTAB',        77.0, FALSE),
      ('Uso del cinturon de seguridad',       'GEOTAB',        24.0, FALSE),
      ('Tiempo en ralenti',                   'GEOTAB',         0.0, FALSE),
      ('TDR Encendido',                       'COLTRACK',      85.0, FALSE),
      ('Speeding 100 kph',                    NULL,            30.0, TRUE)
    ) AS c(nombre, fuente, velocidad, esperado)
  LOOP
    actual := public.es_exceso_grave(caso.nombre, caso.velocidad, caso.fuente);
    IF actual IS DISTINCT FROM caso.esperado THEN
      fallos := fallos || format('; [%s] %s @ %s km/h dio %s, esperado %s',
        COALESCE(caso.fuente, 'sin fuente'), caso.nombre, caso.velocidad,
        actual, caso.esperado);
    END IF;
  END LOOP;

  IF fallos <> '' THEN
    RAISE EXCEPTION 'es_exceso_grave() no reproduce el criterio del sistema. Backfill ABORTADO%', fallos;
  END IF;

  RAISE NOTICE 'Autotest de es_exceso_grave(): 20/20 casos OK.';
END;
$test$;

-- 3. Backfill de las filas ya cargadas.
--    La plataforma de una fila de batch_alerts vive en file_uploads.source.
UPDATE public.batch_alerts ba
   SET is_grave = public.es_exceso_grave(ba.alert_type, ba.speed, fu.source)
  FROM public.file_uploads fu
 WHERE fu.id = ba.upload_id
   AND ba.is_grave IS DISTINCT FROM public.es_exceso_grave(ba.alert_type, ba.speed, fu.source);

-- 4. Verificación: qué quedó marcado como grave y por qué regla.
--    Toda fila listada debería venir de una regla que declara >=80 km/h, o de
--    una regla sin umbral de Coltrack/Fagor medida por encima de 80.
-- SELECT fu.source, ba.alert_type, COUNT(*) AS graves,
--        MIN(ba.speed) AS vel_min, MAX(ba.speed) AS vel_max
--   FROM public.batch_alerts ba
--   JOIN public.file_uploads fu ON fu.id = ba.upload_id
--  WHERE ba.is_grave
--  GROUP BY fu.source, ba.alert_type
--  ORDER BY graves DESC;
