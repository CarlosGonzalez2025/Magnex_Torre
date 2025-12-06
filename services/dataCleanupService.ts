import { supabase } from './supabaseClient';
import { DATA_RETENTION_CONFIG, getRetentionCutoffDate } from '../config/dataRetentionConfig';
import * as XLSX from 'xlsx';

export interface CleanupResult {
  success: boolean;
  deletedAlerts: number;
  deletedInspections: number;
  deletedActionPlans: number;
  archivedFiles: string[];
  errors: string[];
}

/**
 * Servicio de limpieza de datos
 * Elimina registros antiguos según las políticas de retención
 */
export class DataCleanupService {
  /**
   * Ejecuta limpieza completa de la base de datos
   */
  static async runFullCleanup(archiveData: boolean = true): Promise<CleanupResult> {
    const result: CleanupResult = {
      success: true,
      deletedAlerts: 0,
      deletedInspections: 0,
      deletedActionPlans: 0,
      archivedFiles: [],
      errors: []
    };

    try {
      // 1. Limpiar alertas resueltas antiguas
      const resolvedResult = await this.cleanupResolvedAlerts(archiveData);
      result.deletedAlerts += resolvedResult.deleted;
      if (resolvedResult.archived) result.archivedFiles.push(resolvedResult.archived);
      if (resolvedResult.error) result.errors.push(resolvedResult.error);

      // 2. Limpiar alertas activas que excedan el límite
      const activeResult = await this.cleanupExcessAlerts();
      result.deletedAlerts += activeResult.deleted;
      if (activeResult.error) result.errors.push(activeResult.error);

      // 3. Limpiar inspecciones antiguas
      const inspectionResult = await this.cleanupInspections(archiveData);
      result.deletedInspections = inspectionResult.deleted;
      if (inspectionResult.archived) result.archivedFiles.push(inspectionResult.archived);
      if (inspectionResult.error) result.errors.push(inspectionResult.error);

      // 4. Limpiar planes de acción completados antiguos
      const actionPlanResult = await this.cleanupCompletedActionPlans();
      result.deletedActionPlans = actionPlanResult.deleted;
      if (actionPlanResult.error) result.errors.push(actionPlanResult.error);

      // 5. Guardar fecha de última limpieza
      localStorage.setItem('lastCleanupDate', new Date().toISOString());

      result.success = result.errors.length === 0;
    } catch (error) {
      result.success = false;
      result.errors.push(`Error en limpieza: ${error}`);
    }

    return result;
  }

  /**
   * Limpia alertas resueltas antiguas
   */
  private static async cleanupResolvedAlerts(archive: boolean): Promise<{ deleted: number; archived?: string; error?: string }> {
    try {
      const { retentionDays, archiveBeforeDelete } = DATA_RETENTION_CONFIG.resolvedAlerts;
      const cutoffDate = getRetentionCutoffDate(retentionDays);

      // Obtener alertas a eliminar
      const { data: alertsToDelete, error: fetchError } = await supabase
        .from('saved_alerts')
        .select('*')
        .eq('status', 'resolved')
        .lt('timestamp', cutoffDate.toISOString());

      if (fetchError) throw fetchError;
      if (!alertsToDelete || alertsToDelete.length === 0) {
        return { deleted: 0 };
      }

      // Archivar si está habilitado
      let archivedFile: string | undefined;
      if (archive && archiveBeforeDelete) {
        archivedFile = await this.archiveToExcel(
          alertsToDelete,
          `Alertas_Resueltas_Archivo_${new Date().toISOString().split('T')[0]}`
        );
      }

      // Eliminar alertas
      const { error: deleteError } = await supabase
        .from('saved_alerts')
        .delete()
        .eq('status', 'resolved')
        .lt('timestamp', cutoffDate.toISOString());

      if (deleteError) throw deleteError;

      return {
        deleted: alertsToDelete.length,
        archived: archivedFile
      };
    } catch (error) {
      return {
        deleted: 0,
        error: `Error al limpiar alertas resueltas: ${error}`
      };
    }
  }

  /**
   * Limpia alertas activas que excedan el límite máximo
   */
  private static async cleanupExcessAlerts(): Promise<{ deleted: number; error?: string }> {
    try {
      const { maxRecords } = DATA_RETENTION_CONFIG.activeAlerts;

      // Contar alertas activas
      const { count, error: countError } = await supabase
        .from('saved_alerts')
        .select('*', { count: 'exact', head: true })
        .in('status', ['pending', 'in_progress']);

      if (countError) throw countError;
      if (!count || count <= maxRecords) {
        return { deleted: 0 };
      }

      // Calcular cuántas eliminar
      const toDelete = count - maxRecords;

      // Obtener las más antiguas
      const { data: oldestAlerts, error: fetchError } = await supabase
        .from('saved_alerts')
        .select('id')
        .in('status', ['pending', 'in_progress'])
        .order('timestamp', { ascending: true })
        .limit(toDelete);

      if (fetchError) throw fetchError;
      if (!oldestAlerts || oldestAlerts.length === 0) {
        return { deleted: 0 };
      }

      // Eliminar las más antiguas
      const idsToDelete = oldestAlerts.map(a => a.id);
      const { error: deleteError } = await supabase
        .from('saved_alerts')
        .delete()
        .in('id', idsToDelete);

      if (deleteError) throw deleteError;

      return { deleted: oldestAlerts.length };
    } catch (error) {
      return {
        deleted: 0,
        error: `Error al limpiar alertas excedentes: ${error}`
      };
    }
  }

