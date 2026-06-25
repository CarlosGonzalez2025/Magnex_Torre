import React, { useEffect, useState } from 'react';
import { Truck, Users, Route, Clock, Fuel, RefreshCw, AlertTriangle } from 'lucide-react';
import {
  getLiveCounts,
  getMetricsSummary,
  GeotabCounts,
  GeotabMetricsSummary,
} from '../services/geotabService';

// Helpers de fecha local (YYYY-MM-DD)
const toYmd = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => toYmd(new Date(Date.now() - n * 24 * 60 * 60 * 1000));

export const GeotabPanel: React.FC = () => {
  const [fromDate, setFromDate] = useState<string>(daysAgo(7));
  const [toDate, setToDate] = useState<string>(toYmd(new Date()));

  const [counts, setCounts] = useState<GeotabCounts | null>(null);
  const [metrics, setMetrics] = useState<GeotabMetricsSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [c, m] = await Promise.all([
        getLiveCounts().catch(() => null),
        getMetricsSummary(fromDate, toDate),
      ]);
      if (c) setCounts(c);
      setMetrics(m);
    } catch (e: any) {
      setError(e.message || 'Error consultando Geotab');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cards = [
    {
      title: 'Vehículos (en vivo)',
      value: counts?.vehicleCount ?? '—',
      icon: <Truck className="w-6 h-6 text-blue-600" />,
      color: 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800',
    },
    {
      title: 'Conductores (en vivo)',
      value: counts?.driverCount ?? '—',
      icon: <Users className="w-6 h-6 text-emerald-600" />,
      color: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800',
    },
    {
      title: 'Km recorridos',
      value: metrics ? `${metrics.totalKm.toLocaleString('es-CO', { maximumFractionDigits: 0 })} km` : '—',
      icon: <Route className="w-6 h-6 text-purple-600" />,
      color: 'bg-purple-50 border-purple-200 dark:bg-purple-900/20 dark:border-purple-800',
    },
    {
      title: 'Horas de conducción',
      value: metrics ? `${metrics.totalHorasConduccion.toLocaleString('es-CO', { maximumFractionDigits: 0 })} h` : '—',
      icon: <Clock className="w-6 h-6 text-amber-600" />,
      color: 'bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Controles de período */}
      <div className="flex flex-wrap items-end gap-4 bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Desde</label>
          <input
            type="date"
            value={fromDate}
            max={toDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Hasta</label>
          <input
            type="date"
            value={toDate}
            min={fromDate}
            max={toYmd(new Date())}
            onChange={(e) => setToDate(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm"
          />
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Consultando…' : 'Actualizar'}
        </button>
        <p className="text-xs text-slate-400 ml-auto self-center max-w-xs">
          Conteos en vivo desde Geotab. Km y horas desde el histórico sincronizado.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          {error}
        </div>
      )}

      {/* Tarjetas KPI */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card, idx) => (
          <div key={idx} className={`p-4 rounded-xl border ${card.color} shadow-sm`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{card.title}</p>
                <p className="text-2xl font-bold text-slate-800 dark:text-white mt-1">{card.value}</p>
              </div>
              <div className="p-2 bg-white dark:bg-slate-700 rounded-full shadow-sm">{card.icon}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabla por vehículo */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
          <Fuel className="w-4 h-4 text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Detalle por vehículo {metrics ? `(${metrics.porVehiculo.length})` : ''}
          </h3>
        </div>
        <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/50 sticky top-0">
              <tr className="text-left text-slate-500 dark:text-slate-400">
                <th className="px-4 py-2 font-medium">Placa</th>
                <th className="px-4 py-2 font-medium text-right">Km</th>
                <th className="px-4 py-2 font-medium text-right">Horas conducción</th>
                <th className="px-4 py-2 font-medium text-right">Horas ralentí</th>
                <th className="px-4 py-2 font-medium text-right">Viajes</th>
              </tr>
            </thead>
            <tbody>
              {metrics?.porVehiculo.map((v) => (
                <tr key={v.placa} className="border-t border-slate-100 dark:border-slate-700/50 text-slate-700 dark:text-slate-300">
                  <td className="px-4 py-2 font-medium">{v.placa}</td>
                  <td className="px-4 py-2 text-right">{v.km.toLocaleString('es-CO', { maximumFractionDigits: 1 })}</td>
                  <td className="px-4 py-2 text-right">{v.horas_conduccion.toLocaleString('es-CO', { maximumFractionDigits: 1 })}</td>
                  <td className="px-4 py-2 text-right">{v.horas_ralenti.toLocaleString('es-CO', { maximumFractionDigits: 1 })}</td>
                  <td className="px-4 py-2 text-right">{v.viajes}</td>
                </tr>
              ))}
              {(!metrics || metrics.porVehiculo.length === 0) && !loading && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                    Sin datos sincronizados para el período. Verifica que el cron geotab-sync esté corriendo.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
