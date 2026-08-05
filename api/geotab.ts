import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Proxy Geotab (MyGeotab JSON-RPC API).
 *
 * Maneja autenticación + federación (path) + cache de sesión en el lambda,
 * y expone varias "actions" sobre el mismo endpoint, igual que coltrack/fagor
 * pero con la complejidad de Geotab encapsulada del lado servidor:
 *
 *   POST /api/geotab  { action: 'live' }          -> { vehicles }            (mapa/tabla en vivo)
 *   POST /api/geotab  { action: 'alerts' }        -> { vehicles, events }    (worker de alertas)
 *   POST /api/geotab  { action: 'counts' }        -> { vehicleCount, driverCount }
 *   POST /api/geotab  { action: 'dailyMetrics', fromDate, toDate }
 *                                                 -> { metrics: [{date, deviceId, plate, km, drivingHours, idlingHours, trips}] }
 *   POST /api/geotab  { action: 'idlingEvents', fromDate, toDate }
 *                                                 -> { rule, events: [{plate, deviceId, from, to, durationSeconds}] }
 *
 * Credenciales: SOLO por variables de entorno (Vercel). Nunca hardcodear.
 */

// Rangos de una quincena completa pueden superar el timeout por defecto.
export const config = { maxDuration: 60 };

const GEOTAB_DATABASE = process.env.GEOTAB_DATABASE;
const GEOTAB_USER = process.env.GEOTAB_USER;
const GEOTAB_PASSWORD = process.env.GEOTAB_PASSWORD;
const COLOMBIA_TZ_OFFSET = '-05:00';

// Cache de sesión a nivel de módulo: sobrevive entre invocaciones "calientes".
let session: { server: string; credentials: any } | null = null;

