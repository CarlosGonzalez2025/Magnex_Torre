import { createClient } from '@supabase/supabase-js';
import { estandarizar, elegirK, distanciaAlCentroide, entrenarLogistica, predecirProbabilidad, evaluar } from '../services/ralentiML.ts';
const s = createClient('https://cmzeijcyykzdmvisojte.supabase.co','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME');
const all = async (t:string,f:string)=>{const o:any[]=[];for(let p=0;;p++){const{data}=await s.from(t).select(f).range(p*1000,(p+1)*1000-1);if(!data||!data.length)break;o.push(...data);if(data.length<1000)break;}return o;};
const ult=(y:number,m:number)=>new Date(y,m,0).getDate();
const esQ=(a:string,b:string)=>{const[yi,mi,di]=a.split('-').map(Number),[yf,mf,df]=b.split('-').map(Number);return yi===yf&&mi===mf&&((di===1&&df===15)||(di===16&&df===ult(yi,mi)));};
const hoy=new Date().toISOString().slice(0,10);

const per = (await all('ralentis_periodos','vehiculo_id,periodo_inicio,periodo_fin,horas_motor_encendido,horas_motor_ralenti,kms_recorridos')).filter(r=>esQ(r.periodo_inicio,r.periodo_fin)&&r.periodo_fin<hoy);
const ev  = (await all('ralentis_eventos','vehiculo_id,periodo_inicio,periodo_fin,duracion_segundos,proveedor')).filter(r=>esQ(r.periodo_inicio,r.periodo_fin)&&r.periodo_fin<hoy);
const quincenas=[...new Set(per.map(r=>`${r.periodo_inicio}_${r.periodo_fin}`))].sort();
console.log(`Quincenas cerradas: ${quincenas.length} · filas veh-quincena: ${per.length} · eventos: ${ev.length}\n`);

// Métricas por (vehículo, quincena)
type M={mot:number;ral:number;km:number;nEv:number;segEv:number;largos:number};
const key=(v:string,q:string)=>`${v}|${q}`;
const mp=new Map<string,M>();
const get=(k:string)=>mp.get(k)??mp.set(k,{mot:0,ral:0,km:0,nEv:0,segEv:0,largos:0}).get(k)!;
for(const r of per){const m=get(key(r.vehiculo_id,`${r.periodo_inicio}_${r.periodo_fin}`));m.mot+=+r.horas_motor_encendido||0;m.ral+=+r.horas_motor_ralenti||0;m.km+=+r.kms_recorridos||0;}
const UMB:Record<string,number>={COLTRACK:600,FAGOR:300,GEOTAB:0};
for(const e of ev){const d=+e.duracion_segundos||0;if(d<(UMB[String(e.proveedor).toUpperCase()]??300))continue;const m=get(key(e.vehiculo_id,`${e.periodo_inicio}_${e.periodo_fin}`));m.nEv++;m.segEv+=d;if(d>1800)m.largos++;}

// Perfil por vehículo (promedio sobre sus quincenas)
const porVeh=new Map<string,M[]>();
for(const [k,m] of mp){const v=k.split('|')[0];(porVeh.get(v)??porVeh.set(v,[]).get(v)!).push(m);}
const ids=[...porVeh.keys()].filter(v=>porVeh.get(v)!.length>=3);
const feats=ids.map(v=>{const ms=porVeh.get(v)!;const n=ms.length;
  const mot=ms.reduce((a,m)=>a+m.mot,0),ral=ms.reduce((a,m)=>a+m.ral,0);
  const nEv=ms.reduce((a,m)=>a+m.nEv,0),seg=ms.reduce((a,m)=>a+m.segEv,0),lg=ms.reduce((a,m)=>a+m.largos,0);
  return [ mot>0?(ral/mot)*100:0, ral/n, nEv>0?(seg/nEv)/60:0, nEv/n, nEv>0?(lg/nEv)*100:0 ];});
console.log(`Vehículos con >=3 quincenas: ${ids.length}`);

