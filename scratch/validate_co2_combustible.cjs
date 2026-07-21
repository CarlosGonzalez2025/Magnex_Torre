const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://cmzeijcyykzdmvisojte.supabase.co','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME');

// === Réplica EXACTA de la lógica del componente ===
const CO2_FACTOR_FALLBACK = 9.923077;
const CO2_FACTORES_GALON = [
  { name:'DIESEL', test: t => t.includes('diesel') || t.includes('diésel') || t.includes('acpm'), factor: 10.15 },
  { name:'GASOLINA', test: t => t.includes('gasolina') || t.includes('corriente'), factor: 8.81 },
  { name:'GLP', test: t => t.includes('glp') || t.includes('gas licuado'), factor: 6.47 },
];
const factorMatch = (tipo) => {
  const t = (tipo ?? '').toLowerCase().trim();
  if (!t) return { factor: CO2_FACTOR_FALLBACK, grupo:'FALLBACK(vacío)' };
  const m = CO2_FACTORES_GALON.find(f => f.test(t));
  return m ? { factor: m.factor, grupo:m.name } : { factor: CO2_FACTOR_FALLBACK, grupo:'FALLBACK(sin match)' };
};

async function fetchAll(table, select, build) {
  const ps=1000; let all=[]; for(let p=0;;p++){let q=s.from(table).select(select).range(p*ps,p*ps+ps-1); q=build(q); const{data,error}=await q; if(error)throw error; if(!data||!data.length)break; all=all.concat(data); if(data.length<ps)break;} return all;
}

(async()=>{
  // 1. Inventario de tipo_combustible en vehiculos
  const vehs = await fetchAll('vehiculos','id,tipo_combustible',q=>q);
  const porTipo = new Map();
  vehs.forEach(v=>{ const t=(v.tipo_combustible??'(null/vacío)'); porTipo.set(t,(porTipo.get(t)||0)+1); });
  console.log('=== tipo_combustible en vehiculos ('+vehs.length+' veh) ===');
  console.log('valor_BD | veh | -> grupo CO2 | factor');
  [...porTipo.entries()].sort((a,b)=>b[1]-a[1]).forEach(([t,n])=>{
    const m=factorMatch(t==='(null/vacío)'?'':t);
    console.log(`  "${t}" | ${n} | ${m.grupo} | ${m.factor}`);
  });

  // 2. galonesPorCombustible para Q2 mayo (réplica del componente)
  const vehFuel = new Map(); vehs.forEach(v=>vehFuel.set(String(v.id),(v.tipo_combustible??'').trim()));
  const per = await fetchAll('ralentis_periodos','vehiculo_id,consumo_combustible',
    q=>q.eq('periodo_inicio','2026-05-16').eq('periodo_fin','2026-05-31'));
  const galPorComb={};
  per.forEach(r=>{ const tipo=vehFuel.get(String(r.vehiculo_id))||'NO REGISTRA'; const key=tipo.toUpperCase(); galPorComb[key]=(galPorComb[key]??0)+(Number(r.consumo_combustible)||0); });

  const galTotal=per.reduce((a,r)=>a+(Number(r.consumo_combustible)||0),0);
  const galClasif=Object.values(galPorComb).reduce((a,b)=>a+b,0);
  let co2=0;
  console.log('\n=== galonesPorCombustible Q2 mayo -> CO2 ===');
  Object.entries(galPorComb).sort((a,b)=>b[1]-a[1]).forEach(([k,g])=>{
    const m=factorMatch(k); const kg=g*m.factor; co2+=kg;
    console.log(`  key="${k}" | gal=${g.toFixed(1)} | factor=${m.factor} (${m.grupo}) | ${kg.toFixed(0)} kg`);
  });
  console.log('---');
  console.log('Galones total:', galTotal.toFixed(1), '| clasificados:', galClasif.toFixed(1));
  console.log('CO2 total:', co2.toFixed(0),'kg =', (co2/1000).toFixed(3),'ton');
  console.log('Factor efectivo flota:', (co2/galTotal).toFixed(3),'kg/gal');
})().catch(e=>{console.error('ERR',e.message);process.exit(1);});
