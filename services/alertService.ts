import { Vehicle, Alert, AlertType, AlertSeverity, ApiSource } from '../types';
import { saveIdleTimeRecord, saveIgnitionEvent } from './towerControlService';

// Configuración de umbrales
const ALERT_THRESHOLDS = {
  SPEED_LIMIT: 80, // km/h
  IDLE_TIME_MINUTES: 10,
  LOW_FUEL: 15, // porcentaje
};

// =====================================================
// VEHICLE STATE TRACKING FOR IDLE DETECTION
// =====================================================

interface VehicleState {
  plate: string;
  speed: number;
  ignition: boolean;
  timestamp: string;
  location?: string;
  latitude?: number;
  longitude?: number;
  driver?: string;
  contract?: string;
  source?: string;
}

interface IdleState {
  plate: string;
  startTime: string;
  startLocation?: string;
  startLatitude?: number;
  startLongitude?: number;
  driver?: string;
  contract?: string;
  source?: string;
}

// Map para rastrear estados de vehículos
const vehicleStates = new Map<string, VehicleState>();

// Map para rastrear vehículos en ralentí
const idleStates = new Map<string, IdleState>();

/**
 * Detecta alertas basándose en los datos del vehículo
 */
export function detectAlerts(vehicle: Vehicle): Alert[] {
  const alerts: Alert[] = [];
  const eventUpper = (vehicle.event || '').toUpperCase();

  // 1. EXCESO DE VELOCIDAD (≥80 km/h) - CRÍTICO
  if (vehicle.speed >= ALERT_THRESHOLDS.SPEED_LIMIT) {
    alerts.push(createAlert(
      vehicle,
      AlertType.SPEED_VIOLATION,
      AlertSeverity.CRITICAL,
      `Velocidad: ${vehicle.speed} km/h (Límite: ${ALERT_THRESHOLDS.SPEED_LIMIT} km/h)`
    ));
  }

  // 2. BOTÓN DE PÁNICO
  if (
    eventUpper.includes('PANICO') ||
    eventUpper.includes('PANIC') ||
    eventUpper.includes('SOS') ||
    eventUpper.includes('BOTON PANICO')
  ) {
    alerts.push(createAlert(
      vehicle,
      AlertType.PANIC_BUTTON,
      AlertSeverity.CRITICAL,
      'Botón de pánico activado - Requiere atención inmediata'
    ));
  }

  // 3. FRENADA BRUSCA
  if (
    eventUpper.includes('FRENADA BRUSCA') ||
    eventUpper.includes('FRENO BRUSCO') ||
    eventUpper.includes('HARSH BRAKE')
  ) {
    alerts.push(createAlert(
      vehicle,
      AlertType.HARSH_BRAKING,
      AlertSeverity.MEDIUM,
      'Frenada brusca detectada'
    ));
  }

  // 4. ACELERACIÓN BRUSCA
  if (
    eventUpper.includes('SOBRE ACELERACION') ||
    eventUpper.includes('ACELERACION BRUSCA') ||
    eventUpper.includes('HARSH ACCELERATION')
  ) {
    alerts.push(createAlert(
      vehicle,
      AlertType.HARSH_ACCELERATION,
      AlertSeverity.MEDIUM,
      'Aceleración brusca detectada'
    ));
  }

  // 5. SALIDA/ENTRADA DE GEOCERCA
  if (
    eventUpper.includes('GEOCERCA') ||
    eventUpper.includes('GEOFENCE') ||
    eventUpper.includes('SALIDA DE ZONA') ||
    eventUpper.includes('FUERA DE ZONA')
  ) {
    const isExit = eventUpper.includes('SALIDA') || eventUpper.includes('EXIT') || eventUpper.includes('FUERA');
    alerts.push(createAlert(
      vehicle,
      isExit ? AlertType.GEOFENCE_EXIT : AlertType.GEOFENCE_ENTRY,
      AlertSeverity.HIGH,
      `Vehículo ${isExit ? 'salió de' : 'entró a'} zona permitida`
    ));
  }

  // 6. BATERÍA DESCONECTADA
  if (
    eventUpper.includes('BATERIA DESCONECTADA') ||
    eventUpper.includes('BATTERY DISCONNECT') ||
    eventUpper.includes('DESCONEXION')
  ) {
    alerts.push(createAlert(
      vehicle,
      AlertType.BATTERY_DISCONNECT,
      AlertSeverity.CRITICAL,
      'Batería desconectada - Posible manipulación'
    ));
  }

  // 7. RALENTÍ EXCESIVO
  if (
    eventUpper.includes('RALENTI') ||
    eventUpper.includes('IDLE') ||
    eventUpper.includes('ALERTA RALENTI')
  ) {
    alerts.push(createAlert(
      vehicle,
      AlertType.IDLE_EXCESSIVE,
      AlertSeverity.LOW,
      'Ralentí excesivo detectado'
    ));
  }

  // 8. ALERTAS GENERALES DE COLTRACK
  if (vehicle.source === ApiSource.COLTRACK && eventUpper.includes('INFRACCION')) {
    alerts.push(createAlert(
      vehicle,
      AlertType.GENERAL_ALERT,
      AlertSeverity.MEDIUM,
      vehicle.event || 'Infracción detectada'
    ));
  }

  // 9. ALERTAS GENERALES DE FAGOR
  if (vehicle.source === ApiSource.FAGOR) {
    if (eventUpper.includes('EXCESO')) {
      // Ya manejado por velocidad, pero podría ser otro tipo de exceso
      if (!alerts.some(a => a.type === AlertType.SPEED_VIOLATION)) {
        alerts.push(createAlert(
          vehicle,
          AlertType.GENERAL_ALERT,
          AlertSeverity.MEDIUM,
          vehicle.event || 'Exceso detectado'
        ));
      }
    }
    if (eventUpper.includes('ALERTA') || eventUpper.includes('EMERGENCIA')) {
      alerts.push(createAlert(
        vehicle,
        AlertType.GENERAL_ALERT,
        AlertSeverity.HIGH,
        vehicle.event || 'Alerta general'
      ));
    }
  }

  return alerts;
}