const est=estandarizar(feats);
const r=elegirK(est.datos,2,5,42)!;
console.log(`\n── SEGMENTACIÓN (k-means++) ──`);
console.log(`k elegido por silueta: ${r.k}  ·  silueta media = ${r.silueta.toFixed(3)} ${r.silueta>0.25?'(estructura creíble)':'(estructura DÉBIL)'}`);
const NOM=['%Ralentí','h ral/quinc','dur.media min','eventos/quinc','% >30min'];
for(let c=0;c<r.k;c++){
  const idx=r.modelo.asignaciones.map((a,i)=>a===c?i:-1).filter(i=>i>=0);
  const prom=NOM.map((_,j)=>idx.reduce((a,i)=>a+feats[i][j],0)/idx.length);
  console.log(`  Grupo ${c+1}: ${String(idx.length).padStart(3)} veh · ${NOM.map((n,j)=>`${n}=${prom[j].toFixed(1)}`).join(' · ')}`);
}
const dist=distanciaAlCentroide(est.datos,r.modelo);
const orden=dist.map((d,i)=>({d,i})).sort((a,b)=>b.d-a.d);
console.log(`  Atípicos (no encajan ni en su propio grupo): ${orden.slice(0,5).map(o=>o.d.toFixed(1)).join(', ')}`);

// ── Predicción de reincidencia: ¿seguirá en el quintil alto la próxima quincena? ──
console.log(`\n── PREDICCIÓN DE REINCIDENCIA (regresión logística, validación temporal) ──`);
const filas:{v:string;qi:number;x:number[];y:number}[]=[];
const ralQ=(q:string)=>{const vals=ids.map(v=>mp.get(key(v,q))?.ral??0).filter(x=>x>0).sort((a,b)=>b-a);return vals[Math.floor(vals.length*0.2)]??Infinity;};
const umbrales=quincenas.map(q=>ralQ(q));
for(let qi=0;qi<quincenas.length-1;qi++){
  for(const v of ids){
    const a=mp.get(key(v,quincenas[qi])), b=mp.get(key(v,quincenas[qi+1]));
    if(!a||!b||a.mot<=0)continue;
    filas.push({v,qi,x:[(a.ral/a.mot)*100,a.ral,a.nEv>0?(a.segEv/a.nEv)/60:0,a.nEv,a.nEv>0?(a.largos/a.nEv)*100:0],y:b.ral>=umbrales[qi+1]?1:0});
  }
}
const corte=quincenas.length-2;
const tr=filas.filter(f=>f.qi<corte), te=filas.filter(f=>f.qi===corte);
console.log(`  entrenamiento: ${tr.length} filas (quincenas 1..${corte})  ·  prueba: ${te.length} filas (última transición, nunca vista)`);
if(tr.length>20&&te.length>10){
  const e2=estandarizar(tr.map(f=>f.x));
  const Xtr=e2.datos, ytr=tr.map(f=>f.y);
  const Xte=te.map(f=>f.x.map((v,j)=>(v-e2.medias[j])/e2.desviaciones[j]));
  const m=entrenarLogistica(Xtr,ytr,{tasa:0.3,iteraciones:3000,l2:0.01})!;
  const pte=Xte.map(x=>predecirProbabilidad(m,x));
  const met=evaluar(pte,te.map(f=>f.y));
  const base=te.filter(f=>f.y===1).length/te.length;
  console.log(`  AUC=${met.auc.toFixed(3)}  exactitud=${(met.exactitud*100).toFixed(1)}%  precisión=${(met.precision*100).toFixed(1)}%  sensibilidad=${(met.sensibilidad*100).toFixed(1)}%`);
  console.log(`  tasa base de positivos: ${(base*100).toFixed(1)}%  → el modelo ${met.auc>0.7?'APORTA señal real':met.auc>0.6?'aporta señal moderada':'NO aporta'}`);
  console.log(`  pesos: ${NOM.map((n,j)=>`${n}=${m.pesos[j].toFixed(2)}`).join(' · ')}`);
}
