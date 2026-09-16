-- ============================================================
-- MIGRATION: vista ralentis_eventos_por_vehiculo_periodo
-- Versión: v1 - 2026-09-16
--
-- Motivo: el "Análisis General" del módulo de ralentí descargaba la tabla
-- `ralentis_eventos` COMPLETA al navegador cada vez que alguien abría la pestaña
-- —347.075 filas, unos 50 MB— para calcular apenas tres números por quincena:
-- el conteo de alertas, los segundos acumulados y los eventos de más de 30 min.
--
-- Agregados por (vehículo, quincena) esos 347.075 eventos se reducen a 6.449
-- filas: un 98,1% menos, de ~50 MB a ~0,7 MB por apertura. Con el proyecto
-- excedido en transferencia (5,08 GB sobre un límite de 5 GB y ~150 MB diarios),
-- esa pantalla era una de las fuentes principales.
--
-- Se agrega por VEHÍCULO y no solo por quincena a propósito: el componente filtra
-- por cliente, contrato y tipo, y tiene el modo "panel constante" que restringe la
-- serie a los vehículos presentes en todas las quincenas. Agregando solo por
-- quincena, esos filtros dejarían de funcionar. Las tres métricas son aditivas
-- sobre vehículos, así que el cliente las suma y obtiene el mismo resultado.
--
-- NO cambia ni borra dato alguno: es una vista de solo lectura sobre
-- `ralentis_eventos`. El "Informe por Período" sigue leyendo los eventos crudos,
-- porque necesita el detalle por evento para los rankings y la tabla.
--
-- ⚠ LOS UMBRALES ESTÁN DUPLICADOS. Aquí y en `UMBRAL_RALENTI_SEG` de
-- RalentiReports.tsx / RalentiAnalisisGeneral.tsx. Si cambia uno, hay que cambiar
-- el otro en el mismo commit o las dos vistas del módulo dejarán de cuadrar.
-- Coltrack alerta a los 10 min, Fagor a los 5, y Geotab va en 0 porque su regla
-- "Idling" ya aplicó el umbral en la plataforma.
--
-- Ejecutar en: Supabase SQL Editor con rol de administrador
-- ============================================================

CREATE OR REPLACE VIEW public.ralentis_eventos_por_vehiculo_periodo
WITH (security_invoker = true) AS
SELECT
    vehiculo_id,
    periodo_inicio,
    periodo_fin,
    count(*)::int                                                  AS alertas,
    coalesce(sum(duracion_segundos), 0)::bigint                    AS segundos,
    count(*) FILTER (WHERE duracion_segundos > 1800)::int          AS eventos_mas_30min
FROM public.ralentis_eventos
WHERE
    -- Conductor "Taller" = vehículo en mantenimiento, no operación real.
    upper(coalesce(conductor_nombre, '')) NOT LIKE '%TALLER%'
    -- Solo los eventos que son ALERTA según el umbral nativo de su proveedor.
    AND duracion_segundos >= CASE upper(coalesce(proveedor, ''))
        WHEN 'COLTRACK' THEN 600
        WHEN 'FAGOR'    THEN 300
        WHEN 'GEOTAB'   THEN 0
        ELSE 300
    END
GROUP BY vehiculo_id, periodo_inicio, periodo_fin;

COMMENT ON VIEW public.ralentis_eventos_por_vehiculo_periodo IS
    'Agregado de ralentis_eventos por vehículo y quincena, aplicando el umbral de alerta de cada proveedor y excluyendo conductores "Taller". Existe para que el Análisis General no descargue las 347.000 filas de eventos al navegador. Solo lectura.';

-- `security_invoker` hace que la vista respete las políticas RLS de la tabla base
-- en vez de correr con los permisos del dueño. Sin eso, la vista sería una puerta
-- lateral a datos que RLS protege en `ralentis_eventos`.
GRANT SELECT ON public.ralentis_eventos_por_vehiculo_periodo TO anon, authenticated;

-- Índice que sostiene la agregación. Es sobre la TABLA, no sobre la vista.
CREATE INDEX IF NOT EXISTS idx_ralentis_eventos_agregado
    ON public.ralentis_eventos (periodo_inicio, periodo_fin, vehiculo_id);

NOTIFY pgrst, 'reload schema';

-- Verificación — las dos cifras deben coincidir:
--   SELECT count(*) FROM public.ralentis_eventos_por_vehiculo_periodo;       -- ~6.449
--   SELECT sum(alertas) FROM public.ralentis_eventos_por_vehiculo_periodo;   -- ~313.665