/**
 * Crea un objeto de alerta
 * IMPORTANTE: Usa vehicle.lastUpdate como timestamp para mantener la hora real del evento
 * y evitar que las alertas cambien de hora con cada actualización del sistema
 */
function createAlert(
  vehicle: Vehicle,
  type: AlertType,
  severity: AlertSeverity,
  details: string
): Alert {
  // Usar el timestamp del vehículo (hora del evento) en lugar de la hora actual
  // Esto garantiza que el historial refleje la hora REAL del evento
  const timestamp = vehicle.lastUpdate;

  return {
    id: `${vehicle.id}-${type}-${timestamp}`,
    vehicleId: vehicle.id,
    plate: vehicle.plate,
    type,
    severity,
    timestamp, // Timestamp del evento del vehículo, NO de la detección
    location: vehicle.location,
    latitude: vehicle.latitude,
    longitude: vehicle.longitude,
    speed: vehicle.speed,
    driver: vehicle.driver,
    source: vehicle.source,
    contract: vehicle.contract,
    details,
    sent: false
  };
}

/**
 * Guarda alertas en localStorage
 */
export function saveAlertsToStorage(alerts: Alert[]): void {
  try {
    const existing = getAlertsFromStorage();
    const combined = [...alerts, ...existing];

    // Mantener solo las últimas 500 alertas
    const limited = combined.slice(0, 500);

    localStorage.setItem('fleet_alerts', JSON.stringify(limited));
  } catch (error) {
    console.error('Error saving alerts to storage:', error);
  }
}

/**
 * Obtiene alertas desde localStorage
 */
export function getAlertsFromStorage(): Alert[] {
  try {
    const stored = localStorage.getItem('fleet_alerts');
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Error loading alerts from storage:', error);
    return [];
  }
}

/**
 * Marca una alerta como enviada
 */
export function markAlertAsSent(alertId: string, sentBy: string): void {
  try {
    const alerts = getAlertsFromStorage();
    const updated = alerts.map(alert =>
      alert.id === alertId
        ? { ...alert, sent: true, sentAt: new Date().toISOString(), sentBy }
        : alert
    );
    localStorage.setItem('fleet_alerts', JSON.stringify(updated));
  } catch (error) {
    console.error('Error marking alert as sent:', error);
  }
}

/**
 * Marca una alerta como guardada en la base de datos
 */
