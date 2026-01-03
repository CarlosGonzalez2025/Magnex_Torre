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
  saved?: boolean; // Si ya fue guardada en historial
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

// ==================== USER MANAGEMENT ====================

export enum UserRole {
  ADMIN = 'admin',
  USER = 'user'
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  last_login?: string;
  created_at: string;
  created_by?: string;
  updated_at: string;
  updated_by?: string;
}

export interface UserSession {
  id: string;
  user_id: string;
  token: string;
  expires_at: string;
  created_at: string;
  ip_address?: string;
  user_agent?: string;
}

export interface AuditLog {
  id: string;
  user_id?: string;
  action: string;
  resource_type?: string;
  resource_id?: string;
  details?: Record<string, any>;
  ip_address?: string;
  created_at: string;
}

// ==================== PERMISSIONS SYSTEM ====================

export enum Permission {
  // Usuarios
  USER_VIEW = 'user:view',
  USER_CREATE = 'user:create',
  USER_EDIT = 'user:edit',
  USER_DELETE = 'user:delete',

  // Alertas
  ALERT_VIEW = 'alert:view',
  ALERT_CREATE = 'alert:create',
  ALERT_EDIT = 'alert:edit',
  ALERT_DELETE = 'alert:delete',
  ALERT_EXPORT = 'alert:export',

  // Flota
  FLEET_VIEW = 'fleet:view',
  FLEET_EDIT = 'fleet:edit',

  // Auto-Guardadas
  SAVED_ALERTS_VIEW = 'saved_alerts:view',
  SAVED_ALERTS_EXPORT = 'saved_alerts:export',

  // Historial
  HISTORY_VIEW = 'history:view',
  HISTORY_CREATE = 'history:create',
  HISTORY_EDIT = 'history:edit',
  HISTORY_DELETE = 'history:delete',

  // Analytics
  ANALYTICS_VIEW = 'analytics:view',

  // Configuración
  CONFIG_VIEW = 'config:view',
  CONFIG_EDIT = 'config:edit',

  // Auditoría
  AUDIT_VIEW = 'audit:view',
}

// Mapeo de permisos por rol
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  [UserRole.ADMIN]: [
    // Admins tienen TODOS los permisos
    ...Object.values(Permission)
  ],
  [UserRole.USER]: [
    // Usuarios regulares: Solo lectura
    Permission.USER_VIEW,
    Permission.ALERT_VIEW,
    Permission.ALERT_EXPORT,
    Permission.FLEET_VIEW,
    Permission.SAVED_ALERTS_VIEW,
    Permission.SAVED_ALERTS_EXPORT,
    Permission.HISTORY_VIEW,
    Permission.ANALYTICS_VIEW,
  ]
};

/**
 * Verifica si un rol tiene un permiso específico
 * @param role Rol del usuario
 * @param permission Permiso a verificar
 * @returns true si el rol tiene el permiso
 */
export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/**
 * Verifica si un rol tiene TODOS los permisos especificados
 * @param role Rol del usuario
 * @param permissions Array de permisos a verificar
 * @returns true si el rol tiene todos los permisos
 */
export function hasAllPermissions(role: UserRole, permissions: Permission[]): boolean {
  return permissions.every(permission => hasPermission(role, permission));
}

/**
 * Verifica si un rol tiene ALGUNO de los permisos especificados
 * @param role Rol del usuario
 * @param permissions Array de permisos a verificar
 * @returns true si el rol tiene al menos uno de los permisos
 */
export function hasAnyPermission(role: UserRole, permissions: Permission[]): boolean {
  return permissions.some(permission => hasPermission(role, permission));
}
