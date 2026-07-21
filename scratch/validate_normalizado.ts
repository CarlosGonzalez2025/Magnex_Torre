// Valida la métrica normalizada contra la BD real usando el MISMO módulo del frontend.
import { createClient } from '@supabase/supabase-js';
import { computeMotorMetrics, identityDeviation } from '../services/ralentiMetrics.ts';

const supabase = createClient(
  'https://cmzeijcyykzdmvisojte.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME'
);

function isQuincena(inicio: string, fin: string): boolean {
  const [yi, mi, di] = inicio.split('-').map(Number);
  const [yf, mf, df] = fin.split('-').map(Number);
  if (yi !== yf || mi !== mf) return false;
  const ultimoDia = new Date(yi, mi, 0).getDate();
  return (di === 1 && df === 15) || (di === 16 && df === ultimoDia);
}

async function fetchAll(): Promise<any[]> {
  const size = 1000; let all: any[] = [];
  for (let p = 0; ; p++) {
    const { data, error } = await supabase.from('ralentis_periodos')
      .select('vehiculo_id, periodo_inicio, periodo_fin, horas_motor_encendido, horas_motor_ralenti, kms_recorridos, consumo_combustible')
      .range(p * size, p * size + size - 1);
    if (error) throw error;
    if (!data?.length) break;
    all = all.concat(data);
    if (data.length < size) break;
  }
  return all;
}

(async () => {
  const rows = (await fetchAll()).filter(r => isQuincena(r.periodo_inicio, r.periodo_fin));
  const byPer = new Map<string, any[]>();
  for (const r of rows) {
    const k = `${r.periodo_inicio}_${r.periodo_fin}`;
    (byPer.get(k) ?? byPer.set(k, []).get(k)!).push(r);
  }
  console.log('Período           | %RalANTES | %RalAHORA | Conducc | Vel   | km/hRal | Cobert | Flag');
  console.log('------------------|-----------|-----------|---------|-------|---------|--------|-----');
  for (const k of [...byPer.keys()].sort()) {
    const pRows = byPer.get(k)!;
    // ANTES (flota completa, bug): ralentí de TODAS las filas / encendido
    const encAll = pRows.reduce((a, r) => a + (Number(r.horas_motor_encendido) || 0), 0);
    const ralAll = pRows.reduce((a, r) => a + (Number(r.horas_motor_ralenti) || 0), 0);
    const pctAntes = encAll > 0 ? (ralAll / encAll) * 100 : 0;
    // AHORA (módulo real normalizado)
    const m = computeMotorMetrics(pRows);
    const dev = identityDeviation(m);
    console.log(
      `${k} | ${pctAntes.toFixed(2).padStart(8)}% | ${m.pctRalenti.toFixed(2).padStart(8)}% | ` +
      `${m.horasConduccion.toFixed(0).padStart(7)} | ${m.velocidadMedia.toFixed(1).padStart(5)} | ` +
      `${m.kmPorHoraRalenti.toFixed(1).padStart(7)} | ${m.coberturaMotorPct.toFixed(0).padStart(5)}% | ` +
      `${m.datoInconsistente ? 'INCONSIST' : 'OK'}  (identidad dev=${(dev * 100).toFixed(3)}%)`
    );
  }
})().catch(e => { console.error(e.message); process.exit(1); });
