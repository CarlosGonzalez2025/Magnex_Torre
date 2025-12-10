/**
 * Supabase Edge Function: Alert Monitor Worker
 *
 * Este worker se ejecuta cada 5 minutos de forma independiente (24/7)
 * sin necesidad de que haya usuarios conectados al frontend.
 *
 * Funciones:
 * 1. Consulta APIs de Coltrack y Fagor
 * 2. Detecta alertas automáticamente
 * 3. Guarda alertas en saved_alerts
 * 4. Procesa detección de ralentí y registros
 *
 * Trigger: Cron Job cada 5 minutos
 * Endpoint: https://[project-ref].supabase.co/functions/v1/alert-monitor
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ==================== CONFIGURATION ====================

const COLTRACK_API_URL = 'https://gps.coltrack.com/gps/api.jsp';
const COLTRACK_USER = 'WebSMagnex';
const COLTRACK_PASS = ']0zSKl549!9%';

const FAGOR_API_URL = 'https://www.flotasnet.com/servicios/EstadoVehiculo.asmx';
const FAGOR_USER = 'WebMasa2024';
const FAGOR_PASS = 'Weblog24*';

const ALERT_THRESHOLDS = {
  SPEED_LIMIT: 80,
  IDLE_TIME_MINUTES: 10,
  LOW_FUEL: 15,
};

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
    console.log('[Coltrack] Fetching data...');

    const response = await fetch(
      `${COLTRACK_API_URL}?user=${COLTRACK_USER}&pass=${COLTRACK_PASS}&consulta=LastPosition&json=1`,
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      }
    );

    if (!response.ok) {
      throw new Error(`Coltrack API error: ${response.status}`);
    }

    const data = await response.json();
    const vehicles: Vehicle[] = [];

    if (data && Array.isArray(data)) {
      for (const record of data) {
        vehicles.push({
          id: record.IMEI || record.imei || `coltrack-${record.PATENTE}`,
          plate: record.PATENTE || record.patente || 'DESCONOCIDO',
          driver: record.CONDUCTOR || record.conductor || 'Sin asignar',
          speed: parseFloat(record.VELOCIDAD || record.velocidad || '0'),
          location: record.DIRECCION || record.direccion || 'Ubicación desconocida',
          latitude: parseFloat(record.LATITUD || record.latitud || '0'),
          longitude: parseFloat(record.LONGITUD || record.longitud || '0'),
          status: record.ESTADO || 'UNKNOWN',
          lastUpdate: record.FECHA_GPS || new Date().toISOString(),
          source: 'COLTRACK',
          contract: record.CONTRATO || record.CLIENTE || 'No asignado',
          event: record.EVENTO || ''
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
    console.log('[Fagor] Fetching data...');

    const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <EstadoVehiculos xmlns="http://tempuri.org/">
      <Usuario>${FAGOR_USER}</Usuario>
      <Password>${FAGOR_PASS}</Password>
    </EstadoVehiculos>
  </soap:Body>
</soap:Envelope>`;

    const response = await fetch(FAGOR_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': 'http://tempuri.org/EstadoVehiculos'
      },
      body: soapBody
    });

    if (!response.ok) {
      throw new Error(`Fagor API error: ${response.status}`);
    }

    const xmlText = await response.text();
    const vehicles: Vehicle[] = [];

    // Parse XML simple (en producción usar un parser XML real)
    const vehicleMatches = xmlText.matchAll(/<Vehiculo>(.*?)<\/Vehiculo>/gs);

    for (const match of vehicleMatches) {
      const vehicleXml = match[1];

      const plate = vehicleXml.match(/<Patente>(.*?)<\/Patente>/)?.[1] || 'DESCONOCIDO';
      const driver = vehicleXml.match(/<Conductor>(.*?)<\/Conductor>/)?.[1] || 'Sin asignar';
      const speed = parseFloat(vehicleXml.match(/<Velocidad>(.*?)<\/Velocidad>/)?.[1] || '0');
      const location = vehicleXml.match(/<Ubicacion>(.*?)<\/Ubicacion>/)?.[1] || 'Ubicación desconocida';
      const latitude = parseFloat(vehicleXml.match(/<Latitud>(.*?)<\/Latitud>/)?.[1] || '0');
      const longitude = parseFloat(vehicleXml.match(/<Longitud>(.*?)<\/Longitud>/)?.[1] || '0');
      const event = vehicleXml.match(/<Evento>(.*?)<\/Evento>/)?.[1] || '';

      vehicles.push({
        id: `fagor-${plate}`,
        plate,
        driver,
        speed,
        location,
        latitude,
        longitude,
        status: speed > 0 ? 'MOVING' : 'STOPPED',
        lastUpdate: new Date().toISOString(),
        source: 'FAGOR',
        contract: 'No asignado',
        event
      });
    }

    console.log(`[Fagor] Fetched ${vehicles.length} vehicles`);
    return vehicles;
  } catch (error) {
    console.error('[Fagor] Error:', error);
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

async function checkDuplicate(
  supabase: any,
  plate: string,
  timestamp: string,
  type: string
): Promise<boolean> {
  const { count, error } = await supabase
    .from('saved_alerts')
    .select('id', { count: 'exact', head: true })
    .eq('plate', plate)
    .eq('timestamp', timestamp)
    .eq('type', type);

  if (error) {
    console.error('[DB] Error checking duplicate:', error);
    return false;
  }

  return (count || 0) > 0;
}

async function saveAlert(supabase: any, alert: Alert): Promise<boolean> {
  try {
    // Check duplicate
    const isDuplicate = await checkDuplicate(
      supabase,
      alert.plate,
      alert.timestamp,
      alert.type
    );

    if (isDuplicate) {
      console.log(`[DB] Duplicate alert skipped: ${alert.plate} - ${alert.type}`);
      return true;
    }

    // Insert alert
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
    const [coltrackVehicles, fagorVehicles] = await Promise.all([
      fetchColtrackData(),
      fetchFagorData()
    ]);

    const allVehicles = [...coltrackVehicles, ...fagorVehicles];
    console.log(`📊 Total vehicles: ${allVehicles.length} (Coltrack: ${coltrackVehicles.length}, Fagor: ${fagorVehicles.length})`);

    // Detect alerts
    console.log('🔍 Detecting alerts...');
    const allAlerts: Alert[] = [];
    for (const vehicle of allVehicles) {
      const alerts = detectAlerts(vehicle);
      allAlerts.push(...alerts);
    }

    console.log(`⚠️  Detected ${allAlerts.length} alerts`);

    // Save alerts to database
    console.log('💾 Saving alerts to database...');
    let savedCount = 0;
    let duplicateCount = 0;
    let errorCount = 0;

    for (const alert of allAlerts) {
      const isDuplicate = await checkDuplicate(
        supabase,
        alert.plate,
        alert.timestamp,
        alert.type
      );

      if (isDuplicate) {
        duplicateCount++;
        continue;
      }

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
        errors: errorCount
      }
    };

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
