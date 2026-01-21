import { supabase } from './supabaseClient';
import { BatchAlert } from './fileProcessingService';

// ==================== TYPES ====================

export interface FileUploadRecord {
  id: string;
  filename: string;
  source: 'FAGOR' | 'COLTRACK';
  upload_date: string;
  processed_rows: number;
  created_at: string;
}

export interface BatchAlertRecord extends BatchAlert {
  id: string;
  upload_id: string;
  created_at: string;
}

export interface AuditSummary {
  total_uploads: number;
  total_alerts: number;
  total_graves: number;
  recent_uploads: FileUploadRecord[];
}

// ==================== NUEVOS TIPOS PARA ANÁLISIS DETALLADO ====================

export interface DetailedAuditAnalysis {
  overview: {
    total_uploads: number;
    total_alerts: number;
    total_graves: number;
    grave_percentage: number;
    avg_alerts_per_upload: number;
    most_active_source: 'FAGOR' | 'COLTRACK' | null;
  };
  
  temporal: {
    alerts_by_hour: { hour: number; count: number }[];
    alerts_by_day: { day: string; count: number }[];
    alerts_by_month: { month: string; count: number }[];
    peak_hour: number;
    peak_day: string;
  };
  
  severity: {
    by_type: { type: string; count: number; percentage: number }[];
    grave_alerts: { type: string; count: number }[];
    severity_distribution: { severity: string; count: number; percentage: number }[];
  };
  
  vehicles: {
    most_alerts: { plate: string; count: number; grave_count: number }[];
    least_alerts: { plate: string; count: number }[];
    total_vehicles: number;
    avg_alerts_per_vehicle: number;
  };
  
  drivers: {
    most_incidents: { driver: string; count: number; grave_count: number }[];
    driver_performance: { driver: string; total: number; grave_percentage: number }[];
    total_drivers: number;
  };
  
  speed_analysis: {
    avg_speed: number;
    max_speed: number;
    min_speed: number;
    speed_ranges: { range: string; count: number }[];
    excessive_speed_count: number;
  };
  
  location_analysis: {
    top_locations: { location: string; count: number }[];
    locations_with_graves: { location: string; grave_count: number }[];
  };
  
  trends: {
    daily_trend: { date: string; count: number; change_percentage: number }[];
    weekly_comparison: { week: string; count: number }[];
    growth_rate: number;
  };
}

export interface VehicleDetailedStats {
  plate: string;
  total_alerts: number;
  grave_alerts: number;
  alert_types: { type: string; count: number }[];
  avg_speed: number;
  max_speed: number;
  time_distribution: { hour: number; count: number }[];
  drivers: { driver: string; count: number }[];
  locations: { location: string; count: number }[];
  first_alert: string;
  last_alert: string;
  risk_score: number; // 0-100
  trend: 'improving' | 'worsening' | 'stable';
}

export interface DriverDetailedStats {
  driver: string;
  total_alerts: number;
  grave_alerts: number;
  vehicles_driven: string[];
  alert_types: { type: string; count: number }[];
  avg_speed: number;
  max_speed: number;
  time_distribution: { hour: number; count: number }[];
  safety_score: number; // 0-100
  ranking: number;
}

// ==================== PAGINATION HELPER ====================

async function fetchAllRecords<T>(
  query: any,
  pageSize: number = 1000
): Promise<T[]> {
  let allRecords: T[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const to = from + pageSize - 1;
    
    const { data, error } = await query.range(from, to);

    if (error) {
      throw error;
    }

    if (data && data.length > 0) {
      allRecords = allRecords.concat(data);
      console.log(`📦 Obtenidos ${data.length} registros (total acumulado: ${allRecords.length})`);
      
      hasMore = data.length === pageSize;
      from += pageSize;
    } else {
      hasMore = false;
    }
  }

  return allRecords;
}

// ==================== FILE UPLOAD FUNCTIONS ====================

