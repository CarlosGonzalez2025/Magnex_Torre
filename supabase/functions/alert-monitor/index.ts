/**
 * Supabase Edge Function: Alert Monitor Worker (v2.0)
 *
 * Este worker se ejecuta cada 5 minutos de forma independiente (24/7)
 * sin necesidad de que haya usuarios conectados al frontend.
 *
 * Funciones:
 * 1. Consulta APIs de Coltrack y Fagor a través de Vercel serverless functions
 * 2. Detecta alertas automáticamente (velocidad, pánico, frenada, aceleración, colisión)
 * 3. Sistema inteligente de deduplicación con ventanas de tiempo
 * 4. Validación estricta de eventos críticos (pánico, colisión)
 * 5. Guarda alertas únicas y verificadas en saved_alerts
 *
 * Arquitectura:
 * - Supabase Edge Function → Vercel Serverless Functions → Coltrack/Fagor APIs
 * - Esto evita problemas de CORS y bloqueos de IP de las APIs externas
 *
 * Características de Deduplicación:
 * - Exceso de Velocidad: 15 minutos (evita spam de mismo evento)
 * - Frenada/Aceleración Brusca: 10 minutos
 * - Botón de Pánico: 60 minutos (eventos críticos tienen ventana mayor)
 * - Colisión: 24 horas (evento único, validación estricta)
 *
 * Trigger: Cron Job cada 5 minutos (vía cron-job.org)
 * Endpoint: https://[project-ref].supabase.co/functions/v1/alert-monitor
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ==================== CONFIGURATION ====================

// Usar las serverless functions de Vercel en lugar de llamar directamente a las APIs
// Esto evita problemas de CORS y bloqueos de las APIs
const VERCEL_APP_URL = 'https://magnex-torre.vercel.app';
const COLTRACK_API_URL = `${VERCEL_APP_URL}/api/coltrack`;
const FAGOR_API_URL = `${VERCEL_APP_URL}/api/fagor`;
const GEOTAB_API_URL = `${VERCEL_APP_URL}/api/geotab`;

const ALERT_THRESHOLDS = {
  SPEED_LIMIT: 80,
  IDLE_TIME_MINUTES: 10,
  LOW_FUEL: 15,
};

// Configuración de deduplicación (en minutos)
const DEDUPLICATION_WINDOWS = {
  // Infracciones continuas - ventana corta para evitar spam
  'Exceso de Velocidad': 15,      // 15 minutos
  'Frenada Brusca': 10,            // 10 minutos
  'Aceleración Brusca': 10,        // 10 minutos

  // Eventos críticos - ventana larga, son únicos
  'Botón de Pánico': 60,           // 1 hora
  'Colisión': 1440,                // 24 horas
};

const COLOMBIA_TIMEZONE_OFFSET = '-05:00';

function buildLocalIsoDate(
  year: number,
  month: number,
  day: number,
  hours: number,
  minutes: number,
  seconds: number
): string | null {
  const dateOnly = new Date(Date.UTC(year, month - 1, day));
  if (
    dateOnly.getUTCFullYear() !== year ||
    dateOnly.getUTCMonth() !== month - 1 ||
    dateOnly.getUTCDate() !== day
  ) {
    return null;
  }

  const parsed = new Date(
    `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` +
    `T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}` +
    COLOMBIA_TIMEZONE_OFFSET
  );

  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function parseDmyTimestamp(raw: string): string | null {
  const normalized = raw.replace(/\./g, '/').replace(/\s+/g, ' ');
  const dmy = normalized.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!dmy) return null;

  const [, d, m, y, hh = '0', mm = '0', ss = '0'] = dmy;
  const year = Number(y.length === 2 ? `20${y}` : y);
  return buildLocalIsoDate(year, Number(m), Number(d), Number(hh), Number(mm), Number(ss));
}

function parseYmdTimestamp(raw: string): string | null {
  const normalized = raw.replace(/\./g, '/').replace(/\s+/g, ' ');
  const ymd = normalized.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!ymd) return null;

  const [, y, m, d, hh = '0', mm = '0', ss = '0'] = ymd;
  return buildLocalIsoDate(Number(y), Number(m), Number(d), Number(hh), Number(mm), Number(ss));
}

function parseGpsTimestamp(...values: unknown[]): string {
  return parseGpsTimestampWithPreference(false, ...values);
}

function parseDayFirstGpsTimestamp(...values: unknown[]): string {
  return parseGpsTimestampWithPreference(true, ...values);
}

function parseGpsTimestampWithPreference(preferDayFirst: boolean, ...values: unknown[]): string {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const raw = String(value).trim();
    if (!raw) continue;

    if (preferDayFirst) {
      const dmyDate = parseDmyTimestamp(raw);
      if (dmyDate) return dmyDate;
    }

    const ymdDate = parseYmdTimestamp(raw);
    if (ymdDate) return ymdDate;

    const isoDate = new Date(raw);
    if (!Number.isNaN(isoDate.getTime())) return isoDate.toISOString();

    const dmyDate = parseDmyTimestamp(raw);
    if (dmyDate) return dmyDate;
  }

  return new Date().toISOString();
}

// ==================== TYPES ====================

interface Vehicle {
  id: string;
  plate: string;
  driver: string;
  speed: number;
  location: string;
  latitude: number;
  longitude: number;
  status: string;
  lastUpdate: string;
  source: string;
  contract?: string;
  event?: string;
}

interface Alert {
  alert_id: string;
  vehicle_id: string;
  plate: string;
  driver: string;
  type: string;
  severity: string;
  timestamp: string;
  location: string;
  speed: number;
  details: string;
  contract: string | null;
  source: string;
  status: string;
  saved_by: string;
}

// ==================== API CLIENTS ====================

async function fetchColtrackData(): Promise<Vehicle[]> {
  try {
    console.log('[Coltrack] Fetching data via Vercel serverless function...');

    const response = await fetch(COLTRACK_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
      throw new Error(`Coltrack serverless function error: ${response.status}`);
    }

    const result = await response.json();

    if (!result.success || !result.data) {
      throw new Error('Invalid response from Coltrack serverless function');
    }

    const vehicles: Vehicle[] = [];

    if (result.data && Array.isArray(result.data)) {
      for (const record of result.data) {
        vehicles.push({
          id: record.IMEI || record.imei || `coltrack-${record.PLACA || record.PATENTE}`,
          plate: record.PLACA || record.PATENTE || record.patente || 'DESCONOCIDO',
          driver: record.CONDUCTOR || record.Conductor || record.conductor || 'Sin asignar',
          speed: parseFloat(record.VELOCIDAD || record.Velocidad || record.velocidad || '0'),
          location: record.CIUDAD || record.Ciudad || record.DIRECCION || record.Ubicacion || 'Ubicación desconocida',
          latitude: parseFloat(record.LATITUD || record.Latitud || record.latitud || '0'),
          longitude: parseFloat(record.LONGITUD || record.Longitud || record.longitud || '0'),
          status: record.ESTADO || record.Estado || 'UNKNOWN',
          lastUpdate: parseGpsTimestamp(
            record.FECHA_GPS,
            record.FechaGps,
            record.FECHA,
            record.Fecha,
            record.HORA_REPORTE,
            record['Hora Reporte'],
            record.ULTIMA_POSICION,
            record.UltimaPosicion,
            record.lastUpdate,
          ),
          source: 'COLTRACK',
          contract: record.CONTRATO || record.Contrato || record.CLIENTE || record.Cliente || 'No asignado',
          event: record.EVENTO || record.Evento || ''
        });
      }
    }

    console.log(`[Coltrack] Fetched ${vehicles.length} vehicles`);
    return vehicles;
  } catch (error) {
    console.error('[Coltrack] Error:', error);
    return [];
  }
}

async function fetchFagorData(): Promise<Vehicle[]> {
  try {
    console.log('[Fagor] Fetching data via Vercel serverless function...');

    const response = await fetch(FAGOR_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
      throw new Error(`Fagor serverless function error: ${response.status}`);
    }

    const result = await response.json();

    if (!result.success || !result.data) {
      throw new Error('Invalid response from Fagor serverless function');
    }

    const vehicles: Vehicle[] = [];

    if (result.data && Array.isArray(result.data)) {
      for (const record of result.data) {
        const plate = record.Matricula || 'DESCONOCIDO';
        const speed = parseFloat(record.Velocidad || '0');
        const estadoText = record.Estado || record.EstadoUsuario || '';

        vehicles.push({
          id: `fagor-${plate}`,
          plate,
          driver: record.Conductor || 'Sin asignar',
          speed,
          location: record.Localidad || 'Ubicación desconocida',
          latitude: parseFloat(record.Latitud || '0'),
          longitude: parseFloat(record.Longitud || '0'),
          status: speed > 0 ? 'MOVING' : 'STOPPED',
          lastUpdate: parseDayFirstGpsTimestamp(
            record.UltimaPosicion,
            record.Ultima_Posicion,
            record.Fecha,
            record.FECHA,
            record.lastUpdate,
          ),
          source: 'FAGOR',
          contract: record.CONTRATO || record.Contrato || 'No asignado',
          event: estadoText
        });
      }
    }

    console.log(`[Fagor] Fetched ${vehicles.length} vehicles`);
    return vehicles;
  } catch (error) {
    console.error('[Fagor] Error:', error);
    return [];
  }
}

/**
 * Mapea el nombre de una regla de Geotab a (tipo, severidad) de nuestra app.
 * Geotab ya calcula estos eventos vía sus reglas configuradas, así que NO
 * adivinamos por texto como con Coltrack/Fagor: confiamos en ExceptionEvent.
 */
