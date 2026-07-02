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

  // Fallback en vivo: si el histórico aún no está sincronizado (cron geotab-sync
  // no desplegado / sin correr), calculamos km/horas al vuelo desde Geotab.
  if (rows.length === 0) {
    return getLiveMetricsSummary(fromDate, toDate);
  }

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

/**
 * Métricas km/horas EN VIVO desde Geotab (action:'dailyMetrics'), usadas como
 * fallback cuando la tabla sincronizada aún no tiene datos para el período.
 * Recibe fechas locales (YYYY-MM-DD) y las expande a los límites del día en
 * hora de Colombia (-05:00), que es como el proxy agrupa por fecha local.
 */
async function getLiveMetricsSummary(
  fromDate: string,
  toDate: string
): Promise<GeotabMetricsSummary> {
  const fromIso = new Date(`${fromDate}T00:00:00-05:00`).toISOString();
  const toIso = new Date(`${toDate}T23:59:59-05:00`).toISOString();

  const response = await fetch('/api/geotab', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'dailyMetrics', fromDate: fromIso, toDate: toIso }),
  });
  if (!response.ok) throw new Error(`Geotab dailyMetrics: ${response.status}`);

  const result = await response.json();
  if (!result.success || !result.data?.metrics) {
    throw new Error('Respuesta inválida de Geotab (dailyMetrics)');
  }

  const metrics = (result.data.metrics || []) as Array<{
    date: string;
    deviceId: string;
    plate: string;
    km: number;
    drivingHours: number;
    idlingHours: number;
    trips: number;
  }>;

  let totalKm = 0;
  let totalHorasConduccion = 0;
  let totalHorasRalenti = 0;
  let totalViajes = 0;

  const porPlaca: Record<string, GeotabVehicleSummary> = {};

  for (const m of metrics) {
    const km = Number(m.km) || 0;
    const hc = Number(m.drivingHours) || 0;
    const hr = Number(m.idlingHours) || 0;
    const v = Number(m.trips) || 0;

    totalKm += km;
    totalHorasConduccion += hc;
    totalHorasRalenti += hr;
    totalViajes += v;

    const key = m.plate || m.deviceId;
    if (!porPlaca[key]) {
      porPlaca[key] = { placa: key, km: 0, horas_conduccion: 0, horas_ralenti: 0, viajes: 0 };
    }
    porPlaca[key].km += km;
    porPlaca[key].horas_conduccion += hc;
    porPlaca[key].horas_ralenti += hr;
    porPlaca[key].viajes += v;
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
