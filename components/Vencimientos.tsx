import React, { useEffect, useState, useCallback } from 'react';
import { CalendarClock, Loader2, AlertTriangle } from 'lucide-react';
import { getVencimientos, type VencimientoItem } from '../services/documentosService';
import { listContratos } from '../services/hojaDeVidaService';

const VENTANAS = [15, 30, 60, 90];

function diasBadge(dias: number) {
  if (dias < 0) return { cls: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400', txt: `Vencido hace ${Math.abs(dias)}d` };
  if (dias <= 15) return { cls: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400', txt: `en ${dias}d` };
  return { cls: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300', txt: `en ${dias}d` };
}

export const Vencimientos: React.FC = () => {
  const [items, setItems] = useState<VencimientoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dias, setDias] = useState(30);
  const [contrato, setContrato] = useState('');
  const [incluirVencidos, setIncluirVencidos] = useState(true);
  const [contratos, setContratos] = useState<string[]>([]);

  useEffect(() => { listContratos().then(setContratos); }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await getVencimientos({ dias, contrato, incluirVencidos });
    setItems(data);
    setLoading(false);
  }, [dias, contrato, incluirVencidos]);

  useEffect(() => { load(); }, [load]);

  const vencidos = items.filter(i => i.estado === 'vencido').length;
  const porVencer = items.length - vencidos;
  const selectCls = 'px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white text-sm';

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <CalendarClock className="w-7 h-7 text-blue-600" />
          Vencimientos próximos
        </h2>
        <p className="text-slate-500 dark:text-slate-400 mt-1">
          Licencias y manejo defensivo por vencer o vencidos — para gestionar antes de que caduquen.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="rounded-xl p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <p className="text-xs text-red-600 dark:text-red-400">Vencidos</p>
          <p className="text-2xl font-bold text-red-700 dark:text-red-300">{vencidos}</p>
        </div>
        <div className="rounded-xl p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
          <p className="text-xs text-amber-600 dark:text-amber-400">Por vencer (≤ {dias}d)</p>
          <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">{porVencer}</p>
        </div>
        <div className="rounded-xl p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 col-span-2 sm:col-span-1">
          <p className="text-xs text-slate-500 dark:text-slate-400">Total</p>
          <p className="text-2xl font-bold text-slate-800 dark:text-slate-200">{items.length}</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <select value={dias} onChange={(e) => setDias(Number(e.target.value))} className={selectCls}>
          {VENTANAS.map(v => <option key={v} value={v}>Próximos {v} días</option>)}
        </select>
        <select value={contrato} onChange={(e) => setContrato(e.target.value)} className={selectCls}>
          <option value="">Todos los contratos</option>
          {contratos.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 px-1 whitespace-nowrap">
          <input type="checkbox" checked={incluirVencidos} onChange={(e) => setIncluirVencidos(e.target.checked)} className="rounded" />
          Incluir vencidos
        </label>
      </div>

      {/* Tabla */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60">
                <th className="py-3 px-4 font-semibold">Conductor</th>
                <th className="py-3 px-4 font-semibold">Documento</th>
                <th className="py-3 px-4 font-semibold hidden md:table-cell">Contrato</th>
                <th className="py-3 px-4 font-semibold">Vence</th>
                <th className="py-3 px-4 font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="py-16 text-center"><Loader2 className="w-7 h-7 animate-spin text-blue-600 mx-auto" /></td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={5} className="py-12 text-center text-slate-500 dark:text-slate-400">
                  <AlertTriangle className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                  Sin vencimientos en este rango. 🎉
                </td></tr>
              ) : (
                items.map((it, i) => {
                  const b = diasBadge(it.dias);
                  return (
                    <tr key={i} className="border-b border-slate-100 dark:border-slate-700/50">
                      <td className="py-2.5 px-4">
                        <p className="font-medium text-slate-900 dark:text-white">{it.nombre}</p>
                        <p className="text-xs text-slate-400">CC {it.cedula}</p>
                      </td>
                      <td className="py-2.5 px-4 text-slate-700 dark:text-slate-300">{it.documento}</td>
                      <td className="py-2.5 px-4 text-slate-500 dark:text-slate-400 hidden md:table-cell truncate max-w-[180px]">{it.contrato || '—'}</td>
                      <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">{new Date(it.fecha_venc).toLocaleDateString()}</td>
                      <td className="py-2.5 px-4"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${b.cls}`}>{b.txt}</span></td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Vencimientos;