function mapGeotabRule(ruleName: string): { type: string; severity: string } | null {
  const n = (ruleName || '').toLowerCase();

  if (n.includes('exceso') && n.includes('velocidad')) return { type: 'Exceso de Velocidad', severity: 'critical' };
  if (n.includes('speeding')) return { type: 'Exceso de Velocidad', severity: 'critical' };
  if (n.includes('collision') || n.includes('colision') || n.includes('crash')) return { type: 'Colisión', severity: 'critical' };
  // Cubre "Hard Acceleration", "Harsh Acceleration (New)", etc.
  if (n.includes('acceleration') || n.includes('aceleraci')) return { type: 'Aceleración Brusca', severity: 'high' };
  // Cubre "Harsh Braking", "Harsh Braking (New)", "Hard Braking", "Frenada".
  if (n.includes('brak') || n.includes('frenada')) return { type: 'Frenada Brusca', severity: 'high' };
  if (n.includes('cornering') || n.includes('curva')) return { type: 'Conducción Brusca', severity: 'high' };
  if (n.includes('seat belt') || n.includes('cintur')) return { type: 'Cinturón de Seguridad', severity: 'medium' };
  if (n.includes('idle') || n.includes('idling') || n.includes('ralent')) return { type: 'Ralentí Excesivo', severity: 'medium' };

  // Reglas no mapeadas: las guardamos con su nombre original como tipo.
  if (ruleName) return { type: ruleName, severity: 'medium' };
  return null;
}

