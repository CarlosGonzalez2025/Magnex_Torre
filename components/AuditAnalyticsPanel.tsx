import React from 'react';
import {
  TrendingUp, TrendingDown, PieChart, BarChart3, Clock, Gauge,
  Users, Car, MapPin, Download, AlertTriangle, Link2, Activity
} from 'lucide-react';
import { DetailedAuditAnalysis } from '../services/auditService';

// ==================================================================
// Panel de Análisis Detallado (Auditoría de Flota)
// Gráficos ligeros en SVG/CSS (sin dependencias externas), alineados
// con el lenguaje visual existente (slate / indigo / rojo).
// ==================================================================

interface Props {
  analysis: DetailedAuditAnalysis | null;
  isLoading: boolean;
  onViewVehicle: (plate: string) => void;
  onViewDriver: (driver: string) => void;
  onExport: () => void;
}

const SOURCE_TONE: Record<string, string> = {
  COLTRACK: 'bg-blue-500',
  FAGOR: 'bg-emerald-500',
  GEOTAB: 'bg-amber-500'
};

// ---- Primitivas de gráfico -----------------------------------------------

const HBar: React.FC<{
  label: string;
  value: number;
  max: number;
  caption?: string;
  barClass?: string;
  onClick?: () => void;
  rank?: number;
}> = ({ label, value, max, caption, barClass = 'bg-indigo-500', onClick, rank }) => {
  const pct = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      {rank !== undefined && (
        <span className="w-6 h-6 shrink-0 bg-slate-100 text-slate-600 rounded-full flex items-center justify-center text-xs font-bold">
          {rank}
        </span>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          {onClick ? (
            <button
              onClick={onClick}
              className="text-sm font-semibold text-slate-700 hover:text-indigo-600 truncate transition-colors"
              title={label}
            >
              {label}
            </button>
          ) : (
            <span className="text-sm font-medium text-slate-700 truncate" title={label}>{label}</span>
          )}
          <span className="text-sm font-semibold text-slate-800 tabular-nums ml-2 shrink-0">
            {value}{caption ? <span className="text-xs font-normal text-slate-500 ml-1">{caption}</span> : null}
          </span>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${barClass}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
};

const VBars: React.FC<{
  data: { label: string; value: number; highlight?: boolean }[];
  height?: number;
  barClass?: string;
}> = ({ data, height = 120, barClass = 'bg-indigo-500' }) => {
  const max = Math.max(1, ...data.map(d => d.value));
  return (
    <div className="flex items-end gap-1 overflow-x-auto pb-1" style={{ height: height + 22 }}>
      {data.map((d, i) => (
        <div key={i} className="flex flex-col items-center justify-end gap-1 flex-1 min-w-[14px]" title={`${d.label}: ${d.value}`}>
          <span className="text-[10px] text-slate-500 tabular-nums">{d.value > 0 ? d.value : ''}</span>
          <div
            className={`w-full rounded-t ${d.highlight ? 'bg-red-500' : barClass}`}
            style={{ height: `${(d.value / max) * height}px`, minHeight: d.value > 0 ? 3 : 0 }}
          />
          <span className="text-[9px] text-slate-400 truncate w-full text-center">{d.label}</span>
        </div>
      ))}
    </div>
  );
};

const Section: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode; right?: React.ReactNode }> =
  ({ title, icon, children, right }) => (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-slate-800 flex items-center gap-2">{icon}{title}</h3>
        {right}
      </div>
      {children}
    </div>
  );

// ---- Panel ---------------------------------------------------------------

export const AuditAnalyticsPanel: React.FC<Props> = ({ analysis, isLoading, onViewVehicle, onViewDriver, onExport }) => {
  if (isLoading && !analysis) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-slate-600">Generando análisis...</p>
      </div>
    );
  }

  if (!analysis || analysis.overview.total_alerts === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
        <BarChart3 className="w-16 h-16 text-slate-300 mx-auto mb-4" />
        <p className="text-slate-600 font-medium">No hay datos para analizar</p>
        <p className="text-sm text-slate-500 mt-1">Carga archivos o ajusta los filtros para ver el análisis.</p>
      </div>
    );
  }

  const { overview, temporal, severity, vehicles, drivers, speed_analysis, location_analysis, trends, source_distribution, vehicle_driver_relations } = analysis;

  const growthUp = trends.growth_rate >= 0;
  const maxVehicle = vehicles.most_alerts[0]?.count || 1;
  const maxDriver = drivers.most_incidents[0]?.count || 1;
  const maxType = severity.by_type[0]?.count || 1;
  const maxLocation = location_analysis.top_locations[0]?.count || 1;
  const maxSpeedRange = Math.max(1, ...speed_analysis.speed_ranges.map(r => r.count));
  const maxSource = Math.max(1, ...source_distribution.map(s => s.count));

  // Tendencia diaria: últimos 30 puntos
  const trendData = trends.daily_trend.slice(-30).map(t => ({
    label: t.date.slice(5),            // MM-DD
    value: t.count
  }));

  const hourData = temporal.alerts_by_hour.map(h => ({
    label: String(h.hour).padStart(2, '0'),
    value: h.count,
    highlight: h.hour === temporal.peak_hour && h.count > 0
  }));

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPI tone="indigo" label="Total Alertas" value={overview.total_alerts.toLocaleString()} />
        <KPI tone="red" label="% Faltas Graves" value={`${overview.grave_percentage.toFixed(1)}%`} />
        <KPI tone="emerald" label="Vehículos" value={vehicles.total_vehicles} />
        <KPI tone="blue" label="Conductores" value={drivers.total_drivers} />
        <KPI tone="purple" label="Vel. Promedio" value={`${speed_analysis.avg_speed.toFixed(0)}`} suffix="km/h" />
        <KPI tone="orange" label="Vel. Máxima" value={`${speed_analysis.max_speed.toFixed(0)}`} suffix="km/h" />
      </div>

      {/* Tendencia diaria */}
      <Section
        title="Tendencia Diaria de Alertas"
        icon={<Activity className="w-5 h-5 text-indigo-600" />}
        right={
          <span className={`text-sm font-semibold flex items-center gap-1 px-2.5 py-1 rounded-full ${growthUp ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
            {growthUp ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            {growthUp ? '+' : ''}{trends.growth_rate.toFixed(1)}%
          </span>
        }
      >
        {trendData.length > 0
          ? <VBars data={trendData} height={130} barClass="bg-indigo-500" />
          : <p className="text-sm text-slate-500">Sin datos temporales suficientes.</p>}
      </Section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Distribución por hora */}
        <Section
          title="Distribución por Hora"
          icon={<Clock className="w-5 h-5 text-indigo-600" />}
          right={<span className="text-xs bg-red-50 text-red-600 px-2.5 py-1 rounded-full font-medium">Pico: {String(temporal.peak_hour).padStart(2, '0')}:00</span>}
        >
          <VBars data={hourData} height={120} />
        </Section>

        {/* Rangos de velocidad */}
        <Section title="Rangos de Velocidad" icon={<Gauge className="w-5 h-5 text-indigo-600" />}>
          <div className="space-y-3">
            {speed_analysis.speed_ranges.map((r, i) => (
              <HBar
                key={r.range}
                label={r.range}
                value={r.count}
                max={maxSpeedRange}
                barClass={i >= 3 ? 'bg-red-500' : i === 2 ? 'bg-amber-500' : 'bg-emerald-500'}
              />
            ))}
          </div>
        </Section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top vehículos */}
        <Section title="Top Vehículos con Más Alertas" icon={<Car className="w-5 h-5 text-orange-600" />}>
          <div className="space-y-3">
            {vehicles.most_alerts.slice(0, 8).map((v, i) => (
              <HBar
                key={v.plate}
                rank={i + 1}
                label={v.plate}
                value={v.count}
                max={maxVehicle}
                caption={v.grave_count > 0 ? `· ${v.grave_count} graves` : undefined}
                barClass="bg-orange-500"
                onClick={() => onViewVehicle(v.plate)}
              />
            ))}
          </div>
        </Section>

        {/* Top conductores */}
        <Section title="Top Conductores con Más Incidencias" icon={<Users className="w-5 h-5 text-blue-600" />}>
          <div className="space-y-3">
            {drivers.most_incidents.slice(0, 8).map((d, i) => (
              <HBar
                key={d.driver}
                rank={i + 1}
                label={d.driver}
                value={d.count}
                max={maxDriver}
                caption={d.grave_count > 0 ? `· ${d.grave_count} graves` : undefined}
                barClass="bg-blue-500"
                onClick={() => onViewDriver(d.driver)}
              />
            ))}
          </div>
        </Section>
      </div>

      {/* Relación vehículo <-> conductor */}
      <Section title="Relación Vehículo ↔ Conductor" icon={<Link2 className="w-5 h-5 text-indigo-600" />}>
        <p className="text-xs text-slate-500 mb-3">Cruce de responsabilidad: qué conductores operan cada vehículo y cuántas incidencias generan.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200">
                <th className="py-2 pr-4 font-medium">Placa</th>
                <th className="py-2 pr-4 font-medium">Conductores (alertas · graves)</th>
                <th className="py-2 pr-2 font-medium text-right">Total</th>
                <th className="py-2 pl-2 font-medium text-right">Graves</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {vehicle_driver_relations.map(rel => (
                <tr key={rel.plate} className="hover:bg-slate-50">
                  <td className="py-2 pr-4">
                    <button onClick={() => onViewVehicle(rel.plate)} className="font-semibold text-slate-800 hover:text-indigo-600">
                      {rel.plate}
                    </button>
                  </td>
                  <td className="py-2 pr-4">
                    <div className="flex flex-wrap gap-1.5">
                      {rel.drivers.slice(0, 6).map(d => (
                        <button
                          key={d.driver}
                          onClick={() => onViewDriver(d.driver)}
                          className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${d.grave_count > 0 ? 'bg-red-50 text-red-700 hover:bg-red-100' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                          title={`${d.driver}: ${d.count} alertas, ${d.grave_count} graves`}
                        >
                          {d.driver} <span className="tabular-nums opacity-70">{d.count}·{d.grave_count}</span>
                        </button>
                      ))}
                      {rel.drivers.length > 6 && (
                        <span className="px-2 py-0.5 text-xs text-slate-400">+{rel.drivers.length - 6}</span>
                      )}
                    </div>
                  </td>
                  <td className="py-2 pr-2 text-right font-semibold text-slate-800 tabular-nums">{rel.total}</td>
                  <td className="py-2 pl-2 text-right tabular-nums">
                    {rel.grave_count > 0
                      ? <span className="text-red-600 font-semibold">{rel.grave_count}</span>
                      : <span className="text-slate-400">0</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Tipos de alerta */}
        <Section title="Tipos de Alerta" icon={<PieChart className="w-5 h-5 text-indigo-600" />}>
          <div className="space-y-3">
            {severity.by_type.slice(0, 6).map(t => (
              <HBar key={t.type} label={t.type} value={t.count} max={maxType} caption={`· ${t.percentage.toFixed(0)}%`} barClass="bg-indigo-500" />
            ))}
          </div>
        </Section>

        {/* Top ubicaciones */}
        <Section title="Top Ubicaciones" icon={<MapPin className="w-5 h-5 text-rose-600" />}>
          {location_analysis.top_locations.length > 0 ? (
            <div className="space-y-3">
              {location_analysis.top_locations.slice(0, 6).map(l => (
                <HBar key={l.location} label={l.location} value={l.count} max={maxLocation} barClass="bg-rose-500" />
              ))}
            </div>
          ) : <p className="text-sm text-slate-500">Sin datos de ubicación.</p>}
        </Section>
      </div>

      {/* Distribución por plataforma + conductores por % graves */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section title="Distribución por Plataforma" icon={<BarChart3 className="w-5 h-5 text-indigo-600" />}>
          <div className="space-y-3">
            {source_distribution.map(s => (
              <HBar key={s.source} label={s.source} value={s.count} max={maxSource} barClass={SOURCE_TONE[s.source] || 'bg-slate-400'} />
            ))}
          </div>
        </Section>

        <Section title="Conductores por % de Faltas Graves" icon={<AlertTriangle className="w-5 h-5 text-red-600" />}>
          <div className="space-y-3">
            {drivers.driver_performance.filter(d => d.total >= 2).slice(0, 6).map(d => (
              <HBar
                key={d.driver}
                label={d.driver}
                value={Math.round(d.grave_percentage)}
                max={100}
                caption={`% · ${d.total} alertas`}
                barClass="bg-red-500"
                onClick={() => onViewDriver(d.driver)}
              />
            ))}
            {drivers.driver_performance.filter(d => d.total >= 2).length === 0 && (
              <p className="text-sm text-slate-500">Sin conductores con suficientes registros.</p>
            )}
          </div>
        </Section>
      </div>

      {/* Export */}
      <div className="flex justify-end">
        <button onClick={onExport} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2">
          <Download className="w-4 h-4" />
          Exportar Análisis Completo (CSV)
        </button>
      </div>
    </div>
  );
};

// ---- KPI tile ------------------------------------------------------------

const KPI_TONES: Record<string, string> = {
  indigo: 'from-indigo-50 to-indigo-100 border-indigo-200 text-indigo-700',
  red: 'from-red-50 to-red-100 border-red-200 text-red-700',
  emerald: 'from-emerald-50 to-emerald-100 border-emerald-200 text-emerald-700',
  blue: 'from-blue-50 to-blue-100 border-blue-200 text-blue-700',
  purple: 'from-purple-50 to-purple-100 border-purple-200 text-purple-700',
  orange: 'from-orange-50 to-orange-100 border-orange-200 text-orange-700'
};

const KPI: React.FC<{ tone: string; label: string; value: React.ReactNode; suffix?: string }> = ({ tone, label, value, suffix }) => (
  <div className={`bg-gradient-to-br ${KPI_TONES[tone]} rounded-lg p-3 border`}>
    <p className="text-xs font-medium opacity-80">{label}</p>
    <p className="text-xl font-bold text-slate-900 mt-0.5">
      {value}{suffix ? <span className="text-xs font-normal text-slate-500 ml-1">{suffix}</span> : null}
    </p>
  </div>
);