  /**
   * Limpia inspecciones antiguas
   */
  private static async cleanupInspections(archive: boolean): Promise<{ deleted: number; archived?: string; error?: string }> {
    try {
      const { retentionDays, archiveBeforeDelete } = DATA_RETENTION_CONFIG.inspections;
      const cutoffDate = getRetentionCutoffDate(retentionDays);

      // Obtener inspecciones a eliminar
      const { data: inspectionsToDelete, error: fetchError } = await supabase
        .from('inspections')
        .select('*')
        .lt('fecha', cutoffDate.toISOString());

      if (fetchError) throw fetchError;
      if (!inspectionsToDelete || inspectionsToDelete.length === 0) {
        return { deleted: 0 };
      }

      // Archivar si está habilitado
      let archivedFile: string | undefined;
      if (archive && archiveBeforeDelete) {
        archivedFile = await this.archiveToExcel(
          inspectionsToDelete,
          `Inspecciones_Archivo_${new Date().toISOString().split('T')[0]}`
        );
      }

      // Eliminar inspecciones
      const { error: deleteError } = await supabase
        .from('inspections')
        .delete()
        .lt('fecha', cutoffDate.toISOString());

      if (deleteError) throw deleteError;

      return {
        deleted: inspectionsToDelete.length,
        archived: archivedFile
      };
    } catch (error) {
      return {
        deleted: 0,
        error: `Error al limpiar inspecciones: ${error}`
      };
    }
  }

  /**
   * Limpia planes de acción completados antiguos
   */
  private static async cleanupCompletedActionPlans(): Promise<{ deleted: number; error?: string }> {
    try {
      const { retentionDays } = DATA_RETENTION_CONFIG.completedActionPlans;
      const cutoffDate = getRetentionCutoffDate(retentionDays);

      // Eliminar planes completados antiguos
      const { data, error } = await supabase
        .from('action_plans')
        .delete()
        .eq('status', 'completed')
        .lt('created_at', cutoffDate.toISOString())
        .select();

      if (error) throw error;

      return { deleted: data?.length || 0 };
    } catch (error) {
      return {
        deleted: 0,
        error: `Error al limpiar planes de acción: ${error}`
      };
    }
  }

  /**
   * Archiva datos a Excel antes de eliminar
   */
  private static async archiveToExcel(data: any[], filename: string): Promise<string> {
    try {
      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Datos Archivados');

      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([excelBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${filename}.xlsx`;
      link.click();
      window.URL.revokeObjectURL(url);

      return `${filename}.xlsx`;
    } catch (error) {
      console.error('Error al archivar datos:', error);
      throw error;
    }
  }

  /**
   * Verifica si un registro ya existe (evitar duplicados)
   * Soporta: saved_alerts, alert_history, inspections
   */
  static async checkDuplicate(
    table: 'saved_alerts' | 'alert_history' | 'inspections',
    uniqueFields: Record<string, any>
  ): Promise<boolean> {
    try {
      let query = supabase.from(table).select('id', { count: 'exact', head: true });

      Object.entries(uniqueFields).forEach(([key, value]) => {
        query = query.eq(key, value);
      });

      const { count, error } = await query;

      if (error) throw error;

      return (count || 0) > 0;
    } catch (error) {
      console.error('Error al verificar duplicados:', error);
      return false;
    }
  }

  /**
   * Obtiene estadísticas de uso de la base de datos
   */
  static async getDatabaseStats(): Promise<{
    alertCount: number;
    inspectionCount: number;
    actionPlanCount: number;
    estimatedSizeMB: number;
    percentageUsed: number;
  }> {
    try {
      // Contar alertas
      const { count: alertCount } = await supabase
        .from('saved_alerts')
        .select('*', { count: 'exact', head: true });

      // Contar inspecciones
      const { count: inspectionCount } = await supabase
        .from('inspections')
        .select('*', { count: 'exact', head: true });

      // Contar planes de acción
      const { count: actionPlanCount } = await supabase
        .from('action_plans')
        .select('*', { count: 'exact', head: true });

      // Calcular tamaño estimado
      const { avgAlertSize, avgInspectionSize, avgActionPlanSize, maxDatabaseSize } =
        DATA_RETENTION_CONFIG.storageLimits;

      const totalBytes =
        ((alertCount || 0) * avgAlertSize) +
        ((inspectionCount || 0) * avgInspectionSize) +
        ((actionPlanCount || 0) * avgActionPlanSize);

      const estimatedSizeMB = totalBytes / (1024 * 1024);
      const percentageUsed = (totalBytes / maxDatabaseSize) * 100;

      return {
        alertCount: alertCount || 0,
        inspectionCount: inspectionCount || 0,
        actionPlanCount: actionPlanCount || 0,
        estimatedSizeMB: Math.round(estimatedSizeMB * 100) / 100,
        percentageUsed: Math.round(percentageUsed * 100) / 100
      };
    } catch (error) {
      console.error('Error al obtener estadísticas:', error);
      return {
        alertCount: 0,
        inspectionCount: 0,
        actionPlanCount: 0,
        estimatedSizeMB: 0,
        percentageUsed: 0
      };
    }
  }
}