/**
 * Obtiene alertas de Geotab vía la función serverless de Vercel.
 * El proxy entrega ExceptionEvent ya enriquecidos con placa y nombre de regla.
 */
async function fetchGeotabAlerts(): Promise<Alert[]> {
  try {
    console.log('[Geotab] Fetching alerts via Vercel serverless function...');

    const response = await fetch(GEOTAB_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'alerts' })
    });

    if (!response.ok) {
      throw new Error(`Geotab serverless function error: ${response.status}`);
    }

    const result = await response.json();
    if (!result.success || !result.data) {
      throw new Error('Invalid response from Geotab serverless function');
    }

    const events: any[] = result.data.events || [];
    const alerts: Alert[] = [];

    for (const ev of events) {
      const mapped = mapGeotabRule(ev.ruleName);
      if (!mapped) continue;

      const timestamp = parseGpsTimestamp(ev.activeFrom);
      const speed = Math.round(Number(ev.speed) || 0);
      const details = speed > 0
        ? `Regla Geotab: ${ev.ruleName} — ${speed} km/h`
        : `Regla Geotab: ${ev.ruleName}`;

      alerts.push({
        // ev.id es único por evento -> idempotencia natural
        alert_id: `geotab-${ev.id}`,
        vehicle_id: `GEO-${ev.deviceId || ev.plate}`,
        plate: ev.plate || 'DESCONOCIDO',
        driver: 'Sin asignar',
        type: mapped.type,
        severity: mapped.severity,
        timestamp,
        location: 'Ver en Geotab',
        speed,
        details,
        contract: null,
        source: 'GEOTAB',
        status: 'pending',
        saved_by: 'Sistema (Auto)'
      });
    }

    console.log(`[Geotab] Mapped ${alerts.length} alerts from ${events.length} exception events`);
    return alerts;
  } catch (error) {
    console.error('[Geotab] Error:', error);
    return [];
  }
}

// ==================== ALERT DETECTION ====================

