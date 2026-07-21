import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://cmzeijcyykzdmvisojte.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const fechaInicio = '2026-04-29';
const fechaFin = '2026-05-28';

async function diagnose() {
  console.log("=== COMPROBANDO TODOS LOS CONTRATOS Y SUS REPORTES DE CONDUCTORES ===");
  try {
    // 1. Obtener contratos
    const { data: contratos, error: cErr } = await supabase
      .from('contratos')
      .select('*');
      
    if (cErr) throw cErr;
    
    // 2. Obtener todos los reportes de conductores del periodo
    const { data: reportes, error: rErr } = await supabase
      .from('reportes_conductores')
      .select('*, conductores(*)')
      .eq('periodo_inicio', fechaInicio)
      .eq('periodo_fin', fechaFin);
      
    if (rErr) throw rErr;
    
    console.log(`Total reportes de conductores en el periodo ${fechaInicio} al ${fechaFin}: ${reportes.length}`);
    
    // 3. Agrupar reportes de conductores por contrato_id
    const conteoPorContrato = {};
    reportes.forEach(r => {
      const cId = r.conductores?.contrato_id || 'SIN_CONTRATO';
      if (!conteoPorContrato[cId]) {
        conteoPorContrato[cId] = {
          count: 0,
          totalKms: 0,
          drivers: []
        };
      }
      conteoPorContrato[cId].count++;
      conteoPorContrato[cId].totalKms += Number(r.kms ?? 0);
      conteoPorContrato[cId].drivers.push({
        nombre: r.conductores?.nombres,
        estado: r.conductores?.estado,
        kms: r.kms
      });
    });
    
    console.log("\nDesglose de reportes de conductores por contrato:");
    contratos.forEach(c => {
      const info = conteoPorContrato[c.id];
      if (info) {
        console.log(`- Contrato: "${c.nombre}" (ID: ${c.id})`);
        console.log(`  Cliente: "${c.cliente}" | Proyecto: "${c.proyecto}"`);
        console.log(`  Reportes de conductores: ${info.count} | Kilómetros Totales: ${info.totalKms.toFixed(2)}`);
        console.log(`  Detalle de conductores activos/inactivos en el reporte:`);
        info.drivers.forEach(d => {
          console.log(`    * "${d.nombre}" (Estado actual en DB: ${d.estado}) | Kms: ${d.kms}`);
        });
      } else {
        console.log(`- Contrato: "${c.nombre}" (ID: ${c.id}) -> ❌ Sin reportes de conductores en este periodo.`);
      }
    });
    
    const sinContrato = conteoPorContrato['SIN_CONTRATO'];
    if (sinContrato) {
      console.log(`\n- Conductores sin contrato asociado (contrato_id nulo en DB):`);
      console.log(`  Reportes: ${sinContrato.count} | Kilómetros Totales: ${sinContrato.totalKms.toFixed(2)}`);
      sinContrato.drivers.forEach(d => {
        console.log(`    * "${d.nombre}" (Estado: ${d.estado}) | Kms: ${d.kms}`);
      });
    }

  } catch (err) {
    console.error("Error:", err.message);
  }
}

diagnose();