export function markAlertAsSaved(alertId: string): void {
  try {
    const alerts = getAlertsFromStorage();
    const updated = alerts.map(alert =>
      alert.id === alertId
        ? { ...alert, savedToDatabase: true, savedAt: new Date().toISOString() }
        : alert
    );
    localStorage.setItem('fleet_alerts', JSON.stringify(updated));
  } catch (error) {
    console.error('Error marking alert as saved:', error);
  }
}

/**
 * Obtiene solo alertas NO guardadas en la base de datos
 * Estas son las alertas activas que el usuario aún debe gestionar
 */
export function getUnsavedAlerts(): Alert[] {
  try {
    const allAlerts = getAlertsFromStorage();
    return allAlerts.filter(alert => !(alert as any).savedToDatabase);
  } catch (error) {
    console.error('Error getting unsaved alerts:', error);
    return [];
  }
}

/**
 * Limpia alertas antiguas del caché
 * Por defecto: 24 horas para alertas NO guardadas
 * Las alertas guardadas se eliminan del caché inmediatamente
 */
export function cleanOldAlerts(retentionHours: number = 24): void {
  try {
    const alerts = getAlertsFromStorage();
    const cutoffTime = new Date();
    cutoffTime.setHours(cutoffTime.getHours() - retentionHours);

    const filtered = alerts.filter(alert => {
      // Eliminar alertas guardadas en DB (ya están en historial)
      if ((alert as any).savedToDatabase) {
        return false;
      }

      // Mantener alertas recientes
      return new Date(alert.timestamp) > cutoffTime;
    });

    localStorage.setItem('fleet_alerts', JSON.stringify(filtered));
  } catch (error) {
    console.error('Error cleaning old alerts:', error);
  }
}

// =====================================================
// IDLE TIME DETECTION AND IGNITION TRACKING
// =====================================================

/**
 * Determina si la ignición está encendida basado en datos del vehículo
 */
function isIgnitionOn(vehicle: Vehicle): boolean {
  const eventUpper = (vehicle.event || '').toUpperCase();

  // Lógica específica por fuente
  if (vehicle.source === ApiSource.COLTRACK) {
    // Si tiene campo IGNICION
    const ignitionField = (vehicle as any).IGNICION || (vehicle as any).ignicion;
    if (ignitionField !== undefined) {
      return ignitionField === 'ON' || ignitionField === '1' || ignitionField === 1 || ignitionField === true;
    }
  }

  if (vehicle.source === ApiSource.FAGOR) {
    // Fagor puede tener campo ignition o similar
    const ignitionField = (vehicle as any).ignition || (vehicle as any).IGNITION;
    if (ignitionField !== undefined) {
      return ignitionField === 'ON' || ignitionField === '1' || ignitionField === 1 || ignitionField === true;
    }
  }

  // Fallback: Si el vehículo se está moviendo o tiene velocidad > 0, asumimos que está encendido
  if (vehicle.speed > 0) {
    return true;
  }

  // Si tiene evento de ignición ON
  if (eventUpper.includes('IGNICION ON') || eventUpper.includes('IGNITION ON') || eventUpper.includes('MOTOR ENCENDIDO')) {
    return true;
  }

  // Si está detenido pero tuvo actualización reciente (últimos 5 minutos), probablemente está encendido
  if (vehicle.lastUpdate) {
    const lastUpdateTime = new Date(vehicle.lastUpdate).getTime();
    const now = new Date().getTime();
    const minutesSinceUpdate = (now - lastUpdateTime) / (1000 * 60);

    if (minutesSinceUpdate < 5) {
      return true; // Asumimos que está encendido si reportó hace menos de 5 minutos
    }
  }

  return false;
}

/**
 * Procesa un vehículo para detectar ralentí e ignición
 * Debe llamarse cada vez que se recibe datos actualizados del vehículo
 */