async function rpc(server: string, method: string, params: any): Promise<any> {
  const res = await fetch(`https://${server}/apiv1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method, params }),
  });
  const json = await res.json();
  if (json.error) {
    const e: any = new Error(json.error.message || 'Geotab error');
    e.geotab = json.error;
    e.name = json.error?.errors?.[0]?.name || json.error.name || 'GeotabError';
    throw e;
  }
  return json.result;
}

async function authenticate() {
  const result = await rpc('my.geotab.com', 'Authenticate', {
    database: GEOTAB_DATABASE,
    userName: GEOTAB_USER,
    password: GEOTAB_PASSWORD,
  });
  // Federación: usar el servidor que devuelve el login.
  const server = result.path && result.path !== 'ThisServer' ? result.path : 'my.geotab.com';
  session = { server, credentials: result.credentials };
  return session;
}

async function ensureSession() {
  if (!session) await authenticate();
  return session!;
}

/** Ejecuta una llamada reautenticando una vez si la sesión expiró. */
async function call(method: string, params: any): Promise<any> {
  let s = await ensureSession();
  try {
    return await rpc(s.server, method, { ...params, credentials: s.credentials });
  } catch (err: any) {
    const name = String(err?.name || '');
    if (name.includes('InvalidUser') || name.includes('DbUnavailable')) {
      session = null;
      s = await ensureSession();
      return await rpc(s.server, method, { ...params, credentials: s.credentials });
    }
    throw err;
  }
}

/** Pagina cualquier entidad con GetFeed hasta agotar resultados. */
async function getFeedAll(typeName: string, search?: any): Promise<any[]> {
  const out: any[] = [];
  let fromVersion: string | undefined;
  const resultsLimit = 50000;
  // Salvaguarda contra bucles infinitos.
  for (let i = 0; i < 200; i++) {
    const result = await call('GetFeed', { typeName, search, fromVersion, resultsLimit });
    const data: any[] = result?.data || [];
    out.push(...data);
    fromVersion = result?.toVersion;
    if (data.length < resultsLimit || !fromVersion) break;
  }
  return out;
}

// ==================== HELPERS ====================

// Geotab devuelve duraciones como "HH:MM:SS" o "d.HH:MM:SS".
function durationToHours(s: unknown): number {
  if (!s || typeof s !== 'string') return 0;
  let days = 0;
  let rest = s;
  const dotIdx = s.indexOf('.');
  const colonIdx = s.indexOf(':');
  if (dotIdx !== -1 && colonIdx !== -1 && dotIdx < colonIdx) {
    days = Number(s.slice(0, dotIdx)) || 0;
    rest = s.slice(dotIdx + 1);
  }
  const [h = 0, m = 0, sec = 0] = rest.split(':').map(Number);
  return days * 24 + h + m / 60 + sec / 3600;
}

// Fecha local Colombia (YYYY-MM-DD) a partir de un ISO UTC.
function colombiaDate(iso: string): string {
  const d = new Date(new Date(iso).getTime() - 5 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

/** Construye mapa Device.id -> { plate, vehicleType, groups }. */
async function buildDeviceMap(): Promise<Record<string, any>> {
  const devices: any[] = await call('Get', { typeName: 'Device' });
  const map: Record<string, any> = {};
  for (const d of devices) {
    map[d.id] = {
      plate: d.licensePlate || d.name || d.id,
      name: d.name,
      vehicleType: d.vehicleIdentificationNumber ? 'Vehículo' : '',
    };
  }
  return map;
}

/** ¿La regla es de exceso de velocidad? (para saber a qué eventos enriquecer velocidad) */
function isSpeedingRule(ruleName: string): boolean {
  const n = (ruleName || '').toLowerCase();
  return (n.includes('exceso') && n.includes('velocidad')) || n.includes('speeding');
}

/**
 * El ExceptionEvent no trae la velocidad. Para los eventos de exceso de
 * velocidad consultamos LogRecord (GPS) en la ventana del evento y tomamos la
 * velocidad máxima. Se resuelve en UNA sola petición con ExecuteMultiCall.
 * Devuelve un mapa { eventId -> maxSpeedKmh }.
 */
async function speedByEventForSpeeding(
  events: any[],
  ruleMap: Record<string, string>
): Promise<Record<string, number>> {
  const targets = events.filter((e) => isSpeedingRule(ruleMap[e.rule?.id]) && e.device?.id);
  // Tope para acotar el tamaño del multicall.
  const capped = targets.slice(0, 300);
  if (capped.length === 0) return {};

  const nowIso = new Date().toISOString();
  const calls = capped.map((e) => ({
    method: 'Get',
    params: {
      typeName: 'LogRecord',
      search: {
        deviceSearch: { id: e.device.id },
        fromDate: e.activeFrom,
        toDate: e.activeTo || nowIso,
      },
    },
  }));

  const speedMap: Record<string, number> = {};
  try {
    const results: any[] = await call('ExecuteMultiCall', { calls });
    results.forEach((logs: any[], idx: number) => {
      const speeds = (logs || []).map((r) => Number(r.speed) || 0);
      if (speeds.length) speedMap[capped[idx].id] = Math.max(...speeds);
    });
  } catch (err) {
    console.error('speedByEventForSpeeding multicall failed:', err);
  }
  return speedMap;
}

/** DeviceStatusInfo -> filas tipo "vehículo en vivo". */
function mapLiveVehicles(statuses: any[], deviceMap: Record<string, any>): any[] {
  return statuses.map((s) => {
    const dev = deviceMap[s.device?.id] || {};
    const speed = Number(s.speed) || 0;
    return {
      deviceId: s.device?.id,
      plate: dev.plate || s.device?.id || 'UNKNOWN',
      latitude: Number(s.latitude) || 0,
      longitude: Number(s.longitude) || 0,
      speed,
      bearing: Number(s.bearing) || 0,
      isDriving: !!s.isDriving,
      dateTime: s.dateTime,
      vehicleType: dev.vehicleType || '',
    };
  });
}

// ==================== HANDLER ====================

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!GEOTAB_DATABASE || !GEOTAB_USER || !GEOTAB_PASSWORD) {
    return res.status(500).json({
      error: 'Geotab no configurado',
      message: 'Faltan env vars GEOTAB_DATABASE / GEOTAB_USER / GEOTAB_PASSWORD',
    });
  }

  const action = (req.body?.action as string) || 'live';

  try {
    switch (action) {
      // ---- Vehículos en vivo (mapa/tabla) ----
      case 'live': {
        const [statuses, deviceMap] = await Promise.all([
          call('Get', { typeName: 'DeviceStatusInfo' }),
          buildDeviceMap(),
        ]);
        return res.status(200).json({
          success: true,
          source: 'geotab',
          data: { vehicles: mapLiveVehicles(statuses, deviceMap) },
        });
      }

      // ---- Vivo + eventos de excepción (worker de alertas) ----
      case 'alerts': {
        const now = new Date();
        const fromDate = new Date(now.getTime() - 60 * 60 * 1000).toISOString(); // última hora
        const [statuses, deviceMap, rules, events] = await Promise.all([
          call('Get', { typeName: 'DeviceStatusInfo' }),
          buildDeviceMap(),
          call('Get', { typeName: 'Rule' }),
          call('Get', {
            typeName: 'ExceptionEvent',
            search: { fromDate, toDate: now.toISOString() },
            resultsLimit: 5000,
          }),
        ]);

        const ruleMap: Record<string, string> = {};
        for (const r of rules) ruleMap[r.id] = r.name;

        // Velocidad real (máx en la ventana) para los eventos de exceso de velocidad.
        const speedMap = await speedByEventForSpeeding(events, ruleMap);

        const mappedEvents = events.map((e: any) => {
          const dev = deviceMap[e.device?.id] || {};
          return {
            id: e.id,
            plate: dev.plate || e.device?.id || 'UNKNOWN',
            deviceId: e.device?.id,
            ruleId: e.rule?.id,
            ruleName: ruleMap[e.rule?.id] || e.rule?.id || 'Regla desconocida',
            activeFrom: e.activeFrom,
            activeTo: e.activeTo,
            speed: speedMap[e.id] ?? 0,
          };
        });

        return res.status(200).json({
          success: true,
          source: 'geotab',
          data: { vehicles: mapLiveVehicles(statuses, deviceMap), events: mappedEvents },
        });
      }

      // ---- Conteos en vivo ----
      case 'counts': {
        const [devices, drivers] = await Promise.all([
          call('Get', { typeName: 'Device' }),
          call('Get', { typeName: 'User', search: { isDriver: true } }),
        ]);
        return res.status(200).json({
          success: true,
          source: 'geotab',
          data: { vehicleCount: devices.length, driverCount: drivers.length },
        });
      }

      // ---- Métricas diarias (km / horas) por vehículo, paginadas ----
      case 'dailyMetrics': {
        const toDate = (req.body?.toDate as string) || new Date().toISOString();
        const fromDate =
          (req.body?.fromDate as string) ||
          new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

        const deviceMap = await buildDeviceMap();
        const trips = await getFeedAll('Trip', { fromDate, toDate });

        // El feed de Trip respeta `fromDate` pero IGNORA `toDate`: pedir un rango de 2 días
        // devuelve todo desde fromDate hasta hoy (verificado contra la API en ago-2026). Por
        // eso el corte superior se aplica aquí, sobre la fecha local, o el agregado incluiría
        // días fuera de la ventana solicitada.
        const desde = colombiaDate(fromDate);
        const hasta = colombiaDate(toDate);

        // Agregación por (fecha local, dispositivo).
        const agg: Record<string, any> = {};
        for (const t of trips) {
          const deviceId = t.device?.id;
          if (!deviceId || !t.start) continue;
          const date = colombiaDate(t.start);
          if (date < desde || date > hasta) continue;
          const key = `${date}::${deviceId}`;
          if (!agg[key]) {
            const dev = deviceMap[deviceId] || {};
            agg[key] = {
              date,
              deviceId,
              plate: dev.plate || deviceId,
              km: 0,
              drivingHours: 0,
              idlingHours: 0,
              trips: 0,
            };
          }
          agg[key].km += Number(t.distance) || 0;
          agg[key].drivingHours += durationToHours(t.drivingDuration);
          agg[key].idlingHours += durationToHours(t.idlingDuration);
          agg[key].trips += 1;
        }

        return res.status(200).json({
          success: true,
          source: 'geotab',
          data: { fromDate, toDate, metrics: Object.values(agg) },
        });
      }

      // ---- Eventos individuales de ralentí (regla "Idling" de MyGeotab) ----
      // A diferencia del export "Reporte avanzado de viajes en detalle" —que solo trae
      // el ralentí ACUMULADO por viaje— la regla Idling genera un ExceptionEvent por cada
      // episodio, con inicio y fin reales. Es lo que permite alimentar ralentis_eventos
      // sin estimar duraciones.
      case 'idlingEvents': {
        const fromDate = req.body?.fromDate as string;
        const toDate = req.body?.toDate as string;
        if (!fromDate || !toDate) {
          return res.status(400).json({ error: 'idlingEvents requiere fromDate y toDate (ISO)' });
        }

        const [rules, deviceMap] = await Promise.all([
          call('Get', { typeName: 'Rule' }),
          buildDeviceMap(),
        ]);
        const idlingRule = rules.find((r: any) => /^idling$/i.test(r.name || ''))
          ?? rules.find((r: any) => /ralent|idl/i.test(r.name || ''));
        if (!idlingRule) {
          return res.status(200).json({
            success: true,
            source: 'geotab',
            data: { rule: null, events: [], message: 'No hay regla de ralentí configurada en MyGeotab' },
          });
        }

        const RESULTS_LIMIT = 50000;
        const raw: any[] = await call('Get', {
          typeName: 'ExceptionEvent',
          search: { fromDate, toDate, ruleSearch: { id: idlingRule.id } },
          resultsLimit: RESULTS_LIMIT,
        });
        // Geotab no pagina `Get`: si se alcanza el tope, el rango debe partirse.
        const truncado = raw.length >= RESULTS_LIMIT;

        const events = raw
          .filter((e) => e.device?.id && e.activeFrom)
          .map((e) => {
            const dev = deviceMap[e.device.id] || {};
            const ini = new Date(e.activeFrom).getTime();
            const fin = e.activeTo ? new Date(e.activeTo).getTime() : NaN;
            // `duration` viene como "HH:MM:SS"; si falta se deriva de activeFrom/activeTo.
            const durH = durationToHours(e.duration);
            const durationSeconds = durH > 0
              ? Math.round(durH * 3600)
              : (Number.isFinite(fin) && fin > ini ? Math.round((fin - ini) / 1000) : 0);
            return {
              plate: dev.plate || e.device.id,
              deviceId: e.device.id,
              driverId: e.driver?.id && e.driver.id !== 'UnknownDriverId' ? e.driver.id : null,
              from: e.activeFrom,
              to: e.activeTo ?? null,
              durationSeconds,
            };
          })
          .filter((e) => e.durationSeconds > 0);

        return res.status(200).json({
          success: true,
          source: 'geotab',
          data: {
            rule: { id: idlingRule.id, name: idlingRule.name },
            count: events.length,
            truncado,
            events,
          },
        });
      }

      default:
        return res.status(400).json({ error: `Acción desconocida: ${action}` });
    }
  } catch (error: any) {
    console.error('Error connecting to Geotab:', error);
    return res.status(500).json({
      error: 'Failed to connect to Geotab API',
      message: error.message,
      geotab: error.geotab,
    });
  }
}
