-- ====================================================================
-- Script: Eliminar Registros Duplicados en Bitácora de Gestión
-- Ejecuta este script en el Editor de SQL de Supabase (SQL Editor)
-- Mantiene únicamente la primera versión de cada registro duplicado.
-- ====================================================================

-- 1. Mostrar recuento actual antes de la limpieza
SELECT count(*) AS total_antes_de_limpieza FROM public.bitacora_gestion;

-- 2. Eliminar duplicados comparando campos clave
DELETE FROM public.bitacora_gestion a
USING public.bitacora_gestion b
WHERE a.id > b.id  -- Mantiene el registro con el ID menor (el primero insertado)
  AND a.fecha = b.fecha
  AND COALESCE(a.hora_alerta, '') = COALESCE(b.hora_alerta, '')
  AND COALESCE(a.hora_aviso_supervisor, '') = COALESCE(b.hora_aviso_supervisor, '')
  AND a.tipo_novedad = b.tipo_novedad
  AND COALESCE(a.placa, '') = COALESCE(b.placa, '')
  AND COALESCE(a.contrato, '') = COALESCE(b.contrato, '')
  AND COALESCE(a.plataforma, '') = COALESCE(b.plataforma, '')
  AND COALESCE(a.conductor, '') = COALESCE(b.conductor, '')
  AND COALESCE(a.gestion_realizada, '') = COALESCE(b.gestion_realizada, '');

-- 3. Mostrar recuento final después de la limpieza
SELECT count(*) AS total_despues_de_limpieza FROM public.bitacora_gestion;
