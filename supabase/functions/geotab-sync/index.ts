/**
 * Supabase Edge Function: Geotab Sync (v1)
 *
 * Sincroniza el histórico diario de km / horas desde Geotab hacia Supabase,
 * para que el módulo "Geotab" del frontend lo lea de forma instantánea.
 *
 * Arquitectura (igual que alert-monitor):
 *   Edge Function (cron) -> Vercel /api/geotab (action: dailyMetrics) -> Geotab Trip (paginado)
 *   -> upsert en geotab_daily_metrics
 *
 * Ventana: últimos N días en cada corrida (re-procesa para capturar viajes
 * que llegan tarde). El upsert por (fecha, device_id) hace la operación idempotente.
 *
 * Trigger: Cron Job (ej. 1 vez/hora vía cron-job.org)
 * Endpoint: https://[project-ref].supabase.co/functions/v1/geotab-sync
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const VERCEL_APP_URL = 'https://magnex-torre.vercel.app';
const GEOTAB_API_URL = `${VERCEL_APP_URL}/api/geotab`;
const SYNC_DAYS = 3; // re-procesa últimos 3 días

serve(async () => {
  try {
    console.log('🚀 Geotab Sync started');
    const startTime = Date.now();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const toDate = new Date().toISOString();
    const fromDate = new Date(Date.now() - SYNC_DAYS * 24 * 60 * 60 * 1000).toISOString();

    console.log(`📡 Fetching daily metrics ${fromDate} -> ${toDate}`);
    const response = await fetch(GEOTAB_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'dailyMetrics', fromDate, toDate })
    });

    if (!response.ok) {
      throw new Error(`Geotab serverless function error: ${response.status}`);
    }

    const result = await response.json();
    if (!result.success || !result.data?.metrics) {
      throw new Error('Invalid response from Geotab serverless function');
    }

    const metrics: any[] = result.data.metrics;
    console.log(`📊 ${metrics.length} filas (fecha x vehículo) a sincronizar`);

    // Upsert por lotes sobre la llave única (fecha, device_id)
    const rows = metrics.map((m) => ({
      fecha: m.date,
      device_id: m.deviceId,
      placa: m.plate,
      km: Number(m.km.toFixed(2)),
      horas_conduccion: Number(m.drivingHours.toFixed(2)),
      horas_ralenti: Number(m.idlingHours.toFixed(2)),
      viajes: m.trips,
      updated_at: new Date().toISOString(),
    }));

    let upserted = 0;
    const BATCH = 500;
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      const { error } = await supabase
        .from('geotab_daily_metrics')
        .upsert(chunk, { onConflict: 'fecha,device_id' });
      if (error) {
        console.error('[DB] upsert error:', error.message);
      } else {
        upserted += chunk.length;
      }
    }

    const duration = Date.now() - startTime;
    const out = {
      success: true,
      timestamp: new Date().toISOString(),
      duration_ms: duration,
      window: { fromDate, toDate },
      rows: metrics.length,
      upserted,
    };
    console.log('✅ Geotab Sync completed', JSON.stringify(out));
    return new Response(JSON.stringify(out), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('❌ Geotab Sync error:', error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message, timestamp: new Date().toISOString() }),
      { headers: { 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