function detectAlerts(vehicle: Vehicle): Alert[] {
  const alerts: Alert[] = [];
  const eventUpper = (vehicle.event || '').toUpperCase();

  // 1. EXCESO DE VELOCIDAD (≥80 km/h)
  if (vehicle.speed >= ALERT_THRESHOLDS.SPEED_LIMIT) {
    alerts.push({
      alert_id: `${vehicle.id}-SPEED-${vehicle.lastUpdate}`,
      vehicle_id: vehicle.id,
      plate: vehicle.plate,
      driver: vehicle.driver,
      type: 'Exceso de Velocidad',
      severity: 'critical',
      timestamp: vehicle.lastUpdate,
      location: vehicle.location,
      speed: vehicle.speed,
      details: `Velocidad: ${vehicle.speed} km/h (Límite: ${ALERT_THRESHOLDS.SPEED_LIMIT} km/h)`,
      contract: vehicle.contract || null,
      source: vehicle.source,
      status: 'pending',
      saved_by: 'Sistema (Auto)'
    });
  }

  // 2. BOTÓN DE PÁNICO
  if (
    eventUpper.includes('PANICO') ||
    eventUpper.includes('PANIC') ||
    eventUpper.includes('SOS') ||
    eventUpper.includes('BOTON PANICO')
  ) {
    alerts.push({
      alert_id: `${vehicle.id}-PANIC-${vehicle.lastUpdate}`,
      vehicle_id: vehicle.id,
      plate: vehicle.plate,
      driver: vehicle.driver,
      type: 'Botón de Pánico',
      severity: 'critical',
      timestamp: vehicle.lastUpdate,
      location: vehicle.location,
      speed: vehicle.speed,
      details: 'Botón de pánico activado - Requiere atención inmediata',
      contract: vehicle.contract || null,
      source: vehicle.source,
      status: 'pending',
      saved_by: 'Sistema (Auto)'
    });
  }

  // 3. FRENADA BRUSCA
  if (
    eventUpper.includes('FRENADA BRUSCA') ||
    eventUpper.includes('FRENO BRUSCO') ||
    eventUpper.includes('HARSH BRAKE')
  ) {
    alerts.push({
      alert_id: `${vehicle.id}-BRAKE-${vehicle.lastUpdate}`,
      vehicle_id: vehicle.id,
      plate: vehicle.plate,
      driver: vehicle.driver,
      type: 'Frenada Brusca',
      severity: 'high',
      timestamp: vehicle.lastUpdate,
      location: vehicle.location,
      speed: vehicle.speed,
      details: 'Frenada brusca detectada - Revisar comportamiento del conductor',
      contract: vehicle.contract || null,
      source: vehicle.source,
      status: 'pending',
      saved_by: 'Sistema (Auto)'
    });
  }

  // 4. ACELERACIÓN BRUSCA
  if (
    eventUpper.includes('ACELERACION BRUSCA') ||
    eventUpper.includes('HARSH ACCELERATION')
  ) {
    alerts.push({
      alert_id: `${vehicle.id}-ACCEL-${vehicle.lastUpdate}`,
      vehicle_id: vehicle.id,
      plate: vehicle.plate,
      driver: vehicle.driver,
      type: 'Aceleración Brusca',
      severity: 'high',
      timestamp: vehicle.lastUpdate,
      location: vehicle.location,
      speed: vehicle.speed,
      details: 'Aceleración brusca detectada - Revisar comportamiento del conductor',
      contract: vehicle.contract || null,
      source: vehicle.source,
      status: 'pending',
      saved_by: 'Sistema (Auto)'
    });
  }

  // 5. COLISIÓN
  if (
    eventUpper.includes('COLISION') ||
    eventUpper.includes('COLLISION') ||
    eventUpper.includes('CRASH') ||
    eventUpper.includes('IMPACTO')
  ) {
    alerts.push({
      alert_id: `${vehicle.id}-COLLISION-${vehicle.lastUpdate}`,
      vehicle_id: vehicle.id,
      plate: vehicle.plate,
      driver: vehicle.driver,
      type: 'Colisión',
      severity: 'critical',
      timestamp: vehicle.lastUpdate,
      location: vehicle.location,
      speed: vehicle.speed,
      details: 'Posible colisión detectada - Verificar estado del vehículo',
      contract: vehicle.contract || null,
      source: vehicle.source,
      status: 'pending',
      saved_by: 'Sistema (Auto)'
    });
  }

  return alerts;
}

// ==================== DATABASE OPERATIONS ====================

/**
 * Sistema inteligente de detección de duplicados
 * Usa ventanas de tiempo según el tipo de alerta para evitar spam
 */
