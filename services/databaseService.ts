import { Alert } from '../types';
import { DataCleanupService } from './dataCleanupService';
import { supabase, isSupabaseAvailable, markSupabaseUnavailable, isQuotaError } from './supabaseClient';

// ==================== TYPES ====================

export interface SavedAlert {
  id: string;
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
  contract?: string;
  source: string;
  status: 'pending' | 'in_progress' | 'resolved' | 'invalid';
  saved_at: string;
  saved_by: string;
  created_at: string;
  updated_at: string;
  moved_to_history?: boolean;
  moved_at?: string;
  moved_by?: string;
}

export interface FileAttachment {
  name: string;
  url: string;
  type: string;
  size: number;
  uploaded_at: string;
}

export interface ActionPlan {
  id: string;
  alert_history_id: string;
  description: string;
  responsible: string;
  status: 'pending' | 'in_progress' | 'completed';
  observations?: string;
  attachments?: FileAttachment[];
  created_at: string;
  updated_at: string;
  created_by: string;
}

export interface SavedAlertWithPlans extends SavedAlert {
  action_plans: ActionPlan[];
}

// ==================== SAVED_ALERTS FUNCTIONS (Guardado Automático) ====================

/**
 * Guarda una alerta AUTOMÁTICAMENTE en saved_alerts
 * Esta tabla almacena TODAS las alertas detectadas para análisis y reportes
 * Las alertas se limpian automáticamente cada 7-30 días
 */
export async function autoSaveAlert(alert: Alert): Promise<{ success: boolean; data?: SavedAlert; error?: string }> {
  if (!isSupabaseAvailable()) return { success: false, error: 'Supabase no disponible' };
  try {
    // Verificar duplicados en saved_alerts
    const isDuplicate = await DataCleanupService.checkDuplicate('saved_alerts', {
      plate: alert.plate,
      timestamp: alert.timestamp,
      type: alert.type
    });

    if (isDuplicate) {
      // No es error, simplemente ya existe
      return { success: true };
    }

    const alertData = {
      alert_id: alert.id,
      vehicle_id: alert.vehicleId,
      plate: alert.plate,
      driver: alert.driver,
      type: alert.type,
      severity: alert.severity,
      timestamp: alert.timestamp,
      location: alert.location,
      speed: alert.speed,
      details: alert.details,
      contract: alert.contract || null,
      source: alert.source,
      status: 'pending' as const,
      saved_by: 'Sistema (Auto)'
    };

    // 🔍 LOG DE DIAGNÓSTICO: Verificar datos de alertas críticas
    if (alert.severity === 'critical') {
      console.log('🚨 [DIAGNÓSTICO] Guardando alerta CRÍTICA:', {
        plate: alert.plate,
        type: alert.type,
        severity: alert.severity,
        timestamp: alert.timestamp,
        details: alert.details
      });
    }

    const { data, error } = await supabase
      .from('saved_alerts')
      .insert(alertData)
      .select()
      .single();

    if (error) {
      if ((error as any).code === '23505' || error.message.toLowerCase().includes('duplicate key')) {
        return { success: true };
      }
      if (isQuotaError(error.message)) {
        markSupabaseUnavailable();
        return { success: false, error: 'Supabase restringido' };
      }
      console.error('❌ Error auto-saving alert to saved_alerts:', error);
      return { success: false, error: error.message };
    }

    if (alert.severity === 'critical') {
      console.log('✅ [DIAGNÓSTICO] Alerta CRÍTICA guardada exitosamente:', data);
    }

    return { success: true, data };
  } catch (error: any) {
    console.error('Exception auto-saving alert:', error);
    if (alert.severity === 'critical') {
      console.error('🚨 [DIAGNÓSTICO] EXCEPCIÓN al guardar alerta CRÍTICA:', error);
    }
    return { success: false, error: error.message || 'Error desconocido' };
  }
}

