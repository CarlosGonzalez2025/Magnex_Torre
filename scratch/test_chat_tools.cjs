const { TOOLS, makeClient } = require('../api/_chatCore.cjs');
const supabase = makeClient(
  'https://cmzeijcyykzdmvisojte.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME'
);
const P = { periodo_inicio: '2026-06-01', periodo_fin: '2026-06-15' };
(async () => {
  const run = async (name, args) => {
    try {
      const r = await TOOLS[name].run(supabase, args || {});
      console.log(`\n=== ${name} ===\n` + JSON.stringify(r, null, 2).slice(0, 900));
    } catch (e) { console.log(`\n=== ${name} ERROR: ${e.message}`); }
  };
  await run('listar_periodos');
  await run('ralenti_por_periodo', P);
  await run('top_conductores_ralenti', { ...P, limite: 5 });
  await run('consumo_co2_por_contrato', P);
})();
