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

    console.log('✅ Registro de carga creado:', data.id);
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
      is_grave: alert.is_grave
    }));

    console.log(`💾 Guardando ${alertsToInsert.length} alertas...`);

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
