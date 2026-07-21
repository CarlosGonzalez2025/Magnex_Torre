const https = require('https');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://cmzeijcyykzdmvisojte.supabase.co';
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const BITACORA_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vS9nb88g2iHcCb-AS4V7lYBcdQG39us7dDgUSGi7cTz0kSw4R_KZOnkSCq4Cncqd3AwH8659X2HKtnS/pub?gid=127931298&single=true&output=csv';

function fetchCsv(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchCsv(res.headers.location).then(resolve).catch(reject);
      }
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve(body));
    }).on('error', reject);
  });
}

function parseCSV(text) {
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
      } else if (ch === ',' && !inQuotes) {
        fields.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    fields.push(current.trim());
    return fields;
  }

  let headerIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().includes('fecha') && lines[i].toLowerCase().includes('novedad')) {
      headerIdx = i;
      break;
    }
  }

  const headers = parseLine(lines[headerIdx]);
  const rows = [];

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const values = parseLine(lines[i]);
    if (values.every(v => !v)) continue;

    const rowObj = {};
    headers.forEach((h, idx) => {
      rowObj[h] = values[idx] || '';
    });

    // Check Si/No columns if present
    const colSi = values[headers.findIndex(h => h.toUpperCase() === 'SI' || h.toUpperCase() === 'SÍ')] || '';
    const colNo = values[headers.findIndex(h => h.toUpperCase() === 'NO')] || '';

    let esAlerta = true;
    if (colNo.toUpperCase() === 'X' || colNo.toUpperCase() === 'SI') {
      esAlerta = false;
    }

    const rawFecha = rowObj['Fecha'] || rowObj['FECHA'] || '';
    let fecha = '';
    if (rawFecha.includes('/')) {
      const parts = rawFecha.split('/');
      if (parts.length === 3) {
        fecha = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
    } else {
      fecha = rawFecha;
    }

    if (!fecha) continue;

    rows.push({
      fecha: fecha,
      hora_alerta: rowObj['Hora alerta'] || null,
      hora_aviso_supervisor: rowObj['Hora aviso supervisor'] || null,
      tipo_novedad: rowObj['Tipo de novedad'] || 'Exceso de velocidad',
      placa: rowObj['Placa'] ? rowObj['Placa'].toUpperCase() : null,
      contrato: rowObj['Contrato'] || 'SIN CONTRATO',
      plataforma: rowObj['Plataforma'] || null,
      conductor: rowObj['Conductor'] || 'Sin asignar',
      gestion_realizada: rowObj['Gestion realizada'] || null,
      cierre_alerta: rowObj['Cierre de la alerta'] || null,
      es_alerta: esAlerta,
      observacion: rowObj['Observacion'] || null
    });
  }

  return rows;
}

async function runMigration() {
  console.log('🔄 Descargando y procesando hoja de Bitácora desde Google Sheets...');
  const csvText = await fetchCsv(BITACORA_CSV_URL);
  const rows = parseCSV(csvText);
  console.log(`📊 ${rows.length} registros extraídos.`);

  if (rows.length === 0) {
    console.log('⚠️ No se encontraron filas válidas.');
    return;
  }

  console.log('🚀 Insertando datos en Supabase public.bitacora_gestion...');
  const { data, error } = await supabase
    .from('bitacora_gestion')
    .insert(rows)
    .select();

  if (error) {
    console.error('❌ Error al insertar en Supabase:', error.message);
  } else {
    console.log(`✅ ¡Migración completada exitosamente! ${data.length} registros insertados en Supabase.`);
  }
}

runMigration().catch(err => console.error('Error fatal:', err));
