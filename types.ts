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
}

export interface FleetStats {
  totalVehicles: number;
  activeVehicles: number;
  stoppedVehicles: number;
  avgSpeed: number;
}

export type FilterType = 'ALL' | ApiSource;
export type StatusFilterType = 'ALL' | VehicleStatus;
