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

// ==================== FILE UPLOAD FUNCTIONS ====================

/**
 * Guarda el registro de carga de archivo en file_uploads
 * @returns Upload ID para asociar las alertas
 */
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

/**
 * Obtiene todos los registros de carga
 */
export async function getAllFileUploads(): Promise<{
  success: boolean;
  data?: FileUploadRecord[];
  error?: string;
}> {
  try {
    const { data, error } = await supabase
      .from('file_uploads')
      .select('*')
      .order('upload_date', { ascending: false });

    if (error) {
      console.error('❌ Error obteniendo registros:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data: data as FileUploadRecord[] };

  } catch (error: any) {
    console.error('❌ Exception obteniendo registros:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}

// ==================== BATCH ALERTS FUNCTIONS ====================

/**
 * Guarda alertas procesadas en batch_alerts
 * Usa transacción para insertar múltiples filas
 */
export async function saveBatchAlerts(
  uploadId: string,
  alerts: BatchAlert[]
): Promise<{ success: boolean; insertedCount?: number; error?: string }> {
  try {
    if (alerts.length === 0) {
      return { success: false, error: 'No hay alertas para guardar' };
    }

    // Preparar datos para inserción
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
    console.log('🔍 Primera alerta a insertar:', alertsToInsert[0]);

    // Insertar en batch (Supabase soporta hasta 1000 filas por request)
    // Si hay más de 1000, dividir en chunks
    const chunkSize = 1000;
    let totalInserted = 0;

    for (let i = 0; i < alertsToInsert.length; i += chunkSize) {
      const chunk = alertsToInsert.slice(i, i + chunkSize);

      const { data, error } = await supabase
        .from('batch_alerts')
        .insert(chunk)
        .select();

      if (error) {
        console.error(`❌ Error insertando chunk ${i / chunkSize + 1}:`, error);
        return { success: false, error: error.message };
      }

      totalInserted += data.length;
      console.log(`✅ Chunk ${i / chunkSize + 1} guardado: ${data.length} filas`);
    }

    console.log(`✅ Total insertado: ${totalInserted} alertas`);
    return { success: true, insertedCount: totalInserted };

  } catch (error: any) {
    console.error('❌ Exception guardando alertas:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}

/**
 * Obtiene alertas de una carga específica
 */
export async function getAlertsByUploadId(
  uploadId: string
): Promise<{ success: boolean; data?: BatchAlertRecord[]; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('batch_alerts')
      .select('*')
      .eq('upload_id', uploadId)
      .order('timestamp', { ascending: false });

    if (error) {
      console.error('❌ Error obteniendo alertas:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data: data as BatchAlertRecord[] };

  } catch (error: any) {
    console.error('❌ Exception obteniendo alertas:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}

/**
 * Obtiene solo Faltas Graves de una carga
 */
export async function getGraveAlertsByUploadId(
  uploadId: string
): Promise<{ success: boolean; data?: BatchAlertRecord[]; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('batch_alerts')
      .select('*')
      .eq('upload_id', uploadId)
      .eq('is_grave', true)
      .order('timestamp', { ascending: false });

    if (error) {
      console.error('❌ Error obteniendo faltas graves:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data: data as BatchAlertRecord[] };

  } catch (error: any) {
    console.error('❌ Exception obteniendo faltas graves:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}

/**
 * Obtiene todas las Faltas Graves (de todas las cargas)
 */
export async function getAllGraveAlerts(): Promise<{
  success: boolean;
  data?: BatchAlertRecord[];
  error?: string;
}> {
  try {
    const { data, error } = await supabase
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

    if (error) {
      console.error('❌ Error obteniendo todas las faltas graves:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data: data as any };

  } catch (error: any) {
    console.error('❌ Exception obteniendo faltas graves:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}

// ==================== STATISTICS ====================

/**
 * Obtiene resumen de auditoría
 */
export async function getAuditSummary(): Promise<{
  success: boolean;
  data?: AuditSummary;
  error?: string;
}> {
  try {
    // Obtener uploads recientes
    const { data: uploads, error: uploadsError } = await supabase
      .from('file_uploads')
      .select('*')
      .order('upload_date', { ascending: false })
      .limit(10);

    if (uploadsError) {
      return { success: false, error: uploadsError.message };
    }

    // Contar total de alertas
    const { count: totalAlerts, error: alertsError } = await supabase
      .from('batch_alerts')
      .select('*', { count: 'exact', head: true });

    if (alertsError) {
      return { success: false, error: alertsError.message };
    }

    // Contar faltas graves
    const { count: totalGraves, error: gravesError } = await supabase
      .from('batch_alerts')
      .select('*', { count: 'exact', head: true })
      .eq('is_grave', true);

    if (gravesError) {
      return { success: false, error: gravesError.message };
    }

    const summary: AuditSummary = {
      total_uploads: uploads.length,
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

/**
 * Elimina una carga y todas sus alertas asociadas
 */
export async function deleteUpload(
  uploadId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Primero eliminar alertas asociadas
    const { error: alertsError } = await supabase
      .from('batch_alerts')
      .delete()
      .eq('upload_id', uploadId);

    if (alertsError) {
      console.error('❌ Error eliminando alertas:', alertsError);
      return { success: false, error: alertsError.message };
    }

    // Luego eliminar el registro de carga
    const { error: uploadError } = await supabase
      .from('file_uploads')
      .delete()
      .eq('id', uploadId);

    if (uploadError) {
      console.error('❌ Error eliminando carga:', uploadError);
      return { success: false, error: uploadError.message };
    }

    console.log('✅ Carga eliminada:', uploadId);
    return { success: true };

  } catch (error: any) {
    console.error('❌ Exception eliminando carga:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}

/**
 * Elimina una alerta individual
 */
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

/**
 * Elimina TODAS las alertas de la tabla batch_alerts
 * ⚠️ OPERACIÓN DESTRUCTIVA - Elimina todos los registros
 */
export async function deleteAllBatchAlerts(): Promise<{
  success: boolean;
  deletedCount?: number;
  error?: string;
}> {
  try {
    // Contar registros antes de eliminar
    const { count, error: countError } = await supabase
      .from('batch_alerts')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      console.error('❌ Error contando alertas:', countError);
      return { success: false, error: countError.message };
    }

    // Eliminar todos los registros
    const { error: deleteError } = await supabase
      .from('batch_alerts')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Condición que siempre es verdadera

    if (deleteError) {
      console.error('❌ Error eliminando todas las alertas:', deleteError);
      return { success: false, error: deleteError.message };
    }

    console.log(`✅ ${count} alertas eliminadas de batch_alerts`);
    return { success: true, deletedCount: count || 0 };

  } catch (error: any) {
    console.error('❌ Exception eliminando todas las alertas:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}

// ==================== QUERY FUNCTIONS WITH FILTERS ====================

export interface AlertFilters {
  startDate?: string; // ISO 8601
  endDate?: string; // ISO 8601
  plate?: string;
  alertType?: string; // Para búsqueda por texto (deprecated, usar alertTypes)
  alertTypes?: string[]; // Para selección múltiple de tipos exactos
  source?: 'FAGOR' | 'COLTRACK';
  isGrave?: boolean;
  uploadId?: string;
}

/**
 * Consulta alertas con filtros opcionales
 */
export async function queryBatchAlerts(
  filters: AlertFilters = {}
): Promise<{ success: boolean; data?: BatchAlertRecord[]; error?: string }> {
  try {
    // SOLUCIÓN: Primero obtener todos los file_uploads para hacer el join manualmente
    const { data: uploadsData, error: uploadsError } = await supabase
      .from('file_uploads')
      .select('id, filename, source, upload_date');

    if (uploadsError) {
      console.error('❌ Error obteniendo file_uploads:', uploadsError);
    }

    // Crear un Map de upload_id → file_uploads para lookup rápido
    const uploadsMap = new Map<string, any>();
    if (uploadsData) {
      uploadsData.forEach(upload => {
        uploadsMap.set(upload.id, upload);
      });
      console.log(`📦 File uploads cargados: ${uploadsMap.size} registros`);
    }

    // Ahora consultar batch_alerts (sin join, más rápido y confiable)
    // IMPORTANTE: Supabase limita por defecto a 1000 registros, aumentar el límite
    let query = supabase
      .from('batch_alerts')
      .select('*', { count: 'exact' }); // count para saber el total

    // Aplicar filtros
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
    // Filtro de múltiples tipos de alerta
    if (filters.alertTypes && filters.alertTypes.length > 0) {
      query = query.in('alert_type', filters.alertTypes);
    }
    if (filters.isGrave !== undefined) {
      query = query.eq('is_grave', filters.isGrave);
    }
    if (filters.uploadId) {
      query = query.eq('upload_id', filters.uploadId);
    }

    // Ordenar por timestamp descendente
    query = query.order('timestamp', { ascending: false });

    // Aumentar el límite a 10000 registros (ajusta según necesites)
    query = query.limit(10000);

    const { data, error, count } = await query;

    if (error) {
      console.error('❌ Error consultando alertas:', error);
      return { success: false, error: error.message };
    }

    console.log('🔍 Debug - Total registros obtenidos de BD:', data?.length || 0);
    console.log('🔍 Debug - Total registros en tabla (count):', count || 0);

    // Enriquecer alertas con datos de file_uploads (join manual)
    let enrichedData = data?.map((alert: any) => {
      const uploadInfo = uploadsMap.get(alert.upload_id);
      return {
        ...alert,
        file_uploads: uploadInfo || null
      };
    }) || [];

    // Debug: Verificar sources
    if (enrichedData.length > 0) {
      const sourceCounts = enrichedData.reduce((acc: any, item: any) => {
        const source = item.file_uploads?.source || 'SIN_SOURCE';
        acc[source] = (acc[source] || 0) + 1;
        return acc;
      }, {});
      console.log('📊 Distribución por source (después de join manual):', sourceCounts);

      // Mostrar primeras 3 alertas con su source
      console.log('🔍 Primeras 3 alertas:', enrichedData.slice(0, 3).map((item: any) => ({
        id: item.id,
        plate: item.plate,
        alert_type: item.alert_type,
        upload_id: item.upload_id,
        file_uploads_exists: !!item.file_uploads,
        source: item.file_uploads?.source || 'NO_SOURCE'
      })));
    }

    // Filtrar por source si se especificó
    let filteredData = enrichedData;
    if (filters.source && filteredData) {
      filteredData = filteredData.filter(
        (alert: any) => alert.file_uploads?.source === filters.source
      );
      console.log(`✅ Filtrado por source '${filters.source}': ${filteredData.length} alertas`);
    }

    console.log(`✅ Consulta exitosa: ${filteredData?.length || 0} alertas`);
    return { success: true, data: filteredData as BatchAlertRecord[] };

  } catch (error: any) {
    console.error('❌ Exception consultando alertas:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}

/**
 * Obtiene todos los tipos de alerta únicos de la base de datos
 */
export async function getUniqueAlertTypes(): Promise<{ success: boolean; data?: string[]; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('batch_alerts')
      .select('alert_type')
      .order('alert_type', { ascending: true });

    if (error) {
      console.error('❌ Error obteniendo tipos de alerta:', error);
      return { success: false, error: error.message };
    }

    // Extraer valores únicos
    const uniqueTypes = [...new Set(data.map(item => item.alert_type))];

    console.log(`✅ Tipos de alerta únicos: ${uniqueTypes.length}`);
    return { success: true, data: uniqueTypes };

  } catch (error: any) {
    console.error('❌ Exception obteniendo tipos de alerta:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}