export async function processVehicleForIdleDetection(vehicle: Vehicle): Promise<void> {
  try {
    const currentIgnition = isIgnitionOn(vehicle);
    const currentSpeed = vehicle.speed || 0;
    const currentTime = new Date().toISOString();

    // Obtener estado anterior del vehículo
    const previousState = vehicleStates.get(vehicle.plate);

    // Detectar cambio de ignición y guardar evento
    if (previousState && previousState.ignition !== currentIgnition) {
      await saveIgnitionEvent({
        plate: vehicle.plate,
        driver: vehicle.driver,
        event_type: currentIgnition ? 'ignition_on' : 'ignition_off',
        event_datetime: currentTime,
        location: vehicle.location,
        latitude: vehicle.latitude,
        longitude: vehicle.longitude,
        source: vehicle.source
      });
    }

    // DETECCIÓN DE RALENTÍ
    if (currentSpeed === 0 && currentIgnition) {
      // El vehículo está detenido con motor encendido (ralentí)

      if (!idleStates.has(vehicle.plate)) {
        // INICIO de ralentí
        idleStates.set(vehicle.plate, {
          plate: vehicle.plate,
          startTime: currentTime,
          startLocation: vehicle.location,
          startLatitude: vehicle.latitude,
          startLongitude: vehicle.longitude,
          driver: vehicle.driver,
          contract: vehicle.contract,
          source: vehicle.source
        });

        console.log(`[Idle Detection] Vehículo ${vehicle.plate} entró en ralentí`);
      } else {
        // El vehículo CONTINÚA en ralentí - calcular duración
        const idleState = idleStates.get(vehicle.plate)!;
        const startTime = new Date(idleState.startTime).getTime();
        const now = new Date(currentTime).getTime();
        const durationMinutes = (now - startTime) / (1000 * 60);

        // Si supera el umbral, se podría generar alerta (pero esto ya lo hace detectAlerts)
        if (durationMinutes >= ALERT_THRESHOLDS.IDLE_TIME_MINUTES) {
          console.log(`[Idle Detection] Vehículo ${vehicle.plate} lleva ${Math.round(durationMinutes)} minutos en ralentí`);
        }
      }
    } else {
      // El vehículo NO está en ralentí (velocidad > 0 o ignición apagada)

      if (idleStates.has(vehicle.plate)) {
        // FIN de ralentí - guardar registro
        const idleState = idleStates.get(vehicle.plate)!;
        const startTime = new Date(idleState.startTime).getTime();
        const endTime = new Date(currentTime).getTime();
        const durationMinutes = (endTime - startTime) / (1000 * 60);

        // Solo guardar si duró al menos 1 minuto
        if (durationMinutes >= 1) {
          await saveIdleTimeRecord({
            plate: vehicle.plate,
            driver: idleState.driver,
            contract: idleState.contract,
            start_datetime: idleState.startTime,
            end_datetime: currentTime,
            duration_minutes: Math.round(durationMinutes * 100) / 100,
            location: idleState.startLocation,
            latitude: idleState.startLatitude,
            longitude: idleState.startLongitude,
            source: idleState.source
          });

          console.log(`[Idle Detection] Ralentí finalizado para ${vehicle.plate}: ${Math.round(durationMinutes)} minutos`);
        }

        // Limpiar estado de ralentí
        idleStates.delete(vehicle.plate);
      }
    }

    // Actualizar estado del vehículo
    vehicleStates.set(vehicle.plate, {
      plate: vehicle.plate,
      speed: currentSpeed,
      ignition: currentIgnition,
      timestamp: currentTime,
      location: vehicle.location,
      latitude: vehicle.latitude,
      longitude: vehicle.longitude,
      driver: vehicle.driver,
      contract: vehicle.contract,
      source: vehicle.source
    });

  } catch (error) {
    console.error(`[Idle Detection] Error processing vehicle ${vehicle.plate}:`, error);
  }
}

/**
 * Procesa todos los vehículos para detectar ralentí
 */
export async function processVehiclesForIdleDetection(vehicles: Vehicle[]): Promise<void> {
  try {
    // Procesar en paralelo
    await Promise.all(vehicles.map(vehicle => processVehicleForIdleDetection(vehicle)));
  } catch (error) {
    console.error('[Idle Detection] Error processing vehicles:', error);
  }
}

/**
 * Obtiene estadísticas de ralentí de vehículos actualmente en idle
 */
export function getCurrentIdleStats(): Array<{ plate: string; durationMinutes: number; driver?: string; location?: string }> {
  const stats: Array<{ plate: string; durationMinutes: number; driver?: string; location?: string }> = [];

  const now = new Date().getTime();

  idleStates.forEach((idleState, plate) => {
    const startTime = new Date(idleState.startTime).getTime();
    const durationMinutes = (now - startTime) / (1000 * 60);

    stats.push({
      plate,
      durationMinutes: Math.round(durationMinutes * 100) / 100,
      driver: idleState.driver,
      location: idleState.startLocation
    });
  });

  return stats.sort((a, b) => b.durationMinutes - a.durationMinutes);
}