/**
 * Obtener todas las alertas guardadas automáticamente de saved_alerts
 */
export async function getAllAutoSavedAlerts(): Promise<{ success: boolean; data?: SavedAlert[]; error?: string }> {
  try {
    // 🔧 SOLUCIÓN: Obtener TODOS los registros usando paginación automática
    // Supabase tiene límite de 1000 por defecto, así que hacemos múltiples consultas
    let allData: SavedAlert[] = [];
    let from = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('saved_alerts')
        .select('*')
        .order('timestamp', { ascending: false })
        .range(from, from + pageSize - 1);

      if (error) {
        console.error('Error fetching auto-saved alerts:', error);
        return { success: false, error: error.message };
      }

      if (data && data.length > 0) {
        allData = [...allData, ...data];
        from += pageSize;

        // Si recibimos menos registros que el tamaño de página, ya no hay más
        hasMore = data.length === pageSize;
      } else {
        hasMore = false;
      }
    }

    console.log(`✅ Cargadas ${allData.length} alertas auto-guardadas (sin límite de 1000)`);
    return { success: true, data: allData as SavedAlert[] };
  } catch (error: any) {
    console.error('Exception fetching auto-saved alerts:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}

/**
 * Obtener alertas filtradas de saved_alerts
 */
export async function getFilteredAutoSavedAlerts(
  filters: {
    status?: 'pending' | 'in_progress' | 'resolved';
    severity?: string;
    startDate?: string;
    endDate?: string;
  }
): Promise<{ success: boolean; data?: SavedAlert[]; error?: string }> {
  try {
    // 🔧 SOLUCIÓN: Obtener TODOS los registros filtrados usando paginación automática
    let allData: SavedAlert[] = [];
    let from = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      let query = supabase
        .from('saved_alerts')
        .select('*')
        .order('timestamp', { ascending: false })
        .range(from, from + pageSize - 1);

      if (filters.status) {
        query = query.eq('status', filters.status);
      }

      if (filters.severity) {
        query = query.eq('severity', filters.severity);
      }

      if (filters.startDate) {
        query = query.gte('timestamp', filters.startDate);
      }

      if (filters.endDate) {
        query = query.lte('timestamp', filters.endDate);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching filtered auto-saved alerts:', error);
        return { success: false, error: error.message };
      }

      if (data && data.length > 0) {
        allData = [...allData, ...data];
        from += pageSize;

        // Si recibimos menos registros que el tamaño de página, ya no hay más
        hasMore = data.length === pageSize;
      } else {
        hasMore = false;
      }
    }

    console.log(`✅ Cargadas ${allData.length} alertas filtradas (sin límite de 1000)`);
    return { success: true, data: allData as SavedAlert[] };
  } catch (error: any) {
    console.error('Exception fetching filtered auto-saved alerts:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}

/**
 * Elimina múltiples alertas auto-guardadas por sus IDs
 */
export async function deleteMultipleAutoSavedAlerts(alertIds: string[]): Promise<{
  success: boolean;
  deletedCount?: number;
  error?: string
}> {
  try {
    if (!alertIds || alertIds.length === 0) {
      return { success: false, error: 'No se proporcionaron IDs de alertas' };
    }

    const { data, error } = await supabase
      .from('saved_alerts')
      .delete()
      .in('id', alertIds)
      .select();

    if (error) {
      console.error('Error eliminando alertas:', error);
      return { success: false, error: error.message };
    }

    const deletedCount = data?.length || 0;
    console.log(`✅ ${deletedCount} alertas eliminadas correctamente`);
    return { success: true, deletedCount };
  } catch (error: any) {
    console.error('Exception eliminando alertas:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}

/**
 * Marca múltiples alertas como movidas al historial
 */
export async function markMultipleAlertsAsMovedToHistory(
  alertIds: string[],
  userEmail: string
): Promise<{
  success: boolean;
  updatedCount?: number;
  error?: string
}> {
  try {
    if (!alertIds || alertIds.length === 0) {
      return { success: false, error: 'No se proporcionaron IDs de alertas' };
    }

    const { data, error } = await supabase
      .from('saved_alerts')
      .update({
        moved_to_history: true,
        moved_at: new Date().toISOString(),
        moved_by: userEmail
      })
      .in('id', alertIds)
      .select();

    if (error) {
      console.error('Error marcando alertas como movidas:', error);
      return { success: false, error: error.message };
    }

    const updatedCount = data?.length || 0;
    console.log(`✅ ${updatedCount} alertas marcadas como movidas al historial`);
    return { success: true, updatedCount };
  } catch (error: any) {
    console.error('Exception marcando alertas:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}

/**
 * Mark a saved alert as moved to history
 * This helps track which alerts are already being followed up in the history table
 */
export async function markAlertAsMovedToHistory(
  alertId: string,
  userEmail: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('saved_alerts')
      .update({
        moved_to_history: true,
        moved_at: new Date().toISOString(),
        moved_by: userEmail
      })
      .eq('id', alertId);

    if (error) {
      console.error('Error marking alert as moved to history:', error);
      return { success: false, error: error.message };
    }

    console.log(`✅ Alert ${alertId} marked as moved to history by ${userEmail}`);
    return { success: true };
  } catch (error: any) {
    console.error('Exception marking alert as moved to history:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}

// ==================== ALERT_HISTORY FUNCTIONS (Guardado Manual para Seguimiento) ====================

/**
 * Guarda una alerta MANUALMENTE en alert_history para SEGUIMIENTO/GESTIÓN
 * Esta tabla almacena solo alertas que requieren seguimiento con planes de acción
 * Las alertas NO se eliminan con la limpieza automática
 */
export async function saveAlertToDatabase(alert: Alert, savedBy: string = 'Usuario'): Promise<{ success: boolean; data?: SavedAlert; error?: string }> {
  try {
    // Verificar si ya existe en alert_history
    const isDuplicate = await DataCleanupService.checkDuplicate('alert_history', {
      plate: alert.plate,
      timestamp: alert.timestamp,
      type: alert.type
    });

    if (isDuplicate) {
      return {
        success: false,
        error: 'Esta alerta ya está en el historial de seguimiento'
      };
    }

    // Primero, buscar si existe en saved_alerts para obtener el ID
    const { data: savedAlert } = await supabase
      .from('saved_alerts')
      .select('id')
      .eq('alert_id', alert.id)
      .eq('plate', alert.plate)
      .eq('timestamp', alert.timestamp)
      .maybeSingle();

    const alertData = {
      saved_alert_id: savedAlert?.id || null, // Referencia a saved_alerts
      alert_id: alert.id,
      vehicle_id: alert.vehicleId,
      plate: alert.plate,
      driver: alert.driver,
      type: alert.type,
      severity: alert.severity,
      timestamp: alert.timestamp,
      location: alert.location,
      speed: alert.speed,
      details: alert.details,
      contract: alert.contract || null,
      source: alert.source,
      status: 'pending' as const,
      saved_by: savedBy
    };

    const { data, error } = await supabase
      .from('alert_history')
      .insert(alertData)
      .select()
      .single();

    if (error) {
      if ((error as any).code === '23505' || error.message.toLowerCase().includes('duplicate key')) {
        return {
          success: false,
          error: 'Esta alerta ya esta en el historial de seguimiento'
        };
      }
      console.error('Error saving alert to alert_history:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (error: any) {
    console.error('Exception saving alert to history:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}

/**
 * Get all saved alerts with action plans
 */
export async function getAllSavedAlerts(): Promise<{ success: boolean; data?: SavedAlertWithPlans[]; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('alert_history')
      .select(`
        *,
        action_plans (*)
      `)
      .order('timestamp', { ascending: false });

    if (error) {
      console.error('Error fetching alerts:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data: data as SavedAlertWithPlans[] };
  } catch (error: any) {
    console.error('Exception fetching alerts:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}

/**
 * Get saved alerts with filters
 */
export async function getFilteredAlerts(
  filters: {
    status?: 'pending' | 'in_progress' | 'resolved' | 'invalid';
    severity?: string;
    startDate?: string;
    endDate?: string;
  }
): Promise<{ success: boolean; data?: SavedAlertWithPlans[]; error?: string }> {
  try {
    let query = supabase
      .from('alert_history')
      .select(`
        *,
        action_plans (*)
      `)
      .order('timestamp', { ascending: false });

    if (filters.status) {
      query = query.eq('status', filters.status);
    }

    if (filters.severity) {
      query = query.eq('severity', filters.severity);
    }

    if (filters.startDate) {
      query = query.gte('timestamp', filters.startDate);
    }

    if (filters.endDate) {
      query = query.lte('timestamp', filters.endDate);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching filtered alerts:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data: data as SavedAlertWithPlans[] };
  } catch (error: any) {
    console.error('Exception fetching filtered alerts:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}

/**
 * Update alert status
 * NOTA: El estado 'invalid' se usa para marcar alertas erróneas que no deben procesarse
 */
export async function updateAlertStatus(
  alertId: string,
  status: 'pending' | 'in_progress' | 'resolved' | 'invalid'
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('alert_history')
      .update({ status })
      .eq('id', alertId);

    if (error) {
      console.error('Error updating alert status:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Exception updating alert status:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}

/**
 * Delete an alert from history
 */
export async function deleteAlert(alertId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('alert_history')
      .delete()
      .eq('id', alertId);

    if (error) {
      console.error('Error deleting alert:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Exception deleting alert:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}

/**
 * Elimina múltiples alertas del historial por sus IDs
 */
export async function deleteMultipleAlerts(alertIds: string[]): Promise<{
  success: boolean;
  deletedCount?: number;
  error?: string
}> {
  try {
    if (!alertIds || alertIds.length === 0) {
      return { success: false, error: 'No se proporcionaron IDs de alertas' };
    }

    // Eliminar las alertas (los planes de acción se eliminan automáticamente con ON DELETE CASCADE)
    const { data, error } = await supabase
      .from('alert_history')
      .delete()
      .in('id', alertIds)
      .select();

    if (error) {
      console.error('Error eliminando alertas del historial:', error);
      return { success: false, error: error.message };
    }

    const deletedCount = data?.length || 0;
    console.log(`✅ ${deletedCount} alertas eliminadas del historial`);
    return { success: true, deletedCount };
  } catch (error: any) {
    console.error('Exception eliminando alertas del historial:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}

// ==================== ACTION PLANS FUNCTIONS ====================

/**
 * Sincroniza el estado de una alerta basándose en el estado de TODOS sus planes de acción
 * Lógica de negocio:
 * - Si TODOS los planes están "completed" → Alerta pasa a "resolved"
 * - Si al menos un plan está "in_progress" → Alerta permanece "in_progress"
 * - Si todos están "pending" → Alerta está "in_progress" (se está gestionando)
 * - Si no hay planes → No hace nada (mantiene estado actual)
 */
async function syncAlertStatusFromPlans(alertHistoryId: string): Promise<void> {
  try {
    // Obtener todos los planes de esta alerta
    const { data: plans, error } = await supabase
      .from('action_plans')
      .select('status')
      .eq('alert_history_id', alertHistoryId);

    if (error || !plans || plans.length === 0) {
      console.log('No hay planes para sincronizar estado');
      return;
    }

    // Calcular estado de la alerta basándose en los planes
    const allCompleted = plans.every(plan => plan.status === 'completed');
    const hasInProgress = plans.some(plan => plan.status === 'in_progress');

    let newAlertStatus: 'pending' | 'in_progress' | 'resolved';

    if (allCompleted) {
      // Todos los planes completados → Alerta resuelta
      newAlertStatus = 'resolved';
    } else if (hasInProgress) {
      // Al menos un plan en progreso → Alerta en progreso
      newAlertStatus = 'in_progress';
    } else {
      // Todos pendientes → Alerta en progreso (se está gestionando)
      newAlertStatus = 'in_progress';
    }

    // Actualizar estado de la alerta
    const { error: updateError } = await supabase
      .from('alert_history')
      .update({
        status: newAlertStatus,
        updated_at: new Date().toISOString()
      })
      .eq('id', alertHistoryId);

    if (updateError) {
      console.error('Error al sincronizar estado de alerta:', updateError);
    } else {
      console.log(`✅ Estado de alerta sincronizado: ${newAlertStatus} (basado en ${plans.length} planes)`);
    }
  } catch (error) {
    console.error('Exception al sincronizar estado:', error);
  }
}

/**
 * Add an action plan to an alert
 * ACTUALIZA AUTOMÁTICAMENTE EL ESTADO DE LA ALERTA
 */
export async function addActionPlan(
  alertHistoryId: string,
  plan: {
    description: string;
    responsible: string;
    status?: 'pending' | 'in_progress' | 'completed';
    observations?: string;
    attachments?: FileAttachment[];
  },
  createdBy: string = 'Usuario'
): Promise<{ success: boolean; data?: ActionPlan; error?: string }> {
  try {
    const planData = {
      alert_history_id: alertHistoryId,
      description: plan.description,
      responsible: plan.responsible,
      status: plan.status || 'pending',
      observations: plan.observations || null,
      attachments: plan.attachments || [],
      created_by: createdBy
    };

    // 1. Insertar el plan de acción
    const { data, error } = await supabase
      .from('action_plans')
      .insert(planData)
      .select()
      .single();

    if (error) {
      console.error('Error adding action plan:', error);
      return { success: false, error: error.message };
    }

    // 2. ACTUALIZAR ESTADO DE LA ALERTA AUTOMÁTICAMENTE
    // Lógica: Si se crea un plan de acción, la alerta debe pasar a "in_progress"
    // (indica que se está trabajando en la alerta)
    const alertStatus: 'pending' | 'in_progress' | 'resolved' = 'in_progress';

    const { error: updateError } = await supabase
      .from('alert_history')
      .update({
        status: alertStatus,
        updated_at: new Date().toISOString()
      })
      .eq('id', alertHistoryId);

    if (updateError) {
      console.warn('⚠️ Plan creado pero no se pudo actualizar estado de alerta:', updateError);
      // No retornar error, el plan se creó correctamente
    } else {
      console.log(`✅ Estado de alerta actualizado a "${alertStatus}" tras agregar plan de acción`);
    }

    return { success: true, data };
  } catch (error: any) {
    console.error('Exception adding action plan:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}

/**
 * Get all action plans for a specific alert
 */
export async function getActionPlans(alertHistoryId: string): Promise<{ success: boolean; data?: ActionPlan[]; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('action_plans')
      .select('*')
      .eq('alert_history_id', alertHistoryId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching action plans:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (error: any) {
    console.error('Exception fetching action plans:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}

/**
 * Update an action plan
 * SINCRONIZA AUTOMÁTICAMENTE EL ESTADO DE LA ALERTA
 */
export async function updateActionPlan(
  planId: string,
  updates: {
    description?: string;
    responsible?: string;
    status?: 'pending' | 'in_progress' | 'completed';
    observations?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Obtener el alert_history_id del plan antes de actualizarlo
    const { data: planData, error: fetchError } = await supabase
      .from('action_plans')
      .select('alert_history_id')
      .eq('id', planId)
      .single();

    if (fetchError || !planData) {
      console.error('Error fetching plan data:', fetchError);
      return { success: false, error: fetchError?.message || 'Plan no encontrado' };
    }

    const alertHistoryId = planData.alert_history_id;

    // 2. Actualizar el plan de acción
    const { error } = await supabase
      .from('action_plans')
      .update(updates)
      .eq('id', planId);

    if (error) {
      console.error('Error updating action plan:', error);
      return { success: false, error: error.message };
    }

    // 3. SINCRONIZAR ESTADO DE LA ALERTA basándose en TODOS sus planes
    await syncAlertStatusFromPlans(alertHistoryId);

    return { success: true };
  } catch (error: any) {
    console.error('Exception updating action plan:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}

/**
 * Delete an action plan
 * SINCRONIZA AUTOMÁTICAMENTE EL ESTADO DE LA ALERTA tras eliminar
 */
export async function deleteActionPlan(planId: string): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Obtener el alert_history_id antes de eliminar el plan
    const { data: planData, error: fetchError } = await supabase
      .from('action_plans')
      .select('alert_history_id')
      .eq('id', planId)
      .single();

    if (fetchError || !planData) {
      console.error('Error fetching plan data:', fetchError);
      return { success: false, error: fetchError?.message || 'Plan no encontrado' };
    }

    const alertHistoryId = planData.alert_history_id;

    // 2. Eliminar el plan
    const { error } = await supabase
      .from('action_plans')
      .delete()
      .eq('id', planId);

    if (error) {
      console.error('Error deleting action plan:', error);
      return { success: false, error: error.message };
    }

    // 3. SINCRONIZAR ESTADO DE LA ALERTA después de eliminar
    // Si ya no quedan planes, la alerta podría volver a "pending"
    await syncAlertStatusAfterDeletion(alertHistoryId);

    return { success: true };
  } catch (error: any) {
    console.error('Exception deleting action plan:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}

/**
 * Sincroniza el estado de una alerta después de eliminar un plan
 * Si no quedan planes, la alerta vuelve a "pending"
 */
async function syncAlertStatusAfterDeletion(alertHistoryId: string): Promise<void> {
  try {
    // Verificar si quedan planes
    const { data: plans, error } = await supabase
      .from('action_plans')
      .select('status')
      .eq('alert_history_id', alertHistoryId);

    if (error) {
      console.error('Error al verificar planes restantes:', error);
      return;
    }

    if (!plans || plans.length === 0) {
      // No quedan planes → Volver a "pending"
      await supabase
        .from('alert_history')
        .update({
          status: 'pending',
          updated_at: new Date().toISOString()
        })
        .eq('id', alertHistoryId);

      console.log('✅ Alerta sin planes → Estado actualizado a "pending"');
    } else {
      // Aún hay planes → Sincronizar basándose en los planes restantes
      await syncAlertStatusFromPlans(alertHistoryId);
    }
  } catch (error) {
    console.error('Exception al sincronizar estado tras eliminación:', error);
  }
}

// ==================== STATISTICS ====================

/**
 * Get alert statistics
 */
export async function getAlertStatistics(): Promise<{
  success: boolean;
  data?: {
    total: number;
    pending: number;
    in_progress: number;
    resolved: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  error?: string;
}> {
  try {
    const { data, error } = await supabase
      .from('alert_history')
      .select('status, severity');

    if (error) {
      console.error('Error fetching statistics:', error);
      return { success: false, error: error.message };
    }

    const stats = {
      total: data.length,
      pending: data.filter(a => a.status === 'pending').length,
      in_progress: data.filter(a => a.status === 'in_progress').length,
      resolved: data.filter(a => a.status === 'resolved').length,
      critical: data.filter(a => a.severity === 'critical').length,
      high: data.filter(a => a.severity === 'high').length,
      medium: data.filter(a => a.severity === 'medium').length,
      low: data.filter(a => a.severity === 'low').length,
    };

    return { success: true, data: stats };
  } catch (error: any) {
    console.error('Exception fetching statistics:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}
