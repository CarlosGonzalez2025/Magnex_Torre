import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

/**
 * Cron de sincronización Geotab (hosteado en Vercel).
 *
 * Cada corrida trae las métricas diarias (km / horas / ralentí / viajes) desde
 * Geotab vía /api/geotab (action: dailyMetrics) y las hace upsert en la tabla
 * Supabase geotab_daily_metrics, que alimenta el módulo "Geotab — Telemetría".
 *
 * Programación: Vercel Cron (ver vercel.json -> "crons") o cualquier scheduler
 * externo (cron-job.org) que haga POST/GET a /api/geotab-sync.
 *
 * Backfill puntual: /api/geotab-sync?days=30            (1..400; por defecto 3)
 *                   /api/geotab-sync?inicio=2026-03-30&fin=2026-04-30
 *
 * Env vars requeridas en Vercel:
 *   SUPABASE_URL                -> URL del proyecto Supabase
 *   SUPABASE_SERVICE_ROLE_KEY   -> service role (bypassa RLS para el upsert)
 *   CRON_SECRET (opcional)      -> si está, se exige Authorization: Bearer <CRON_SECRET>.
 *                                  Vercel Cron lo envía automáticamente cuando existe.
 */

const VERCEL_APP_URL = 'https://magnex-torre.vercel.app';
const GEOTAB_API_URL = `${VERCEL_APP_URL}/api/geotab`;
const DEFAULT_SYNC_DAYS = 3;
const COLOMBIA_OFFSET = '-05:00';
const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;

// Permite hasta 60s en planes que lo soporten (backfill / rangos amplios).
export const config = { maxDuration: 60 };