export async function createFileUploadRecord(
  filename: string,
  source: 'FAGOR' | 'COLTRACK',
  processedRows: number
): Promise<{ success: boolean; uploadId?: string; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('file_uploads')
      .insert({
        filename,
        source,
        upload_date: new Date().toISOString(),
        processed_rows: processedRows
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Error creando registro de carga:', error);
      return { success: false, error: error.message };
    }

    console.log('✅ Registro de carga creado:', {
      uploadId: data.id,
      filename,
      source,
      processedRows
    });
    return { success: true, uploadId: data.id };

  } catch (error: any) {
    console.error('❌ Exception creando registro:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}

export async function getAllFileUploads(): Promise<{
  success: boolean;
  data?: FileUploadRecord[];
  error?: string;
}> {
  try {
    const query = supabase
      .from('file_uploads')
      .select('*')
      .order('upload_date', { ascending: false });

    const data = await fetchAllRecords<FileUploadRecord>(query);

    console.log(`✅ Total file_uploads obtenidos: ${data.length}`);
    return { success: true, data };

  } catch (error: any) {
    console.error('❌ Exception obteniendo registros:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}

// ==================== BATCH ALERTS FUNCTIONS ====================

export async function saveBatchAlerts(
  uploadId: string,
  alerts: BatchAlert[]
): Promise<{ success: boolean; insertedCount?: number; error?: string }> {
  try {
    if (alerts.length === 0) {
      return { success: false, error: 'No hay alertas para guardar' };
    }

    const alertsToInsert = alerts.map(alert => ({
      upload_id: uploadId,
      plate: alert.plate,
      alert_type: alert.alert_type,
      speed: alert.speed,
      timestamp: alert.timestamp,
      driver: alert.driver || null,
      severity: alert.severity,
      is_grave: alert.is_grave,
      location: alert.location || null,
      latitude: alert.latitude || null,
      longitude: alert.longitude || null
    }));

    console.log(`💾 Guardando ${alertsToInsert.length} alertas con upload_id: ${uploadId}`);

    const chunkSize = 1000;
    let totalInserted = 0;

    for (let i = 0; i < alertsToInsert.length; i += chunkSize) {
      const chunk = alertsToInsert.slice(i, i + chunkSize);

      const { data, error } = await supabase
        .from('batch_alerts')
        .insert(chunk)
        .select();

      if (error) {
        console.error(`❌ Error insertando chunk ${Math.floor(i / chunkSize) + 1}:`, error);
        return { success: false, error: error.message };
      }

      totalInserted += data.length;
      console.log(`✅ Chunk ${Math.floor(i / chunkSize) + 1}/${Math.ceil(alertsToInsert.length / chunkSize)} guardado: ${data.length} filas`);
    }

    console.log(`✅ Total insertado: ${totalInserted} alertas`);
    return { success: true, insertedCount: totalInserted };

  } catch (error: any) {
    console.error('❌ Exception guardando alertas:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}

export async function getAlertsByUploadId(
  uploadId: string
): Promise<{ success: boolean; data?: BatchAlertRecord[]; error?: string }> {
  try {
    const query = supabase
      .from('batch_alerts')
      .select('*')
      .eq('upload_id', uploadId)
      .order('timestamp', { ascending: false });

    const data = await fetchAllRecords<BatchAlertRecord>(query);

    console.log(`✅ Total alertas obtenidas para upload ${uploadId}: ${data.length}`);
    return { success: true, data };

  } catch (error: any) {
    console.error('❌ Exception obteniendo alertas:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}

export async function getGraveAlertsByUploadId(
  uploadId: string
): Promise<{ success: boolean; data?: BatchAlertRecord[]; error?: string }> {
  try {
    const query = supabase
      .from('batch_alerts')
      .select('*')
      .eq('upload_id', uploadId)
      .eq('is_grave', true)
      .order('timestamp', { ascending: false });

    const data = await fetchAllRecords<BatchAlertRecord>(query);

    console.log(`✅ Total faltas graves para upload ${uploadId}: ${data.length}`);
    return { success: true, data };

  } catch (error: any) {
    console.error('❌ Exception obteniendo faltas graves:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}

export async function getAllGraveAlerts(): Promise<{
  success: boolean;
  data?: BatchAlertRecord[];
  error?: string;
}> {
  try {
    const query = supabase
      .from('batch_alerts')
      .select(`
        *,
        file_uploads (
          filename,
          source,
          upload_date
        )
      `)
      .eq('is_grave', true)
      .order('timestamp', { ascending: false });

    const data = await fetchAllRecords<any>(query);

    console.log(`✅ Total faltas graves en el sistema: ${data.length}`);
    return { success: true, data };

  } catch (error: any) {
    console.error('❌ Exception obteniendo faltas graves:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}

// ==================== STATISTICS ====================

export async function getAuditSummary(): Promise<{
  success: boolean;
  data?: AuditSummary;
  error?: string;
}> {
  try {
    const { data: uploads, error: uploadsError } = await supabase
      .from('file_uploads')
      .select('*')
      .order('upload_date', { ascending: false })
      .limit(10);

    if (uploadsError) {
      return { success: false, error: uploadsError.message };
    }

    const { count: totalUploadsCount, error: totalUploadsError } = await supabase
      .from('file_uploads')
      .select('*', { count: 'exact', head: true });

    if (totalUploadsError) {
      return { success: false, error: totalUploadsError.message };
    }

    const { count: totalAlerts, error: alertsError } = await supabase
      .from('batch_alerts')
      .select('*', { count: 'exact', head: true });

    if (alertsError) {
      return { success: false, error: alertsError.message };
    }

    const { count: totalGraves, error: gravesError } = await supabase
      .from('batch_alerts')
      .select('*', { count: 'exact', head: true })
      .eq('is_grave', true);

    if (gravesError) {
      return { success: false, error: gravesError.message };
    }

    const summary: AuditSummary = {
      total_uploads: totalUploadsCount || 0,
      total_alerts: totalAlerts || 0,
      total_graves: totalGraves || 0,
      recent_uploads: uploads as FileUploadRecord[]
    };

    return { success: true, data: summary };

  } catch (error: any) {
    console.error('❌ Exception obteniendo resumen:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}

export async function deleteUpload(
  uploadId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    let hasMore = true;
    let deletedTotal = 0;

    while (hasMore) {
      const { data, error } = await supabase
        .from('batch_alerts')
        .delete()
        .eq('upload_id', uploadId)
        .limit(1000)
        .select();

      if (error) {
        console.error('❌ Error eliminando alertas:', error);
        return { success: false, error: error.message };
      }

      const deletedCount = data?.length || 0;
      deletedTotal += deletedCount;
      hasMore = deletedCount === 1000;

      if (deletedCount > 0) {
        console.log(`🗑️ Eliminadas ${deletedCount} alertas (total: ${deletedTotal})`);
      }
    }

    const { error: uploadError } = await supabase
      .from('file_uploads')
      .delete()
      .eq('id', uploadId);

    if (uploadError) {
      console.error('❌ Error eliminando carga:', uploadError);
      return { success: false, error: uploadError.message };
    }

    console.log(`✅ Carga eliminada: ${uploadId} (${deletedTotal} alertas eliminadas)`);
    return { success: true };

  } catch (error: any) {
    console.error('❌ Exception eliminando carga:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}

export async function deleteBatchAlert(
  alertId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('batch_alerts')
      .delete()
      .eq('id', alertId);

    if (error) {
      console.error('❌ Error eliminando alerta:', error);
      return { success: false, error: error.message };
    }

    console.log('✅ Alerta eliminada:', alertId);
    return { success: true };

  } catch (error: any) {
    console.error('❌ Exception eliminando alerta:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}

export async function deleteAllBatchAlerts(): Promise<{
  success: boolean;
  deletedCount?: number;
  error?: string;
}> {
  try {
    const { count, error: countError } = await supabase
      .from('batch_alerts')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      console.error('❌ Error contando alertas:', countError);
      return { success: false, error: countError.message };
    }

    const totalToDelete = count || 0;
    let deletedTotal = 0;
    let hasMore = true;

    console.log(`⚠️ Iniciando eliminación de ${totalToDelete} alertas...`);

    while (hasMore) {
      // Obtener IDs de las primeras 1000 alertas
      const { data: alertsToDelete, error: fetchError } = await supabase
        .from('batch_alerts')
        .select('id')
        .limit(1000);

      if (fetchError) {
        console.error('❌ Error obteniendo alertas para eliminar:', fetchError);
        return { success: false, error: fetchError.message };
      }

      if (!alertsToDelete || alertsToDelete.length === 0) {
        hasMore = false;
        break;
      }

      // Eliminar por IDs
      const ids = alertsToDelete.map(alert => alert.id);
      const { data, error: deleteError } = await supabase
        .from('batch_alerts')
        .delete()
        .in('id', ids)
        .select();

      if (deleteError) {
        console.error('❌ Error eliminando alertas:', deleteError);
        return { success: false, error: deleteError.message };
      }

      const deletedCount = data?.length || 0;
      deletedTotal += deletedCount;
      hasMore = deletedCount === 1000;

      console.log(`🗑️ Eliminadas ${deletedCount} alertas (progreso: ${deletedTotal}/${totalToDelete})`);
    }

    console.log(`✅ ${deletedTotal} alertas eliminadas de batch_alerts`);
    return { success: true, deletedCount: deletedTotal };

  } catch (error: any) {
    console.error('❌ Exception eliminando todas las alertas:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}

// ==================== QUERY FUNCTIONS WITH FILTERS ====================

export interface AlertFilters {
  startDate?: string;
  endDate?: string;
  plate?: string;
  alertType?: string;
  alertTypes?: string[];
  source?: 'FAGOR' | 'COLTRACK';
  isGrave?: boolean;
  uploadId?: string;
}

export async function queryBatchAlerts(
  filters: AlertFilters = {}
): Promise<{ success: boolean; data?: BatchAlertRecord[]; error?: string }> {
  try {
    const { data: uploadsData, error: uploadsError } = await supabase
      .from('file_uploads')
      .select('id, filename, source, upload_date');

    if (uploadsError) {
      console.error('❌ Error obteniendo file_uploads:', uploadsError);
    }

    const uploadsMap = new Map<string, any>();
    if (uploadsData) {
      uploadsData.forEach(upload => {
        uploadsMap.set(upload.id, upload);
      });
      console.log(`📦 File uploads cargados: ${uploadsMap.size} registros`);
    }

    let query = supabase
      .from('batch_alerts')
      .select('*');

    if (filters.startDate) {
      query = query.gte('timestamp', filters.startDate);
    }
    if (filters.endDate) {
      query = query.lte('timestamp', filters.endDate);
    }
    if (filters.plate) {
      query = query.ilike('plate', `%${filters.plate}%`);
    }
    if (filters.alertType) {
      query = query.ilike('alert_type', `%${filters.alertType}%`);
    }
    if (filters.alertTypes && filters.alertTypes.length > 0) {
      query = query.in('alert_type', filters.alertTypes);
    }
    if (filters.isGrave !== undefined) {
      query = query.eq('is_grave', filters.isGrave);
    }
    if (filters.uploadId) {
      query = query.eq('upload_id', filters.uploadId);
    }

    query = query.order('timestamp', { ascending: false });

    console.log('⏳ Ejecutando consulta con paginación automática...');

    const data = await fetchAllRecords<any>(query);

    console.log(`✅ Total registros obtenidos: ${data.length}`);

    let enrichedData = data.map((alert: any) => {
      const uploadInfo = uploadsMap.get(alert.upload_id);
      return {
        ...alert,
        file_uploads: uploadInfo || null
      };
    });

    if (filters.source) {
      enrichedData = enrichedData.filter(
        (alert: any) => alert.file_uploads?.source === filters.source
      );
      console.log(`✅ Filtrado por source '${filters.source}': ${enrichedData.length} alertas`);
    }

    console.log(`✅ Consulta exitosa: ${enrichedData.length} alertas`);
    return { success: true, data: enrichedData as BatchAlertRecord[] };

  } catch (error: any) {
    console.error('❌ Exception consultando alertas:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}

export async function getUniqueAlertTypes(): Promise<{ 
  success: boolean; 
  data?: string[]; 
  error?: string 
}> {
  try {
    const query = supabase
      .from('batch_alerts')
      .select('alert_type')
      .order('alert_type', { ascending: true });

    const data = await fetchAllRecords<{ alert_type: string }>(query);

    const uniqueTypes = [...new Set(data.map(item => item.alert_type))];

    console.log(`✅ Tipos de alerta únicos: ${uniqueTypes.length}`);
    return { success: true, data: uniqueTypes };

  } catch (error: any) {
    console.error('❌ Exception obteniendo tipos de alerta:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}

// ==================== 🆕 ANÁLISIS DETALLADO Y MÉTRICAS AVANZADAS ====================

/**
 * 📊 ANÁLISIS COMPLETO DEL SISTEMA
 * Genera un reporte detallado con todas las métricas y análisis
 */
export async function getDetailedAuditAnalysis(
  filters: AlertFilters = {}
): Promise<{ success: boolean; data?: DetailedAuditAnalysis; error?: string }> {
  try {
    console.log('📊 Iniciando análisis detallado de auditoría...');

    // Obtener todas las alertas con filtros
    const alertsResult = await queryBatchAlerts(filters);
    if (!alertsResult.success || !alertsResult.data) {
      return { success: false, error: 'Error obteniendo alertas' };
    }

    const alerts = alertsResult.data;
    const totalAlerts = alerts.length;

    // Obtener uploads
    const uploadsResult = await getAllFileUploads();
    const uploads = uploadsResult.data || [];

    // 1. OVERVIEW
    const graveAlerts = alerts.filter(a => a.is_grave);
    const gravePercentage = totalAlerts > 0 ? (graveAlerts.length / totalAlerts) * 100 : 0;
    const avgAlertsPerUpload = uploads.length > 0 ? totalAlerts / uploads.length : 0;
    
    const sourceCount = alerts.reduce((acc, a) => {
      const source = a.file_uploads?.source;
      if (source) acc[source] = (acc[source] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const mostActiveSource = sourceCount['FAGOR'] > (sourceCount['COLTRACK'] || 0) 
      ? 'FAGOR' as const
      : sourceCount['COLTRACK'] > 0 
        ? 'COLTRACK' as const 
        : null;

    // 2. ANÁLISIS TEMPORAL
    const alertsByHour = Array.from({ length: 24 }, (_, i) => ({ hour: i, count: 0 }));
    const alertsByDay: Record<string, number> = {};
    const alertsByMonth: Record<string, number> = {};

    alerts.forEach(alert => {
      const date = new Date(alert.timestamp);
      const hour = date.getHours();
      const day = date.toISOString().split('T')[0];
      const month = date.toISOString().slice(0, 7);

      alertsByHour[hour].count++;
      alertsByDay[day] = (alertsByDay[day] || 0) + 1;
      alertsByMonth[month] = (alertsByMonth[month] || 0) + 1;
    });

    const peakHour = alertsByHour.reduce((max, curr) => 
      curr.count > max.count ? curr : max
    ).hour;

    const peakDay = Object.entries(alertsByDay).reduce((max, curr) => 
      curr[1] > max[1] ? curr : max, ['', 0]
    )[0];

    // 3. ANÁLISIS DE SEVERIDAD
    const alertTypeCount = alerts.reduce((acc, a) => {
      acc[a.alert_type] = (acc[a.alert_type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const byType = Object.entries(alertTypeCount).map(([type, count]) => ({
      type,
      count,
      percentage: (count / totalAlerts) * 100
    })).sort((a, b) => b.count - a.count);

    const graveByType = graveAlerts.reduce((acc, a) => {
      acc[a.alert_type] = (acc[a.alert_type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const graveAlertsArray = Object.entries(graveByType).map(([type, count]) => ({
      type,
      count
    })).sort((a, b) => b.count - a.count);

    const severityCount = alerts.reduce((acc, a) => {
      acc[a.severity] = (acc[a.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const severityDistribution = Object.entries(severityCount).map(([severity, count]) => ({
      severity,
      count,
      percentage: (count / totalAlerts) * 100
    })).sort((a, b) => b.count - a.count);

    // 4. ANÁLISIS DE VEHÍCULOS
    const vehicleAlerts = alerts.reduce((acc, a) => {
      if (!acc[a.plate]) {
        acc[a.plate] = { total: 0, grave: 0 };
      }
      acc[a.plate].total++;
      if (a.is_grave) acc[a.plate].grave++;
      return acc;
    }, {} as Record<string, { total: number; grave: number }>);

    const mostAlerts = Object.entries(vehicleAlerts)
      .map(([plate, data]) => ({
        plate,
        count: data.total,
        grave_count: data.grave
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const leastAlerts = Object.entries(vehicleAlerts)
      .map(([plate, data]) => ({
        plate,
        count: data.total
      }))
      .sort((a, b) => a.count - b.count)
      .slice(0, 10);

    const totalVehicles = Object.keys(vehicleAlerts).length;
    const avgAlertsPerVehicle = totalVehicles > 0 ? totalAlerts / totalVehicles : 0;

    // 5. ANÁLISIS DE CONDUCTORES
    const driverAlerts = alerts.reduce((acc, a) => {
      const driver = a.driver || 'Sin conductor';
      if (!acc[driver]) {
        acc[driver] = { total: 0, grave: 0 };
      }
      acc[driver].total++;
      if (a.is_grave) acc[driver].grave++;
      return acc;
    }, {} as Record<string, { total: number; grave: number }>);

    const mostIncidents = Object.entries(driverAlerts)
      .map(([driver, data]) => ({
        driver,
        count: data.total,
        grave_count: data.grave
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const driverPerformance = Object.entries(driverAlerts)
      .map(([driver, data]) => ({
        driver,
        total: data.total,
        grave_percentage: (data.grave / data.total) * 100
      }))
      .sort((a, b) => b.grave_percentage - a.grave_percentage)
      .slice(0, 10);

    const totalDrivers = Object.keys(driverAlerts).length;

    // 6. ANÁLISIS DE VELOCIDAD
    const speeds = alerts.map(a => a.speed).filter(s => s > 0);
    const avgSpeed = speeds.length > 0 
      ? speeds.reduce((sum, s) => sum + s, 0) / speeds.length 
      : 0;
    const maxSpeed = speeds.length > 0 ? Math.max(...speeds) : 0;
    const minSpeed = speeds.length > 0 ? Math.min(...speeds) : 0;

    const speedRanges = [
      { range: '0-60 km/h', count: speeds.filter(s => s <= 60).length },
      { range: '61-80 km/h', count: speeds.filter(s => s > 60 && s <= 80).length },
      { range: '81-100 km/h', count: speeds.filter(s => s > 80 && s <= 100).length },
      { range: '101-120 km/h', count: speeds.filter(s => s > 100 && s <= 120).length },
      { range: '>120 km/h', count: speeds.filter(s => s > 120).length }
    ];

    const excessiveSpeedCount = speeds.filter(s => s > 120).length;

    // 7. ANÁLISIS DE UBICACIONES
    const locationAlerts = alerts.reduce((acc, a) => {
      const location = a.location || 'Sin ubicación';
      if (!acc[location]) {
        acc[location] = { total: 0, grave: 0 };
      }
      acc[location].total++;
      if (a.is_grave) acc[location].grave++;
      return acc;
    }, {} as Record<string, { total: number; grave: number }>);

    const topLocations = Object.entries(locationAlerts)
      .map(([location, data]) => ({
        location,
        count: data.total
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const locationsWithGraves = Object.entries(locationAlerts)
      .filter(([, data]) => data.grave > 0)
      .map(([location, data]) => ({
        location,
        grave_count: data.grave
      }))
      .sort((a, b) => b.grave_count - a.grave_count)
      .slice(0, 10);

    // 8. ANÁLISIS DE TENDENCIAS
    const dailyAlerts = Object.entries(alertsByDay)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const dailyTrend = dailyAlerts.map((item, index) => {
      const prevCount = index > 0 ? dailyAlerts[index - 1].count : item.count;
      const changePercentage = prevCount > 0 
        ? ((item.count - prevCount) / prevCount) * 100 
        : 0;
      return {
        date: item.date,
        count: item.count,
        change_percentage: changePercentage
      };
    });

    const weeklyComparison = Object.entries(alertsByMonth)
      .map(([week, count]) => ({ week, count }))
      .sort((a, b) => a.week.localeCompare(b.week));

    const growthRate = dailyTrend.length > 1
      ? (dailyTrend[dailyTrend.length - 1].count - dailyTrend[0].count) / dailyTrend[0].count * 100
      : 0;

    const analysis: DetailedAuditAnalysis = {
      overview: {
        total_uploads: uploads.length,
        total_alerts: totalAlerts,
        total_graves: graveAlerts.length,
        grave_percentage: gravePercentage,
        avg_alerts_per_upload: avgAlertsPerUpload,
        most_active_source: mostActiveSource
      },
      temporal: {
        alerts_by_hour: alertsByHour,
        alerts_by_day: Object.entries(alertsByDay).map(([day, count]) => ({ day, count })),
        alerts_by_month: Object.entries(alertsByMonth).map(([month, count]) => ({ month, count })),
        peak_hour: peakHour,
        peak_day: peakDay
      },
      severity: {
        by_type: byType,
        grave_alerts: graveAlertsArray,
        severity_distribution: severityDistribution
      },
      vehicles: {
        most_alerts: mostAlerts,
        least_alerts: leastAlerts,
        total_vehicles: totalVehicles,
        avg_alerts_per_vehicle: avgAlertsPerVehicle
      },
      drivers: {
        most_incidents: mostIncidents,
        driver_performance: driverPerformance,
        total_drivers: totalDrivers
      },
      speed_analysis: {
        avg_speed: avgSpeed,
        max_speed: maxSpeed,
        min_speed: minSpeed,
        speed_ranges: speedRanges,
        excessive_speed_count: excessiveSpeedCount
      },
      location_analysis: {
        top_locations: topLocations,
        locations_with_graves: locationsWithGraves
      },
      trends: {
        daily_trend: dailyTrend,
        weekly_comparison: weeklyComparison,
        growth_rate: growthRate
      }
    };

    console.log('✅ Análisis detallado completado');
    return { success: true, data: analysis };

  } catch (error: any) {
    console.error('❌ Exception en análisis detallado:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}

/**
 * 🚗 ESTADÍSTICAS DETALLADAS POR VEHÍCULO
 */
export async function getVehicleDetailedStats(
  plate: string
): Promise<{ success: boolean; data?: VehicleDetailedStats; error?: string }> {
  try {
    console.log(`🚗 Analizando vehículo: ${plate}`);

    const alertsResult = await queryBatchAlerts({ plate });
    if (!alertsResult.success || !alertsResult.data) {
      return { success: false, error: 'Error obteniendo alertas del vehículo' };
    }

    const alerts = alertsResult.data;
    const graveAlerts = alerts.filter(a => a.is_grave);

    // Tipos de alerta
    const alertTypeCount = alerts.reduce((acc, a) => {
      acc[a.alert_type] = (acc[a.alert_type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const alertTypes = Object.entries(alertTypeCount)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);

    // Velocidades
    const speeds = alerts.map(a => a.speed).filter(s => s > 0);
    const avgSpeed = speeds.length > 0 
      ? speeds.reduce((sum, s) => sum + s, 0) / speeds.length 
      : 0;
    const maxSpeed = speeds.length > 0 ? Math.max(...speeds) : 0;

    // Distribución temporal
    const hourCount = alerts.reduce((acc, a) => {
      const hour = new Date(a.timestamp).getHours();
      acc[hour] = (acc[hour] || 0) + 1;
      return acc;
    }, {} as Record<number, number>);

    const timeDistribution = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      count: hourCount[i] || 0
    }));

    // Conductores
    const driverCount = alerts.reduce((acc, a) => {
      const driver = a.driver || 'Sin conductor';
      acc[driver] = (acc[driver] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const drivers = Object.entries(driverCount)
      .map(([driver, count]) => ({ driver, count }))
      .sort((a, b) => b.count - a.count);

    // Ubicaciones
    const locationCount = alerts.reduce((acc, a) => {
      const location = a.location || 'Sin ubicación';
      acc[location] = (acc[location] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const locations = Object.entries(locationCount)
      .map(([location, count]) => ({ location, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Fechas
    const timestamps = alerts.map(a => new Date(a.timestamp).getTime());
    const firstAlert = new Date(Math.min(...timestamps)).toISOString();
    const lastAlert = new Date(Math.max(...timestamps)).toISOString();

    // Risk Score (0-100, mayor = peor)
    const graveRatio = alerts.length > 0 ? (graveAlerts.length / alerts.length) : 0;
    const speedFactor = maxSpeed > 120 ? (maxSpeed - 120) / 100 : 0;
    const alertFrequency = alerts.length / 30; // alertas por día (asumiendo 30 días)
    const riskScore = Math.min(100, Math.round(
      (graveRatio * 40) + (speedFactor * 30) + (Math.min(alertFrequency, 1) * 30)
    ));

    // Tendencia
    const recentAlerts = alerts.filter(a => {
      const date = new Date(a.timestamp);
      const now = new Date();
      const daysDiff = (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24);
      return daysDiff <= 7;
    }).length;

    const oldAlerts = alerts.filter(a => {
      const date = new Date(a.timestamp);
      const now = new Date();
      const daysDiff = (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24);
      return daysDiff > 7 && daysDiff <= 14;
    }).length;

    const trend = recentAlerts < oldAlerts 
      ? 'improving' as const 
      : recentAlerts > oldAlerts 
        ? 'worsening' as const 
        : 'stable' as const;

    const stats: VehicleDetailedStats = {
      plate,
      total_alerts: alerts.length,
      grave_alerts: graveAlerts.length,
      alert_types: alertTypes,
      avg_speed: avgSpeed,
      max_speed: maxSpeed,
      time_distribution: timeDistribution,
      drivers,
      locations,
      first_alert: firstAlert,
      last_alert: lastAlert,
      risk_score: riskScore,
      trend
    };

    console.log(`✅ Análisis de vehículo ${plate} completado`);
    return { success: true, data: stats };

  } catch (error: any) {
    console.error('❌ Exception en análisis de vehículo:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}

/**
 * 👤 ESTADÍSTICAS DETALLADAS POR CONDUCTOR
 */
export async function getDriverDetailedStats(
  driver: string
): Promise<{ success: boolean; data?: DriverDetailedStats; error?: string }> {
  try {
    console.log(`👤 Analizando conductor: ${driver}`);

    // Obtener todas las alertas y filtrar por conductor
    const alertsResult = await queryBatchAlerts({});
    if (!alertsResult.success || !alertsResult.data) {
      return { success: false, error: 'Error obteniendo alertas' };
    }

    const alerts = alertsResult.data.filter(a => a.driver === driver);
    const graveAlerts = alerts.filter(a => a.is_grave);

    // Vehículos conducidos
    const vehicles = [...new Set(alerts.map(a => a.plate))];

    // Tipos de alerta
    const alertTypeCount = alerts.reduce((acc, a) => {
      acc[a.alert_type] = (acc[a.alert_type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const alertTypes = Object.entries(alertTypeCount)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);

    // Velocidades
    const speeds = alerts.map(a => a.speed).filter(s => s > 0);
    const avgSpeed = speeds.length > 0 
      ? speeds.reduce((sum, s) => sum + s, 0) / speeds.length 
      : 0;
    const maxSpeed = speeds.length > 0 ? Math.max(...speeds) : 0;

    // Distribución temporal
    const hourCount = alerts.reduce((acc, a) => {
      const hour = new Date(a.timestamp).getHours();
      acc[hour] = (acc[hour] || 0) + 1;
      return acc;
    }, {} as Record<number, number>);

    const timeDistribution = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      count: hourCount[i] || 0
    }));

    // Safety Score (0-100, mayor = mejor)
    const graveRatio = alerts.length > 0 ? (graveAlerts.length / alerts.length) : 0;
    const speedFactor = maxSpeed > 120 ? (maxSpeed - 120) / 100 : 0;
    const alertFrequency = alerts.length / 30;
    const safetyScore = Math.max(0, Math.round(
      100 - ((graveRatio * 40) + (speedFactor * 30) + (Math.min(alertFrequency, 1) * 30))
    ));

    // Ranking (simplificado, en producción compararía con todos los conductores)
    const ranking = 1; // Placeholder

    const stats: DriverDetailedStats = {
      driver,
      total_alerts: alerts.length,
      grave_alerts: graveAlerts.length,
      vehicles_driven: vehicles,
      alert_types: alertTypes,
      avg_speed: avgSpeed,
      max_speed: maxSpeed,
      time_distribution: timeDistribution,
      safety_score: safetyScore,
      ranking
    };

    console.log(`✅ Análisis de conductor ${driver} completado`);
    return { success: true, data: stats };

  } catch (error: any) {
    console.error('❌ Exception en análisis de conductor:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}

/**
 * 📈 EXPORTAR ANÁLISIS A CSV
 */
export function exportAnalysisToCSV(
  analysis: DetailedAuditAnalysis,
  filename: string = 'analisis_flota.csv'
): void {
  const rows: string[] = [];
  
  // Header
  rows.push('REPORTE DE ANÁLISIS DE FLOTA\n');
  rows.push(`Fecha de generación: ${new Date().toLocaleString('es-CO')}\n\n`);
  
  // Overview
  rows.push('RESUMEN GENERAL');
  rows.push('Total Cargas,Total Alertas,Faltas Graves,% Graves,Promedio Alertas/Carga,Fuente Más Activa');
  rows.push([
    analysis.overview.total_uploads,
    analysis.overview.total_alerts,
    analysis.overview.total_graves,
    analysis.overview.grave_percentage.toFixed(2) + '%',
    analysis.overview.avg_alerts_per_upload.toFixed(2),
    analysis.overview.most_active_source || 'N/A'
  ].join(','));
  
  rows.push('\n\nTOP 10 VEHÍCULOS CON MÁS ALERTAS');
  rows.push('Placa,Total Alertas,Faltas Graves');
  analysis.vehicles.most_alerts.forEach(v => {
    rows.push(`${v.plate},${v.count},${v.grave_count}`);
  });
  
  rows.push('\n\nTOP 10 CONDUCTORES CON MÁS INCIDENTES');
  rows.push('Conductor,Total Alertas,Faltas Graves');
  analysis.drivers.most_incidents.forEach(d => {
    rows.push(`${d.driver},${d.count},${d.grave_count}`);
  });
  
  const csvContent = rows.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  
  console.log(`✅ Análisis exportado a ${filename}`);
}
