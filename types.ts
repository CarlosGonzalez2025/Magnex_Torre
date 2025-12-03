export enum ApiSource {
  FAGOR = 'FAGOR',
  COLTRACK = 'COLTRACK',
}

export enum VehicleStatus {
  MOVING = 'En Movimiento',
  STOPPED = 'Detenido',
  IDLE = 'Encendido', // Engine on but not moving
  OFF = 'Apagado'
}

export enum AlertType {
  SPEED_VIOLATION = 'Exceso de Velocidad',
  PANIC_BUTTON = 'Botón de Pánico',
  HARSH_BRAKING = 'Frenada Brusca',
  HARSH_ACCELERATION = 'Aceleración Brusca',
  GEOFENCE_EXIT = 'Salida de Geocerca',
  GEOFENCE_ENTRY = 'Entrada a Geocerca',
  ENGINE_OFF = 'Motor Apagado',
  BATTERY_DISCONNECT = 'Batería Desconectada',
  IDLE_EXCESSIVE = 'Ralentí Excesivo',
  GENERAL_ALERT = 'Alerta General'
}

export enum AlertSeverity {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low'
}

export interface Alert {
  id: string;
  vehicleId: string;
  plate: string;
  type: AlertType;
  severity: AlertSeverity;
  timestamp: string;
  location: string;
  latitude: number;
  longitude: number;
  speed: number;
  driver: string;
  source: ApiSource;
  contract?: string;
  details: string;
  sent?: boolean; // Si fue enviada por WhatsApp
  sentAt?: string; // Cuándo fue enviada
  sentBy?: string; // Quién la envió
}

export interface Vehicle {
  id: string;
  plate: string;
  source: ApiSource;
  latitude: number;
  longitude: number;
  speed: number;
  status: VehicleStatus;
  driver: string;
  fuelLevel: number;
  lastUpdate: string;
  location: string;
  odometer: number;
  contract?: string; // Contrato/Cliente asignado
  vehicleType?: string; // Tipo de vehículo (camión, van, etc.)
  event?: string; // Evento actual del vehículo
}

export interface FleetStats {
  totalVehicles: number;
  activeVehicles: number;
  stoppedVehicles: number;
  avgSpeed: number;
}

export type FilterType = 'ALL' | ApiSource;
export type StatusFilterType = 'ALL' | VehicleStatus;
export type AlertFilterType = 'ALL' | AlertSeverity;
