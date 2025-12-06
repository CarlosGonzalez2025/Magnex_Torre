/**
 * Configuración de políticas de retención de datos
 *
 * IMPORTANTE: Estas políticas ayudan a controlar el crecimiento de la base de datos
 * y evitar consumir el límite gratuito de Supabase (500 MB)
 */

export interface RetentionPolicy {
  /** Días que se mantienen los datos antes de ser eliminados */
  retentionDays: number;
  /** Límite máximo de registros permitidos */
  maxRecords: number;
  /** Si se debe archivar antes de eliminar (exportar a Excel) */
  archiveBeforeDelete: boolean;
}

export const DATA_RETENTION_CONFIG = {
  /** Alertas guardadas con estado 'resolved' (resueltas) */
  resolvedAlerts: {
    retentionDays: 7, // Eliminar después de 7 días
    maxRecords: 1000, // Máximo 1000 alertas resueltas
    archiveBeforeDelete: true // Exportar antes de eliminar
  } as RetentionPolicy,

  /** Alertas guardadas con estado 'pending' o 'in_progress' */
  activeAlerts: {
    retentionDays: 30, // Mantener 30 días
    maxRecords: 500, // Máximo 500 alertas activas
    archiveBeforeDelete: true
  } as RetentionPolicy,

  /** Inspecciones cargadas desde Excel */
  inspections: {
    retentionDays: 7, // Eliminar después de 7 días
    maxRecords: 5000, // Máximo 5000 inspecciones
    archiveBeforeDelete: true
  } as RetentionPolicy,

  /** Planes de acción completados */
  completedActionPlans: {
    retentionDays: 30, // Eliminar después de 30 días
    maxRecords: 2000,
    archiveBeforeDelete: false // No es necesario archivar
  } as RetentionPolicy,

  /** Configuración de limpieza automática */
  autoCleanup: {
    /** Si la limpieza automática está habilitada */
    enabled: true,
    /** Intervalo de días entre limpiezas automáticas */
    cleanupIntervalDays: 7, // Ejecutar cada 7 días
    /** Hora del día para ejecutar limpieza (0-23) */
    cleanupHour: 2, // 2 AM
    /** Ejecutar limpieza al iniciar la aplicación si no se ha ejecutado en el intervalo */
    runOnStartup: true
  },

  /** Límites de almacenamiento (estimados) */
  storageLimits: {
    /** Tamaño promedio de una alerta guardada (bytes) */
    avgAlertSize: 1024, // ~1 KB por alerta
    /** Tamaño promedio de una inspección (bytes) */
    avgInspectionSize: 512, // ~0.5 KB por inspección
    /** Tamaño promedio de un plan de acción (bytes) */
    avgActionPlanSize: 512, // ~0.5 KB por plan
    /** Límite máximo de base de datos (bytes) - Supabase free tier */
    maxDatabaseSize: 500 * 1024 * 1024, // 500 MB
    /** Umbral de advertencia (80% del límite) */
    warningThreshold: 0.8
  }
};

/**
 * Calcula el uso estimado de almacenamiento
 */
export function calculateEstimatedStorage(
  alertCount: number,
  inspectionCount: number,
  actionPlanCount: number
): {
  totalBytes: number;
  totalMB: number;
  percentageUsed: number;
  isNearLimit: boolean;
} {
  const { avgAlertSize, avgInspectionSize, avgActionPlanSize, maxDatabaseSize, warningThreshold } =
    DATA_RETENTION_CONFIG.storageLimits;

  const totalBytes =
    (alertCount * avgAlertSize) +
    (inspectionCount * avgInspectionSize) +
    (actionPlanCount * avgActionPlanSize);

  const totalMB = totalBytes / (1024 * 1024);
  const percentageUsed = (totalBytes / maxDatabaseSize) * 100;
  const isNearLimit = percentageUsed >= (warningThreshold * 100);

  return {
    totalBytes,
    totalMB: Math.round(totalMB * 100) / 100,
    percentageUsed: Math.round(percentageUsed * 100) / 100,
    isNearLimit
  };
}

/**
 * Obtiene la fecha límite para retención basada en la política
 */
export function getRetentionCutoffDate(retentionDays: number): Date {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);
  cutoff.setHours(0, 0, 0, 0); // Inicio del día
  return cutoff;
}

/**
 * Verifica si es hora de ejecutar la limpieza automática
 * Se ejecuta cada 7 días según la configuración
 */
export function shouldRunAutoCleanup(lastCleanupDate: Date | null): boolean {
  const { enabled, cleanupIntervalDays, cleanupHour } = DATA_RETENTION_CONFIG.autoCleanup;

  if (!enabled) return false;

  const now = new Date();
  const currentHour = now.getHours();

  // Si nunca se ha ejecutado, ejecutar
  if (!lastCleanupDate) return true;

  // Calcular días desde la última limpieza
  const daysSinceLastCleanup = (now.getTime() - lastCleanupDate.getTime()) / (1000 * 60 * 60 * 24);

  // Si han pasado los días configurados (por defecto 7 días), ejecutar
  if (daysSinceLastCleanup >= cleanupIntervalDays) {
    // Solo ejecutar si es la hora configurada o después
    return currentHour >= cleanupHour;
  }

  return false;
}
