import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

// Configuración de Supabase
const SUPABASE_URL = 'https://cmzeijcyykzdmvisojte.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Rango del período (Fijo para esta importación)
const PERIODO_INICIO = '2026-04-29';
const PERIODO_FIN = '2026-05-28';
const MES = '2026-04'; // Mes de referencia

// Helpers de normalización y utilidades
function normalizeName(name) {
  return String(name ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');
}

function namesAreFuzzyEqual(name1, name2) {
  const norm1 = normalizeName(name1);
  const norm2 = normalizeName(name2);
  if (norm1 === norm2) return true;
  
  const noVowels = (s) => s.replace(/[AEIOU]/g, '');
  const nv1 = noVowels(norm1);
  const nv2 = noVowels(norm2);
  
  // Coincidencia fonética simple (removiendo vocales y permitiendo pequeña diferencia de longitud)
  if (nv1 === nv2 && Math.abs(norm1.length - norm2.length) <= 3) {
    return true;
  }
  return false;
}

function normalizePlate(plate) {
  return String(plate ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function num(val) {
  const n = Number(val);
  return isNaN(n) || !isFinite(n) ? 0 : n;
}

function parseTimeStringToHours(timeStr) {
  if (timeStr === undefined || timeStr === null || timeStr === '') return 0;
  if (typeof timeStr === 'number') return timeStr * 24;
  const parts = String(timeStr).trim().split(':');
  if (parts.length === 3) {
    const hh = parseInt(parts[0], 10) || 0;
    const mm = parseInt(parts[1], 10) || 0;
    const ss = parseInt(parts[2], 10) || 0;
    return hh + mm / 60 + ss / 3600;
  }
  return 0;
}

function detectSeparator(headerLine) {
  const separators = ['|', ';', ','];
  let bestSep = '|';
  let maxCount = -1;
  for (const sep of separators) {
    const count = headerLine.split(sep).length - 1;
    if (count > maxCount) {
      maxCount = count;
      bestSep = sep;
    }
  }
  return bestSep;
}

function generarUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function normCedula(cedula) {
  if (cedula === undefined || cedula === null) return '';
  return String(cedula)
    .replace(/[^A-Z0-9]/gi, '')
    .trim()
    .toUpperCase();
}

// Carga de maestros desde Supabase con paginación para soportar grandes volúmenes de registros
async function loadMasters() {
  console.log("Cargando base de datos maestros...");
  
  let dbConductores = [];
  let pageC = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('conductores')
      .select('id, nombres, cedula, ibutton, proyecto, estado')
      .range(pageC * pageSize, (pageC + 1) * pageSize - 1);
      
    if (error) throw error;
    dbConductores = dbConductores.concat(data);
    if (data.length < pageSize) break;
    pageC++;
  }

  let dbVehiculos = [];
  let pageV = 0;
  while (true) {
    const { data, error } = await supabase
      .from('vehiculos')
      .select('id, placa, cliente, contrato_id, gps_compañia, tipo_activo')
      .range(pageV * pageSize, (pageV + 1) * pageSize - 1);
      
    if (error) throw error;
    dbVehiculos = dbVehiculos.concat(data);
    if (data.length < pageSize) break;
    pageV++;
  }

  console.log(`Cargados: ${dbConductores.length} conductores, ${dbVehiculos.length} vehículos.`);
  return { dbConductores, dbVehiculos };
}

// Auto-creación de conductores faltantes en el maestro
async function asegurarConductorEnMaestro(
  nombreOriginal,
  cedulaOriginal,
  ibuttonOriginal,
  conductPorNombreNorm,
  conductPorCedula
) {
  const nombreNorm = normalizeName(nombreOriginal);
  
  // 1. Coincidencia exacta por nombre
  let found = conductPorNombreNorm.get(nombreNorm);
  if (found) return found;

  // 2. Coincidencia aproximada por nombre
  for (const [dbNormName, dbCond] of conductPorNombreNorm.entries()) {
    if (namesAreFuzzyEqual(dbNormName, nombreNorm)) {
      console.log(`[Cruce Aproximado] Asociando "${nombreOriginal}" con registro existente "${dbCond.nombres}"`);
      return dbCond;
    }
  }

  // 3. Coincidencia exacta por cédula (si es provista)
  if (cedulaOriginal) {
    const cedNorm = normCedula(cedulaOriginal);
    found = conductPorCedula.get(cedNorm);
    if (found) return found;
  }

  // Si no se encuentra, auto-crear conductor temporal
  const tempCedula = cedulaOriginal && String(cedulaOriginal).trim().length > 0 && isNaN(Number(cedulaOriginal)) === false
    ? String(cedulaOriginal).trim()
    : 'TEMP_CC_' + nombreNorm.replace(/\s/g, '').substring(0, 10) + '_' + generarUUID().slice(0, 6);

  const newDriver = {
    nombres: nombreOriginal.trim(),
    cedula: tempCedula,
    proyecto: 'PENDIENTE GOOGLE SHEETS',
    cargo: 'PENDIENTE GOOGLE SHEETS',
    estado: 'PENDIENTE GOOGLE SHEETS',
    ibutton: ibuttonOriginal || '',
  };

  console.log(`[Auto-Crear Conductor] Creando registro temporal para "${nombreOriginal}" con Cédula: "${tempCedula}"`);
  const { data, error } = await supabase
    .from('conductores')
    .insert(newDriver)
    .select('*')
    .single();

  if (error) {
    console.error(`Error al auto-crear conductor "${nombreOriginal}":`, error.message);
    if (error.code === '23505' || String(error.message).includes('unique constraint') || String(error.message).includes('duplicate key')) {
      const { data: existingDbDriver } = await supabase
        .from('conductores')
        .select('*')
        .eq('cedula', tempCedula)
        .maybeSingle();

      if (existingDbDriver) {
        conductPorNombreNorm.set(nombreNorm, existingDbDriver);
        return existingDbDriver;
      }
    }
    return null;
  }

  conductPorNombreNorm.set(nombreNorm, data);
  if (data.cedula) conductPorCedula.set(normCedula(data.cedula), data);
  return data;
}

// Auto-creación de vehículos faltantes en el maestro
async function asegurarVehiculoEnMaestro(placaOriginal, vehicPorPlaca) {
  const placaNorm = normalizePlate(placaOriginal);
  if (!placaNorm) return null;

  let found = vehicPorPlaca.get(placaNorm);
  if (found) return found;

  const newVeh = {
    placa: placaOriginal.trim().toUpperCase(),
    estado: 'PENDIENTE GOOGLE SHEETS',
    cliente: 'PENDIENTE GOOGLE SHEETS',
    tipo_activo: 'PENDIENTE GOOGLE SHEETS',
  };

  console.log(`[Auto-Crear Vehículo] Creando registro temporal para placa: "${placaOriginal}"`);
  const { data, error } = await supabase
    .from('vehiculos')
    .insert(newVeh)
    .select('*')
    .single();

  if (error) {
    console.error(`Error al auto-crear vehículo "${placaOriginal}":`, error.message);
    return null;
  }

  vehicPorPlaca.set(placaNorm, data);
  return data;
}

// --- PROCESAMIENTO COLTRACK ---
function parseColtrackCSVs() {
  console.log("Procesando archivos planos de Coltrack...");

  // 1. Cargar mapeo de iButtons y Cédulas (si existe la cabecera correcta, si no, se salta)
  const driverMap = new Map(); // ConductorName -> { iButton, cedula }
  const driversContent = fs.readFileSync('coltrack/Conductores_Coltrack.csv', 'utf-8');
  const dLines = driversContent.split('\n').filter(l => l.trim().length > 0);
  const dSep = detectSeparator(dLines[0] ?? '');
  
  const hasIdInHeader = dLines[0].toLowerCase().includes('identificaci') || dLines[0].toLowerCase().includes('dni') || dLines[0].toLowerCase().includes('ibutton');
  
  if (hasIdInHeader) {
    for (let i = 1; i < dLines.length; i++) {
      const cols = dLines[i].split(dSep);
      if (cols.length >= 5) {
        const nombre = cols[0];
        const apellido = cols[1];
        const ibutton = cols[2];
        const cedula = cols[4];
        const fullNameNorm = normalizeName(`${nombre} ${apellido}`);
        driverMap.set(fullNameNorm, { ibutton, cedula });
      }
    }
  } else {
    console.log("Conductores_Coltrack.csv no contiene columnas de ID/iButton directamente. Se procesará solo como métricas o mapeo por nombre.");
  }

  // 2. Cargar Consolidado de Conductores Coltrack (Soporta punto y coma o tubería)
  const conductorMetrics = [];
  const condContent = fs.readFileSync('coltrack/Consolidado_Faltas_Por_Conductor_Coltrack.csv', 'utf-8');
  const cLines = condContent.split('\n').filter(l => l.trim().length > 0);
  const cSep = detectSeparator(cLines[0] ?? '');
  const cHeaders = cLines[0].split(cSep).map(h => h.trim());
  for (let i = 1; i < cLines.length; i++) {
    const cols = cLines[i].split(cSep);
    if (cols.length >= 5) {
      const row = {};
      cHeaders.forEach((h, idx) => {
        row[h] = cols[idx];
      });
      conductorMetrics.push(row);
    }
  }

  // 3. Cargar Consolidado de Vehículos Coltrack (Soporta punto y coma o tubería)
  const vehMetrics = [];
  const vehContent = fs.readFileSync('coltrack/Consolidado_Faltas_Por_Vehículo_Coltrack.csv', 'utf-8');
  const vLines = vehContent.split('\n').filter(l => l.trim().length > 0);
  const vSep = detectSeparator(vLines[0] ?? '');
  const vHeaders = vLines[0].split(vSep).map(h => h.trim());
  for (let i = 1; i < vLines.length; i++) {
    const cols = vLines[i].split(vSep);
    if (cols.length >= 5) {
      const row = {};
      vHeaders.forEach((h, idx) => {
        row[h] = cols[idx];
      });
      vehMetrics.push(row);
    }
  }

  // 4. Cargar Ralentís Coltrack (Soporta punto y coma o tubería)
  const ralentiMap = new Map(); // Placa -> RalentiRow
  const ralContent = fs.readFileSync('coltrack/Ralenti_Coltrack.csv', 'utf-8');
  const rLines = ralContent.split('\n').filter(l => l.trim().length > 0);
  const rSep = detectSeparator(rLines[0] ?? '');
  const rHeaders = rLines[0].split(rSep).map(h => h.trim());
  for (let i = 1; i < rLines.length; i++) {
    const cols = rLines[i].split(rSep);
    if (cols.length >= 5) {
      const row = {};
      rHeaders.forEach((h, idx) => {
        row[h] = cols[idx];
      });
      const placaNorm = normalizePlate(row['Unidad']);
      ralentiMap.set(placaNorm, row);
    }
  }

  return { driverMap, conductorMetrics, vehMetrics, ralentiMap };
}

// --- PROCESAMIENTO FAGOR ---
function parseFagorExcelFiles() {
  console.log("Procesando archivos XLSX de Fagor...");

  // 1. Conductores Fagor (Maestro iButton)
  const driverMap = new Map(); // ConductorName -> { iButton, cedula }
  const wbCond = XLSX.readFile('fagor/Conductores_Fagor.xlsx');
  const sheetCond = wbCond.Sheets[wbCond.SheetNames[0]];
  const rowsCond = XLSX.utils.sheet_to_json(sheetCond);
  rowsCond.forEach(row => {
    const nombre = row['Nombre'] ?? '';
    const primerAp = row['Primer Apellido'] ?? '';
    const segundoAp = row['Segundo Apellido'] ?? '';
    const fullNameNorm = normalizeName(`${nombre} ${primerAp} ${segundoAp}`);
    const ibutton = row['Código iButton'] ?? '';
    const cedula = row['DNI'] ?? '';
    driverMap.set(fullNameNorm, { ibutton, cedula });
  });

  // 2. Km Conductor Fagor
  const wbKmCond = XLSX.readFile('fagor/Km_Conductor_Fagor 1.xlsx');
  const sheetKmCond = wbKmCond.Sheets[wbKmCond.SheetNames[0]];
  const rawRowsKmCond = XLSX.utils.sheet_to_json(sheetKmCond, { header: 1 });
  const headersKmCond = rawRowsKmCond[2].map(h => String(h ?? '').trim());
  const conductorMetrics = [];
  for (let i = 3; i < rawRowsKmCond.length; i++) {
    const rowData = rawRowsKmCond[i];
    if (rowData.length > 1) {
      const row = {};
      headersKmCond.forEach((h, idx) => {
        row[h] = rowData[idx];
      });
      if (row['Conductor'] && row['Conductor'] !== 'N/A') {
        conductorMetrics.push(row);
      }
    }
  }

  // 3. Km Vehículos Fagor
  const wbKmVeh = XLSX.readFile('fagor/Km_Vehículos_Fagor 1.xlsx');
  const sheetKmVeh = wbKmVeh.Sheets[wbKmVeh.SheetNames[0]];
  const rawRowsKmVeh = XLSX.utils.sheet_to_json(sheetKmVeh, { header: 1 });
  const headersKmVeh = rawRowsKmVeh[2].map(h => String(h ?? '').trim());
  const vehMetrics = [];
  for (let i = 3; i < rawRowsKmVeh.length; i++) {
    const rowData = rawRowsKmVeh[i];
    if (rowData.length > 1) {
      const row = {};
      headersKmVeh.forEach((h, idx) => {
        row[h] = rowData[idx];
      });
      vehMetrics.push(row);
    }
  }

  // 4. Ralentí Alarms Fagor (Contador de Alarma por Vehículo)
  const ralentiAlarmsMap = new Map(); // Placa -> Count
  const ralFiles = ['fagor/Ralenti 1.xlsx', 'fagor/Ralenti 2.xlsx', 'fagor/Ralenti 3.xlsx'];
  ralFiles.forEach(file => {
    try {
      const wbRal = XLSX.readFile(file);
      const sheetRal = wbRal.Sheets[wbRal.SheetNames[0]];
      const rowsRal = XLSX.utils.sheet_to_json(sheetRal);
      rowsRal.forEach(row => {
        const placa = normalizePlate(row['Matrícula']);
        if (placa) {
          const currentCount = ralentiAlarmsMap.get(placa) ?? 0;
          ralentiAlarmsMap.set(placa, currentCount + 1);
        }
      });
    } catch (e) {
      console.warn(`Omitiendo o error al leer ${file}:`, e.message);
    }
  });

  return { driverMap, conductorMetrics, vehMetrics, ralentiAlarmsMap };
}

// Helper para consolidar reportes de conductores (evita duplicar conductor_id en el array de inserción)
function consolidarReportesConductores(records) {
  const map = new Map();
  for (const r of records) {
    const key = `${r.conductor_id}_${r.periodo_inicio}_${r.periodo_fin}`;
    if (map.has(key)) {
      const existing = map.get(key);
      const prevKms = existing.kms;
      existing.kms += r.kms;
      existing.horas_conduccion += r.horas_conduccion;
      existing.excesos_10_kph += r.excesos_10_kph;
      existing.excesos_20_kph += r.excesos_20_kph;
      existing.excesos_30_kph += r.excesos_30_kph;
      existing.excesos_40_kph += r.excesos_40_kph;
      existing.excesos_50_kph += r.excesos_50_kph;
      existing.excesos_60_kph += r.excesos_60_kph;
      existing.excesos_80_kph += r.excesos_80_kph;
      existing.aceleraciones_bruscas += r.aceleraciones_bruscas;
      existing.frenadas_bruscas += r.frenadas_bruscas;

      const totalKms = prevKms + r.kms;
      if (totalKms > 0) {
        existing.calificacion = Math.round(
          ((existing.calificacion * prevKms) + (r.calificacion * r.kms)) / totalKms
        );
      } else {
        existing.calificacion = Math.round((existing.calificacion + r.calificacion) / 2);
      }
    } else {
      map.set(key, { ...r });
    }
  }
  return Array.from(map.values());
}

// Helper para consolidar reportes de vehículos (evita duplicar vehiculo_id en el array de inserción)
function consolidarReportesVehiculos(records) {
  const map = new Map();
  for (const r of records) {
    const key = `${r.vehiculo_id}_${r.periodo_inicio}_${r.periodo_fin}`;
    if (map.has(key)) {
      const existing = map.get(key);
      const prevKms = existing.kms;
      existing.kms += r.kms;
      existing.horas_conduccion += r.horas_conduccion;
      existing.excesos_10_kph += r.excesos_10_kph;
      existing.excesos_20_kph += r.excesos_20_kph;
      existing.excesos_30_kph += r.excesos_30_kph;
      existing.excesos_40_kph += r.excesos_40_kph;
      existing.excesos_50_kph += r.excesos_50_kph;
      existing.excesos_60_kph += r.excesos_60_kph;
      existing.excesos_80_kph += r.excesos_80_kph;
      existing.aceleraciones_bruscas += r.aceleraciones_bruscas;
      existing.frenadas_bruscas += r.frenadas_bruscas;
      
      existing.km_recorridos_ralenti += r.km_recorridos_ralenti;
      existing.horas_motor_encendido += r.horas_motor_encendido;
      existing.horas_motor_ralenti += r.horas_motor_ralenti;
      existing.consumo_combustible += r.consumo_combustible;
      existing.ralentis_excesivos += r.ralentis_excesivos;

      const totalKms = prevKms + r.kms;
      if (totalKms > 0) {
        existing.calificacion = Math.round(
          ((existing.calificacion * prevKms) + (r.calificacion * r.kms)) / totalKms
        );
      } else {
        existing.calificacion = Math.round((existing.calificacion + r.calificacion) / 2);
      }
    } else {
      map.set(key, { ...r });
    }
  }
  return Array.from(map.values());
}

async function consolidarConBaseDeDatosVehiculos(nuevosRecords, periodoInicio, periodoFin) {
  const { data: dbRecords, error } = await supabase
    .from('reportes_vehiculos')
    .select('id, vehiculo_id')
    .eq('periodo_inicio', periodoInicio)
    .eq('periodo_fin', periodoFin);

  if (error) console.error('Error cargando IDs de vehículos de la BD:', error);

  const dbIdMap = new Map();
  for (const r of (dbRecords ?? [])) {
    dbIdMap.set(r.vehiculo_id, r.id);
  }

  return nuevosRecords.map(nuevo => {
    const existingId = dbIdMap.get(nuevo.vehiculo_id);
    return { ...nuevo, id: existingId ?? nuevo.id ?? generarUUID() };
  });
}

async function consolidarConBaseDeDatosConductores(nuevosRecords, periodoInicio, periodoFin) {
  const { data: dbRecords, error } = await supabase
    .from('reportes_conductores')
    .select('id, conductor_id')
    .eq('periodo_inicio', periodoInicio)
    .eq('periodo_fin', periodoFin);

  if (error) console.error('Error cargando IDs de conductores de la BD:', error);

  const dbIdMap = new Map();
  for (const r of (dbRecords ?? [])) {
    dbIdMap.set(r.conductor_id, r.id);
  }

  return nuevosRecords.map(nuevo => {
    const existingId = dbIdMap.get(nuevo.conductor_id);
    return { ...nuevo, id: existingId ?? nuevo.id ?? generarUUID() };
  });
}

// --- CONSOLIDACION E INGESTA ---
async function main() {
  try {
    const { dbConductores, dbVehiculos } = await loadMasters();
    
    // Crear mapas de maestros indexados para búsquedas ultrarrápidas
    const conductPorCedula = new Map();
    const conductPorNombreNorm = new Map();
    dbConductores.forEach(c => {
      if (c.cedula) conductPorCedula.set(normCedula(c.cedula), c);
      conductPorNombreNorm.set(normalizeName(c.nombres), c);
    });

    const vehicPorPlaca = new Map();
    dbVehiculos.forEach(v => {
      vehicPorPlaca.set(normalizePlate(v.placa), v);
    });

    // Parsear archivos planos
    const coltrack = parseColtrackCSVs();
    const fagor = parseFagorExcelFiles();

    console.log("\nIniciando consolidación de Conductores...");
    const reportesConductores = [];
    let condMatchCount = 0;
    let condUnmatchCount = 0;

    // A. Conductores Coltrack
    for (const row of coltrack.conductorMetrics) {
      const condName = row['Conductor'];
      const condNameNorm = normalizeName(condName);
      const mappedData = coltrack.driverMap.get(condNameNorm);

      // Usar asegurarConductorEnMaestro para resolver o crear conductor
      const foundCond = await asegurarConductorEnMaestro(
        condName,
        mappedData?.cedula,
        mappedData?.ibutton,
        conductPorNombreNorm,
        conductPorCedula
      );

      if (foundCond) {
        condMatchCount++;
        reportesConductores.push({
          conductor_id: foundCond.id,
          periodo_inicio: PERIODO_INICIO,
          periodo_fin: PERIODO_FIN,
          calificacion: num(row['Calificacion'] ?? row['Calificación']),
          kms: num(String(row['kms']).replace(',', '.')),
          horas_conduccion: num(row['Horas conduccion'] ?? row['Horas conducción']),
          excesos_10_kph: num(row['Excesos 10 kph']),
          excesos_20_kph: num(row['Excesos 20 kph']),
          excesos_30_kph: num(row['Excesos 30 kph']),
          excesos_40_kph: num(row['Excesos 40 kph']),
          excesos_50_kph: num(row['Excesos 50 kph']),
          excesos_60_kph: num(row['Excesos 60 kph']),
          excesos_80_kph: num(row['Excesos 80 kph']),
          aceleraciones_bruscas: num(row['Aceleraciones']),
          frenadas_bruscas: num(row['Frenadas']),
          ibutton: String(mappedData?.ibutton ?? foundCond.ibutton ?? ''),
          estado_conductor: String(foundCond.estado ?? 'ACTIVO'),
          proyecto: String(foundCond.proyecto ?? ''),
          mes: MES,
          fecha_reporte: new Date().toISOString().slice(0, 10),
        });
      } else {
        condUnmatchCount++;
        console.warn(`[Coltrack Driver Unmatched] No se pudo encontrar ni crear: ${condName}`);
      }
    }

    // B. Conductores Fagor
    for (const row of fagor.conductorMetrics) {
      const condName = String(row['Conductor']).trim();
      const condNameNorm = normalizeName(condName);
      const mappedData = fagor.driverMap.get(condNameNorm);

      // Usar asegurarConductorEnMaestro
      const foundCond = await asegurarConductorEnMaestro(
        condName,
        mappedData?.cedula,
        mappedData?.ibutton,
        conductPorNombreNorm,
        conductPorCedula
      );

      if (foundCond) {
        condMatchCount++;
        reportesConductores.push({
          conductor_id: foundCond.id,
          periodo_inicio: PERIODO_INICIO,
          periodo_fin: PERIODO_FIN,
          calificacion: 100, // Por defecto Fagor no tiene campo calificación
          kms: num(row['Km. Recorridos']),
          horas_conduccion: num(parseTimeStringToHours(row['Horas Conducción'])),
          excesos_10_kph: 0,
          excesos_20_kph: 0,
          excesos_30_kph: 0,
          excesos_40_kph: 0,
          excesos_50_kph: 0,
          excesos_60_kph: 0,
          excesos_80_kph: 0,
          aceleraciones_bruscas: 0,
          frenadas_bruscas: num(row['Uso de Freno nº veces']),
          ibutton: String(mappedData?.ibutton ?? foundCond.ibutton ?? ''),
          estado_conductor: String(foundCond.estado ?? 'ACTIVO'),
          proyecto: String(foundCond.proyecto ?? ''),
          mes: MES,
          fecha_reporte: new Date().toISOString().slice(0, 10),
        });
      } else {
        condUnmatchCount++;
        console.warn(`[Fagor Driver Unmatched] No se pudo encontrar ni crear: ${condName}`);
      }
    }

    console.log(`Consolidación de conductores finalizada. Coincidencias: ${condMatchCount}, No encontrados/creados: ${condUnmatchCount}.`);

    console.log("\nIniciando consolidación de Vehículos...");
    const reportesVehiculos = [];
    let vehMatchCount = 0;
    let vehUnmatchCount = 0;

    // A. Vehículos Coltrack
    for (const row of coltrack.vehMetrics) {
      const placa = row['Vehiculo'];
      const placaNorm = normalizePlate(placa);
      
      const foundVeh = await asegurarVehiculoEnMaestro(placa, vehicPorPlaca);

      if (foundVeh) {
        vehMatchCount++;
        const ralenti = coltrack.ralentiMap.get(placaNorm) ?? {};
        reportesVehiculos.push({
          vehiculo_id: foundVeh.id,
          contrato_id: foundVeh.contrato_id ?? null,
          periodo_inicio: PERIODO_INICIO,
          periodo_fin: PERIODO_FIN,
          calificacion: num(row['Calificacion']),
          kms: num(row['kms']),
          horas_conduccion: num(row['Horas conduccion']),
          excesos_10_kph: num(row['Excesos 10 kph']),
          excesos_20_kph: num(row['Excesos 20 kph']),
          excesos_30_kph: num(row['Excesos 30 kph']),
          excesos_40_kph: num(row['Excesos 40 kph']),
          excesos_50_kph: num(row['Excesos 50 kph']),
          excesos_60_kph: num(row['Excesos 60 kph']),
          excesos_80_kph: num(row['Excesos 80 kph']),
          aceleraciones_bruscas: num(row['Aceleraciones']),
          frenadas_bruscas: num(row['Frenadas']),
          dispositivo_gps: String(row['GPS_PROVEEDOR'] ?? foundVeh.gps_compañia ?? ''),
          base: '',
          estado_gps: 'ACTIVO',
          km_recorridos_ralenti: num(ralenti['Kms recorridos']),
          horas_motor_encendido: num(ralenti['Horas motor encendido']),
          horas_motor_ralenti: num(ralenti['Horas motor en ralenti']),
          consumo_combustible: num(ralenti['Horas motor encendido']) > 0
            ? num(ralenti['Consumo de combustible']) * (num(ralenti['Horas motor en ralenti']) / num(ralenti['Horas motor encendido']))
            : 0,
          ralentis_excesivos: num(ralenti['(Ralentis excesivos'] ?? ralenti['Ralentis excesivos'] ?? ralenti['Ralentís excesivos']),
          proyecto: String(foundVeh.cliente ?? ''),
          mes: MES,
          fecha_reporte: new Date().toISOString().slice(0, 10),
        });
      } else {
        vehUnmatchCount++;
        console.warn(`[Coltrack Vehicle Unmatched] Placa no encontrada/creada: ${placa}`);
      }
    }

    // B. Vehículos Fagor
    for (const row of fagor.vehMetrics) {
      const placa = row['Matrícula'];
      const placaNorm = normalizePlate(placa);
      
      const foundVeh = await asegurarVehiculoEnMaestro(placa, vehicPorPlaca);

      if (foundVeh) {
        vehMatchCount++;
        const alarmCount = fagor.ralentiAlarmsMap.get(placaNorm) ?? 0;
        reportesVehiculos.push({
          vehiculo_id: foundVeh.id,
          contrato_id: foundVeh.contrato_id ?? null,
          periodo_inicio: PERIODO_INICIO,
          periodo_fin: PERIODO_FIN,
          calificacion: 100, // Defecto para Fagor
          kms: num(row['Km. Recorridos']),
          horas_conduccion: num(parseTimeStringToHours(row['Horas Conducción'])),
          excesos_10_kph: 0,
          excesos_20_kph: 0,
          excesos_30_kph: 0,
          excesos_40_kph: 0,
          excesos_50_kph: 0,
          excesos_60_kph: 0,
          excesos_80_kph: 0,
          aceleraciones_bruscas: 0,
          frenadas_bruscas: num(row['Uso de Freno nº veces']),
          dispositivo_gps: String(foundVeh.gps_compañia ?? 'FAGOR'),
          base: '',
          estado_gps: 'ACTIVO',
          km_recorridos_ralenti: num(row['Km. Recorridos']),
          horas_motor_encendido: num(parseTimeStringToHours(row['Horas Motor'])),
          horas_motor_ralenti: num(parseTimeStringToHours(row['Ralentí Tiempo Total'])),
          consumo_combustible: num(row['Ralentí Galones Total']),
          ralentis_excesivos: alarmCount,
          proyecto: String(foundVeh.cliente ?? ''),
          mes: MES,
          fecha_reporte: new Date().toISOString().slice(0, 10),
        });
      } else {
        vehUnmatchCount++;
        console.warn(`[Fagor Vehicle Unmatched] Placa no encontrada/creada: ${placa}`);
      }
    }

    console.log(`Consolidación de vehículos finalizada. Coincidencias: ${vehMatchCount}, No encontrados/creados: ${vehUnmatchCount}.`);

    // --- ALMACENAR EN SUPABASE ---
    console.log("\nGuardando reportes consolidados en Supabase...");
    
    // Inserción en lotes de 100
    const BATCH_SIZE = 100;
    
    // Consolidar antes de insertar
    const reportesConductoresConsolidados = consolidarReportesConductores(reportesConductores);
    const reportesVehiculosConsolidados = consolidarReportesVehiculos(reportesVehiculos);

    // Inserción Conductores
    let insertedCondCount = 0;
    const consolidadosCondFinal = await consolidarConBaseDeDatosConductores(
      reportesConductoresConsolidados,
      PERIODO_INICIO,
      PERIODO_FIN
    );
    for (let i = 0; i < consolidadosCondFinal.length; i += BATCH_SIZE) {
      const batch = consolidadosCondFinal.slice(i, i + BATCH_SIZE);
      const { error: err } = await supabase
        .from('reportes_conductores')
        .upsert(batch, { onConflict: 'conductor_id,periodo_inicio,periodo_fin' });
      if (err) throw err;
      insertedCondCount += batch.length;
    }
    console.log(`Guardados con éxito ${insertedCondCount} reportes de conductores.`);

    // Inserción Vehículos
    let insertedVehCount = 0;
    const consolidadosVehFinal = await consolidarConBaseDeDatosVehiculos(
      reportesVehiculosConsolidados,
      PERIODO_INICIO,
      PERIODO_FIN
    );
    for (let i = 0; i < consolidadosVehFinal.length; i += BATCH_SIZE) {
      const batch = consolidadosVehFinal.slice(i, i + BATCH_SIZE);
      const { error: err } = await supabase
        .from('reportes_vehiculos')
        .upsert(batch, { onConflict: 'vehiculo_id,periodo_inicio,periodo_fin' });
      if (err) throw err;
      insertedVehCount += batch.length;
    }
    console.log(`Guardados con éxito ${insertedVehCount} reportes de vehículos.`);

    console.log("\n=== PROCESO DE UNIFICACIÓN COMPLETADO CON EXITO ===");

  } catch (err) {
    console.error("\nFATAL ERROR en el proceso de consolidación:", err.message);
  }
}

main();
