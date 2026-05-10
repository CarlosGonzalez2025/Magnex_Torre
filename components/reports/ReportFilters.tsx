import React from 'react';
import { Search, Filter, Download } from 'lucide-react';

export interface FiltroState {
  tipo: 'conductor' | 'vehiculo';
  conductorId: string;
  vehiculoId: string;
  fechaInicio: string;
  fechaFin: string;
  proyecto: string;
  contratoId: string;
}

interface ReportFiltersProps {
  filtro: FiltroState;
  onChange: (filtro: FiltroState) => void;
  conductores: { id: string; nombres: string; cedula: string }[];
  vehiculos: { id: string; placa: string; cliente: string }[];
  contratos?: { id: string; nombre: string; cliente?: string; proyecto?: string }[];
  proyectos: string[];
  modo: 'daily' | 'monthly';
  onGenerar: () => void;
  onGenerarContrato?: () => void;
  generando: boolean;
  generandoContrato?: boolean;
}

export const ReportFilters: React.FC<ReportFiltersProps> = ({
  filtro,
  onChange,
  conductores,
  vehiculos,
  contratos = [],
  proyectos,
  modo,
  onGenerar,
  onGenerarContrato,
  generando,
  generandoContrato = false,
}) => {
  const set = (patch: Partial<FiltroState>) => onChange({ ...filtro, ...patch });

  const handleFechaInicio = (v: string) => {
    if (modo === 'daily') set({ fechaInicio: v, fechaFin: v });
    else set({ fechaInicio: v });
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-4">
      <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-semibold">
        <Filter className="w-4 h-4" />
        <span>Filtros del Informe</span>
      </div>

      <div className="flex gap-2">
        {(['conductor', 'vehiculo'] as const).map((t) => (
          <button
            key={t}
            onClick={() => set({ tipo: t, conductorId: '', vehiculoId: '' })}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
              filtro.tipo === t
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
            }`}
          >
            {t === 'conductor' ? 'Conductores' : 'Vehiculos'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtro.tipo === 'conductor' && (
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">Conductor</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-400" />
              <select
                value={filtro.conductorId}
                onChange={(e) => set({ conductorId: e.target.value })}
                className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              >
                <option value="">Seleccionar</option>
                {conductores.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombres.toUpperCase()} ({c.cedula})</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {filtro.tipo === 'vehiculo' && (
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">Vehiculo (Placa)</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-400" />
              <select
                value={filtro.vehiculoId}
                onChange={(e) => set({ vehiculoId: e.target.value })}
                className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              >
                <option value="">Seleccionar</option>
                {vehiculos.map((v) => (
                  <option key={v.id} value={v.id}>{v.placa} - {v.cliente}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div>
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">Proyecto</label>
          <select
            value={filtro.proyecto}
            onChange={(e) => set({ proyecto: e.target.value })}
            className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          >
            <option value="">Todos los proyectos</option>
            {proyectos.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        {modo === 'monthly' && (
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">Contrato</label>
            <select
              value={filtro.contratoId}
              onChange={(e) => set({ contratoId: e.target.value, conductorId: '', vehiculoId: '' })}
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            >
              <option value="">Todos los contratos</option>
              {contratos.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
        )}

        <div>
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">
            {modo === 'daily' ? 'Fecha del informe' : 'Fecha inicio'}
          </label>
          <input
            type="date"
            value={filtro.fechaInicio}
            onChange={(e) => handleFechaInicio(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          />
        </div>

        {modo === 'monthly' && (
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">Fecha fin</label>
            <input
              type="date"
              value={filtro.fechaFin}
              min={filtro.fechaInicio}
              onChange={(e) => set({ fechaFin: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={onGenerar}
          disabled={generando || (!filtro.conductorId && !filtro.vehiculoId) || !filtro.fechaInicio}
          className="w-full sm:w-auto px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white font-semibold text-sm transition-colors flex items-center gap-2"
        >
          {generando && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
          {generando ? 'Generando PDF...' : 'Generar PDF individual'}
        </button>

        {modo === 'monthly' && onGenerarContrato && (
          <button
            onClick={onGenerarContrato}
            disabled={generandoContrato || !filtro.contratoId || !filtro.fechaInicio || !filtro.fechaFin}
            className="w-full sm:w-auto px-6 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white font-semibold text-sm transition-colors flex items-center gap-2"
          >
            {generandoContrato
              ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <Download className="w-4 h-4" />}
            {generandoContrato ? 'Generando contrato...' : 'Descargar contrato'}
          </button>
        )}
      </div>
    </div>
  );
};
