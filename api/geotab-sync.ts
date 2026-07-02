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
 * Backfill puntual: /api/geotab-sync?days=30  (1..90; por defecto 3).
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

// Permite hasta 60s en planes que lo soporten (backfill / rangos amplios).
export const config = { maxDuration: 60 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Autorización opcional: si CRON_SECRET está definido, se exige el header.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers['authorization'];
    if (auth !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({
      error: 'Sync no configurado',
      message: 'Faltan env vars SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY',
    });
  }

  // Ventana a sincronizar (idempotente por la llave única fecha+device_id).
  const days = Math.min(Math.max(Number(req.query.days) || DEFAULT_SYNC_DAYS, 1), 90);

  try {
    const toDate = new Date().toISOString();
    const fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const response = await fetch(GEOTAB_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'dailyMetrics', fromDate, toDate }),
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
      updated_at: new Date().toISOString(),
    }));

    const supabase = createClient(supabaseUrl, serviceKey);

    let upserted = 0;
    const BATCH = 500;
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      const { error } = await supabase
        .from('geotab_daily_metrics')
        .upsert(chunk, { onConflict: 'fecha,device_id' });
      if (error) {
        console.error('[geotab-sync] upsert error:', error.message);
      } else {
        upserted += chunk.length;
      }
    }

    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      window: { fromDate, toDate, days },
      rows: rows.length,
      upserted,
    });
  } catch (error: any) {
    console.error('geotab-sync error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
