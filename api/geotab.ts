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
 *
 * Credenciales: SOLO por variables de entorno (Vercel). Nunca hardcodear.
 */

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

        // Agregación por (fecha local, dispositivo).
        const agg: Record<string, any> = {};
        for (const t of trips) {
          const deviceId = t.device?.id;
          if (!deviceId || !t.start) continue;
          const date = colombiaDate(t.start);
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
