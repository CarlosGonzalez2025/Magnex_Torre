import * as XLSX from 'xlsx';

// ==================== TYPES ====================

export interface BatchAlert {
  plate: string;
  alert_type: string;
  speed: number | null;
  timestamp: string;
  driver?: string;
  severity: 'critical' | 'high' | 'medium';
  is_grave: boolean;
}

export interface ProcessingResult {
  success: boolean;
  data?: BatchAlert[];
  totalRows: number;
  gravesDetected: number;
  error?: string;
}

// ==================== UTILITY FUNCTIONS ====================

/**
 * Convierte fecha en formato DD/MM/YYYY HH:MM:SS a ISO 8601
 * Soporta múltiples formatos comunes de fecha
 */
function parseTimestampToISO(timestamp: string | null | undefined): string {
  if (!timestamp) {
    return new Date().toISOString();
  }

  const timestampStr = timestamp.toString().trim();

  // Intentar parsear formato DD/MM/YYYY HH:MM:SS (FAGOR)
  const ddmmyyyyPattern = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{1,2}):(\d{1,2})$/;
  const match = timestampStr.match(ddmmyyyyPattern);

  if (match) {
    const [, day, month, year, hours, minutes, seconds] = match;
    // Crear fecha en formato ISO: YYYY-MM-DDTHH:MM:SS.000Z
    const isoDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}:${seconds.padStart(2, '0')}.000Z`;

    // Validar que la fecha sea válida
    const dateObj = new Date(isoDate);
    if (!isNaN(dateObj.getTime())) {
      return dateObj.toISOString();
    }
  }

  // Intentar parsear como fecha ISO directa
  try {
    const dateObj = new Date(timestampStr);
    if (!isNaN(dateObj.getTime())) {
      return dateObj.toISOString();
    }
  } catch (e) {
    console.warn('⚠️ No se pudo parsear timestamp:', timestampStr);
  }

  // Fallback: fecha actual
  return new Date().toISOString();
}

// ==================== FAGOR PROCESSOR ====================

/**
 * Procesa archivos de FAGOR (Excel/CSV con múltiples headers)
 * Busca la fila que contiene "Matrícula" como inicio de datos
 */
function processFagorFile(workbook: XLSX.WorkBook): ProcessingResult {
  try {
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // Convertir a array de arrays
    const rawData: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    if (rawData.length === 0) {
      return { success: false, error: 'Archivo vacío', totalRows: 0, gravesDetected: 0 };
    }

    // Buscar fila de headers (que contiene "Matrícula")
    let headerRowIndex = -1;
    for (let i = 0; i < rawData.length; i++) {
      const row = rawData[i];
      if (row.some((cell: any) =>
        cell && cell.toString().toLowerCase().includes('matrícula')
      )) {
        headerRowIndex = i;
        break;
      }
    }

    if (headerRowIndex === -1) {
      return {
        success: false,
        error: 'No se encontró la fila de encabezados con "Matrícula"',
        totalRows: 0,
        gravesDetected: 0
      };
    }

    const headers = rawData[headerRowIndex].map((h: any) =>
      h ? h.toString().trim().toLowerCase() : ''
    );

    console.log('📊 FAGOR - Fila de headers encontrada:', headerRowIndex);
    console.log('📊 FAGOR - Headers detectados:', headers);

    // Mapear índices de columnas
    const plateIndex = headers.findIndex((h: string) => h.includes('matrícula'));

    // Buscar columna de tipo de alerta (puede ser "Estado", "Iconos", "Alerta", etc.)
    let alertTypeIndex = headers.findIndex((h: string) =>
      h.includes('estado') || h.includes('alerta') || h.includes('tipo')
    );

    // Si no se encuentra columna específica, buscar en columnas que tengan texto
    if (alertTypeIndex === -1) {
      // Intentar detectar automáticamente revisando la primera fila de datos
      const firstDataRow = rawData[headerRowIndex + 1];
      if (firstDataRow) {
        for (let idx = 0; idx < firstDataRow.length; idx++) {
          const cellValue = firstDataRow[idx];
          if (cellValue && cellValue.toString().toLowerCase().includes('alrm')) {
            alertTypeIndex = idx;
            console.log(`📊 FAGOR - Detectado tipo de alerta en columna ${idx} automáticamente`);
            break;
          }
        }
      }
    }

    // Si aún no se encuentra, usar columna 0 como fallback
    if (alertTypeIndex === -1) {
      alertTypeIndex = 0;
    }

    const speedIndex = headers.findIndex((h: string) => h.includes('velocidad'));
    const timestampIndex = headers.findIndex((h: string) =>
      h.includes('ult.') || h.includes('pos') || h.includes('fecha')
    );
    const driverIndex = headers.findIndex((h: string) => h.includes('conductor'));

    console.log('📊 FAGOR - Índices de columnas:', {
      plate: plateIndex,
      alertType: alertTypeIndex,
      speed: speedIndex,
      timestamp: timestampIndex,
      driver: driverIndex
    });

    // Mostrar muestra de primera fila de datos para diagnóstico
    if (rawData.length > headerRowIndex + 1) {
      console.log('📊 FAGOR - Primera fila de datos:', rawData[headerRowIndex + 1]);
    }

    if (plateIndex === -1) {
      return {
        success: false,
        error: 'No se encontró columna de Matrícula',
        totalRows: 0,
        gravesDetected: 0
      };
    }

    // Procesar filas de datos
    const alerts: BatchAlert[] = [];
    let gravesCount = 0;

    for (let i = headerRowIndex + 1; i < rawData.length; i++) {
      const row = rawData[i];

      // Saltar filas vacías
      if (!row || row.length === 0 || !row[plateIndex]) {
        continue;
      }

      const plate = row[plateIndex]?.toString().trim();
      if (!plate) continue;

      // Extraer alertType con manejo robusto de null/undefined
      const alertTypeRaw = row[alertTypeIndex];
      const alertType = (alertTypeRaw !== null && alertTypeRaw !== undefined)
        ? alertTypeRaw.toString().trim()
        : 'Sin especificar';

      const speedRaw = speedIndex >= 0 ? row[speedIndex] : null;
      const speed = speedRaw ? parseFloat(speedRaw.toString()) : null;

      // Parsear timestamp a formato ISO 8601
      const timestampRaw = timestampIndex >= 0 ? row[timestampIndex] : null;
      const timestamp = parseTimestampToISO(timestampRaw?.toString());

      const driver = driverIndex >= 0 ? row[driverIndex]?.toString().trim() : undefined;

      // Detectar Falta Grave: "Alrm. de excesos de velocidad"
      // Asegurar que alertType sea string antes de usar métodos
      const alertTypeLower = alertType ? alertType.toLowerCase() : '';
      const isGrave = alertTypeLower.includes('alrm') &&
                      alertTypeLower.includes('exceso') &&
                      alertTypeLower.includes('velocidad');

      if (isGrave) {
        gravesCount++;
      }

      alerts.push({
        plate,
        alert_type: alertType,
        speed,
        timestamp,
        driver,
        severity: isGrave ? 'critical' : speed && speed > 100 ? 'high' : 'medium',
        is_grave: isGrave
      });
    }

    console.log(`✅ FAGOR procesado: ${alerts.length} alertas, ${gravesCount} graves`);

    return {
      success: true,
      data: alerts,
      totalRows: alerts.length,
      gravesDetected: gravesCount
    };

  } catch (error: any) {
    console.error('❌ Error procesando FAGOR:', error);
    return {
      success: false,
      error: error.message || 'Error desconocido procesando archivo FAGOR',
      totalRows: 0,
      gravesDetected: 0
    };
  }
}

// ==================== COLTRACK PROCESSOR ====================

/**
 * Procesa archivos de COLTRACK (CSV delimitado por pipe "|")
 */
function processColtrackFile(workbook: XLSX.WorkBook): ProcessingResult {
  try {
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // Convertir a JSON
    const rawData: any[] = XLSX.utils.sheet_to_json(sheet);

    if (rawData.length === 0) {
      return { success: false, error: 'Archivo vacío', totalRows: 0, gravesDetected: 0 };
    }

    console.log('📊 COLTRACK - Primera fila:', rawData[0]);
    console.log('📊 COLTRACK - Columnas disponibles:', Object.keys(rawData[0]));

    const alerts: BatchAlert[] = [];
    let gravesCount = 0;

    for (const row of rawData) {
      // Mapear columnas (case insensitive)
      const plate = row['Nombre'] || row['nombre'] || row['NOMBRE'] || '';
      const alertType = row['Evento'] || row['evento'] || row['EVENTO'] || 'Sin especificar';
      const speedRaw = row['Max kph'] || row['max kph'] || row['MAX KPH'] || row['Velocidad'] || null;
      const speed = speedRaw ? parseFloat(speedRaw.toString().replace(/[^\d.-]/g, '')) : null;

      // Parsear timestamp a formato ISO 8601
      const timestampRaw = row['Hora Reporte'] || row['hora reporte'] || row['HORA REPORTE'] || row['Fecha'] || null;
      const timestamp = parseTimestampToISO(timestampRaw);

      // Concatenar nombre + apellido del conductor
      const firstName = row['Nombre Conductor'] || row['nombre conductor'] || '';
      const lastName = row['Apellido'] || row['apellido'] || row['Apellido Conductor'] || '';
      const driver = `${firstName} ${lastName}`.trim() || undefined;

      if (!plate || !plate.toString().trim()) {
        continue; // Saltar filas sin placa
      }

      // Detectar Falta Grave: "infraccion" (case insensitive)
      const alertTypeLower = alertType ? alertType.toLowerCase() : '';
      const isGrave = alertTypeLower.includes('infraccion') ||
                      alertTypeLower.includes('infracción');

      if (isGrave) {
        gravesCount++;
      }

      alerts.push({
        plate: plate.toString().trim(),
        alert_type: alertType.toString().trim(),
        speed,
        timestamp: timestamp.toString(),
        driver,
        severity: isGrave ? 'critical' : speed && speed > 100 ? 'high' : 'medium',
        is_grave: isGrave
      });
    }

    console.log(`✅ COLTRACK procesado: ${alerts.length} alertas, ${gravesCount} graves`);

    return {
      success: true,
      data: alerts,
      totalRows: alerts.length,
      gravesDetected: gravesCount
    };

  } catch (error: any) {
    console.error('❌ Error procesando COLTRACK:', error);
    return {
      success: false,
      error: error.message || 'Error desconocido procesando archivo COLTRACK',
      totalRows: 0,
      gravesDetected: 0
    };
  }
}

// ==================== MAIN PROCESSOR ====================

/**
 * Procesa un archivo según el proveedor seleccionado
 * @param file - Archivo cargado (.xlsx o .csv)
 * @param source - Proveedor ('FAGOR' o 'COLTRACK')
 */
export async function processFile(
  file: File,
  source: 'FAGOR' | 'COLTRACK'
): Promise<ProcessingResult> {
  try {
    console.log(`🚀 Procesando archivo: ${file.name} (${source})`);

    // Leer archivo como array buffer
    const arrayBuffer = await file.arrayBuffer();

    // Parsear con xlsx
    const workbook = XLSX.read(arrayBuffer, {
      type: 'array',
      // Para COLTRACK (CSV con pipe), especificar delimitador
      ...(source === 'COLTRACK' && file.name.endsWith('.csv') ? {
        raw: true,
        FS: '|' // Field Separator
      } : {})
    });

    if (!workbook || workbook.SheetNames.length === 0) {
      return {
        success: false,
        error: 'No se pudo leer el archivo o está vacío',
        totalRows: 0,
        gravesDetected: 0
      };
    }

    // Procesar según proveedor
    if (source === 'FAGOR') {
      return processFagorFile(workbook);
    } else {
      return processColtrackFile(workbook);
    }

  } catch (error: any) {
    console.error('❌ Error general procesando archivo:', error);
    return {
      success: false,
      error: `Error al procesar archivo: ${error.message}`,
      totalRows: 0,
      gravesDetected: 0
    };
  }
}

/**
 * Valida el formato del archivo antes de procesarlo
 */
export function validateFile(file: File, source: 'FAGOR' | 'COLTRACK'): { valid: boolean; error?: string } {
  const maxSize = 10 * 1024 * 1024; // 10 MB

  if (file.size > maxSize) {
    return { valid: false, error: 'El archivo es demasiado grande (máximo 10 MB)' };
  }

  const validExtensions = ['.xlsx', '.xls', '.csv'];
  const fileName = file.name.toLowerCase();
  const hasValidExtension = validExtensions.some(ext => fileName.endsWith(ext));

  if (!hasValidExtension) {
    return { valid: false, error: 'Formato de archivo no válido. Use .xlsx, .xls o .csv' };
  }

  // Validaciones específicas por proveedor
  if (source === 'COLTRACK' && !fileName.endsWith('.csv')) {
    console.warn('⚠️ COLTRACK: Se recomienda usar archivos .csv');
  }

  return { valid: true };
}
