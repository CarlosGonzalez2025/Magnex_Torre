import { Alert } from '../types';
import { DataCleanupService } from './dataCleanupService';
import { supabase } from './supabaseClient';

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
  status: 'pending' | 'in_progress' | 'resolved';
  saved_at: string;
  saved_by: string;
  created_at: string;
  updated_at: string;
}

export interface ActionPlan {
  id: string;
  alert_history_id: string;
  description: string;
  responsible: string;
  status: 'pending' | 'in_progress' | 'completed';
  observations?: string;
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

    const { data, error } = await supabase
      .from('saved_alerts')
      .insert(alertData)
      .select()
      .single();

    if (error) {
      console.error('Error auto-saving alert to saved_alerts:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (error: any) {
    console.error('Exception auto-saving alert:', error);
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
    status?: 'pending' | 'in_progress' | 'resolved';
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
 */
export async function updateAlertStatus(
  alertId: string,
  status: 'pending' | 'in_progress' | 'resolved'
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

// ==================== ACTION PLANS FUNCTIONS ====================

/**
 * Add an action plan to an alert
 */
export async function addActionPlan(
  alertHistoryId: string,
  plan: {
    description: string;
    responsible: string;
    status?: 'pending' | 'in_progress' | 'completed';
    observations?: string;
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
      created_by: createdBy
    };

    const { data, error } = await supabase
      .from('action_plans')
      .insert(planData)
      .select()
      .single();

    if (error) {
      console.error('Error adding action plan:', error);
      return { success: false, error: error.message };
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
    const { error } = await supabase
      .from('action_plans')
      .update(updates)
      .eq('id', planId);

    if (error) {
      console.error('Error updating action plan:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Exception updating action plan:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}

/**
 * Delete an action plan
 */
export async function deleteActionPlan(planId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('action_plans')
      .delete()
      .eq('id', planId);

    if (error) {
      console.error('Error deleting action plan:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Exception deleting action plan:', error);
    return { success: false, error: error.message || 'Error desconocido' };
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
