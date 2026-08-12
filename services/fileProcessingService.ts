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
  location?: string;
  latitude?: number;
  longitude?: number;
  /**
   * Valor EXACTO de la celda de fecha/hora tal como venía en el archivo de la
   * plataforma, sin interpretar (serial de Excel en GEOTAB/COLTRACK, texto en
   * FAGOR). Viaja hasta `alertas_diarias_gps.raw_data` y es la única forma de
   * auditar un evento contra la plataforma sin conservar el archivo original:
   * `timestamp` ya es una interpretación nuestra, este campo no.
   */
  source_time_raw?: string | number | null;
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
function normalizeText(value: unknown): string {
  return String(value ?? '')
    .replace(/Ã¡/gi, 'a')
    .replace(/Ã©/gi, 'e')
    .replace(/Ã­/gi, 'i')
    .replace(/Ã³/gi, 'o')
    .replace(/Ãº/gi, 'u')
    .replace(/Ã±/gi, 'n')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function normalizeHeader(value: unknown): string {
  return normalizeText(value).replace(/[^a-z0-9]/g, '');
}

function findHeaderIndex(headers: string[], exactNames: string[]): number {
  return headers.findIndex(header => exactNames.includes(header));
}

function parseNumeric(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  const normalized = String(value)
    .trim()
    .replace(/\s+/g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '');

  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

// Zona horaria operativa de la flota: Colombia (UTC-5, sin horario de verano).
const OPERACION_OFFSET_MIN = -5 * 60;
// Sufijo de zona explícito para que el ISO represente un INSTANTE correcto en la
// columna TIMESTAMPTZ y, a la vez, que `slice(0,10)` dé el día CALENDARIO local.
const OPERACION_OFFSET_ISO = '-05:00';

const pad2 = (v: number) => String(v).padStart(2, '0');

/**
 * ISO con offset de la operación (UTC-5): 'YYYY-MM-DDTHH:MM:SS-05:00'.
 * Preserva el reloj de pared local (para `fecha_dia = slice(0,10)`) y guarda el
 * instante correcto en TIMESTAMPTZ (evita el off-by-one por conversión a UTC).
 */
function isoLocal(y: number, mo: number, d: number, h = 0, mi = 0, s = 0): string {
  return `${y}-${pad2(mo)}-${pad2(d)}T${pad2(h)}:${pad2(mi)}:${pad2(s)}${OPERACION_OFFSET_ISO}`;
}

/** Instante absoluto → reloj de pared de la operación (UTC-5), con offset. */
function instanteAOperacion(instant: Date): string {
  const shifted = new Date(instant.getTime() + OPERACION_OFFSET_MIN * 60000);
  return isoLocal(
    shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate(),
    shifted.getUTCHours(), shifted.getUTCMinutes(), shifted.getUTCSeconds()
  );
}

/** Date local → toma sus componentes locales (sin pasar por UTC), con offset. */
function fechaLocalNaive(d: Date): string {
  return isoLocal(d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds());
}

/**
 * Deja el valor de la celda de origen listo para guardarse en JSONB sin perder
 * información: los seriales de Excel se conservan como número (su precisión
 * completa es lo que permite recomputar el segundo exacto) y el resto como
 * texto. NO interpreta ni normaliza: ese es justamente el punto.
 */
function normalizarValorCrudo(valor: unknown): string | number | null {
  if (valor === null || valor === undefined || valor === '') return null;
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  if (valor instanceof Date) return isNaN(valor.getTime()) ? null : valor.toISOString();
  return String(valor);
}

/**
 * Convierte cualquier timestamp de plataforma a ISO con offset de la operación
 * (UTC-5). Clave para que `fecha_dia = timestamp.slice(0,10)` refleje el día
 * CALENDARIO local correcto y que el instante en TIMESTAMPTZ sea el real: nunca se
 * aplica una conversión a UTC que corra el día (bug previo: eventos de la noche
 * caían al día siguiente).
 */
function parseTimestampToISO(timestamp: unknown): string {
  if (timestamp === null || timestamp === undefined || timestamp === '') {
    return fechaLocalNaive(new Date());
  }

  // Date (xlsx/csv con cellDates): se toma su reloj de pared local, no UTC.
  if (timestamp instanceof Date && !isNaN(timestamp.getTime())) {
    return fechaLocalNaive(timestamp);
  }

  // Serial de Excel: es el reloj de pared del archivo → naive directo.
  // Se convierte a ms REDONDEANDO al segundo y se leen los componentes en UTC:
  // así el reloj de pared queda intacto (sin intervención de la zona de la
  // máquina) y se recupera el segundo exacto. `SSF.parse_date_code` truncaba
  // (`Math.floor`) el error de coma flotante del serial y restaba un segundo a
  // ~38% de los eventos (p.ej. 6:11:53 quedaba 6:11:52).
  if (typeof timestamp === 'number' && Number.isFinite(timestamp)) {
    // Serial 25569 = 1970-01-01. Por debajo de 61 aplica el bug del año bisiesto
    // 1900 de Excel: ahí se delega en SSF, que sí lo contempla.
    if (timestamp >= 61) {
      const d = new Date(Math.round((timestamp - 25569) * 86400) * 1000);
      if (!isNaN(d.getTime())) {
        return isoLocal(
          d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(),
          d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()
        );
      }
    }
    const d = XLSX.SSF.parse_date_code(timestamp);
    if (d) return isoLocal(d.y, d.m, d.d, d.H ?? 0, d.M ?? 0, Math.round(d.S ?? 0));
  }

  const s = timestamp.toString().trim();

  // FAGOR: DD/MM/YYYY [HH:MM[:SS]] → hora local del archivo, naive directo.
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (dmy) {
    return isoLocal(+dmy[3], +dmy[2], +dmy[1], +(dmy[4] ?? 0), +(dmy[5] ?? 0), +(dmy[6] ?? 0));
  }

  // ISO con zona EXPLÍCITA (Z u offset), p.ej. Geotab en UTC → instante real → hora operación.
  if (/^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}.*(?:Z|[+-]\d{2}:?\d{2})$/.test(s)) {
    const inst = new Date(s);
    if (!isNaN(inst.getTime())) return instanteAOperacion(inst);
  }

  // COLTRACK / otros: YYYY-MM-DD o YYYY/MM/DD [HH:MM[:SS]] SIN zona → hora local, naive directo.
  const ymd = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[\sT](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (ymd) {
    return isoLocal(+ymd[1], +ymd[2], +ymd[3], +(ymd[4] ?? 0), +(ymd[5] ?? 0), +(ymd[6] ?? 0));
  }

  // Último recurso: si el string trae zona se convierte a operación; si no, componentes locales.
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return /(?:Z|[+-]\d{2}:?\d{2})$/.test(s) ? instanteAOperacion(d) : fechaLocalNaive(d);
  }

  console.warn('⚠️ No se pudo parsear timestamp:', s);
  return fechaLocalNaive(new Date());
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
        normalizeHeader(cell) === 'matricula'
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

    const displayHeaders = rawData[headerRowIndex].map((h: any) =>
      h ? h.toString().trim() : ''
    );
    const headers = rawData[headerRowIndex].map(normalizeHeader);

    console.log('📊 FAGOR - Fila de headers encontrada:', headerRowIndex);
    console.log('📊 FAGOR - Headers detectados:', displayHeaders);

    // Mapear índices de columnas
    const plateIndex = findHeaderIndex(headers, ['matricula', 'placa']);

    // Buscar columna de tipo de alerta (puede ser "Estado", "Iconos", "Alerta", etc.)
    let alertTypeIndex = findHeaderIndex(headers, ['estado', 'alerta', 'tipo']);

    if (alertTypeIndex === -1) {
      alertTypeIndex = headers.findIndex((h: string) =>
        h.includes('estado') || h.includes('alerta') || h.includes('tipo')
      );
    }

    // Si no se encuentra columna específica, buscar en columnas que tengan texto
    if (alertTypeIndex === -1) {
      // Intentar detectar automáticamente revisando la primera fila de datos
      const firstDataRow = rawData[headerRowIndex + 1];
      if (firstDataRow) {
        for (let idx = 0; idx < firstDataRow.length; idx++) {
          const cellValue = firstDataRow[idx];
          if (cellValue && normalizeText(cellValue).includes('alrm')) {
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

    let speedIndex = findHeaderIndex(headers, ['velocidad']);
    if (speedIndex === -1) {
      speedIndex = headers.findIndex((h: string) =>
        h.includes('velocidad') &&
        !h.includes('exceso') &&
        !h.includes('taco')
      );
    }
    if (speedIndex === -1) {
      speedIndex = findHeaderIndex(headers, ['velocidadvehiculotaco', 'velocidadvehiculo']);
    }

    let timestampIndex = findHeaderIndex(headers, ['fechahora', 'fecha']);
    if (timestampIndex === -1) {
      timestampIndex = headers.findIndex((h: string) =>
        h.includes('ult') || h.includes('pos') || h.includes('fecha')
      );
    }
    const driverIndex = findHeaderIndex(headers, ['conductor']);
    const locationIndex = findHeaderIndex(headers, ['localidad', 'ubicacion', 'direccion']);
    const excessSpeedIndex = headers.findIndex((h: string) =>
      h === 'excesovelocidad' || h === 'excesodevelocidad'
    );

    console.log('📊 FAGOR - Índices de columnas:', {
      plate: plateIndex,
      alertType: alertTypeIndex,
      speed: speedIndex,
      timestamp: timestampIndex,
      driver: driverIndex,
      location: locationIndex,
      excessSpeed: excessSpeedIndex
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

    if (timestampIndex === -1) {
      return {
        success: false,
        error: 'No se encontro columna de Fecha Hora',
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

      const plateRaw = row[plateIndex]?.toString().trim();
      if (!plateRaw) continue;

      // Normalizar placa: mayúsculas y sin espacios
      const plate = plateRaw.toUpperCase().replace(/\s+/g, '');

      // Extraer alertType con manejo robusto de null/undefined
      const alertTypeRaw = row[alertTypeIndex];
      const alertType = (alertTypeRaw !== null && alertTypeRaw !== undefined)
        ? alertTypeRaw.toString().trim()
        : 'Sin especificar';

      const speedRaw = speedIndex >= 0 ? row[speedIndex] : null;
      const speed = parseNumeric(speedRaw);

      // Parsear timestamp a formato ISO 8601
      const timestampRaw = timestampIndex >= 0 ? row[timestampIndex] : null;
      const timestamp = parseTimestampToISO(timestampRaw);

      const driver = driverIndex >= 0 ? row[driverIndex]?.toString().trim() : undefined;
      const location = locationIndex >= 0 ? row[locationIndex]?.toString().trim() : undefined;

      // Debug: Log de primera fila con ubicación
      if (alerts.length === 0 && location) {
        console.log('📍 FAGOR - Primera fila con ubicación:', {
          location,
          locationIndex,
          columna_localidad: displayHeaders[locationIndex]
        });
      }

      // Detectar Falta Grave: "Alrm. de excesos de velocidad"
      // Asegurar que alertType sea string antes de usar métodos
      const alertTypeLower = normalizeText(alertType);
      const excessSpeedRaw = excessSpeedIndex >= 0 ? row[excessSpeedIndex] : null;
      const excessSpeedValue = parseNumeric(excessSpeedRaw);
      const esExcesoVelocidad = (
        alertTypeLower.includes('alrm') &&
        alertTypeLower.includes('exceso') &&
        alertTypeLower.includes('velocidad')
      ) || (excessSpeedValue !== null && excessSpeedValue > 0);
      // Falta grave = exceso de velocidad REAL >= 80 km/h, no solo por el tipo/columna.
      const isGrave = esExcesoVelocidad && speed !== null && speed >= 80;

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
        is_grave: isGrave,
        location,
        source_time_raw: normalizarValorCrudo(timestampRaw)
      });
    }

    console.log(`✅ FAGOR procesado: ${alerts.length} alertas, ${gravesCount} graves`);

    // Debug: Mostrar primeras 3 placas normalizadas
    if (alerts.length > 0) {
      console.log('🔍 Primeras 3 placas procesadas:', alerts.slice(0, 3).map(a => a.plate));
    }

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
      const plateRaw = row['Nombre'] || row['nombre'] || row['NOMBRE'] || '';
      // Normalizar placa: mayúsculas y sin espacios
      const plate = plateRaw ? plateRaw.toString().toUpperCase().replace(/\s+/g, '') : '';
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

      // Capturar coordenadas (latitud y longitud) - Buscar todas las variaciones posibles
      const latitudeRaw = row['Latitud'] || row['latitud'] || row['LATITUD'] ||
                          row['Latitude'] || row['latitude'] || row['LATITUDE'] ||
                          row['Lat'] || row['lat'] || row['LAT'] || null;
      const longitudeRaw = row['Longitud'] || row['longitud'] || row['LONGITUD'] ||
                           row['Longitude'] || row['longitude'] || row['LONGITUDE'] ||
                           row['Long'] || row['long'] || row['LONG'] ||
                           row['Lon'] || row['lon'] || row['LON'] || null;

      // Debug: Log de primera fila con coordenadas
      if (alerts.length === 0 && (latitudeRaw || longitudeRaw)) {
        console.log('📍 COLTRACK - Primera fila con coordenadas:', {
          latitudeRaw,
          longitudeRaw,
          columnas_disponibles: Object.keys(row).filter(k =>
            k.toLowerCase().includes('lat') || k.toLowerCase().includes('lon') || k.toLowerCase().includes('long')
          )
        });
      }

      const latitude = latitudeRaw ? parseFloat(latitudeRaw.toString()) : undefined;
      const longitude = longitudeRaw ? parseFloat(longitudeRaw.toString()) : undefined;

      // Crear string de ubicación si hay coordenadas
      let location: string | undefined = undefined;
      if (latitude !== undefined && longitude !== undefined && !isNaN(latitude) && !isNaN(longitude)) {
        location = `Lat: ${latitude.toFixed(6)}, Lon: ${longitude.toFixed(6)}`;
      }

      if (!plate || !plate.toString().trim()) {
        continue; // Saltar filas sin placa
      }

      // Falta grave = exceso de velocidad REAL >= 80 km/h (columna "Max kph"),
      // no por el nombre del evento (p.ej. "Infraccion 30 Km/h" a 44 km/h NO es grave).
      const alertTypeLower = alertType ? alertType.toLowerCase() : '';
      const esInfraccionVelocidad = alertTypeLower.includes('infraccion') || alertTypeLower.includes('infracción');
      const isGrave = esInfraccionVelocidad && speed !== null && speed >= 80;

      if (isGrave) {
        gravesCount++;
      }

      alerts.push({
        plate: plate, // Ya está normalizada
        alert_type: alertType.toString().trim(),
        speed,
        timestamp: timestamp.toString(),
        driver,
        severity: isGrave ? 'critical' : speed && speed > 100 ? 'high' : 'medium',
        is_grave: isGrave,
        location,
        latitude,
        longitude,
        source_time_raw: normalizarValorCrudo(timestampRaw)
      });
    }

    console.log(`✅ COLTRACK procesado: ${alerts.length} alertas, ${gravesCount} graves`);

    // Debug: Mostrar primeras 3 placas normalizadas
    if (alerts.length > 0) {
      console.log('🔍 Primeras 3 placas procesadas:', alerts.slice(0, 3).map(a => a.plate));
    }

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

// ==================== GEOTAB PROCESSOR ====================

/**
 * Procesa archivos de GEOTAB (Excel con hoja "Data")
 */
function processGeotabFile(workbook: XLSX.WorkBook): ProcessingResult {
  try {
    const sheetName = 'Data';
    if (!workbook.SheetNames.includes(sheetName)) {
      return {
        success: false,
        error: 'No se encontró la pestaña "Data" requerida para el reporte de Geotab',
        totalRows: 0,
        gravesDetected: 0
      };
    }
    const sheet = workbook.Sheets[sheetName];
    // Convertir a array de arrays
    const rawData: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    if (rawData.length === 0) {
      return { success: false, error: 'Archivo vacío', totalRows: 0, gravesDetected: 0 };
    }

    // La fila de encabezados es la fila 11 (índice 10)
    // Buscaremos la fila que contiene ".Device.DeviceName" o similar.
    let headerRowIndex = -1;
    for (let i = 0; i < Math.min(rawData.length, 30); i++) {
      const row = rawData[i];
      if (row && row.some((cell: any) =>
        normalizeText(cell).includes('.device.devicename') || normalizeText(cell) === 'devicename'
      )) {
        headerRowIndex = i;
        break;
      }
    }

    // Fallback si no lo encuentra: asumir fila 11 (índice 10)
    if (headerRowIndex === -1) {
      headerRowIndex = 10;
    }

    const headers = rawData[headerRowIndex].map(normalizeHeader);
    console.log('📊 GEOTAB - Fila de headers encontrada:', headerRowIndex);

    const plateIndex = headers.findIndex(h => h.includes('devicedevicename') || h === 'devicename' || h.includes('devicename'));
    const firstNameIndex = headers.findIndex(h => h.includes('driveruserfirstname') || h === 'userfirstname');
    const lastNameIndex = headers.findIndex(h => h.includes('driveruserlastname') || h === 'userlastname');
    const exceptionRuleIndex = headers.findIndex(h => h.includes('exceptionruleexceptionrulename') || h === 'exceptionrulename' || h.includes('rulename'));
    const longitudeIndex = headers.findIndex(h => h.includes('exceptiondetaillongitude') || h === 'longitude' || h === 'longitud');
    const latitudeIndex = headers.findIndex(h => h.includes('exceptiondetaillatitude') || h === 'latitude' || h === 'latitud');
    const locationIndex = headers.findIndex(h => h.includes('exceptiondetaillocation') || h === 'location' || h === 'ubicacion');
    const timestampIndex = headers.findIndex(h => h.includes('exceptiondetailstarttime') || h === 'starttime' || h === 'fechahora');
    const detailsIndex = headers.findIndex(h => h.includes('exceptiondetaildetails') || h === 'details' || h === 'detalles');
    const extraInfoIndex = headers.findIndex(h => h.includes('exceptiondetailextrainfo') || h === 'extrainfo' || h.includes('extrainfo'));

    console.log('📊 GEOTAB - Índices de columnas:', {
      plate: plateIndex,
      firstName: firstNameIndex,
      lastName: lastNameIndex,
      exceptionRule: exceptionRuleIndex,
      longitude: longitudeIndex,
      latitude: latitudeIndex,
      location: locationIndex,
      timestamp: timestampIndex,
      details: detailsIndex,
      extraInfo: extraInfoIndex
    });

    if (plateIndex === -1 || exceptionRuleIndex === -1 || timestampIndex === -1) {
      return {
        success: false,
        error: 'No se encontraron las columnas requeridas (Dispositivo, Excepción, Hora)',
        totalRows: 0,
        gravesDetected: 0
      };
    }

    const alerts: BatchAlert[] = [];
    let gravesCount = 0;

    for (let i = headerRowIndex + 1; i < rawData.length; i++) {
      const row = rawData[i];

      // Saltar filas vacías
      if (!row || row.length === 0 || !row[plateIndex]) {
        continue;
      }

      const plateRaw = row[plateIndex]?.toString().trim();
      if (!plateRaw) continue;

      // Normalizar placa: mayúsculas y sin espacios
      const plate = plateRaw.toUpperCase().replace(/\s+/g, '');

      // Conductor (combinar primer nombre + apellido)
      const firstName = firstNameIndex >= 0 ? (row[firstNameIndex]?.toString().trim() || '') : '';
      const lastName = lastNameIndex >= 0 ? (row[lastNameIndex]?.toString().trim() || '') : '';
      const driver = `${firstName} ${lastName}`.trim() || undefined;

      // Alerta y detalles
      const alertType = row[exceptionRuleIndex]?.toString().trim() || 'Excepción telemática';
      const details = detailsIndex >= 0 ? row[detailsIndex]?.toString().trim() : '';
      const extraInfo = extraInfoIndex >= 0 ? row[extraInfoIndex]?.toString().trim() : '';

      // Coordenadas
      const latitudeRaw = latitudeIndex >= 0 ? row[latitudeIndex] : null;
      const longitudeRaw = longitudeIndex >= 0 ? row[longitudeIndex] : null;
      const latitude = latitudeRaw ? parseFloat(latitudeRaw.toString()) : undefined;
      const longitude = longitudeRaw ? parseFloat(longitudeRaw.toString()) : undefined;

      // Ubicación
      const location = locationIndex >= 0 ? row[locationIndex]?.toString().trim() : undefined;

      // Timestamp
      const timestampRaw = row[timestampIndex];
      const timestamp = parseTimestampToISO(timestampRaw);

      // Extraer velocidad de details o extraInfo usando regex: /velocidad\s+m[aá]xima:\s*(\d+)/i
      let speed: number | null = null;
      const combinedText = `${extraInfo} ${details}`;
      const speedMatch = combinedText.match(/velocidad\s+m[aá]xima:\s*(\d+)/i);
      if (speedMatch) {
        speed = parseInt(speedMatch[1], 10);
      }

      // Detectar falta grave:
      // - Si el tipo contiene "exceso" y "velocidad", y la velocidad es >= 80
      // - O si el tipo contiene "80" o los detalles contienen "exceso velocidad 80"
      const alertTypeLower = alertType.toLowerCase();
      const detailsLower = details ? details.toLowerCase() : '';
      const isSpeedingAlert = alertTypeLower.includes('exceso') && (alertTypeLower.includes('velocidad') || alertTypeLower.includes('limite'));
      
      const isGrave = (isSpeedingAlert && speed !== null && speed >= 80) ||
                      alertTypeLower.includes('exceso velocidad 80') ||
                      detailsLower.includes('exceso velocidad 80') ||
                      (isSpeedingAlert && alertTypeLower.includes('80'));

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
        is_grave: isGrave,
        location,
        latitude,
        longitude,
        source_time_raw: normalizarValorCrudo(timestampRaw)
      });
    }

    console.log(`✅ GEOTAB procesado: ${alerts.length} alertas, ${gravesCount} graves`);
    return {
      success: true,
      data: alerts,
      totalRows: alerts.length,
      gravesDetected: gravesCount
    };

  } catch (error: any) {
    console.error('❌ Error procesando GEOTAB:', error);
    return {
      success: false,
      error: error.message || 'Error desconocido procesando archivo GEOTAB',
      totalRows: 0,
      gravesDetected: 0
    };
  }
}

// ==================== MAIN PROCESSOR ====================

/**
 * Procesa un archivo según el proveedor seleccionado
 * @param file - Archivo cargado (.xlsx o .csv)
 * @param source - Proveedor ('FAGOR', 'COLTRACK' o 'GEOTAB')
 */
export async function processFile(
  file: File,
  source: 'FAGOR' | 'COLTRACK' | 'GEOTAB'
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
    } else if (source === 'GEOTAB') {
      return processGeotabFile(workbook);
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
export function validateFile(file: File, source: 'FAGOR' | 'COLTRACK' | 'GEOTAB'): { valid: boolean; error?: string } {
  const maxSize = 50 * 1024 * 1024; // 50 MB

  if (file.size > maxSize) {
    return { valid: false, error: 'El archivo es demasiado grande (máximo 50 MB)' };
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

  if (source === 'GEOTAB' && fileName.endsWith('.csv')) {
    console.warn('⚠️ GEOTAB: Se recomienda usar archivos Excel (.xlsx)');
  }

  return { valid: true };
}
