/**
 * API de Google Apps Script para Inspecciones Magnex
 *
 * Este script:
 * 1. Descarga el Excel de inspecciones desde la URL configurada
 * 2. Filtra los datos por rango de fechas
 * 3. Reemplaza los datos en Google Sheets
 * 4. Retorna JSON para el sistema web
 *
 * Endpoints:
 * - ?action=test                                    → Prueba la API
 * - ?action=replace&startDate=YYYY-MM-DD&endDate=... → Descarga, filtra y reemplaza
 * - ?action=get&startDate=YYYY-MM-DD&endDate=...    → Solo lee del Sheet
 */

// ============================================================================
// CONFIGURACIÓN - EDITA ESTAS VARIABLES
// ============================================================================

const EXCEL_URL = 'https://desarrollo.checkayg.stork.segurosayg.com/export/archivoinspeccionestotal.xlsx';
const SHEET_NAME = 'Datos'; // Nombre de la pestaña donde se guardarán los datos
const MAX_ROWS = 10000; // Máximo de filas a procesar (protección)

// ============================================================================
// FUNCIÓN PRINCIPAL - Recibe las peticiones HTTP GET
// ============================================================================

function doGet(e) {
  try {
    const action = e.parameter.action || 'test';

    switch (action) {
      case 'test':
        return testAPI();

      case 'replace':
        return replaceData(e.parameter);

      case 'get':
        return getData(e.parameter);

      default:
        return createResponse(false, null, 'Acción no válida. Usa: test, replace, o get');
    }
  } catch (error) {
    Logger.log('Error en doGet: ' + error.toString());
    return createResponse(false, null, error.toString());
  }
}

// ============================================================================
// ENDPOINT: Test - Verifica que la API funciona
// ============================================================================

function testAPI() {
  return createResponse(true, {
    message: 'API funcionando correctamente',
    timestamp: new Date().toISOString(),
    sheetName: SHEET_NAME,
    excelUrl: EXCEL_URL
  });
}

// ============================================================================
// ENDPOINT: Replace - Descarga Excel, filtra y reemplaza datos en Sheet
// ============================================================================

function replaceData(params) {
  const startDate = params.startDate;
  const endDate = params.endDate;
  const limit = parseInt(params.limit) || 3000;

  // Validar parámetros
  if (!startDate || !endDate) {
    return createResponse(false, null, 'Faltan parámetros: startDate y endDate son requeridos');
  }

  Logger.log('Iniciando descarga y reemplazo de datos');
  Logger.log('Rango: ' + startDate + ' a ' + endDate);

  try {
    // 1. Descargar el Excel
    Logger.log('Descargando Excel desde: ' + EXCEL_URL);
    const response = UrlFetchApp.fetch(EXCEL_URL, {
      muteHttpExceptions: true,
      followRedirects: true
    });

    if (response.getResponseCode() !== 200) {
      throw new Error('Error al descargar Excel: HTTP ' + response.getResponseCode());
    }

    const blob = response.getBlob();
    Logger.log('Excel descargado exitosamente, tamaño: ' + blob.getBytes().length + ' bytes');

    // 2. Convertir Excel a datos
    const data = parseExcelToJson(blob);
    Logger.log('Total de registros en Excel: ' + data.length);

    // 3. Filtrar por rango de fechas
    const filteredData = filterByDateRange(data, startDate, endDate, limit);
    Logger.log('Registros después de filtrar: ' + filteredData.length);

    // 4. Reemplazar datos en Google Sheets
    replaceSheetData(filteredData);
    Logger.log('Datos reemplazados en Google Sheets');

    // 5. Retornar respuesta
    return createResponse(true, {
      data: filteredData,
      stats: {
        totalInExcel: data.length,
        filteredRecords: filteredData.length,
        startDate: startDate,
        endDate: endDate
      }
    });

  } catch (error) {
    Logger.log('Error en replaceData: ' + error.toString());
    return createResponse(false, null, error.toString());
  }
}

// ============================================================================
// ENDPOINT: Get - Solo lee datos del Sheet (sin descargar Excel)
// ============================================================================

function getData(params) {
  const startDate = params.startDate;
  const endDate = params.endDate;

  if (!startDate || !endDate) {
    return createResponse(false, null, 'Faltan parámetros: startDate y endDate son requeridos');
  }

  try {
    Logger.log('Leyendo datos del Sheet');

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    if (!sheet) {
      throw new Error('No se encontró la hoja: ' + SHEET_NAME);
    }

    const data = readSheetData(sheet);
    const filteredData = filterByDateRange(data, startDate, endDate, 10000);

    Logger.log('Datos leídos: ' + filteredData.length);

    return createResponse(true, {
      data: filteredData,
      stats: {
        totalInSheet: data.length,
        filteredRecords: filteredData.length,
        startDate: startDate,
        endDate: endDate
      }
    });

  } catch (error) {
    Logger.log('Error en getData: ' + error.toString());
    return createResponse(false, null, error.toString());
  }
}

// ============================================================================
// UTILIDADES - Parseo de Excel
// ============================================================================

