import type { VercelRequest, VercelResponse } from '@vercel/node';

// ============================================================================
// CONFIGURACIÓN - Google Apps Script API
// ============================================================================
// IMPORTANTE: Reemplaza esta URL con la que obtienes al deployar el Apps Script
// Ejemplo: https://script.google.com/macros/s/AKfycbxXXXXXXX/exec
//
// Instrucciones completas en: /docs/GOOGLE_SHEETS_SETUP.m
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbx-TjIIneq8C6FLTBNPq6_Asdd273nYmvw8r5QVRl8YxIM7Y8klA31HiUJfErK340KYpg/exec';

// ============================================================================
// Interfaces
// ============================================================================

interface InspectionRecord {
  llave: string;
  fecha: string;
  matricula: string;
  dia: string;
  horaInicio: string;
  lugarInicio: string;
  horaFin: string;
  conductor: string;
  fechaHoraInspeccion: string;
  numHallazgos: number;
  estado: string;
  contrato: string;
  tipoVehiculo: string;
}

interface AppsScriptResponse {
  success: boolean;
  data?: InspectionRecord[];
  stats?: {
    totalInExcel?: number;
    filteredRecords: number;
    startDate: string;
    endDate: string;
  };
  error?: string;
  timestamp: string;
}

// ============================================================================
// Utilidades
// ============================================================================

/**
 * Obtener rango de fechas por defecto (últimos 7 días)
 */
function getDefaultDateRange(): { startDate: string; endDate: string } {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 7); // 7 días atrás

  return {
    startDate: startDate.toISOString().split('T')[0], // YYYY-MM-DD
    endDate: endDate.toISOString().split('T')[0]
  };
}

// ============================================================================
// Handler Principal
// ============================================================================

/**
 * Serverless function para obtener inspecciones desde Google Apps Script
 *
 * Query params:
 * - startDate: YYYY-MM-DD (default: hoy - 7 días)
 * - endDate: YYYY-MM-DD (default: hoy)
 * - limit: número máximo de registros (default: 3000, max: 5000)
 * - action: 'replace' (descarga Excel y reemplaza Sheet) o 'get' (solo lee Sheet)
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Verificar que Apps Script esté configurado
    if (APPS_SCRIPT_URL === 'TU_URL_DE_APPS_SCRIPT_AQUI') {
      throw new Error(
        'Apps Script no configurado. Por favor, actualiza APPS_SCRIPT_URL en /api/inspections.ts con tu URL de Apps Script. ' +
        'Consulta /docs/GOOGLE_SHEETS_SETUP.md para instrucciones.'
      );
    }

    // Obtener parámetros de query
    const defaultRange = getDefaultDateRange();
    const startDateParam = (req.query.startDate as string) || defaultRange.startDate;
    const endDateParam = (req.query.endDate as string) || defaultRange.endDate;
    const limitParam = parseInt(req.query.limit as string) || 3000;
    const limit = Math.min(limitParam, 5000); // Máximo 5k registros
    const action = (req.query.action as string) || 'replace'; // 'replace' o 'get'

    console.log('[Inspections] Calling Apps Script API');
    console.log('[Inspections] Date range:', startDateParam, 'to', endDateParam);
    console.log('[Inspections] Action:', action);
    console.log('[Inspections] Limit:', limit);

    // Construir URL de Apps Script con parámetros
    const url = new URL(APPS_SCRIPT_URL);
    url.searchParams.set('action', action);
    url.searchParams.set('startDate', startDateParam);
    url.searchParams.set('endDate', endDateParam);
    url.searchParams.set('limit', limit.toString());

    console.log('[Inspections] Apps Script URL:', url.toString());

    // Llamar a Apps Script con timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 segundos para Apps Script

    const response = await fetch(url.toString(), {
      signal: controller.signal,
      method: 'GET',
      redirect: 'follow'
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Apps Script HTTP ${response.status}: ${response.statusText}`);
    }

    // Parsear respuesta JSON
    const appsScriptData: AppsScriptResponse = await response.json();

    console.log('[Inspections] Apps Script response:', {
      success: appsScriptData.success,
      recordCount: appsScriptData.data?.length || 0,
      hasError: !!appsScriptData.error
    });

    // Verificar si Apps Script retornó error
    if (!appsScriptData.success) {
      throw new Error(appsScriptData.error || 'Apps Script retornó error desconocido');
    }

    // Obtener datos
    const inspections = appsScriptData.data || [];

    console.log(`[Inspections] Received ${inspections.length} records from Apps Script`);

    // Calcular estadísticas localmente
    const stats = {
      total: inspections.length,
      ok: inspections.filter(i => i.estado === 'OK').length,
      sinInspeccion: inspections.filter(i =>
        i.estado.toLowerCase().includes('sin inspección') ||
        i.estado.toLowerCase().includes('sin inspeccion')
      ).length,
      fueraDeTiempo: inspections.filter(i =>
        i.estado.toLowerCase().includes('fuera de tiempo')
      ).length
    };

    // Estadísticas por contrato
    const contractStats: Record<string, any> = {};
    inspections.forEach(inspection => {
      const contract = inspection.contrato || 'No asignado';
      if (!contractStats[contract]) {
        contractStats[contract] = {
          total: 0,
          ok: 0,
          sinInspeccion: 0,
          fueraDeTiempo: 0
        };
      }
      contractStats[contract].total++;
      if (inspection.estado === 'OK') contractStats[contract].ok++;
      if (inspection.estado.toLowerCase().includes('sin inspección')) contractStats[contract].sinInspeccion++;
      if (inspection.estado.toLowerCase().includes('fuera de tiempo')) contractStats[contract].fueraDeTiempo++;
    });

    console.log('[Inspections] Successfully processed inspections from Apps Script');

    // Retornar respuesta en formato esperado por el sistema
    return res.status(200).json({
      success: true,
      data: inspections,
      stats,
      contractStats,
      downloadedAt: appsScriptData.timestamp || new Date().toISOString(),
      filterStartDate: startDateParam,
      filterEndDate: endDateParam,
      totalRecordsInExcel: appsScriptData.stats?.totalInExcel || 0,
      recordsAfterFilter: appsScriptData.stats?.filteredRecords || inspections.length,
      source: 'apps-script',
      action: action
    });

  } catch (error: any) {
    console.error('[Inspections] Error:', error);
    console.error('[Inspections] Error stack:', error.stack);

    // Determinar mensaje de error amigable
    let friendlyMessage = error.message || 'Error desconocido';

    if (error.name === 'AbortError') {
      friendlyMessage = 'Timeout: La llamada a Apps Script tardó más de 60 segundos. ' +
        'Esto puede ocurrir si el archivo Excel es muy grande. ' +
        'Intenta con un rango de fechas más pequeño.';
    } else if (error.message?.includes('fetch')) {
      friendlyMessage = 'No se pudo conectar a Google Apps Script. Verifica que la URL esté correcta y que el script esté deployado.';
    } else if (error.message?.includes('Apps Script no configurado')) {
      friendlyMessage = error.message;
    }

    return res.status(500).json({
      success: false,
      error: friendlyMessage,
      errorDetails: error.message,
      errorStack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      data: [],
      stats: { total: 0, ok: 0, sinInspeccion: 0, fueraDeTiempo: 0 },
      contractStats: {},
      downloadedAt: new Date().toISOString(),
      source: 'apps-script-error'
    });
  }
}
