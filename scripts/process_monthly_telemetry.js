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

// Helpers de normalización
function normalizeName(name) {
  return String(name ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');
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

// Carga de maestros desde Supabase
async function loadMasters() {
  console.log("Cargando base de datos maestros...");
  const { data: dbConductores, error: eC } = await supabase
    .from('conductores')
    .select('id, nombres, cedula, ibutton, proyecto, estado');
  if (eC) throw eC;

  const { data: dbVehiculos, error: eV } = await supabase
    .from('vehiculos')
    .select('id, placa, cliente, contrato_id, gps_compañia, tipo_activo');
  if (eV) throw eV;

  console.log(`Cargados: ${dbConductores.length} conductores, ${dbVehiculos.length} vehículos.`);
  return { dbConductores, dbVehiculos };
}

// --- PROCESAMIENTO COLTRACK ---
function parseColtrackCSVs() {
  console.log("Procesando archivos planos de Coltrack...");

  // 1. Cargar mapeo de iButtons y Cédulas
  const driverMap = new Map(); // ConductorName -> { iButton, cedula }
  const driversContent = fs.readFileSync('coltrack/Conductores_Coltrack.csv', 'utf-8');
  const dLines = driversContent.split('\n').filter(l => l.trim().length > 0);
  // Cabecera: Nombre|Apellido|iButton|Hora identificacion|No. Identificación...
  for (let i = 1; i < dLines.length; i++) {
    const cols = dLines[i].split('|');
    if (cols.length >= 5) {
      const nombre = cols[0];
      const apellido = cols[1];
      const ibutton = cols[2];
      const cedula = cols[4];
      const fullNameNorm = normalizeName(`${nombre} ${apellido}`);
      driverMap.set(fullNameNorm, { ibutton, cedula });
    }
  }

  // 2. Cargar Consolidado de Conductores Coltrack
  const conductorMetrics = [];
  const condContent = fs.readFileSync('coltrack/Consolidado_Faltas_Por_Conductor_Coltrack.csv', 'utf-8');
  const cLines = condContent.split('\n').filter(l => l.trim().length > 0);
  const cHeaders = cLines[0].split('|').map(h => h.trim());
  for (let i = 1; i < cLines.length; i++) {
    const cols = cLines[i].split('|');
    if (cols.length >= 5) {
      const row = {};
      cHeaders.forEach((h, idx) => {
        row[h] = cols[idx];
      });
      conductorMetrics.push(row);
    }
  }

  // 3. Cargar Consolidado de Vehículos Coltrack
  const vehMetrics = [];
  const vehContent = fs.readFileSync('coltrack/Consolidado_Faltas_Por_Vehículo_Coltrack.csv', 'utf-8');
  const vLines = vehContent.split('\n').filter(l => l.trim().length > 0);
  const vHeaders = vLines[0].split('|').map(h => h.trim());
  for (let i = 1; i < vLines.length; i++) {
    const cols = vLines[i].split('|');
    if (cols.length >= 5) {
      const row = {};
      vHeaders.forEach((h, idx) => {
        row[h] = cols[idx];
      });
      vehMetrics.push(row);
    }
  }

  // 4. Cargar Ralentís Coltrack
  const ralentiMap = new Map(); // Placa -> RalentiRow
  const ralContent = fs.readFileSync('coltrack/Ralenti_Coltrack.csv', 'utf-8');
  const rLines = ralContent.split('\n').filter(l => l.trim().length > 0);
  const rHeaders = rLines[0].split('|').map(h => h.trim());
  for (let i = 1; i < rLines.length; i++) {
    const cols = rLines[i].split('|');
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
  // Fila 3 es cabecera real
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

// --- CONSOLIDACION E INGESTA ---
async function main() {
  try {
    const { dbConductores, dbVehiculos } = await loadMasters();
    
    // Crear mapas de maestros indexados para búsquedas ultrarrápidas
    const conductPorCedula = new Map();
    const conductPorNombreNorm = new Map();
    dbConductores.forEach(c => {
      if (c.cedula) conductPorCedula.set(String(c.cedula).trim(), c);
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
    coltrack.conductorMetrics.forEach(row => {
      const condName = row['Conductor'];
      const condNameNorm = normalizeName(condName);
      let foundCond = conductPorNombreNorm.get(condNameNorm);

      // Si no coincide por nombre, buscar por mapeo iButton
      if (!foundCond) {
        const mapped = coltrack.driverMap.get(condNameNorm);
        if (mapped && mapped.cedula) {
          foundCond = conductPorCedula.get(String(mapped.cedula).trim());
        }
      }

      if (foundCond) {
        condMatchCount++;
        const mappedData = coltrack.driverMap.get(condNameNorm);
        reportesConductores.push({
          conductor_id: foundCond.id,
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
          ibutton: String(mappedData?.ibutton ?? foundCond.ibutton ?? ''),
          estado_conductor: String(foundCond.estado ?? 'ACTIVO'),
          proyecto: String(foundCond.proyecto ?? ''),
          mes: MES,
          fecha_reporte: new Date().toISOString().slice(0, 10),
        });
      } else {
        condUnmatchCount++;
        console.warn(`[Coltrack Driver Unmatched] No se encontró: ${condName}`);
      }
    });

    // B. Conductores Fagor
    fagor.conductorMetrics.forEach(row => {
      const condName = String(row['Conductor']).trim();
      const condNameNorm = normalizeName(condName);
      let foundCond = conductPorNombreNorm.get(condNameNorm);

      // Si no coincide por nombre, buscar por iButton mapping
      if (!foundCond) {
        const mapped = fagor.driverMap.get(condNameNorm);
        if (mapped && mapped.cedula) {
          foundCond = conductPorCedula.get(String(mapped.cedula).trim());
        }
      }

      if (foundCond) {
        condMatchCount++;
        const mappedData = fagor.driverMap.get(condNameNorm);
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
        console.warn(`[Fagor Driver Unmatched] No se encontró: ${condName}`);
      }
    });

    console.log(`Consolidación de conductores finalizada. Coincidencias: ${condMatchCount}, No encontrados: ${condUnmatchCount}.`);

    console.log("\nIniciando consolidación de Vehículos...");
    const reportesVehiculos = [];
    let vehMatchCount = 0;
    let vehUnmatchCount = 0;

    // A. Vehículos Coltrack
    coltrack.vehMetrics.forEach(row => {
      const placa = row['Vehiculo'];
      const placaNorm = normalizePlate(placa);
      const foundVeh = vehicPorPlaca.get(placaNorm);

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
          consumo_combustible: num(ralenti['Consumo de combustible']),
          ralentis_excesivos: num(ralenti['(Ralentis excesivos']),
          proyecto: String(foundVeh.cliente ?? ''),
          mes: MES,
          fecha_reporte: new Date().toISOString().slice(0, 10),
        });
      } else {
        vehUnmatchCount++;
        console.warn(`[Coltrack Vehicle Unmatched] Placa no encontrada: ${placa}`);
      }
    });

    // B. Vehículos Fagor
    fagor.vehMetrics.forEach(row => {
      const placa = row['Matrícula'];
      const placaNorm = normalizePlate(placa);
      const foundVeh = vehicPorPlaca.get(placaNorm);

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
        console.warn(`[Fagor Vehicle Unmatched] Placa no encontrada: ${placa}`);
      }
    });

    console.log(`Consolidación de vehículos finalizada. Coincidencias: ${vehMatchCount}, No encontrados: ${vehUnmatchCount}.`);

    // --- ALMACENAR EN SUPABASE ---
    console.log("\nGuardando reportes consolidados en Supabase...");
    
    // Inserción en lotes de 100
    const BATCH_SIZE = 100;
    
    // Inserción Conductores
    let insertedCondCount = 0;
    for (let i = 0; i < reportesConductores.length; i += BATCH_SIZE) {
      const batch = reportesConductores.slice(i, i + BATCH_SIZE);
      const { error: err } = await supabase
        .from('reportes_conductores')
        .upsert(batch, { onConflict: 'conductor_id,periodo_inicio,periodo_fin' });
      if (err) throw err;
      insertedCondCount += batch.length;
    }
    console.log(`Guardados con éxito ${insertedCondCount} reportes de conductores.`);

    // Inserción Vehículos
    let insertedVehCount = 0;
    for (let i = 0; i < reportesVehiculos.length; i += BATCH_SIZE) {
      const batch = reportesVehiculos.slice(i, i + BATCH_SIZE);
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