function parseExcelToJson(blob) {
  // Convertir blob a base64
  const bytes = blob.getBytes();
  const base64 = Utilities.base64Encode(bytes);

  // Crear archivo temporal en Drive
  const file = DriveApp.createFile(blob.setName('temp.xlsx'));
  const fileId = file.getId();

  try {
    // Convertir a Google Sheets temporalmente para leer
    const resource = {
      title: 'TempSheet',
      mimeType: MimeType.GOOGLE_SHEETS
    };

    const convertedFile = Drive.Files.copy(resource, fileId);
    const tempSheet = SpreadsheetApp.openById(convertedFile.id).getSheets()[0];

    // Leer datos
    const data = readSheetData(tempSheet);

    // Limpiar archivos temporales
    DriveApp.getFileById(fileId).setTrashed(true);
    DriveApp.getFileById(convertedFile.id).setTrashed(true);

    return data;

  } catch (error) {
    // Limpiar en caso de error
    try { DriveApp.getFileById(fileId).setTrashed(true); } catch (e) {}
    throw error;
  }
}

function readSheetData(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return []; // Sin datos (solo headers)

  const lastCol = 13; // Columnas A-M (13 columnas)
  const range = sheet.getRange(2, 1, lastRow - 1, lastCol); // Desde fila 2 (sin headers)
  const values = range.getValues();

  const data = [];

  for (let i = 0; i < values.length; i++) {
    const row = values[i];

    // Saltar filas vacías
    if (!row[0] && !row[1] && !row[2]) continue;

    data.push({
      llave: row[0] ? String(row[0]) : '',
      fecha: row[1] ? formatDate(row[1]) : '',
      matricula: row[2] ? String(row[2]) : '',
      dia: row[3] ? String(row[3]) : '',
      horaInicio: row[4] ? String(row[4]) : '',
      lugarInicio: row[5] ? String(row[5]) : '',
      horaFin: row[6] ? String(row[6]) : '',
      conductor: row[7] ? String(row[7]) : '',
      fechaHoraInspeccion: row[8] ? formatDate(row[8]) : '',
      numHallazgos: row[9] ? parseInt(row[9]) || 0 : 0,
      estado: row[10] ? String(row[10]) : '',
      contrato: row[11] ? String(row[11]) : '',
      tipoVehiculo: row[12] ? String(row[12]) : ''
    });
  }

  return data;
}

// ============================================================================
// UTILIDADES - Filtrado por Fechas
// ============================================================================

function filterByDateRange(data, startDateStr, endDateStr, limit) {
  const startDate = new Date(startDateStr);
  const endDate = new Date(endDateStr);
  endDate.setHours(23, 59, 59, 999); // Fin del día

  const filtered = data.filter(function(record) {
    if (!record.fecha) return false;

    const recordDate = parseDate(record.fecha);
    if (!recordDate) return false;

    return recordDate >= startDate && recordDate <= endDate;
  });

  // Aplicar límite
  return filtered.slice(0, Math.min(filtered.length, limit));
}

function parseDate(dateStr) {
  if (!dateStr) return null;

  try {
    // Si ya es Date object
    if (dateStr instanceof Date) {
      return dateStr;
    }

    // String en formato DD/MM/YYYY o similar
    if (typeof dateStr === 'string') {
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
    }

    return null;
  } catch (error) {
    return null;
  }
}

function formatDate(date) {
  if (!date) return '';

  if (!(date instanceof Date)) {
    date = new Date(date);
  }

  if (isNaN(date.getTime())) return '';

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return year + '-' + month + '-' + day;
}

// ============================================================================
// UTILIDADES - Reemplazo de Datos en Sheet
// ============================================================================

function replaceSheetData(data) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);

  if (!sheet) {
    throw new Error('No se encontró la hoja: ' + SHEET_NAME);
  }

  // 1. Limpiar datos existentes (mantener headers en fila 1)
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, 13).clearContent();
  }

  // 2. Si no hay datos, salir
  if (data.length === 0) {
    return;
  }

  // 3. Convertir datos a array 2D para escribir en Sheet
  const rows = data.map(function(record) {
    return [
      record.llave || '',
      record.fecha || '',
      record.matricula || '',
      record.dia || '',
      record.horaInicio || '',
      record.lugarInicio || '',
      record.horaFin || '',
      record.conductor || '',
      record.fechaHoraInspeccion || '',
      record.numHallazgos || 0,
      record.estado || '',
      record.contrato || '',
      record.tipoVehiculo || ''
    ];
  });

  // 4. Escribir datos (desde fila 2, después de headers)
  const range = sheet.getRange(2, 1, rows.length, 13);
  range.setValues(rows);

  Logger.log('Escribió ' + rows.length + ' filas en el Sheet');
}

// ============================================================================
// UTILIDADES - Respuestas HTTP
// ============================================================================

function createResponse(success, data, error) {
  const response = {
    success: success,
    timestamp: new Date().toISOString()
  };

  if (success) {
    response.data = data.data || [];
    response.stats = data.stats || data;
  } else {
    response.error = error || 'Error desconocido';
  }

  return ContentService
    .createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}
