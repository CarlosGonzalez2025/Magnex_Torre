-- ============================================================================
-- MIGRATION v12: índices para el orden de las alertas diarias
--
-- PROBLEMA
-- --------
-- Informes Diarios falla de forma intermitente con:
--     57014: canceling statement due to statement timeout
--
-- El módulo consulta siempre con esta forma (getReporteAlertasDiarias, que
-- alimenta el PDF, el Excel y el generador de correos):
--
--     SELECT ... FROM alertas_diarias_gps
--     WHERE fecha_dia BETWEEN :a AND :b
--       AND vehiculo_id IS NOT NULL
--       [AND contrato_id = :c]
--     ORDER BY fecha
--     LIMIT 1000 OFFSET :n;
--
-- La v7 creó índices sobre (fecha_dia), (placa, fecha_dia) y
-- (contrato_id, fecha_dia), pero NINGUNO incluye `fecha`, que es la columna
-- por la que se ordena. Postgres resuelve el filtro con el índice y después
-- ordena en memoria todo el conjunto filtrado. Con ~151.000 filas esa
-- ordenación a veces termina a tiempo y a veces supera el statement timeout.
--
-- Medido contra producción sobre el histórico completo, tres intentos:
--     con ORDER BY fecha     ->  500/57014   500/57014   2385 ms   (2 de 3 fallan)
--     sin ORDER BY           ->      697 ms      523 ms    502 ms   (siempre OK)
--
-- Por eso el fallo parecía depender del dispositivo: no dependía. Es un
-- timeout de servidor que salta según la carga y el estado de la caché, y
-- cada usuario se lo encuentra en un momento distinto.
--
-- SOLUCIÓN
-- --------
-- Dos índices que incluyen `fecha` como última columna, de modo que el mismo
-- índice resuelve el filtro y entrega las filas ya ordenadas, sin ordenación
-- posterior. Ambos son parciales sobre `vehiculo_id IS NOT NULL`, que es el
-- filtro que aplican todas las consultas del módulo: así ocupan menos y el
-- planificador los elige con más facilidad.
--
-- EJECUCIÓN
-- ---------
-- CREATE INDEX CONCURRENTLY no bloquea escrituras, pero NO puede ejecutarse
-- dentro de una transacción. En el editor SQL de Supabase hay que lanzar cada
-- sentencia POR SEPARADO. Si alguna queda en estado inválido (por ejemplo, si
-- se cancela a media construcción), basta con DROP INDEX y repetirla.
-- ============================================================================


-- 1) Caso por defecto y consultas sin contrato.
--    El módulo abre con fechaInicio = fechaFin = ayer, así que `fecha_dia`
--    toma un único valor y el índice devuelve las filas directamente
--    ordenadas por `fecha`: la ordenación desaparece por completo.
--    Sirve a getReporteAlertasDiarias, listarAlertasDiarias y
--    listarAlertasDiariasResumen.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_alertas_diarias_fechadia_fecha
  ON public.alertas_diarias_gps (fecha_dia, fecha)
  WHERE vehiculo_id IS NOT NULL;


-- 2) Exportaciones por contrato del submódulo Análisis.
--    Cada botón de correo, PDF y Excel de la lista de contratos llama a
--    getReporteAlertasDiarias con contratoId, de modo que esta es la consulta
--    más repetida del módulo. Con las tres columnas en el índice se resuelve
--    entera sin ordenar.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_alertas_diarias_contrato_fechadia_fecha
  ON public.alertas_diarias_gps (contrato_id, fecha_dia, fecha)
  WHERE vehiculo_id IS NOT NULL;


-- 3) Refresca las estadísticas para que el planificador use los índices nuevos
--    desde la primera consulta y no tras el siguiente autovacuum.
ANALYZE public.alertas_diarias_gps;


-- ============================================================================
-- COMPROBACIÓN
-- ------------
-- Tras aplicar la migración, este plan NO debe contener ningún nodo "Sort"
-- ni "Seq Scan" sobre alertas_diarias_gps:
--
--     EXPLAIN ANALYZE
--     SELECT id, placa, conductor, fecha
--     FROM public.alertas_diarias_gps
--     WHERE fecha_dia BETWEEN CURRENT_DATE - 1 AND CURRENT_DATE - 1
--       AND vehiculo_id IS NOT NULL
--     ORDER BY fecha
--     LIMIT 1000;
--
-- Lo esperado es un "Index Scan using idx_alertas_diarias_fechadia_fecha".
--
--
-- NOTA SOBRE UN RIESGO LATENTE (no corregido aquí a propósito)
-- -----------------------------------------------------------
-- `listarAlertasDiariasResumen` pagina por offset sin ORDER BY. En Postgres
-- eso deja el orden entre páginas formalmente indefinido, así que en teoría
-- podría repetir o saltarse filas bajo escritura concurrente. Se comprobó dos
-- veces sobre producción y devolvió resultados idénticos, de modo que NO es un
-- fallo observado. No se le añade un ORDER BY porque, sin estos índices, era
-- precisamente la ordenación lo que disparaba el timeout: conviene aplicar la
-- migración primero y valorarlo después con los índices ya en su sitio.
-- ============================================================================
