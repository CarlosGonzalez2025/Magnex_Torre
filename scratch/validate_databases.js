import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');
import fetch from 'node-fetch'; // Global fetch is available in modern Node, but import is fine

const SUPABASE_URL = 'https://cmzeijcyykzdmvisojte.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const DRIVERS_SHEET = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSWnrFQgrot22f8B5ByeHSH5Jt_AdnEvXDpcHZAi3sCdX3JnSdQ0xkXiujUtkw9PHc2DhRCw9eNg8Lx/pub?gid=0&single=true&output=csv';
const VEHICLES_SHEET = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRgi_mZfm-IlKYs7R7B2B4023qhLuywBkYRdO52uVCXEpa-qrNQENrqzMWJ6K_ddg3SlJbFrHLt7Saq/pub?gid=0&single=true&output=csv';

// Normalizadores
function normalizeName(name) {
  return String(name ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');
}

function normalizeKey(k) {
  return k.trim().toUpperCase()
    .replace(/[ÁÀÂÄ]/g, 'A').replace(/[ÉÈÊË]/g, 'E')
    .replace(/[ÍÌÎÏ]/g, 'I').replace(/[ÓÒÔÖ]/g, 'O')
    .replace(/[ÚÙÛÜ]/g, 'U').replace(/[Ñ]/g, 'N')
    .replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function parseCSV(text, delimiter = ',') {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];

  function parseLine(line) {
    const fields = [];
    let current = '', inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === delimiter && !inQuotes) {
        fields.push(current.trim()); current = '';
      } else { current += ch; }
    }
    fields.push(current.trim());
    return fields;
  }

  const headers = parseLine(lines[0]);
  return lines.slice(1).map(line => {
    const values = parseLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = values[i] ?? ''; });
    return obj;
  }).filter(row => Object.values(row).some(v => v !== ''));
}

async function loadAllSupabaseDrivers() {
  console.log("Cargando TODOS los conductores de Supabase (con paginacion)...");
  let allDrivers = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;
  
  while (hasMore) {
    const { data, error } = await supabase
      .from('conductores')
      .select('id, nombres, cedula, ibutton, proyecto, estado, created_at')
      .range(page * pageSize, (page + 1) * pageSize - 1);
      
    if (error) throw error;
    allDrivers = allDrivers.concat(data);
    hasMore = data.length === pageSize;
    page++;
    console.log(`  -> Cargados ${allDrivers.length} conductores...`);
  }
  return allDrivers;
}

async function loadAllSupabaseVehicles() {
  console.log("Cargando TODOS los vehiculos de Supabase (con paginacion)...");
  let allVehs = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;
  
  while (hasMore) {
    const { data, error } = await supabase
      .from('vehiculos')
      .select('id, placa, cliente, contrato_id, gps_compañia, tipo_activo')
      .range(page * pageSize, (page + 1) * pageSize - 1);
      
    if (error) throw error;
    allVehs = allVehs.concat(data);
    hasMore = data.length === pageSize;
    page++;
    console.log(`  -> Cargados ${allVehs.length} vehiculos...`);
  }
  return allVehs;
}