async function checkDuplicate(
  supabase: any,
  plate: string,
  timestamp: string,
  type: string
): Promise<{ isDuplicate: boolean; reason?: string }> {
  try {
    // Obtener la ventana de deduplicación para este tipo de alerta
    const windowMinutes = DEDUPLICATION_WINDOWS[type] || 15; // Default: 15 minutos

    // Calcular el rango de tiempo
    const alertTime = new Date(timestamp);
    const windowStart = new Date(alertTime.getTime() - windowMinutes * 60 * 1000);

    // Buscar alertas del mismo tipo y placa en la ventana de tiempo
    const { data, error, count } = await supabase
      .from('saved_alerts')
      .select('timestamp, details', { count: 'exact' })
      .eq('plate', plate)
      .eq('type', type)
      .gte('timestamp', windowStart.toISOString())
      .lte('timestamp', timestamp);

    if (error) {
      console.error('[DB] Error checking duplicate:', error);
      return { isDuplicate: false };
    }

    if ((count || 0) > 0) {
      const lastAlert = data?.[0];
      const timeDiff = Math.round((alertTime.getTime() - new Date(lastAlert.timestamp).getTime()) / 60000);

      console.log(`[Dedup] 🔄 Duplicate detected: ${plate} - ${type} (last alert ${timeDiff}min ago, window: ${windowMinutes}min)`);

      return {
        isDuplicate: true,
        reason: `Alert already exists within ${windowMinutes} minute window`
      };
    }

    return { isDuplicate: false };

  } catch (error) {
    console.error('[DB] Exception in checkDuplicate:', error);
    return { isDuplicate: false };
  }
}

/**
 * Validación adicional para eventos críticos
 * Eventos como pánico y colisión requieren validación estricta
 */
async function validateCriticalEvent(
  supabase: any,
  plate: string,
  type: string,
  timestamp: string
): Promise<{ isValid: boolean; reason?: string }> {
  // Solo validar eventos críticos
  const criticalEvents = ['Botón de Pánico', 'Colisión'];
  if (!criticalEvents.includes(type)) {
    return { isValid: true };
  }

  try {
    // Para eventos críticos, verificar en las últimas 24 horas
    const twentyFourHoursAgo = new Date(new Date(timestamp).getTime() - 24 * 60 * 60 * 1000);

    const { count, error } = await supabase
      .from('saved_alerts')
      .select('id', { count: 'exact', head: true })
      .eq('plate', plate)
      .eq('type', type)
      .gte('timestamp', twentyFourHoursAgo.toISOString());

    if (error) {
      console.error('[Validation] Error validating critical event:', error);
      return { isValid: true }; // En caso de error, permitir guardado
    }

    if ((count || 0) > 0) {
      console.log(`[Validation] ⚠️ Critical event already reported in last 24h: ${plate} - ${type}`);
      return {
        isValid: false,
        reason: 'Critical event already reported in last 24 hours'
      };
    }

    console.log(`[Validation] ✅ Critical event validated: ${plate} - ${type}`);
    return { isValid: true };

  } catch (error) {
    console.error('[Validation] Exception validating critical event:', error);
    return { isValid: true }; // En caso de error, permitir guardado
  }
}

/**
 * Limpieza automática de datos antiguos.
 * Se ejecuta 1 de cada 12 invocaciones (~cada hora si el cron corre cada 5 min).
 * Evita overflow de cuota sin necesitar pg_cron.
 */
