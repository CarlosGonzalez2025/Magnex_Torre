import { Vehicle, Alert, AlertType, AlertSeverity, ApiSource } from '../types';

// Configuración de umbrales
const ALERT_THRESHOLDS = {
  SPEED_LIMIT: 80, // km/h
  IDLE_TIME_MINUTES: 10,
  LOW_FUEL: 15, // porcentaje
};

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
 */
function createAlert(
  vehicle: Vehicle,
  type: AlertType,
  severity: AlertSeverity,
  details: string
): Alert {
  const timestamp = new Date().toISOString();
  return {
    id: `${vehicle.id}-${type}-${timestamp}`,
    vehicleId: vehicle.id,
    plate: vehicle.plate,
    type,
    severity,
    timestamp,
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
