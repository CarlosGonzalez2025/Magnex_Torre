import { supabase } from './supabaseClient';

/**
 * Servicio Geotab (híbrido):
 *  - Conteos (vehículos / conductores): EN VIVO vía /api/geotab.
 *  - Km / horas: desde Supabase (tabla geotab_daily_metrics, sincronizada por cron).
 */

export interface GeotabCounts {
  vehicleCount: number;
  driverCount: number;
}

export interface GeotabDailyMetric {
  fecha: string;
  device_id: string;
  placa: string;
  km: number;
  horas_conduccion: number;
  horas_ralenti: number;
  viajes: number;
}

export interface GeotabVehicleSummary {
  placa: string;
  km: number;
  horas_conduccion: number;
  horas_ralenti: number;
  viajes: number;
}

export interface GeotabMetricsSummary {
  totalKm: number;
  totalHorasConduccion: number;
  totalHorasRalenti: number;
  totalViajes: number;
  porVehiculo: GeotabVehicleSummary[];
}

/** Conteos en vivo de vehículos y conductores. */
export async function getLiveCounts(): Promise<GeotabCounts> {
  const response = await fetch('/api/geotab', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'counts' }),
  });
  if (!response.ok) throw new Error(`Geotab counts: ${response.status}`);
  const result = await response.json();
  if (!result.success || !result.data) throw new Error('Respuesta inválida de Geotab (counts)');
  return {
    vehicleCount: result.data.vehicleCount ?? 0,
    driverCount: result.data.driverCount ?? 0,
  };
}

/** Métricas km/horas desde Supabase para un rango [fromDate, toDate] (YYYY-MM-DD). */
export async function getMetricsSummary(
  fromDate: string,
  toDate: string
): Promise<GeotabMetricsSummary> {
  const { data, error } = await supabase
    .from('geotab_daily_metrics')
    .select('fecha, device_id, placa, km, horas_conduccion, horas_ralenti, viajes')
    .gte('fecha', fromDate)
    .lte('fecha', toDate);

  if (error) throw new Error(error.message);

  const rows = (data || []) as GeotabDailyMetric[];

  // Totales
  let totalKm = 0;
  let totalHorasConduccion = 0;
  let totalHorasRalenti = 0;
  let totalViajes = 0;

  // Agregación por vehículo (suma de los días del rango)
  const porPlaca: Record<string, GeotabVehicleSummary> = {};

  for (const r of rows) {
    totalKm += Number(r.km) || 0;
    totalHorasConduccion += Number(r.horas_conduccion) || 0;
    totalHorasRalenti += Number(r.horas_ralenti) || 0;
    totalViajes += Number(r.viajes) || 0;

    const key = r.placa || r.device_id;
    if (!porPlaca[key]) {
      porPlaca[key] = { placa: key, km: 0, horas_conduccion: 0, horas_ralenti: 0, viajes: 0 };
    }
    porPlaca[key].km += Number(r.km) || 0;
    porPlaca[key].horas_conduccion += Number(r.horas_conduccion) || 0;
    porPlaca[key].horas_ralenti += Number(r.horas_ralenti) || 0;
    porPlaca[key].viajes += Number(r.viajes) || 0;
  }

  const porVehiculo = Object.values(porPlaca).sort((a, b) => b.km - a.km);

  return {
    totalKm,
    totalHorasConduccion,
    totalHorasRalenti,
    totalViajes,
    porVehiculo,
  };
}