async function run() {
  try {
    const dbConductores = await loadAllSupabaseDrivers();
    const dbVehiculos = await loadAllSupabaseVehicles();

    // Mapas de Supabase
    const dbCondsByCedula = new Map();
    const dbCondsByName = new Map();
    dbConductores.forEach(c => {
      if (c.cedula) dbCondsByCedula.set(String(c.cedula).trim(), c);
      dbCondsByName.set(normalizeName(c.nombres), c);
    });

    const dbVehsByPlaca = new Map();
    dbVehiculos.forEach(v => {
      if (v.placa) dbVehsByPlaca.set(String(v.placa).trim().toUpperCase().replace(/[^A-Z0-9]/g, ''), v);
    });

    // 1. ANALIZAR GOOGLE SHEETS
    console.log("\nDescargando Google Sheets...");
    const resDrivers = await fetch(DRIVERS_SHEET);
    const textDrivers = await resDrivers.text();
    const sheetDriversRaw = parseCSV(textDrivers);

    const resVehicles = await fetch(VEHICLES_SHEET);
    const textVehicles = await resVehicles.text();
    const sheetVehiclesRaw = parseCSV(textVehicles);

    // Mapear con claves normalizadas (igual que hace la API)
    const FIELD_MAP = {
      NOMBRES: 'nombres',
      NO_CEDULA_CIUDADANIA: 'cedula', CEDULA: 'cedula',
      ESTADO_DEL_CONDUCTOR: 'estado', ESTADO: 'estado',
      LLAVE_IBUTTON: 'ibutton', IBUTTON: 'ibutton',
      NOMBRE_CONTRATO_PROYECTO: 'proyecto', PROYECTO: 'proyecto'
    };

    const sheetDrivers = sheetDriversRaw.map(row => {
      const mapped = {};
      for (const [k, v] of Object.entries(row)) {
        const norm = normalizeKey(k);
        const target = FIELD_MAP[norm];
        if (target) mapped[target] = String(v ?? '').trim();
      }
      return mapped;
    }).filter(d => d.cedula);

    const VEH_FIELD_MAP = {
      PLACA: 'placa',
      CLIENTE: 'cliente',
      TIPO: 'tipo',
      ESTADO: 'estado'
    };

    const sheetVehicles = sheetVehiclesRaw.map(row => {
      const mapped = {};
      for (const [k, v] of Object.entries(row)) {
        const norm = normalizeKey(k);
        const target = VEH_FIELD_MAP[norm];
        if (target) mapped[target] = String(v ?? '').trim();
      }
      return mapped;
    }).filter(v => v.placa);

    console.log(`Procesados de Google Sheets: ${sheetDrivers.length} conductores, ${sheetVehicles.length} vehiculos.`);

    // Cruce Google Sheets vs Supabase
    const missingDriversSheets = [];
    sheetDrivers.forEach((d, idx) => {
      let matched = dbCondsByCedula.get(d.cedula);
      if (!matched && d.nombres) {
        matched = dbCondsByName.get(normalizeName(d.nombres));
      }
      if (!matched) {
        missingDriversSheets.push(d);
      }
    });

    const missingVehiclesSheets = [];
    sheetVehicles.forEach(v => {
      const cleanPlaca = v.placa.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const matched = dbVehsByPlaca.get(cleanPlaca);
      if (!matched) {
        missingVehiclesSheets.push(v);
      }
    });

    // 2. ANALIZAR COLTRACK CSV (Conductores_Coltrack.csv)
    console.log("\nAnalizando Coltrack Conductores...");
    const coltrackContent = fs.readFileSync('coltrack/Conductores_Coltrack.csv', 'utf8');
    const coltrackRows = parseCSV(coltrackContent, '|'); // Pipe delimited
    
    // coltrackRows tiene "Nombre Conductor", "Apellido", "Empresa", "Puntaje", etc.
    const missingDriversColtrack = [];
    const matchedColtrackCount = { nameMatch: 0, unmatched: 0 };
    
    coltrackRows.forEach(row => {
      const nombre = row['Nombre Conductor'] || '';
      const apellido = row['Apellido'] || '';
      const fullName = `${nombre} ${apellido}`.replace(/\s+/g, ' ').trim();
      const fullNameNorm = normalizeName(fullName);
      
      let matched = dbCondsByName.get(fullNameNorm);
      if (matched) {
        matchedColtrackCount.nameMatch++;
      } else {
        matchedColtrackCount.unmatched++;
        // Busquemos en Google Sheets si existe
        const inSheets = sheetDrivers.find(sd => normalizeName(sd.nombres) === fullNameNorm);
        missingDriversColtrack.push({
          fullName,
          fullNameNorm,
          empresa: row['Empresa'],
          puntaje: row['Puntaje'],
          kms: row['Kms recorridos'],
          enGoogleSheets: inSheets ? `SÍ (Cédula: ${inSheets.cedula})` : 'NO'
        });
      }
    });

    // 3. ANALIZAR FAGOR EXCEL
    console.log("\nAnalizando Fagor Conductores...");
    const fagorDrivers = [];
    const wbCond = XLSX.readFile('fagor/Conductores_Fagor.xlsx');
    const sheetCond = wbCond.Sheets[wbCond.SheetNames[0]];
    const rowsCond = XLSX.utils.sheet_to_json(sheetCond);
    rowsCond.forEach(row => {
      const nombre = row['Nombre'] ?? '';
      const primerAp = row['Primer Apellido'] ?? '';
      const segundoAp = row['Segundo Apellido'] ?? '';
      const fullName = `${nombre} ${primerAp} ${segundoAp}`.replace(/\s+/g, ' ').trim();
      const fullNameNorm = normalizeName(fullName);
      const ibutton = String(row['Código iButton'] ?? '').trim();
      const cedula = String(row['DNI'] ?? '').trim();
      fagorDrivers.push({ fullName, fullNameNorm, ibutton, cedula });
    });

    const missingDriversFagor = [];
    fagorDrivers.forEach(d => {
      let matched = dbCondsByCedula.get(d.cedula);
      if (!matched) {
        matched = dbCondsByName.get(d.fullNameNorm);
      }
      if (!matched) {
        // Buscar si existe en Google Sheets
        const inSheets = sheetDrivers.find(sd => sd.cedula === d.cedula || normalizeName(sd.nombres) === d.fullNameNorm);
        missingDriversFagor.push({
          ...d,
          enGoogleSheets: inSheets ? 'SÍ' : 'NO'
        });
      }
    });

    // Generar reporte en Markdown
    console.log("\nGenerando Reporte de Validación...");
    let report = `# Reporte de Validación de Base de Datos - Conductores y Vehículos

Este reporte detalla el cruce y consistencia de los datos entre las fuentes de datos (Google Sheets, Coltrack, Fagor) y la base de datos Supabase ('conductores' y 'vehiculos').

## Resumen Ejecutivo

| Métrica | Supabase | Google Sheets | Coincidentes | Faltantes en Supabase |
| --- | --- | --- | --- | --- |
| **Conductores** | ${dbConductores.length} | ${sheetDrivers.length} | ${sheetDrivers.length - missingDriversSheets.length} | **${missingDriversSheets.length}** |
| **Vehículos** | ${dbVehiculos.length} | ${sheetVehicles.length} | ${sheetVehicles.length - missingVehiclesSheets.length} | **${missingVehiclesSheets.length}** |

---

## 1. Conductores de Google Sheets Faltantes en Supabase
Total: **${missingDriversSheets.length}**

*(Estos conductores están registrados en el Google Sheet de control principal pero no existen en la tabla 'conductores' de Supabase por Cédula ni por Nombre)*
${missingDriversSheets.length === 0 ? '*No hay conductores faltantes.*' : ''}
${missingDriversSheets.slice(0, 30).map(md => `- Fila en Sheet: **${md.nombres}** | Cédula: \`${md.cedula}\` | Proyecto: \`${md.proyecto || 'N/A'}\` | Estado: \`${md.estado}\``).join('\n')}
${missingDriversSheets.length > 30 ? `\n*y ${missingDriversSheets.length - 30} más...*` : ''}