/** Fecha local de Colombia (UTC-5 fijo, sin horario de verano) de un instante dado. */
function fechaColombia(ms: number): string {
  return new Date(ms - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Autorización opcional: si CRON_SECRET está definido, se exige el header.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers['authorization'];
    if (auth !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  // El proyecto declara la URL de Supabase como VITE_SUPABASE_URL (la usa el bundle del
  // cliente). En las funciones serverless el prefijo VITE_ no significa nada, así que se
  // acepta cualquiera de los dos nombres en vez de exigir un duplicado en Vercel.
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({
      error: 'Sync no configurado',
      // Se indica exactamente cuál falta (solo presencia, nunca el valor).
      message: 'Faltan variables de entorno en Vercel',
      detalle: {
        SUPABASE_URL: !!process.env.SUPABASE_URL,
        VITE_SUPABASE_URL: !!process.env.VITE_SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        SUPABASE_SERVICE_KEY: !!process.env.SUPABASE_SERVICE_KEY,
      },
      ayuda: 'Defina la URL (SUPABASE_URL o VITE_SUPABASE_URL) y la service role key, y vuelva a desplegar: Vercel solo aplica variables nuevas a despliegues posteriores.',
    });
  }

  // Ventana a sincronizar (idempotente por la llave única fecha+device_id).
  //
  // El límite inferior SIEMPRE se ancla a las 00:00 de Colombia del primer día pedido.
  // El feed de Trip respeta `fromDate`, así que pasarle un instante a mitad de día —lo
  // que hacía `Date.now() - days*24h`— devolvía solo la COLA de ese día; el agregado se
  // guardaba igual contra el día local completo y pisaba la fila buena escrita en una
  // corrida anterior. Como el cron corre cada hora, la última escritura de cada día era
  // siempre la más truncada y ahí quedaba congelada: entre agosto y septiembre de 2026
  // la tabla llegó a conservar ~30% de los km y las horas reales.
  //
  // `days` pasa a contarse en días calendario locales (days=3 cubre hoy y los 3 previos
  // completos), que es justo lo que da el margen para recoger viajes que llegan tarde.
  const inicio = req.query.inicio as string | undefined;
  const fin = req.query.fin as string | undefined;
  let days = 0;
  let desde: string;
  let hasta: string;

  if (inicio !== undefined || fin !== undefined) {
    if (!ES_FECHA.test(inicio ?? '') || !ES_FECHA.test(fin ?? '') || (inicio as string) > (fin as string)) {
      return res.status(400).json({
        error: 'Rango inválido',
        message: 'Use inicio y fin en formato YYYY-MM-DD (fecha local de Colombia), con inicio <= fin.',
      });
    }
    desde = inicio as string;
    hasta = fin as string;
  } else {
    // El tope se subió de 90 a 400 días para permitir el backfill histórico del informe de
    // ralentí (alinear Geotab con Coltrack/Fagor desde abril 2026 exige 126 días).
    days = Math.min(Math.max(Number(req.query.days) || DEFAULT_SYNC_DAYS, 1), 400);
    desde = fechaColombia(Date.now() - days * 24 * 60 * 60 * 1000);
    hasta = fechaColombia(Date.now());
  }

  try {
    const fromDate = `${desde}T00:00:00.000${COLOMBIA_OFFSET}`;
    const toDate = `${hasta}T23:59:59.999${COLOMBIA_OFFSET}`;

    const response = await fetch(GEOTAB_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // `incluirCombustible` añade los galones de ralentí medidos con el contador
      // acumulativo de la ECU. Lo pide solo el cron: el panel en vivo consume esta misma
      // acción como respaldo y no necesita cargar con esa consulta.
      body: JSON.stringify({ action: 'dailyMetrics', fromDate, toDate, incluirCombustible: true }),
    });

    if (!response.ok) {
      throw new Error(`Geotab dailyMetrics error: ${response.status}`);
    }

    const result = await response.json();
    if (!result.success || !result.data?.metrics) {
      throw new Error('Respuesta inválida de Geotab (dailyMetrics)');
    }

    const metrics: any[] = result.data.metrics;
    const rows = metrics.map((m) => ({
      fecha: m.date,
      device_id: m.deviceId,
      placa: m.plate,
      km: Number((Number(m.km) || 0).toFixed(2)),
      horas_conduccion: Number((Number(m.drivingHours) || 0).toFixed(2)),
      horas_ralenti: Number((Number(m.idlingHours) || 0).toFixed(2)),
      viajes: Number(m.trips) || 0,
      // NULL ≠ 0: sin lecturas del contador de la ECU no hay medición, y escribir un
      // cero haría que el informe leyera "no consumió nada".
      galones_ralenti:
        m.idleFuelGallons === undefined || m.idleFuelGallons === null
          ? null
          : Number(Number(m.idleFuelGallons).toFixed(4)),
      updated_at: new Date().toISOString(),
    }));

    const supabase = createClient(supabaseUrl, serviceKey);

    let upserted = 0;
    // Red de seguridad para el orden de despliegue: si el código sube antes de que se
    // corra migrations/geotab_daily_galones_ralenti_v1.sql, la columna no existe y el
    // upsert entero falla. Sin esto, el cron dejaría de escribir km y horas EN SILENCIO
    // —el error solo se veía en consola— hasta que alguien notara el hueco. Al detectar
    // que la columna falta se reintenta sin ese campo y se avisa en la respuesta.
    let faltaColumnaCombustible = false;
    const sinCombustible = (fila: any) => {
      const { galones_ralenti, ...resto } = fila;
      return resto;
    };
    const esColumnaInexistente = (msg: string) =>
      /galones_ralenti/i.test(msg) && /(column|schema cache|42703|PGRST204)/i.test(msg);

    const BATCH = 500;
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      const payload = faltaColumnaCombustible ? chunk.map(sinCombustible) : chunk;
      const { error } = await supabase
        .from('geotab_daily_metrics')
        .upsert(payload, { onConflict: 'fecha,device_id' });
      if (!error) {
        upserted += chunk.length;
        continue;
      }
      if (!faltaColumnaCombustible && esColumnaInexistente(error.message)) {
        faltaColumnaCombustible = true;
        const { error: error2 } = await supabase
          .from('geotab_daily_metrics')
          .upsert(chunk.map(sinCombustible), { onConflict: 'fecha,device_id' });
        if (!error2) { upserted += chunk.length; continue; }
        console.error('[geotab-sync] upsert error (reintento sin combustible):', error2.message);
        continue;
      }
      console.error('[geotab-sync] upsert error:', error.message);
    }

    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      window: { fromDate, toDate, days },
      // Días locales efectivamente cubiertos y cuántos traían datos: deja ver de un
      // vistazo si un tramo del backfill quedó corto.
      rango: { desde, hasta, diasConDatos: new Set(rows.map(r => r.fecha)).size },
      combustible: {
        // Falta correr migrations/geotab_daily_galones_ralenti_v1.sql en Supabase.
        migracionPendiente: faltaColumnaCombustible || undefined,
        filasConMedicion: faltaColumnaCombustible ? 0 : rows.filter(r => r.galones_ralenti !== null).length,
        galones: Number(rows.reduce((s, r) => s + (Number(r.galones_ralenti) || 0), 0).toFixed(2)),
        // Geotab no pagina `Get`: pasado el tope, las lecturas que faltan no llegan y el
        // combustible del tramo queda corto. Rangos largos hay que pedirlos por tramos.
        truncado: result.data?.combustibleTruncado === true || undefined,
      },
      rows: rows.length,
      upserted,
    });
  } catch (error: any) {
    console.error('geotab-sync error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
