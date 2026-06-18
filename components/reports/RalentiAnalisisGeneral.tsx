import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  TrendingUp,
  BarChart3,
  Leaf,
  Fuel,
  AlertTriangle,
  CheckCircle,
  Activity,
  Info,
  BrainCircuit,
  DollarSign,
  Clock,
  Filter,
  X,
  ChevronDown,
} from 'lucide-react';
import { supabase } from '../../services/supabaseClient';

// ── CO₂ factors (kg/gal) — FECOC/UPME ──
const CO2_FACTORES: { test: (t: string) => boolean; factor: number }[] = [
  { test: t => t.includes('diesel') || t.includes('diésel') || t.includes('acpm'), factor: 10.15 },
  { test: t => t.includes('gasolina') || t.includes('corriente'), factor: 8.81 },
  { test: t => t.includes('glp') || t.includes('gas licuado'), factor: 6.47 },
  { test: t => t.includes('electric') || t.includes('eléctric'), factor: 0 },
];
const PRECIOS_GALON: { test: (t: string) => boolean; precio: number }[] = [
  { test: t => t.includes('diesel') || t.includes('diésel') || t.includes('acpm'), precio: 11200 },
  { test: t => t.includes('gasolina') || t.includes('corriente'), precio: 16000 },
  { test: t => t.includes('electric') || t.includes('eléctric'), precio: 0 },
];
const getCO2Factor = (tipo?: string | null): number => {
  const t = (tipo ?? '').toLowerCase().trim();
  if (!t) return 10.15;
  return CO2_FACTORES.find(f => f.test(t))?.factor ?? 10.15;
};
const getPrecioGalon = (tipo?: string | null): number => {
  const t = (tipo ?? '').toLowerCase().trim();
  if (!t) return 11200;
  return PRECIOS_GALON.find(f => f.test(t))?.precio ?? 11200;
};

// ── Types ──
interface VehicleOption {
  id: string;
  placa: string;
  cliente?: string;
  contrato_id?: string | null;
  tipo_activo?: string | null;
  tipo_combustible?: string | null;
}

interface ContractOption {
  id: string;
  nombre: string;
}

interface PeriodoData {
  key: string;
  label: string;
  labelCorto: string;
  inicio: string;
  fin: string;
  totalEventos: number;
  totalGalones: number;
  totalHorasEncendido: number;
  totalHorasRalenti: number;
  pctRalenti: number;
  co2Kg: number;
  costoCOP: number;
  vehiculosActivos: number;
  pctVsBaselineEventos: number;
  pctVsBaselineGalones: number;
  pctVsBaselineCO2: number;
}

// ── Helpers ──
const MESES_FULL = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const MESES_CORTO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function getPeriodoLabel(inicio: string): { label: string; labelCorto: string } {
  const [year, month, day] = inicio.split('-').map(Number);
  const quincena = day <= 15 ? 'Q1' : 'Q2';
  return {
    label: `${quincena} ${MESES_FULL[month - 1]} ${year}`,
    labelCorto: `${quincena} ${MESES_CORTO[month - 1]}`,
  };
}
function fmtPct(v: number, showSign = true): string {
  const sign = showSign && v > 0 ? '+' : '';
  return sign + v.toFixed(1) + '%';
}
function fmtCOP(v: number): string {
  return '$' + Math.round(v).toLocaleString('es-CO');
}

