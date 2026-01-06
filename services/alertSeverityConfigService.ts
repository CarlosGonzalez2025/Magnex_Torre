import { supabase } from './supabaseClient';
import { AlertSeverity } from '../types';

export interface AlertSeverityConfig {
  id: string;
  alert_type: string;
  severity: AlertSeverity;
  description?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  updated_by?: string;
}

/**
 * Get all alert severity configurations
 */
export async function getAllAlertSeverityConfigs(): Promise<{ success: boolean; data?: AlertSeverityConfig[]; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('alert_severity_config')
      .select('*')
      .order('alert_type', { ascending: true });

    if (error) {
      console.error('Error fetching alert severity configs:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data: data as AlertSeverityConfig[] };
  } catch (error: any) {
    console.error('Exception fetching alert severity configs:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}

/**
 * Get severity for a specific alert type
 */
export async function getSeverityForAlertType(alertType: string): Promise<AlertSeverity> {
  try {
    const { data, error } = await supabase
      .from('alert_severity_config')
      .select('severity')
      .eq('alert_type', alertType)
      .eq('is_active', true)
      .single();

    if (error || !data) {
      // Default to medium if not found
      console.warn(`No config found for alert type: ${alertType}, using default: medium`);
      return AlertSeverity.MEDIUM;
    }

    return data.severity as AlertSeverity;
  } catch (error) {
    console.error('Exception getting severity for alert type:', error);
    return AlertSeverity.MEDIUM;
  }
}

/**
 * Update severity configuration for an alert type
 */
export async function updateAlertSeverityConfig(
  id: string,
  severity: AlertSeverity,
  description?: string,
  userEmail?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('alert_severity_config')
      .update({
        severity,
        description,
        updated_at: new Date().toISOString(),
        updated_by: userEmail
      })
      .eq('id', id);

    if (error) {
      console.error('Error updating alert severity config:', error);
      return { success: false, error: error.message };
    }

    console.log(`✅ Alert severity config ${id} updated to ${severity}`);
    return { success: true };
  } catch (error: any) {
    console.error('Exception updating alert severity config:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}

/**
 * Toggle active status for an alert type
 */
export async function toggleAlertTypeStatus(
  id: string,
  isActive: boolean,
  userEmail?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('alert_severity_config')
      .update({
        is_active: isActive,
        updated_at: new Date().toISOString(),
        updated_by: userEmail
      })
      .eq('id', id);

    if (error) {
      console.error('Error toggling alert type status:', error);
      return { success: false, error: error.message };
    }

    console.log(`✅ Alert type ${id} ${isActive ? 'enabled' : 'disabled'}`);
    return { success: true };
  } catch (error: any) {
    console.error('Exception toggling alert type status:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}

/**
 * Get all configurations as a Map for quick lookup
 * Used by alert detection service
 */
export async function getAlertSeverityMap(): Promise<Map<string, AlertSeverity>> {
  const map = new Map<string, AlertSeverity>();

  try {
    const { data, error } = await supabase
      .from('alert_severity_config')
      .select('alert_type, severity')
      .eq('is_active', true);

    if (error) {
      console.error('Error fetching alert severity map:', error);
      return map;
    }

    data?.forEach((config: any) => {
      map.set(config.alert_type, config.severity as AlertSeverity);
    });

    console.log(`📋 Loaded ${map.size} alert severity configurations`);
  } catch (error) {
    console.error('Exception creating alert severity map:', error);
  }

  return map;
}
