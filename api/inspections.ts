import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as XLSX from 'xlsx';

// URL del Excel de inspecciones
const INSPECTIONS_URL = 'https://desarrollo.checkayg.stork.segurosayg.com/export/archivoinspeccionestotal.xlsx';

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

/**
 * Parsear fecha del Excel (formato: DD/MM/YYYY o similar)
 */
function parseExcelDate(dateStr: string): Date | null {
  if (!dateStr) return null;

  try {
    // Intentar formato DD/MM/YYYY
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      const day = parseInt(parts[0]);
      const month = parseInt(parts[1]) - 1; // Mes base 0
      const year = parseInt(parts[2]);
      return new Date(year, month, day);
    }

    // Intentar parseo directo
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date;
    }

    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Obtener mes actual en formato YYYY-MM
 */
function getCurrentMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Serverless function para descargar y parsear inspecciones preoperacionales
 * Query params:
 * - month: YYYY-MM (default: mes actual)
 * - limit: número máximo de registros (default: 5000, max: 10000)
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
    // Obtener parámetros de query
    const targetMonth = (req.query.month as string) || getCurrentMonth();
    const limitParam = parseInt(req.query.limit as string) || 5000;
    const limit = Math.min(limitParam, 10000); // Máximo 10k registros

    console.log('[Inspections] Target month:', targetMonth);
    console.log('[Inspections] Limit:', limit);
    console.log('[Inspections] Downloading Excel from:', INSPECTIONS_URL);

    // Descargar el Excel con timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 segundos timeout

    const response = await fetch(INSPECTIONS_URL, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'MagnexTorre/1.0',
        'Accept': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel'
      }
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Validar Content-Type
    const contentType = response.headers.get('content-type') || '';
    console.log('[Inspections] Content-Type:', contentType);

    // Convertir a buffer
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    console.log('[Inspections] Downloaded', buffer.length, 'bytes');

    if (buffer.length === 0) {
      throw new Error('El archivo descargado está vacío');
    }

    // Intentar detectar si es HTML de error
    const bufferStart = buffer.toString('utf8', 0, Math.min(200, buffer.length));
    if (bufferStart.toLowerCase().includes('<!doctype') || bufferStart.toLowerCase().includes('<html')) {
      throw new Error('El servidor devolvió HTML en lugar de Excel. Posible error de autenticación o URL incorrecta.');
    }

    console.log('[Inspections] Parsing Excel...');

    // Parsear Excel
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });

    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      throw new Error('El archivo Excel no contiene hojas');
    }

    // Asumir que la primera hoja contiene los datos
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // Convertir a JSON
    const rawData: any[] = XLSX.utils.sheet_to_json(worksheet);

    console.log(`[Inspections] Found ${rawData.length} total records in Excel`);

    if (rawData.length === 0) {
      return res.status(200).json({
        success: true,
        data: [],
        stats: { total: 0, ok: 0, sinInspeccion: 0, fueraDeTiempo: 0 },
        contractStats: {},
        message: 'No se encontraron registros en el Excel',
        downloadedAt: new Date().toISOString(),
        filterMonth: targetMonth
      });
    }

    // Mapear datos a estructura consistente Y FILTRAR POR MES
    let inspections: InspectionRecord[] = rawData
      .map((row: any) => {
        const fechaStr = row['Fecha'] || row['fecha'] || '';
        return {
          llave: row['Llave'] || row['llave'] || '',
          fecha: fechaStr,
          matricula: row['Matrícula'] || row['Matricula'] || row['matricula'] || row['Placa'] || '',
          dia: row['Día'] || row['Dia'] || row['dia'] || '',
          horaInicio: row['Hora inicio'] || row['hora_inicio'] || '',
          lugarInicio: row['Lugar inicio'] || row['lugar_inicio'] || '',
          horaFin: row['Hora fin'] || row['hora_fin'] || '',
          conductor: row['Conductor'] || row['conductor'] || '',
          fechaHoraInspeccion: row['Fecha y hora inspección'] || row['fecha_hora_inspeccion'] || '',
          numHallazgos: parseInt(row['Nº Hallazgos'] || row['num_hallazgos'] || '0'),
          estado: row['Estado'] || row['estado'] || 'Desconocido',
          contrato: row['Contrato'] || row['contrato'] || 'No asignado',
          tipoVehiculo: row['Tipo de vehículos'] || row['Tipo de vehiculos'] || row['tipo_vehiculo'] || ''
        };
      })
      .filter((inspection) => {
        // Filtrar por mes objetivo
        if (!inspection.fecha) return false;

        const inspectionDate = parseExcelDate(inspection.fecha);
        if (!inspectionDate) return false;

        const inspectionMonth = `${inspectionDate.getFullYear()}-${String(inspectionDate.getMonth() + 1).padStart(2, '0')}`;
        return inspectionMonth === targetMonth;
      })
      .slice(0, limit); // Limitar cantidad

    console.log(`[Inspections] Filtered to ${inspections.length} records for month ${targetMonth}`);

    // Calcular estadísticas
    const stats = {
      total: inspections.length,
      ok: inspections.filter(i => i.estado === 'OK').length,
      sinInspeccion: inspections.filter(i => i.estado.toLowerCase().includes('sin inspección') || i.estado.toLowerCase().includes('sin inspeccion')).length,
      fueraDeTiempo: inspections.filter(i => i.estado.toLowerCase().includes('fuera de tiempo')).length
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

    console.log('[Inspections] Successfully parsed and filtered inspections');

    return res.status(200).json({
      success: true,
      data: inspections,
      stats,
      contractStats,
      downloadedAt: new Date().toISOString(),
      filterMonth: targetMonth,
      totalRecordsInExcel: rawData.length,
      recordsAfterFilter: inspections.length
    });

  } catch (error: any) {
    console.error('[Inspections] Error:', error);
    console.error('[Inspections] Error stack:', error.stack);

    // Determinar mensaje de error amigable
    let friendlyMessage = error.message || 'Error desconocido';

    if (error.name === 'AbortError') {
      friendlyMessage = 'Timeout: La descarga del Excel tardó más de 30 segundos';
    } else if (error.message?.includes('fetch')) {
      friendlyMessage = 'No se pudo conectar al servidor de inspecciones. Verifica la URL o tu conexión.';
    } else if (error.message?.includes('HTML')) {
      friendlyMessage = error.message;
    }

    return res.status(500).json({
      success: false,
      error: friendlyMessage,
      errorDetails: error.message,
      data: [],
      stats: { total: 0, ok: 0, sinInspeccion: 0, fueraDeTiempo: 0 },
      contractStats: {},
      downloadedAt: new Date().toISOString()
    });
  }
}
