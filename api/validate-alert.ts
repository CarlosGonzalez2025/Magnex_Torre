import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { validateAlertWithRPA } from '../services/rpaValidationService';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://cmzeijcyykzdmvisojte.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const config = {
  maxDuration: 60 // Permite hasta 60s para la ejecución del navegador y carga de mapas
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Solo permitir POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { plate, timestamp, source, alertId } = req.body || {};

  if (!plate || !timestamp || !source || !alertId) {
    return res.status(400).json({
      error: 'Faltan parámetros requeridos',
      message: 'Se requiere plate, timestamp, source y alertId en el cuerpo de la petición.'
    });
  }

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({
      error: 'Supabase no configurado',
      message: 'Falta la variable de entorno SUPABASE_SERVICE_ROLE_KEY en el servidor.'
    });
  }

  console.log(`[API Validation] 🚀 Iniciando validación RPA para alerta ${alertId} (${plate} en ${source})`);

  try {
    // 1. Inicializar cliente de Supabase con bypass de RLS
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 2. Ejecutar Agente RPA
    const validationResult = await validateAlertWithRPA(plate, timestamp, source);
    console.log(`[API Validation] Resultado RPA:`, {
      isValid: validationResult.isValid,
      reason: validationResult.reason,
      hasScreenshot: !!validationResult.screenshotBuffer && validationResult.screenshotBuffer.length > 0
    });

    let screenshotUrl = '';

    // 3. Subir captura de pantalla a Supabase Storage (si existe y tiene tamaño)
    if (validationResult.screenshotBuffer && validationResult.screenshotBuffer.length > 0) {
      const bucketName = 'gps-alerts-screenshots';
      const fallbackBucket = 'action-plan-attachments';
      const fileName = `${plate}/${alertId}_${Date.now()}.png`;

      let activeBucket = bucketName;
      console.log(`[API Validation] Subiendo captura a Supabase Storage en el bucket: ${activeBucket}...`);

      // Intentar subir al bucket de capturas
      let { error: uploadError } = await supabase.storage
        .from(activeBucket)
        .upload(fileName, validationResult.screenshotBuffer, {
          contentType: 'image/png',
          cacheControl: '3600',
          upsert: true
        });

      // Si falla porque no existe el bucket de screenshots, caemos al bucket genérico de adjuntos
      if (uploadError && uploadError.message.includes('not found')) {
        console.warn(`[API Validation] Bucket '${bucketName}' no encontrado. Intentando con bucket de respaldo '${fallbackBucket}'...`);
        activeBucket = fallbackBucket;
        const fallbackFileName = `screenshots/${plate}/${alertId}_${Date.now()}.png`;
        
        const { error: fallbackError } = await supabase.storage
          .from(activeBucket)
          .upload(fallbackFileName, validationResult.screenshotBuffer, {
            contentType: 'image/png',
            cacheControl: '3600',
            upsert: true
          });
          
        uploadError = fallbackError;
      }

      if (uploadError) {
        console.error('[API Validation] Error subiendo captura de pantalla:', uploadError.message);
      } else {
        // Obtener URL pública
        const { data: publicUrlData } = supabase.storage
          .from(activeBucket)
          .getPublicUrl(activeBucket === bucketName ? fileName : `screenshots/${plate}/${alertId}_${Date.now()}.png`);

        screenshotUrl = publicUrlData?.publicUrl || '';
        console.log(`[API Validation] Captura subida con éxito. URL: ${screenshotUrl}`);
      }
    }

    // 4. Actualizar registro en saved_alerts
    const { error: updateSavedError } = await supabase
      .from('saved_alerts')
      .update({
        screenshot_url: screenshotUrl || null,
        validation_reason: validationResult.reason,
        is_real_alert: validationResult.isValid,
        updated_at: new Date().toISOString()
      })
      .eq('alert_id', alertId);

    if (updateSavedError) {
      console.error('[API Validation] Error actualizando saved_alerts:', updateSavedError.message);
    } else {
      console.log(`[API Validation] Fila en saved_alerts actualizada.`);
    }

    // 5. Actualizar registro en alert_history (por si ya fue movida manualmente)
    const { error: updateHistoryError } = await supabase
      .from('alert_history')
      .update({
        screenshot_url: screenshotUrl || null,
        validation_reason: validationResult.reason,
        is_real_alert: validationResult.isValid,
        updated_at: new Date().toISOString()
      })
      .eq('alert_id', alertId);

    if (updateHistoryError) {
      console.error('[API Validation] Error actualizando alert_history:', updateHistoryError.message);
    } else {
      console.log(`[API Validation] Fila en alert_history actualizada.`);
    }

    return res.status(200).json({
      success: true,
      alertId,
      plate,
      source,
      isValid: validationResult.isValid,
      reason: validationResult.reason,
      screenshotUrl
    });

  } catch (error: any) {
    console.error('[API Validation] Excepción en handler de validación:', error);
    return res.status(500).json({
      error: 'Error interno en validación RPA',
      message: error.message
    });
  }
}
