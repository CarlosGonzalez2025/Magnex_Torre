import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const SUPABASE_URL = 'https://cmzeijcyykzdmvisojte.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const contratoAdmin = '4bbd8493-20e0-4818-917c-ede4e001a676';
const contratoTibu = '3b2b1604-4b6d-4786-a077-04c1d4be39cc';

const normName = (name) =>
  String(name ?? '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, ' ');

async function fetchAllRows(query) {
  const allRows = [];
  let from = 0;
  const PAGE_SIZE = 1000;
  while (true) {
    const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    allRows.push(...(data ?? []));
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return allRows;
}

const csvText = fs.readFileSync('coltrack/Consolidado_Faltas_Por_Conductor_Coltrack.csv', 'latin1');
const lines = csvText.split('\n').filter(l => l.trim());
const csvNames = new Map(); // normName -> kms
for (let i = 1; i < lines.length; i++) {
  const cols = lines[i].split(';');
  const name = cols[0];
  const kms = Number((cols[3] ?? '0').replace(',', '.'));
  csvNames.set(normName(name), kms);
}
console.log(`Total filas en CSV Coltrack de conductor: ${csvNames.size} nombres únicos`);

async function main() {
  for (const [label, contratoId] of [['VRC-ADMINISTRACION', contratoAdmin], ['VRC-TIBU', contratoTibu]]) {
    const conds = await fetchAllRows(supabase.from('conductores').select('*').eq('contrato_id', contratoId));
    console.log(`\n=== ${label}: ${conds.length} conductores en DB ===`);
    let found = 0, foundWithKms = 0, notFound = 0;
    conds.forEach(c => {
      const key = normName(c.nombres);
      if (csvNames.has(key)) {
        found++;
        const kms = csvNames.get(key);
        if (kms > 0) foundWithKms++;
        console.log(`  ENCONTRADO: "${c.nombres}" (estado ${c.estado}) -> kms en CSV Coltrack: ${kms}`);
      } else {
        notFound++;
      }
    });
    console.log(`Resumen ${label}: encontrados en CSV=${found} (con kms>0=${foundWithKms}), NO encontrados en CSV=${notFound}`);
  }
}

main().catch(e => console.error(e));