async function runPeriodicCleanup(supabase: any): Promise<void> {
  // Solo correr ~1 vez por hora (1 de cada 12 ejecuciones de 5 min)
  if (Math.random() > 1/12) return;

  try {
    const sevenDaysAgo  = new Date(Date.now() - 7  * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [r1, r2, r3, r4, r5] = await Promise.all([
      supabase.from('saved_alerts').delete().eq('status', 'resolved').lt('created_at', sevenDaysAgo),
      supabase.from('saved_alerts').delete().in('status', ['pending', 'in_progress']).lt('created_at', thirtyDaysAgo),
      supabase.from('vehicle_ignition_events').delete().lt('created_at', thirtyDaysAgo),
      supabase.from('idle_time_records').delete().lt('created_at', thirtyDaysAgo),
      supabase.from('preoperational_inspections').delete().lt('created_at', thirtyDaysAgo),
    ]);

    console.log('[Cleanup] ✅ Periodic cleanup done');
    [r1, r2, r3, r4, r5].forEach((r, i) => {
      if (r.error) console.warn(`[Cleanup] Table ${i} error:`, r.error.message);
    });
  } catch (err) {
    console.warn('[Cleanup] Error during periodic cleanup:', err);
  }
}

async function saveAlert(supabase: any, alert: Alert): Promise<boolean> {
  try {
    // Insert alert (validaciones ya se hicieron en el loop principal)
    // Esto mantiene saveAlert como una función simple de guardado
    const { error } = await supabase
      .from('saved_alerts')
      .insert({
        alert_id: alert.alert_id,
        vehicle_id: alert.vehicle_id,
        plate: alert.plate,
        driver: alert.driver,
        type: alert.type,
        severity: alert.severity,
        timestamp: alert.timestamp,
        location: alert.location,
        speed: alert.speed,
        details: alert.details,
        contract: alert.contract,
        source: alert.source,
        status: alert.status,
        saved_by: alert.saved_by
      });

    if (error) {
      if (error.code === '23505' || String(error.message || '').toLowerCase().includes('duplicate key')) {
        console.log(`[DB] Duplicate ignored by unique index: ${alert.plate} - ${alert.type}`);
        return true;
      }
      console.error('[DB] Error saving alert:', error);
      return false;
    }

    console.log(`[DB] ✅ Alert saved: ${alert.plate} - ${alert.type}`);
    return true;
  } catch (error) {
    console.error('[DB] Exception saving alert:', error);
    return false;
  }
}

// ==================== MAIN WORKER FUNCTION ====================

serve(async (req) => {
  try {
    console.log('🚀 Alert Monitor Worker started');
    const startTime = Date.now();

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch data from APIs
    console.log('📡 Fetching fleet data...');
    const [coltrackVehicles, fagorVehicles, geotabAlerts] = await Promise.all([
      fetchColtrackData(),
      fetchFagorData(),
      fetchGeotabAlerts()
    ]);

    const allVehicles = [...coltrackVehicles, ...fagorVehicles];
    console.log(`📊 Total vehicles: ${allVehicles.length} (Coltrack: ${coltrackVehicles.length}, Fagor: ${fagorVehicles.length})`);

    // Detect alerts
    // - Coltrack/Fagor: por umbrales/texto (detectAlerts)
    // - Geotab: ExceptionEvent ya calculados por reglas (geotabAlerts)
    console.log('🔍 Detecting alerts...');
    const allAlerts: Alert[] = [];
    for (const vehicle of allVehicles) {
      const alerts = detectAlerts(vehicle);
      allAlerts.push(...alerts);
    }
    allAlerts.push(...geotabAlerts);

    console.log(`⚠️  Detected ${allAlerts.length} alerts (Geotab: ${geotabAlerts.length})`);

    // Save alerts to database with intelligent deduplication
    console.log('💾 Saving alerts to database...');
    let savedCount = 0;
    let duplicateCount = 0;
    let rejectedCount = 0;
    let errorCount = 0;

    for (const alert of allAlerts) {
      // Verificar duplicados antes de intentar guardar
      const duplicateCheck = await checkDuplicate(
        supabase,
        alert.plate,
        alert.timestamp,
        alert.type
      );

      if (duplicateCheck.isDuplicate) {
        duplicateCount++;
        continue;
      }

      // Verificar validación de eventos críticos
      const validationResult = await validateCriticalEvent(
        supabase,
        alert.plate,
        alert.type,
        alert.timestamp
      );

      if (!validationResult.isValid) {
        rejectedCount++;
        console.log(`[DB] 🚫 Critical event rejected: ${alert.plate} - ${alert.type}`);
        continue;
      }

      // Intentar guardar la alerta
      const success = await saveAlert(supabase, alert);
      if (success) {
        savedCount++;
      } else {
        errorCount++;
      }
    }

    const duration = Date.now() - startTime;

    const result = {
      success: true,
      timestamp: new Date().toISOString(),
      duration_ms: duration,
      vehicles: {
        total: allVehicles.length,
        coltrack: coltrackVehicles.length,
        fagor: fagorVehicles.length
      },
      alerts: {
        detected: allAlerts.length,
        saved: savedCount,
        duplicates: duplicateCount,
        rejected_critical: rejectedCount,
        errors: errorCount
      },
      deduplication: {
        enabled: true,
        windows: DEDUPLICATION_WINDOWS
      }
    };

    // Limpieza periódica en background (no bloquea la respuesta)
    runPeriodicCleanup(supabase).catch(() => {});

    console.log('✅ Worker completed successfully');
    console.log(JSON.stringify(result, null, 2));

    return new Response(
      JSON.stringify(result),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('❌ Worker error:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      }),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
