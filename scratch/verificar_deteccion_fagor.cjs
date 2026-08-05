/**
 * Verifica la NUEVA regla de detección del ingestor Fagor contra los archivos reales:
 *   grilla de vehículo  ⇔  cabecera con «Matrícula» + «Horas Motor» + «Ralentí Tiempo Total»
 * y reproduce la agregación por matrícula para confirmar las cifras del período.
 */
const XLSX = require('xlsx');

const files = [
  'C:/Users/drago/Downloads/Grid_telemetríaMasa Stork_195 (7).xlsx',
  'C:/Users/drago/Downloads/Grid_telemetríaMasa Stork_195 (6).xlsx',
  'C:/Users/drago/Downloads/Informe_de_kilometraje_seleccion_Masa Stork (4).xlsx',
  'C:/Users/drago/Downloads/Informe_ralenti_SeleccionVehiculos (12).xlsx',
  'fagor/Km_Vehículos_Fagor 1.xlsx',
  'fagor/Km_Conductor_Fagor 1.xlsx',
  'ralentis flota/Documento Ralenti 1 primera quincena Abril 2026 Fagor.xlsx',
];

const T = s => String(s ?? '').trim();
const num = v => Number(String(v ?? '').replace(',', '.')) || 0;
const parseTimeStringToHours = v => {
  if (v === undefined || v === null || v === '') return 0;
  if (typeof v === 'number') return v * 24;
  const p = String(v).trim().split(':');
  if (p.length === 3) return (+p[0] || 0) + (+p[1] || 0) / 60 + (+p[2] || 0) / 3600;
  if (p.length === 2) return (+p[0] || 0) + (+p[1] || 0) / 60;
  return 0;
};
const normPlate = s => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

for (const f of files) {
  let wb;
  try { wb = XLSX.readFile(f); } catch (e) { console.log(`\n${f.split(/[\\/]/).pop()} → NO LEGIBLE (${e.message})`); continue; }
  const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });

  let headerIdx = -1;
  for (let i = 0; i < Math.min(raw.length, 15); i++) {
    const r = (raw[i] || []).map(T);
    if (r.includes('Matrícula') && r.includes('Horas Motor') && r.includes('Ralentí Tiempo Total')) { headerIdx = i; break; }
  }

  const nombre = f.split(/[\\/]/).pop();
  if (headerIdx < 0) { console.log(`\n${nombre}\n   → NO es grilla de vehículo (no aporta horas de motor)`); continue; }

  const headers = (raw[headerIdx] || []).map(T);
  const map = new Map();
  for (let i = headerIdx + 1; i < raw.length; i++) {
    const rd = raw[i];
    if (!rd || rd.length <= 1) continue;
    const row = {};
    headers.forEach((h, idx) => { row[h] = rd[idx]; });
    const placa = normPlate(row['Matrícula']);
    if (!placa) continue;
    const a = map.get(placa) ?? { motor: 0, ral: 0, km: 0, gal: 0 };
    a.motor += parseTimeStringToHours(row['Horas Motor']);
    a.ral   += parseTimeStringToHours(row['Ralentí Tiempo Total']);
    a.km    += num(row['Km. Recorridos']);
    a.gal   += num(row['Ralentí Galones Total']);
    map.set(placa, a);
  }
  const tot = [...map.values()].reduce((a, v) => ({ motor: a.motor + v.motor, ral: a.ral + v.ral, km: a.km + v.km, gal: a.gal + v.gal }), { motor: 0, ral: 0, km: 0, gal: 0 });
  const violaciones = [...map.values()].filter(v => v.motor > 0 && v.ral > v.motor * 1.02).length;
  console.log(`\n${nombre}`);
  console.log(`   → SÍ es grilla de vehículo (cabecera fila ${headerIdx})`);
  console.log(`   matrículas=${map.size}  motor=${tot.motor.toFixed(1)} h  ralentí=${tot.ral.toFixed(1)} h  ` +
              `% ralentí=${tot.motor > 0 ? (tot.ral / tot.motor * 100).toFixed(2) : 'n/a'}%  km=${tot.km.toFixed(0)}  galones=${tot.gal.toFixed(1)}`);
  console.log(`   filas con ralentí > motor: ${violaciones}`);
}