---

## 2. Vehículos de Google Sheets Faltantes en Supabase
Total: **${missingVehiclesSheets.length}**

*(Vehículos en el Google Sheet principal que no están registrados en la tabla 'vehiculos' de Supabase)*
${missingVehiclesSheets.length === 0 ? '*No hay vehículos faltantes.*' : ''}
${missingVehiclesSheets.slice(0, 30).map(mv => `- Placa: \`${mv.placa}\` | Cliente: \`${mv.cliente || 'N/A'}\` | Tipo: \`${mv.tipo || 'N/A'}\``).join('\n')}
${missingVehiclesSheets.length > 30 ? `\n*y ${missingVehiclesSheets.length - 30} más...*` : ''}

---

## 3. Conductores de Coltrack CSV No Encontrados en Supabase
Total: **${missingDriversColtrack.length}** (de ${coltrackRows.length} registros en Coltrack)

*(Conductores que tienen registros de telemetría en Coltrack pero cuyos nombres normalizados no se encuentran en la tabla 'conductores' de Supabase)*
${missingDriversColtrack.slice(0, 30).map(md => `- **${md.fullName}** | Kms: \`${md.kms}\` | Puntaje: \`${md.puntaje}\` | ¿Está en Google Sheets?: **${md.enGoogleSheets}**`).join('\n')}
${missingDriversColtrack.length > 30 ? `\n*y ${missingDriversColtrack.length - 30} más...*` : ''}