// ── Compact multi-select dropdown ──
const MultiSelect: React.FC<{
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}> = ({ label, options, selected, onChange, placeholder = 'Todos' }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter(s => s !== v) : [...selected, v]);

  const displayText =
    selected.length === 0 ? placeholder
    : selected.length === options.length ? `Todos (${options.length})`
    : selected.length <= 2 ? selected.map(v => options.find(o => o.value === v)?.label ?? v).join(', ')
    : `${selected.length} seleccionados`;

  return (
    <div ref={ref} className="relative">
      <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1 block uppercase tracking-wider">{label}</label>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-emerald-400 transition-colors"
      >
        <span className="truncate">{displayText}</span>
        <div className="flex items-center gap-1 shrink-0">
          {selected.length > 0 && (
            <span
              role="button"
              onClick={e => { e.stopPropagation(); onChange([]); }}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="w-3 h-3" />
            </span>
          )}
          <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 w-full min-w-[180px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl shadow-xl overflow-hidden">
          <div className="flex border-b border-slate-100 dark:border-slate-700">
            <button
              onClick={() => onChange(options.map(o => o.value))}
              className="flex-1 py-1.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 transition-colors"
            >
              Todos
            </button>
            <button
              onClick={() => onChange([])}
              className="flex-1 py-1.5 text-[10px] font-semibold text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              Limpiar
            </button>
          </div>
          <div className="max-h-52 overflow-y-auto py-1">
            {options.map(opt => (
              <label
                key={opt.value}
                className="flex items-center gap-2.5 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(opt.value)}
                  onChange={() => toggle(opt.value)}
                  className="w-3.5 h-3.5 accent-emerald-500 shrink-0"
                />
                <span className="truncate">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ── SVG Charts ──
interface BarDatum { label: string; value: number; }

const VerticalBarChart: React.FC<{
  data: BarDatum[];
  colors?: string[];
  formatValue?: (v: number) => string;
  chartHeight?: number;
  baselineIdx?: number;
}> = ({ data, colors, formatValue = v => v.toFixed(0), chartHeight = 180, baselineIdx = 0 }) => {
  if (!data.length) return null;
  const maxVal = Math.max(...data.map(d => d.value), 1);
  const W = 500;
  const padTop = 30;
  const padBottom = 38;
  const padSide = 16;
  const barArea = W - padSide * 2;
  const barSlot = barArea / data.length;
  const barW = Math.min(72, barSlot * 0.58);
  const BAR_COLORS = ['#003366', '#f97316', '#10b981', '#6366f1', '#ec4899', '#f59e0b'];
  const resolvedColors = colors ?? data.map((_, i) => BAR_COLORS[i % BAR_COLORS.length]);

  return (
    <svg className="w-full" viewBox={`0 0 ${W} ${chartHeight + padTop + padBottom}`}>
      {baselineIdx >= 0 && (() => {
        const x = padSide + baselineIdx * barSlot + (barSlot - barW) / 2;
        return <rect x={x - 6} y={padTop - 4} width={barW + 12} height={chartHeight + 8} rx={8} fill="#003366" fillOpacity="0.06" />;
      })()}
      <line x1={padSide} x2={W - padSide} y1={padTop + chartHeight} y2={padTop + chartHeight} stroke="#e2e8f0" strokeWidth="1.5" />
      {data.map((d, i) => {
        const barH = Math.max(4, (d.value / maxVal) * chartHeight);
        const x = padSide + i * barSlot + (barSlot - barW) / 2;
        const y = padTop + chartHeight - barH;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={barH} rx={5} fill={resolvedColors[i]} />
            <text x={x + barW / 2} y={y - 7} textAnchor="middle" fontSize="10" fontWeight="700" fill="#334155">
              {formatValue(d.value)}
            </text>
            <text x={x + barW / 2} y={padTop + chartHeight + 16} textAnchor="middle" fontSize="9.5" fill="#64748b">
              {d.label}
            </text>
            {i === baselineIdx && (
              <text x={x + barW / 2} y={padTop + chartHeight + 30} textAnchor="middle" fontSize="8.5" fill="#003366" fontWeight="600">
                (base)
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
};

const GroupedBarChart: React.FC<{
  data: { label: string; ev: number; gal: number }[];
  chartHeight?: number;
}> = ({ data, chartHeight = 180 }) => {
  if (!data.length) return null;
  const allVals = data.flatMap(d => [Math.abs(d.ev), Math.abs(d.gal)]);
  const maxAbs = Math.max(...allVals, 1);
  const W = 500;
  const padTop = 30;
  const padBottom = 50;
  const padSide = 16;
  const barArea = W - padSide * 2;
  const groupSlot = barArea / data.length;
  const gap = 4;
  const groupW = Math.min(80, groupSlot * 0.65);
  const barW = (groupW - gap) / 2;

  return (
    <svg className="w-full" viewBox={`0 0 ${W} ${chartHeight + padTop + padBottom}`}>
      <line x1={padSide} x2={W - padSide} y1={padTop + chartHeight} y2={padTop + chartHeight} stroke="#e2e8f0" strokeWidth="1.5" />
      {data.map((group, gi) => {
        const gx = padSide + gi * groupSlot + (groupSlot - groupW) / 2;
        const evH = Math.max(4, (Math.abs(group.ev) / maxAbs) * chartHeight);
        const galH = Math.max(4, (Math.abs(group.gal) / maxAbs) * chartHeight);
        return (
          <g key={gi}>
            <rect x={gx} y={padTop + chartHeight - evH} width={barW} height={evH} rx={3} fill="#003366" />
            <text x={gx + barW / 2} y={padTop + chartHeight - evH - 6} textAnchor="middle" fontSize="9" fontWeight="700" fill="#003366">
              {Math.abs(group.ev).toFixed(1)}%
            </text>
            <rect x={gx + barW + gap} y={padTop + chartHeight - galH} width={barW} height={galH} rx={3} fill="#f97316" />
            <text x={gx + barW + gap + barW / 2} y={padTop + chartHeight - galH - 6} textAnchor="middle" fontSize="9" fontWeight="700" fill="#f97316">
              {Math.abs(group.gal).toFixed(1)}%
            </text>
            <text x={gx + groupW / 2} y={padTop + chartHeight + 16} textAnchor="middle" fontSize="9.5" fill="#64748b">
              {group.label}
            </text>
          </g>
        );
      })}
      <rect x={padSide} y={padTop + chartHeight + 32} width={10} height={10} rx={2} fill="#003366" />
      <text x={padSide + 14} y={padTop + chartHeight + 41} fontSize="9.5" fill="#64748b">% Dismin. Eventos</text>
      <rect x={padSide + 130} y={padTop + chartHeight + 32} width={10} height={10} rx={2} fill="#f97316" />
      <text x={padSide + 144} y={padTop + chartHeight + 41} fontSize="9.5" fill="#64748b">% Dismin. Galones</text>
    </svg>
  );
};

const TrendSparkline: React.FC<{ values: number[]; color?: string }> = ({ values, color = '#003366' }) => {
  if (values.length < 2) return null;
  const W = 80; const H = 24;
  const min = Math.min(...values);
  const max = Math.max(...values, min + 1);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * W},${H - ((v - min) / (max - min)) * H}`);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="shrink-0">
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

// ── Main Component ──
export const RalentiAnalisisGeneral: React.FC<{
  vehicles: VehicleOption[];
  contracts: ContractOption[];
}> = ({ vehicles, contracts }) => {

  // Independent filter state — completely separate from the "por período" view
  const [selClients, setSelClients] = useState<string[]>([]);
  const [selContracts, setSelContracts] = useState<string[]>([]);
  const [selTypes, setSelTypes] = useState<string[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allRows, setAllRows] = useState<any[]>([]);

  // Derived filter options from vehicles
  const clientOptions = useMemo(() => {
    const set = new Set<string>();
    vehicles.forEach(v => { if (v.cliente?.trim()) set.add(v.cliente.trim()); });
    return Array.from(set).sort().map(c => ({ value: c, label: c }));
  }, [vehicles]);

  const typeOptions = useMemo(() => {
    const set = new Set<string>();
    vehicles.forEach(v => { if (v.tipo_activo?.trim()) set.add(v.tipo_activo.trim()); });
    return Array.from(set).sort().map(t => ({ value: t, label: t }));
  }, [vehicles]);

  const contractOptions = useMemo(
    () => contracts.map(c => ({ value: c.id, label: c.nombre })),
    [contracts]
  );

  // vehFuelMap: vehiculo_id → tipo_combustible
  const vehFuelMap = useMemo(() => {
    const map = new Map<string, string>();
    vehicles.forEach(v => map.set(String(v.id), (v.tipo_combustible ?? '').trim()));
    return map;
  }, [vehicles]);

  // Filtered vehicle IDs based on THIS component's own filters
  const filteredVehIds = useMemo(() => {
    let filtered = vehicles;
    if (selClients.length > 0) filtered = filtered.filter(v => v.cliente && selClients.includes(v.cliente.trim()));
    if (selContracts.length > 0) filtered = filtered.filter(v => v.contrato_id && selContracts.includes(v.contrato_id));
    if (selTypes.length > 0) filtered = filtered.filter(v => v.tipo_activo && selTypes.includes(v.tipo_activo.trim()));
    return new Set(filtered.map(v => String(v.id)));
  }, [vehicles, selClients, selContracts, selTypes]);

  const hasFilter = selClients.length > 0 || selContracts.length > 0 || selTypes.length > 0;

  // Fetch ALL periods — no date filter, completely independent
  useEffect(() => {
    if (vehicles.length === 0) return;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const FIELDS = 'vehiculo_id, periodo_inicio, periodo_fin, horas_motor_encendido, horas_motor_ralenti, consumo_combustible, ralentis_excesivos';
        const PAGE = 1000;

        // 1. Get total count to know how many pages to fetch
        const { count, error: countErr } = await supabase
          .from('ralentis_periodos')
          .select(FIELDS, { count: 'exact', head: true });
        if (countErr) throw countErr;

        const total = count ?? 0;
        const numPages = Math.max(1, Math.ceil(total / PAGE));

        // 2. Fetch all pages in parallel
        const pagePromises = Array.from({ length: numPages }, (_, i) =>
          supabase
            .from('ralentis_periodos')
            .select(FIELDS)
            .order('periodo_inicio', { ascending: true })
            .range(i * PAGE, (i + 1) * PAGE - 1)
        );
        const results = await Promise.all(pagePromises);
        for (const res of results) {
          if (res.error) throw res.error;
        }

        const allData = results.flatMap(r => r.data ?? []);
        setAllRows(allData);
      } catch (e: any) {
        setError(e.message ?? 'Error al cargar datos');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [vehicles]);

  // Compute aggregated periods whenever allRows or filters change
  const periods = useMemo((): PeriodoData[] => {
    const rows = hasFilter
      ? allRows.filter(r => filteredVehIds.has(String(r.vehiculo_id)))
      : allRows;

    const periodMap = new Map<string, typeof rows>();
    rows.forEach(r => {
      const key = `${r.periodo_inicio}_${r.periodo_fin}`;
      if (!periodMap.has(key)) periodMap.set(key, []);
      periodMap.get(key)!.push(r);
    });

    const computed: PeriodoData[] = [];
    periodMap.forEach((pRows, key) => {
      const first = pRows[0];
      const totalEventos = pRows.reduce((a, r) => a + (Number(r.ralentis_excesivos) || 0), 0);
      const totalGalones = pRows.reduce((a, r) => a + (Number(r.consumo_combustible) || 0), 0);
      const totalHorasEncendido = pRows.reduce((a, r) => a + (Number(r.horas_motor_encendido) || 0), 0);
      const totalHorasRalenti = pRows.reduce((a, r) => a + (Number(r.horas_motor_ralenti) || 0), 0);
      const pctRalenti = totalHorasEncendido > 0 ? (totalHorasRalenti / totalHorasEncendido) * 100 : 0;
      let co2Kg = 0; let costoCOP = 0;
      const vehSet = new Set<string>();
      pRows.forEach(r => {
        const fuel = vehFuelMap.get(String(r.vehiculo_id)) || '';
        const gal = Number(r.consumo_combustible) || 0;
        co2Kg += gal * getCO2Factor(fuel);
        costoCOP += gal * getPrecioGalon(fuel);
        vehSet.add(String(r.vehiculo_id));
      });
      const labels = getPeriodoLabel(first.periodo_inicio);
      computed.push({
        key, ...labels,
        inicio: first.periodo_inicio, fin: first.periodo_fin,
        totalEventos, totalGalones, totalHorasEncendido, totalHorasRalenti,
        pctRalenti, co2Kg, costoCOP,
        vehiculosActivos: vehSet.size,
        pctVsBaselineEventos: 0, pctVsBaselineGalones: 0, pctVsBaselineCO2: 0,
      });
    });

    computed.sort((a, b) => a.inicio.localeCompare(b.inicio));

    if (computed.length > 0) {
      const bl = computed[0];
      computed.forEach((p, i) => {
        if (i === 0) return;
        p.pctVsBaselineEventos = bl.totalEventos > 0 ? ((p.totalEventos - bl.totalEventos) / bl.totalEventos) * 100 : 0;
        p.pctVsBaselineGalones = bl.totalGalones > 0 ? ((p.totalGalones - bl.totalGalones) / bl.totalGalones) * 100 : 0;
        p.pctVsBaselineCO2 = bl.co2Kg > 0 ? ((p.co2Kg - bl.co2Kg) / bl.co2Kg) * 100 : 0;
      });
    }
    return computed;
  }, [allRows, filteredVehIds, hasFilter, vehFuelMap]);

  // Auto-insights
  const insights = useMemo(() => {
    if (periods.length < 2) return null;
    const baseline = periods[0];
    const latest = periods[periods.length - 1];
    const prev = periods[periods.length - 2];
    const bestPeriodo = [...periods].sort((a, b) => a.pctRalenti - b.pctRalenti)[0];
    const worstPeriodo = [...periods].sort((a, b) => b.pctRalenti - a.pctRalenti)[0];
    const latestVsPrevPct = prev.totalEventos > 0
      ? ((latest.totalEventos - prev.totalEventos) / prev.totalEventos) * 100 : 0;
    const trending: 'mejora' | 'retroceso' | 'estable' =
      latestVsPrevPct < -5 ? 'mejora' : latestVsPrevPct > 5 ? 'retroceso' : 'estable';
    return { baseline, latest, prev, bestPeriodo, worstPeriodo, latestVsPrevPct, trending };
  }, [periods]);

  const BAR_COLORS = ['#003366', '#f97316', '#10b981', '#6366f1', '#ec4899', '#f59e0b'];
  const barColors = periods.map((_, i) => BAR_COLORS[i % BAR_COLORS.length]);

  // ── States ──
  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-xl p-4 text-xs bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 border border-red-200/50 dark:border-red-900/50 flex gap-2 items-start">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /><span><strong>Error:</strong> {error}</span>
      </div>
    );
  }
  if (periods.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-8 text-center space-y-2 max-w-lg mx-auto shadow-sm">
        <Info className="w-10 h-10 text-slate-400 mx-auto" />
        <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm">Sin períodos disponibles</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          No hay datos de ralentí cargados. Procese los archivos en el módulo "Procesador Satelital" primero.
        </p>
      </div>
    );
  }

  const baseline = periods[0];
  const latest = periods[periods.length - 1];

  return (
    <div className="space-y-6">

      {/* ── Independent Filter Bar ── */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 shadow-sm">
        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-semibold text-sm mb-3">
          <Filter className="w-4 h-4 text-emerald-500" />
          <span>Filtros del Análisis General</span>
          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-normal ml-1">
            — Cubre todos los períodos disponibles en la base de datos
          </span>
          {hasFilter && (
            <button
              onClick={() => { setSelClients([]); setSelContracts([]); setSelTypes([]); }}
              className="ml-auto flex items-center gap-1 text-[10px] text-slate-400 hover:text-red-500 transition-colors font-normal"
            >
              <X className="w-3 h-3" /> Limpiar filtros
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <MultiSelect
            label="Clientes"
            options={clientOptions}
            selected={selClients}
            onChange={setSelClients}
            placeholder="Todos los clientes"
          />
          <MultiSelect
            label="Contratos"
            options={contractOptions}
            selected={selContracts}
            onChange={setSelContracts}
            placeholder="Todos los contratos"
          />
          <MultiSelect
            label="Tipo de Vehículo"
            options={typeOptions}
            selected={selTypes}
            onChange={setSelTypes}
            placeholder="Todos los tipos"
          />
        </div>
        {/* Summary of coverage */}
        <div className="mt-3 flex items-center gap-4 text-[11px] text-slate-400 dark:text-slate-500">
          <span><strong className="text-slate-600 dark:text-slate-300">{periods.length}</strong> períodos</span>
          <span><strong className="text-slate-600 dark:text-slate-300">{baseline.labelCorto}</strong> → <strong className="text-slate-600 dark:text-slate-300">{latest.labelCorto}</strong></span>
          <span><strong className="text-slate-600 dark:text-slate-300">{latest.vehiculosActivos}</strong> vehículos en período actual</span>
          {hasFilter && (
            <span className="ml-auto text-emerald-600 dark:text-emerald-400 font-semibold">
              Filtro activo — mostrando subconjunto de flota
            </span>
          )}
        </div>
      </div>

      {/* ── KPI Summary Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider">Períodos Analizados</span>
            <BarChart3 className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-3xl font-bold text-slate-800 dark:text-slate-100">{periods.length}</div>
          <div className="text-[11px] text-slate-400 dark:text-slate-500">{baseline.labelCorto} → {latest.labelCorto}</div>
          <TrendSparkline values={periods.map(p => p.totalEventos)} color="#003366" />
        </div>

        {(() => {
          const pct = latest.pctVsBaselineEventos;
          const improved = pct < 0;
          return (
            <div className={`bg-white dark:bg-slate-800 border rounded-xl p-5 shadow-sm space-y-2 ${improved ? 'border-emerald-200 dark:border-emerald-800/50' : 'border-red-200 dark:border-red-800/50'}`}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider">Δ Eventos vs Base</span>
                <Activity className={`w-4 h-4 ${improved ? 'text-emerald-400' : 'text-red-400'}`} />
              </div>
              <div className={`text-3xl font-bold ${improved ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                {fmtPct(pct)}
              </div>
              <div className="text-[11px] text-slate-400 dark:text-slate-500">{baseline.totalEventos} → {latest.totalEventos} eventos</div>
              <TrendSparkline values={periods.map(p => p.totalEventos)} color={improved ? '#10b981' : '#ef4444'} />
            </div>
          );
        })()}

        {(() => {
          const pct = latest.pctVsBaselineCO2;
          const improved = pct < 0;
          return (
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider">CO₂ Período Actual</span>
                <Leaf className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-3xl font-bold text-slate-800 dark:text-slate-100">{(latest.co2Kg / 1000).toFixed(2)} t</div>
              <div className={`text-[11px] font-semibold ${improved ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                {fmtPct(pct)} vs línea base
              </div>
              <TrendSparkline values={periods.map(p => p.co2Kg)} color="#10b981" />
            </div>
          );
        })()}

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider">Costo Combustible</span>
            <DollarSign className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-slate-800 dark:text-slate-100 leading-tight">{fmtCOP(latest.costoCOP)}</div>
          <div className="text-[11px] text-slate-400 dark:text-slate-500">{latest.totalGalones.toFixed(1)} gal — {latest.label}</div>
          <TrendSparkline values={periods.map(p => p.costoCOP)} color="#f59e0b" />
        </div>
      </div>

      {/* ── Comparison Table ── */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm">
        <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm flex items-center gap-2 mb-5">
          <BarChart3 className="w-4 h-4 text-emerald-500" />
          Comparativo por Período vs Línea Base
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#003366] text-white text-[10px] font-bold uppercase tracking-wider">
                <th className="py-3 px-4 rounded-tl-lg">Período</th>
                <th className="py-3 px-3">Vehículos</th>
                <th className="py-3 px-3">Eventos Excesivos</th>
                <th className="py-3 px-3">Galones</th>
                <th className="py-3 px-3">CO₂ (kg)</th>
                <th className="py-3 px-3">% Ralentí</th>
                <th className="py-3 px-3">Δ Eventos</th>
                <th className="py-3 px-3 rounded-tr-lg">Δ Galones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {periods.map((p, i) => {
                const isBaseline = i === 0;
                const isLatest = i === periods.length - 1;
                return (
                  <tr key={p.key} className={`transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-700/30 ${isBaseline ? 'bg-blue-50/60 dark:bg-blue-950/20' : ''} ${isLatest && !isBaseline ? 'bg-slate-50/40 dark:bg-slate-700/10' : ''}`}>
                    <td className="py-3 px-4 font-semibold text-slate-800 dark:text-slate-200">
                      <div className="flex items-center gap-2">
                        {p.label}
                        {isBaseline && <span className="text-[9px] bg-[#003366] text-white px-1.5 py-0.5 rounded-full font-bold">BASE</span>}
                        {isLatest && !isBaseline && <span className="text-[9px] bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-300 px-1.5 py-0.5 rounded-full font-bold">ACTUAL</span>}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-slate-600 dark:text-slate-400">{p.vehiculosActivos}</td>
                    <td className="py-3 px-3 font-bold text-slate-700 dark:text-slate-300">{p.totalEventos}</td>
                    <td className="py-3 px-3 text-slate-700 dark:text-slate-300">{p.totalGalones.toFixed(2)}</td>
                    <td className="py-3 px-3 text-slate-700 dark:text-slate-300">{p.co2Kg.toFixed(0)}</td>
                    <td className="py-3 px-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${p.pctRalenti < 10 ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400' : p.pctRalenti < 20 ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400' : 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400'}`}>
                        {p.pctRalenti.toFixed(2)}%
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      {isBaseline ? <span className="text-slate-300 dark:text-slate-600 text-[11px]">—</span> : (
                        <span className={`font-bold text-[11px] ${p.pctVsBaselineEventos < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                          {fmtPct(p.pctVsBaselineEventos)}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      {isBaseline ? <span className="text-slate-300 dark:text-slate-600 text-[11px]">—</span> : (
                        <span className={`font-bold text-[11px] ${p.pctVsBaselineGalones < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                          {fmtPct(p.pctVsBaselineGalones)}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Charts 2×2 ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm">
          <h4 className="font-bold text-slate-700 dark:text-slate-300 text-[11px] uppercase tracking-wider mb-4 flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-indigo-500" /> Eventos de Ralentí por Período
          </h4>
          <VerticalBarChart data={periods.map(p => ({ label: p.labelCorto, value: p.totalEventos }))} colors={barColors} formatValue={v => String(Math.round(v))} />
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm">
          <h4 className="font-bold text-slate-700 dark:text-slate-300 text-[11px] uppercase tracking-wider mb-4 flex items-center gap-2">
            <Fuel className="w-3.5 h-3.5 text-orange-500" /> Galones Consumidos por Período
          </h4>
          <VerticalBarChart data={periods.map(p => ({ label: p.labelCorto, value: p.totalGalones }))} colors={barColors} formatValue={v => v.toFixed(1)} />
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm">
          <h4 className="font-bold text-slate-700 dark:text-slate-300 text-[11px] uppercase tracking-wider mb-4 flex items-center gap-2">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-500" /> % Variación vs Línea Base
          </h4>
          {periods.length < 2 ? (
            <div className="flex items-center justify-center h-40 text-xs text-slate-400">Se requieren al menos 2 períodos</div>
          ) : (
            <GroupedBarChart data={periods.slice(1).map(p => ({ label: p.labelCorto, ev: -p.pctVsBaselineEventos, gal: -p.pctVsBaselineGalones }))} />
          )}
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm">
          <h4 className="font-bold text-slate-700 dark:text-slate-300 text-[11px] uppercase tracking-wider mb-4 flex items-center gap-2">
            <Leaf className="w-3.5 h-3.5 text-emerald-500" /> CO₂ Emitido por Período (kg)
          </h4>
          <VerticalBarChart data={periods.map(p => ({ label: p.labelCorto, value: p.co2Kg }))} colors={barColors} formatValue={v => v.toFixed(0)} />
        </div>
      </div>

      {/* ── Sequential trend table ── */}
      {periods.length >= 2 && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm">
          <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm flex items-center gap-2 mb-5">
            <Clock className="w-4 h-4 text-indigo-500" /> Tendencia Secuencial (Período a Período)
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 text-[10px] font-bold uppercase tracking-wider">
                  <th className="py-2.5 px-4 rounded-tl-lg">Comparación</th>
                  <th className="py-2.5 px-3">Δ Eventos</th>
                  <th className="py-2.5 px-3">Δ Galones</th>
                  <th className="py-2.5 px-3">Δ CO₂ (kg)</th>
                  <th className="py-2.5 px-3 rounded-tr-lg">Tendencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {periods.slice(1).map((p, i) => {
                  const prev = periods[i];
                  const dEv = prev.totalEventos > 0 ? ((p.totalEventos - prev.totalEventos) / prev.totalEventos) * 100 : 0;
                  const dGal = prev.totalGalones > 0 ? ((p.totalGalones - prev.totalGalones) / prev.totalGalones) * 100 : 0;
                  const dCO2 = prev.co2Kg > 0 ? ((p.co2Kg - prev.co2Kg) / prev.co2Kg) * 100 : 0;
                  const isGood = dEv < -2; const isBad = dEv > 2;
                  return (
                    <tr key={p.key} className="hover:bg-slate-50/70 dark:hover:bg-slate-700/30 transition-colors">
                      <td className="py-3 px-4 text-slate-700 dark:text-slate-300 font-medium">{prev.labelCorto} → {p.labelCorto}</td>
                      <td className="py-3 px-3">
                        <span className={`font-bold ${dEv < 0 ? 'text-emerald-600 dark:text-emerald-400' : dEv > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-500'}`}>{fmtPct(dEv)}</span>
                        <span className="text-slate-400 dark:text-slate-500 ml-1">({prev.totalEventos} → {p.totalEventos})</span>
                      </td>
                      <td className="py-3 px-3">
                        <span className={`font-bold ${dGal < 0 ? 'text-emerald-600 dark:text-emerald-400' : dGal > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-500'}`}>{fmtPct(dGal)}</span>
                        <span className="text-slate-400 dark:text-slate-500 ml-1">({prev.totalGalones.toFixed(1)} → {p.totalGalones.toFixed(1)} gal)</span>
                      </td>
                      <td className="py-3 px-3">
                        <span className={`font-bold ${dCO2 < 0 ? 'text-emerald-600 dark:text-emerald-400' : dCO2 > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-500'}`}>{fmtPct(dCO2)}</span>
                      </td>
                      <td className="py-3 px-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${isGood ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400' : isBad ? 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'}`}>
                          {isGood ? '↓ Mejora' : isBad ? '↑ Retroceso' : '→ Estable'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Conclusions ── */}
      {insights && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm">
          <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm flex items-center gap-2 mb-5">
            <BrainCircuit className="w-4 h-4 text-violet-500" /> Conclusiones Importantes
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="p-4 bg-emerald-50 dark:bg-emerald-950/20 rounded-xl border border-emerald-200 dark:border-emerald-800/40">
              <div className="text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-400 mb-1.5">Mejor Período</div>
              <div className="text-sm font-bold text-slate-800 dark:text-slate-200">{insights.bestPeriodo.label}</div>
              <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                {insights.bestPeriodo.pctRalenti.toFixed(2)}% ralentí · {insights.bestPeriodo.totalEventos} eventos · {insights.bestPeriodo.totalGalones.toFixed(1)} gal
              </div>
            </div>
            <div className="p-4 bg-red-50 dark:bg-red-950/20 rounded-xl border border-red-200 dark:border-red-800/40">
              <div className="text-[10px] uppercase font-bold text-red-600 dark:text-red-400 mb-1.5">Mayor Desviación</div>
              <div className="text-sm font-bold text-slate-800 dark:text-slate-200">{insights.worstPeriodo.label}</div>
              <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                {insights.worstPeriodo.pctRalenti.toFixed(2)}% ralentí · {insights.worstPeriodo.totalEventos} eventos · {insights.worstPeriodo.totalGalones.toFixed(1)} gal
              </div>
            </div>
          </div>
          <div className="space-y-3">
            {insights.latest.pctVsBaselineEventos < -10 ? (
              <div className="flex items-start gap-3 p-3.5 bg-emerald-50 dark:bg-emerald-950/20 rounded-xl border border-emerald-200 dark:border-emerald-800/40">
                <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div className="text-xs text-emerald-800 dark:text-emerald-300 leading-relaxed">
                  <strong className="font-bold block mb-0.5">1. Mejora significativa vs línea base ({insights.baseline.label})</strong>
                  El período actual ({insights.latest.label}) logró una reducción del <strong>{Math.abs(insights.latest.pctVsBaselineEventos).toFixed(1)}%</strong> en eventos excesivos y{' '}
                  <strong>{Math.abs(insights.latest.pctVsBaselineGalones).toFixed(1)}%</strong> en consumo de galones. Las medidas implementadas han reducido significativamente el ralentí.
                </div>
              </div>
            ) : insights.latest.pctVsBaselineEventos > 10 ? (
              <div className="flex items-start gap-3 p-3.5 bg-red-50 dark:bg-red-950/20 rounded-xl border border-red-200 dark:border-red-800/40">
                <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                <div className="text-xs text-red-800 dark:text-red-300 leading-relaxed">
                  <strong className="font-bold block mb-0.5">1. Empeoramiento vs línea base ({insights.baseline.label})</strong>
                  El período actual presenta un <strong>aumento del {insights.latest.pctVsBaselineEventos.toFixed(1)}%</strong> en eventos respecto a la línea base. Revisar prácticas operativas urgentemente.
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3 p-3.5 bg-amber-50 dark:bg-amber-950/20 rounded-xl border border-amber-200 dark:border-amber-800/40">
                <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                  <strong className="font-bold block mb-0.5">1. Variación moderada vs línea base</strong>
                  El período actual presenta una variación de <strong>{fmtPct(insights.latest.pctVsBaselineEventos)}</strong> en eventos respecto a {insights.baseline.label}.
                </div>
              </div>
            )}

            {insights.trending === 'retroceso' && (
              <div className="flex items-start gap-3 p-3.5 bg-red-50 dark:bg-red-950/20 rounded-xl border border-red-200 dark:border-red-800/40">
                <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                <div className="text-xs text-red-800 dark:text-red-300 leading-relaxed">
                  <strong className="font-bold block mb-0.5">2. Alerta: Tendencia de retroceso ({insights.prev.labelCorto} → {insights.latest.labelCorto})</strong>
                  Los eventos de ralentí aumentaron <strong>{Math.abs(insights.latestVsPrevPct).toFixed(1)}%</strong> entre los últimos dos períodos. Hay señales de relajación en las prácticas de control.
                </div>
              </div>
            )}
            {insights.trending === 'mejora' && (
              <div className="flex items-start gap-3 p-3.5 bg-emerald-50 dark:bg-emerald-950/20 rounded-xl border border-emerald-200 dark:border-emerald-800/40">
                <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div className="text-xs text-emerald-800 dark:text-emerald-300 leading-relaxed">
                  <strong className="font-bold block mb-0.5">2. Tendencia favorable ({insights.prev.labelCorto} → {insights.latest.labelCorto})</strong>
                  Los eventos disminuyeron <strong>{Math.abs(insights.latestVsPrevPct).toFixed(1)}%</strong> respecto al período anterior. Los controles están mostrando resultados positivos.
                </div>
              </div>
            )}

            <div className="p-3.5 bg-[#003366]/5 dark:bg-blue-950/20 rounded-xl border border-[#003366]/15 dark:border-blue-800/30">
              <div className="text-[10px] uppercase font-bold text-[#003366] dark:text-blue-300 mb-1.5">Recomendación Principal</div>
              <div className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                {insights.trending === 'retroceso'
                  ? `Investigar las causas del aumento en ${insights.latest.labelCorto} y reforzar los controles operativos para recuperar los niveles óptimos alcanzados en ${insights.bestPeriodo.labelCorto}.`
                  : insights.trending === 'mejora'
                    ? `Mantener y reforzar las prácticas actuales. Documentar e institucionalizar las medidas exitosas de ${insights.latest.labelCorto} para sostener la mejora en períodos futuros.`
                    : `Continuar monitoreando la flota. Foco en los conductores con mayor tiempo de ralentí acumulado e implementar capacitaciones periódicas para consolidar mejoras.`
                }
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
