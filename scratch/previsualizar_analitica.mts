/** Replica la agregación del Análisis General y corre el modelo, con datos reales. */
import { createClient } from '@supabase/supabase-js';
import { computeMotorMetrics } from '../services/ralentiMetrics.ts';
import { regresionLineal, proyectar, correlacion, fuerzaCorrelacion, detectarAtipicos, descomponerCambio } from '../services/ralentiAnalytics.ts';

const s = createClient('https://cmzeijcyykzdmvisojte.supabase.co','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME');
const PAGE=1000; const rows:any[]=[];
for(let p=0;;p++){const {data}=await s.from('ralentis_periodos').select('vehiculo_id,periodo_inicio,periodo_fin,horas_motor_encendido,horas_motor_ralenti,kms_recorridos,consumo_combustible').range(p*PAGE,(p+1)*PAGE-1); if(!data||!data.length)break; rows.push(...data); if(data.length<PAGE)break;}
const ult=(y:number,m:number)=>new Date(y,m,0).getDate();
const esQ=(a:string,b:string)=>{const[yi,mi,di]=a.split('-').map(Number),[yf,mf,df]=b.split('-').map(Number); return yi===yf&&mi===mf&&((di===1&&df===15)||(di===16&&df===ult(yi,mi)));};
const hoy=new Date().toISOString().slice(0,10);
const byP=new Map<string,any[]>();
for(const r of rows){ if(!esQ(r.periodo_inicio,r.periodo_fin))continue; const k=`${r.periodo_inicio}_${r.periodo_fin}`; (byP.get(k)??byP.set(k,[]).get(k)!).push(r); }
const per=[...byP.entries()].sort().map(([k,rs])=>{const m=computeMotorMetrics(rs); const [ini,fin]=k.split('_');
  return {label:ini.slice(0,7)+(Number(ini.slice(8))<=15?' Q1':' Q2'), ini, fin, enCurso: fin>=hoy, ...m};});
const cerr=per.filter(p=>!p.enCurso);
console.log(`Períodos: ${per.length} · cerrados: ${cerr.length}${per.length>cerr.length?'  (excluida la quincena en curso ✓)':''}\n`);
console.log('PERIODO      VEH  %RAL   RAL/VEH  KM/VEH   GAL');
for(const p of cerr) console.log(`${p.label}  ${String(p.vehiculosConMotor).padStart(4)}  ${p.pctRalenti.toFixed(2).padStart(5)}  ${(p.totalHorasRalenti/Math.max(p.vehiculosConMotor,1)).toFixed(2).padStart(7)}  ${p.kmPorVehiculoActivo.toFixed(0).padStart(6)}  ${p.totalGalones.toFixed(0).padStart(5)}`);
const S=(f:(p:any)=>number)=>cerr.map((p,x)=>({x,y:f(p)}));
console.log('\n── TENDENCIAS ──');
for(const [t,f,u] of [['% Ralentí',(p:any)=>p.pctRalenti,'pp'],['Ralentí por vehículo',(p:any)=>p.totalHorasRalenti/Math.max(p.vehiculosConMotor,1),'h/veh'],['Km por vehículo',(p:any)=>p.kmPorVehiculoActivo,'km']] as any[]){
  const r=regresionLineal(S(f)); if(!r){console.log(`  ${t}: sin datos`);continue;}
  console.log(`  ${t}: ${r.pendiente>0?'+':''}${r.pendiente.toFixed(2)} ${u}/quincena · R²=${r.r2.toFixed(2)} · t=${r.tStat.toFixed(2)} → ${r.significativa?'TENDENCIA':'SIN TENDENCIA (ruido)'}`);
  if(r.significativa){const pr=proyectar(r,cerr.length); console.log(`      proyección próxima quincena: ${pr.valor.toFixed(2)} ± ${pr.banda.toFixed(2)}`);}
}
const c1=correlacion(cerr.map(p=>p.kmPorVehiculoActivo),cerr.map(p=>p.pctRalenti));
if(c1!=null) console.log(`\n── CORRELACIÓN Km/veh vs %Ralentí: r=${c1.toFixed(2)} (${fuerzaCorrelacion(c1)})`);
const at=detectarAtipicos(S((p:any)=>p.pctRalenti));
console.log(`\n── ATÍPICOS: ${at.length===0?'ninguno (serie homogénea)':''}`);
at.forEach(a=>console.log(`   ${cerr[a.indice].label}: ${a.valor.toFixed(2)}% vs ${a.esperado.toFixed(2)}% esperado (z=${a.z.toFixed(1)})`));
const b=cerr[0],a=cerr[cerr.length-1];
const d=descomponerCambio(b.totalHorasRalenti,b.vehiculosConMotor,a.totalHorasRalenti,a.vehiculosConMotor);
if(d) console.log(`\n── FLOTA vs CONDUCTA (${b.label} → ${a.label})\n   total ${Math.round(d.totalBase)} h → ${Math.round(d.totalActual)} h  (${d.cambioTotal>0?'+':''}${Math.round(d.cambioTotal)} h)\n   efecto flota:      ${d.efectoFlota>0?'+':''}${Math.round(d.efectoFlota)} h  (${d.pctFlota.toFixed(0)}%)\n   efecto conducta:   ${d.efectoIntensidad>0?'+':''}${Math.round(d.efectoIntensidad)} h  (${d.pctIntensidad.toFixed(0)}%)`);