---

## 4. Conductores de Fagor Excel No Encontrados en Supabase
Total: **${missingDriversFagor.length}** (de ${fagorDrivers.length} en el maestro de Fagor)

*(Conductores en el maestro de Fagor que no se encuentran en Supabase por Cédula ni por Nombre)*
${missingDriversFagor.slice(0, 30).map(md => `- **${md.fullName}** | Cédula/DNI: \`${md.cedula}\` | iButton: \`${md.ibutton}\` | ¿Está en Google Sheets?: **${md.enGoogleSheets}**`).join('\n')}
${missingDriversFagor.length > 30 ? `\n*y ${missingDriversFagor.length - 30} más...*` : ''}

---

## 5. Diagnóstico del Conductor 1005181554 (Mardory Pineda Jiménez)
- **Cédula**: \`1005181554\`
- **Estado en Google Sheets**: ACTIVO | Proyecto: \`ECOPETROL CAMPOS MADUROS\`
- **Estado en Supabase**: ACTIVO (ID: \`2bab521f-ae19-4856-ab9e-bd9cf592df0a\`)
- **Fecha de Creación en Supabase**: \`2026-05-29T05:10:14.582Z\` (Posterior al período de reporte: \`29/04/2026\` a \`28/05/2026\`)
- **iButton en Supabase**: \`""\` (Vacío, no tiene asignado)
- **En Coltrack CSV**: Aparece como \`Mardory Pineda Jimnez\` (con error de codificación en el apellido, sin la 'e' de Jiménez).
- **Km en Coltrack CSV**: Recorrió **798.353 km** con puntaje **97.981**.
- **Causa de falta de Km en el Reporte Mensual**:
  1. **Fecha de Creación**: Fue creada en Supabase el 29 de mayo, un día después del fin del período de reporte (28 de mayo).
  2. **Inconsistencia de Nombres**: Su nombre en Coltrack es \`Mardory Pineda Jimnez\`, mientras que en Supabase es \`Mardory Pineda Jiménez\`. Al normalizar, \`MARDORY PINEDA JIMNEZ\` no coincide con \`MARDORY PINEDA JIMENEZ\`.
  3. **Falta de iButton / Mapeo Roto**: Al no coincidir por nombre, el script busca el iButton/Cédula mapeados en \`Conductores_Coltrack.csv\`. Sin embargo, el script tiene un bug de columnas y asocia la cédula con la calificación y el iButton con la empresa. Como ella tampoco tiene iButton en Supabase, falla el cruce.
  4. **Falta de procesamiento**: Además, el archivo de kilómetros de conductores de Coltrack usa separador punto y coma (\`;\`), pero el script lo parsea con tubería (\`|\`), lo que causa que **no se procese ningún conductor de Coltrack**.
`;

    fs.writeFileSync('scratch/validacion_resultados.md', report);
    console.log("Reporte guardado en scratch/validacion_resultados.md");

  } catch (err) {
    console.error("Error en ejecucion:", err);
  }
}

run();
