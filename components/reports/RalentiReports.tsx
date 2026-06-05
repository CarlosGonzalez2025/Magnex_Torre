import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  BarChart3, 
  Calendar, 
  Filter, 
  AlertTriangle, 
  Info, 
  TrendingUp, 
  Fuel, 
  DollarSign, 
  Trash2, 
  Leaf, 
  Clock, 
  User, 
  ChevronRight, 
  CheckCircle, 
  ShieldAlert,
  Search,
  Activity,
  FileSpreadsheet
} from 'lucide-react';
import { supabase } from '../../services/supabaseClient';

interface ContractOption {
  id: string;
  nombre: string;
}

interface VehicleOption {
  id: string;
  placa: string;
  cliente?: string;
}

interface IdlingEvent {
  id: string;
  placa: string;
  conductor_nombre: string;
  fecha_inicio: string;
  fecha_fin: string;
  duracion_segundos: number;
  galones_consumidos: number;
  ubicacion: string;
  proveedor: string;
  vehiculo_id: string;
  conductor_id: string | null;
}

export const RalentiReports: React.FC = () => {
  // Filter States
  const [year, setYear] = useState<number>(2026);
  const [month, setMonth] = useState<number>(4); // Default to April, where our test data resides
  const [quincena, setQuincena] = useState<'1' | '2' | 'all'>('1');
  const [contratoId, setContratoId] = useState<string>('');
  const [placa, setPlaca] = useState<string>('');

  // Dropdown list options
  const [contracts, setContracts] = useState<ContractOption[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);

  // Telemetry Data
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  // Summary Metrics from reportes_vehiculos/ralentis_periodos
  const [summaryMetrics, setSummaryMetrics] = useState({
    totalHorasMotorEncendido: 0,
    totalHorasMotorRalenti: 0,
    totalGalonesConsumidos: 0,
    totalRalentisExcesivos: 0,
  });

  // Detailed events from ralentis_eventos
  const [events, setEvents] = useState<IdlingEvent[]>([]);

  // Fetch initial dropdown data
  useEffect(() => {
    const fetchDropdowns = async () => {
      try {
        const { data: dbContracts } = await supabase
          .from('contratos')
          .select('id, nombre')
          .order('nombre');
        if (dbContracts) setContracts(dbContracts);

        const { data: dbVehicles } = await supabase
          .from('vehiculos')
          .select('id, placa, cliente')
          .order('placa');
        if (dbVehicles) setVehicles(dbVehicles);
      } catch (err) {
        console.error('Error fetching filters:', err);
      }
    };
    fetchDropdowns();
  }, []);

  // Fetch metrics and detailed events based on filters
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const yearStr = String(year);
      const monthStr = String(month).padStart(2, '0');
      
      let dateStart = `${yearStr}-${monthStr}-01`;
      let dateEnd = '';
      if (quincena === '1') {
        dateEnd = `${yearStr}-${monthStr}-15`;
      } else if (quincena === '2') {
        const lastDay = new Date(year, month, 0).getDate();
        dateStart = `${yearStr}-${monthStr}-16`;
        dateEnd = `${yearStr}-${monthStr}-${lastDay}`;
      } else {
        const lastDay = new Date(year, month, 0).getDate();
        dateEnd = `${yearStr}-${monthStr}-${lastDay}`;
      }

      // 1. Resolve vehicles under chosen contract if contract filter is active
      let vehIds: string[] = [];
      if (contratoId) {
        const { data: dbVehs, error: vehErr } = await supabase
          .from('vehiculos')
          .select('id')
          .eq('contrato_id', contratoId);
        if (vehErr) throw vehErr;
        vehIds = (dbVehs ?? []).map(v => v.id);

        // If a contract is selected but has no vehicles, return empty state early
        if (vehIds.length === 0) {
          setSummaryMetrics({
            totalHorasMotorEncendido: 0,
            totalHorasMotorRalenti: 0,
            totalGalonesConsumidos: 0,
            totalRalentisExcesivos: 0,
          });
          setEvents([]);
          setLoading(false);
          return;
        }
      }

      // 2. Fetch vehicle summary statistics for the period
      let repVehQuery = supabase.from('ralentis_periodos')
        .select('vehiculo_id, horas_motor_encendido, horas_motor_ralenti, consumo_combustible, ralentis_excesivos')
        .gte('periodo_inicio', dateStart)
        .lte('periodo_fin', dateEnd);

      if (placa) {
        repVehQuery = repVehQuery.eq('vehiculo_id', placa);
      } else if (contratoId && vehIds.length > 0) {
        repVehQuery = repVehQuery.in('vehiculo_id', vehIds);
      }

      const { data: dbRepVehs, error: repErr } = await repVehQuery;
      if (repErr) throw repErr;

      let filteredRepVehs = dbRepVehs ?? [];

      // Sum metrics
      const sumEncendido = filteredRepVehs.reduce((acc, r) => acc + (Number(r.horas_motor_encendido) || 0), 0);
      const sumRalenti = filteredRepVehs.reduce((acc, r) => acc + (Number(r.horas_motor_ralenti) || 0), 0);
      const sumGalones = filteredRepVehs.reduce((acc, r) => acc + (Number(r.consumo_combustible) || 0), 0);
      const sumExcesivos = filteredRepVehs.reduce((acc, r) => acc + (Number(r.ralentis_excesivos) || 0), 0);

      setSummaryMetrics({
        totalHorasMotorEncendido: sumEncendido,
        totalHorasMotorRalenti: sumRalenti,
        totalGalonesConsumidos: sumGalones,
        totalRalentisExcesivos: sumExcesivos,
      });

      // 3. Fetch detailed ralentis_eventos
      let evQuery = supabase.from('ralentis_eventos')
        .select('*')
        .gte('fecha_inicio', `${dateStart}T00:00:00Z`)
        .lte('fecha_inicio', `${dateEnd}T23:59:59Z`);

      if (placa) {
        evQuery = evQuery.eq('vehiculo_id', placa);
      } else if (contratoId && vehIds.length > 0) {
        evQuery = evQuery.in('vehiculo_id', vehIds);
      }

      const { data: dbEvents, error: evErr } = await evQuery;
      if (evErr) throw evErr;

      setEvents((dbEvents ?? []) as IdlingEvent[]);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error al obtener datos de telemetría.');
    } finally {
      setLoading(false);
    }
  }, [year, month, quincena, contratoId, placa]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Derived Calculations
  const daysInPeriod = useMemo(() => {
    if (quincena === '1') return 15;
    const lastDay = new Date(year, month, 0).getDate();
    if (quincena === '2') return lastDay - 15;
    return lastDay;
  }, [year, month, quincena]);

  const stats = useMemo(() => {
    const { totalHorasMotorEncendido, totalHorasMotorRalenti, totalGalonesConsumidos, totalRalentisExcesivos } = summaryMetrics;

    const pctRalenti = totalHorasMotorEncendido > 0 
      ? (totalHorasMotorRalenti / totalHorasMotorEncendido) * 100 
      : 0;

    const costTotal = totalGalonesConsumidos * 9922; // $9.922 COP per gallon
    const costAvgDaily = daysInPeriod > 0 ? costTotal / daysInPeriod : 0;

    const co2Kg = totalGalonesConsumidos * 9.923077; // CO2 kg formula
    const treesEquivalent = co2Kg / 22; // Trees formula

    const mayorEventoSegundos = events.length > 0 
      ? Math.max(...events.map(e => e.duracion_segundos)) 
      : 0;

    const totalDuracionEventosSegundos = events.reduce((acc, e) => acc + e.duracion_segundos, 0);
    const promedioEventoSegundos = events.length > 0 
      ? totalDuracionEventosSegundos / events.length 
      : 0;

    const eventosMas30Min = events.filter(e => e.duracion_segundos > 1800).length;

    // Operational Risk estimation based on pctRalenti
    let riskLevel: 'Bajo' | 'Medio' | 'Alto' = 'Bajo';
    let riskColor = 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200/50 dark:border-emerald-900/50';
    let riskDescription = 'Operación eficiente. Ralentí dentro de los parámetros de control establecidos (meta < 10%).';
    
    if (pctRalenti > 15) {
      riskLevel = 'Alto';
      riskColor = 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 border-red-200/50 dark:border-red-900/50';
      riskDescription = 'Peligro en ralentí. Exceso severo de motor encendido estacionario, elevando costos y fallas de filtros.';
    } else if (pctRalenti >= 10) {
      riskLevel = 'Medio';
      riskColor = 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 border-amber-200/50 dark:border-amber-900/50';
      riskDescription = 'Alerta de ralentí. Desviación moderada de la meta del 10%. Se recomienda revisar conductores críticos.';
    }

    // FAP/AdBlue filter failure risk
    let fapRisk = 'Bajo';
    let fapDescription = 'Baja probabilidad de acumulación de hollín. Filtro de partículas opera a temperaturas correctas.';
    let fapProgressColor = 'bg-emerald-500';
    let fapTextColor = 'text-emerald-600 dark:text-emerald-400';

    if (pctRalenti > 15) {
      fapRisk = 'Crítico';
      fapDescription = 'Peligro crítico de taponamiento del FAP por acumulación severa de hollín debido al enfriamiento del motor.';
      fapProgressColor = 'bg-red-500 animate-pulse';
      fapTextColor = 'text-red-600 dark:text-red-400';
    } else if (pctRalenti >= 10) {
      fapRisk = 'Moderado';
      fapDescription = 'Riesgo de saturación a mediano plazo. Las regeneraciones activas podrían ser insuficientes.';
      fapProgressColor = 'bg-amber-500';
      fapTextColor = 'text-amber-600 dark:text-amber-400';
    }

    // Deltas / Variations vs goals
    // Meta Ralentí: 10%
    const deltaPct = pctRalenti - 10;
    // Meta Galones: 37 galones por quincena/periodo
    const deltaGalones = totalGalonesConsumidos - 37;
    // Meta Costo diario: $28.000 COP
    const deltaCostoDiario = costAvgDaily - 28000;

    return {
      pctRalenti,
      totalHorasMotorRalenti,
      totalGalonesConsumidos,
      totalRalentisExcesivos,
      costTotal,
      costAvgDaily,
      co2Kg,
      treesEquivalent,
      mayorEventoSegundos,
      promedioEventoSegundos,
      eventosMas30Min,
      riskLevel,
      riskColor,
      riskDescription,
      fapRisk,
      fapDescription,
      fapProgressColor,
      fapTextColor,
      deltaPct,
      deltaGalones,
      deltaCostoDiario,
    };
  }, [summaryMetrics, events, daysInPeriod]);

  // Helper to format seconds as hh:mm:ss
  const formatSeconds = (totalSecs: number): string => {
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = Math.floor(totalSecs % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // Group events by driver and compute metrics
  const driverData = useMemo(() => {
    const driverMap = new Map<string, { totalTime: number; maxEvent: number; count: number; name: string }>();

    events.forEach(e => {
      const name = e.conductor_nombre || 'NO REGISTRA';
      const current = driverMap.get(name) ?? { totalTime: 0, maxEvent: 0, count: 0, name };
      current.totalTime += e.duracion_segundos;
      current.count += 1;
      if (e.duracion_segundos > current.maxEvent) {
        current.maxEvent = e.duracion_segundos;
      }
      driverMap.set(name, current);
    });

    const drivers = Array.from(driverMap.values());
    
    const topByTime = [...drivers]
      .sort((a, b) => b.totalTime - a.totalTime)
      .slice(0, 10);

    const topByMax = [...drivers]
      .sort((a, b) => b.maxEvent - a.maxEvent)
      .slice(0, 10);

    return { topByTime, topByMax };
  }, [events]);

  // Daily CO2 trend logic (distribute total summary gallons over events timeline)
  const dailyCO2Trend = useMemo(() => {
    const dailyDurations = new Map<string, number>();
    events.forEach(e => {
      const dateKey = String(e.fecha_inicio ?? '').slice(0, 10);
      if (dateKey) {
        dailyDurations.set(dateKey, (dailyDurations.get(dateKey) ?? 0) + e.duracion_segundos);
      }
    });

    // Sort dates chronologically
    const sortedDates = Array.from(dailyDurations.keys()).sort();
    
    // Total duration of all detailed events
    const totalEventSecs = events.reduce((acc, e) => acc + e.duracion_segundos, 0);

    let cumulativeCO2 = 0;
    const dataPoints: { date: string; value: number }[] = [];

    sortedDates.forEach(date => {
      const duration = dailyDurations.get(date) ?? 0;
      
      // Distribute total gallons proportionally to this day's duration
      const galonesDia = totalEventSecs > 0 
        ? (duration / totalEventSecs) * stats.totalGalonesConsumidos 
        : 0;

      const co2KgDia = galonesDia * 9.923077;
      cumulativeCO2 += co2KgDia;
      
      dataPoints.push({
        date: date.slice(5), // Keep MM-DD for label
        value: Number(cumulativeCO2.toFixed(1)),
      });
    });

    return dataPoints;
  }, [events, stats.totalGalonesConsumidos]);

  // Group CO2 by provider/platform
  const providerCO2Data = useMemo(() => {
    const provMap = new Map<string, number>();
    events.forEach(e => {
      const prov = e.proveedor || 'COLTRACK';
      provMap.set(prov, (provMap.get(prov) ?? 0) + e.duracion_segundos);
    });

    const totalEventSecs = events.reduce((acc, e) => acc + e.duracion_segundos, 0);

    return Array.from(provMap.entries()).map(([provider, secs]) => {
      const galones = totalEventSecs > 0 
        ? (secs / totalEventSecs) * stats.totalGalonesConsumidos 
        : 0;
      const co2Kg = galones * 9.923077;
      return {
        name: provider,
        co2Tons: Number((co2Kg / 1000).toFixed(3)),
      };
    });
  }, [events, stats.totalGalonesConsumidos]);

  // Render horizontal bar chart for top drivers (native SVG)
  const renderHorizontalBarChart = (data: { name: string; value: number }[], metricType: 'time' | 'max') => {
    if (data.length === 0) {
      return (
        <div className="flex items-center justify-center h-48 bg-slate-50 dark:bg-slate-900/30 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-xs text-slate-400">
          Sin datos para graficar
        </div>
      );
    }

    const maxValue = Math.max(...data.map(d => d.value), 1);
    const chartHeight = data.length * 32 + 20;

    return (
      <svg className="w-full" viewBox={`0 0 500 ${chartHeight}`} height={chartHeight}>
        {data.map((d, index) => {
          const barWidth = (d.value / maxValue) * 280;
          const y = index * 32 + 10;
          const labelValue = metricType === 'time' 
            ? `${(d.value / 3600).toFixed(1)} h` 
            : formatSeconds(d.value);

          return (
            <g key={index} className="group transition-all duration-300">
              <text 
                x="10" 
                y={y + 16} 
                className="fill-slate-600 dark:fill-slate-300 font-medium text-[11px] truncate"
                width="140"
              >
                {d.name.length > 20 ? `${d.name.substring(0, 18)}...` : d.name}
              </text>
              <rect 
                x="150" 
                y={y + 4} 
                width={barWidth} 
                height="16" 
                rx="4" 
                className={`${metricType === 'time' ? 'fill-indigo-500/80 dark:fill-indigo-400/80 hover:fill-indigo-600' : 'fill-purple-500/80 dark:fill-purple-400/80 hover:fill-purple-600'} transition-all`}
              />
              <text 
                x={150 + barWidth + 8} 
                y={y + 16} 
                className="fill-slate-700 dark:fill-slate-200 font-bold text-[10px]"
              >
                {labelValue}
              </text>
            </g>
          );
        })}
      </svg>
    );
  };

  // Render CO2 Trend (native SVG path)
  const renderTrendLineChart = (data: { date: string; value: number }[]) => {
    if (data.length <= 1) {
      return (
        <div className="flex items-center justify-center h-48 bg-slate-50 dark:bg-slate-900/30 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-xs text-slate-400">
          Insuficientes datos diarios para graficar tendencia
        </div>
      );
    }

    const maxVal = Math.max(...data.map(d => d.value), 10);
    const minVal = 0;
    const chartWidth = 500;
    const chartHeight = 160;
    const padding = 20;

    const points = data.map((d, index) => {
      const x = padding + (index / (data.length - 1)) * (chartWidth - padding * 2);
      const y = chartHeight - padding - ((d.value - minVal) / (maxVal - minVal)) * (chartHeight - padding * 2);
      return { x, y, label: d.date, val: d.value };
    });

    let pathD = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      pathD += ` L ${points[i].x} ${points[i].y}`;
    }

    // For area gradient
    const areaD = `${pathD} L ${points[points.length - 1].x} ${chartHeight - padding} L ${points[0].x} ${chartHeight - padding} Z`;

    return (
      <svg className="w-full" viewBox={`0 0 ${chartWidth} ${chartHeight}`} height={chartHeight}>
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        <line x1={padding} y1={padding} x2={chartWidth - padding} y2={padding} stroke="#e2e8f0" strokeDasharray="3" className="dark:stroke-slate-700" />
        <line x1={padding} y1={chartHeight / 2} x2={chartWidth - padding} y2={chartHeight / 2} stroke="#e2e8f0" strokeDasharray="3" className="dark:stroke-slate-700" />
        <line x1={padding} y1={chartHeight - padding} x2={chartWidth - padding} y2={chartHeight - padding} stroke="#e2e8f0" className="dark:stroke-slate-700" />

        {/* Area */}
        <path d={areaD} fill="url(#areaGrad)" />

        {/* Trend Line */}
        <path d={pathD} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

        {/* Data points */}
        {points.map((p, idx) => {
          const showLabel = idx === 0 || idx === Math.floor(points.length / 2) || idx === points.length - 1;
          return (
            <g key={idx}>
              <circle cx={p.x} cy={p.y} r="3.5" fill="#10b981" stroke="#ffffff" strokeWidth="1.5" className="hover:r-5 cursor-pointer" />
              {showLabel && (
                <>
                  <text x={p.x} y={chartHeight - 4} textAnchor="middle" className="fill-slate-400 dark:fill-slate-500 text-[9px] font-semibold">{p.label}</text>
                  <text x={p.x} y={p.y - 8} textAnchor="middle" className="fill-slate-800 dark:fill-slate-200 text-[9px] font-bold">{p.val.toFixed(0)} kg</text>
                </>
              )}
            </g>
          );
        })}
      </svg>
    );
  };

  return (
    <div className="p-4 md:p-6 space-y-6 w-full mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center">
            <Fuel className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Informe de Ralentí</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Análisis gerencial, impacto ecológico y desperdicio económico por ralentí excesivo</p>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3 shadow-sm">
        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-semibold text-sm">
          <Filter className="w-4 h-4 text-emerald-500" />
          <span>Filtros Gerenciales</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {/* Year */}
          <div>
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">Año</label>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="2026">2026</option>
              <option value="2025">2025</option>
            </select>
          </div>

          {/* Month */}
          <div>
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">Mes</label>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="1">Enero</option>
              <option value="2">Febrero</option>
              <option value="3">Marzo</option>
              <option value="4">Abril</option>
              <option value="5">Mayo</option>
              <option value="6">Junio</option>
              <option value="7">Julio</option>
              <option value="8">Agosto</option>
              <option value="9">Septiembre</option>
              <option value="10">Octubre</option>
              <option value="11">Noviembre</option>
              <option value="12">Diciembre</option>
            </select>
          </div>

          {/* Quincena */}
          <div>
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">Quincena</label>
            <select
              value={quincena}
              onChange={(e) => setQuincena(e.target.value as any)}
              className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="1">Primera Quincena (1-15)</option>
              <option value="2">Segunda Quincena (16-Fin)</option>
              <option value="all">Mes Completo</option>
            </select>
          </div>

          {/* Contract */}
          <div>
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">Contrato</label>
            <select
              value={contratoId}
              onChange={(e) => { setContratoId(e.target.value); setPlaca(''); }}
              className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="">Todos los contratos</option>
              {contracts.map(c => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </div>

          {/* Vehicle */}
          <div>
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">Vehículo (Matrícula)</label>
            <select
              value={placa}
              onChange={(e) => setPlaca(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="">Todos los vehículos</option>
              {vehicles
                .filter(v => !contratoId || (contracts.find(c => c.id === contratoId) && v.cliente === contracts.find(c => c.id === contratoId)?.nombre)) // rough filter fallback
                .map(v => (
                  <option key={v.id} value={v.id}>{v.placa}</option>
                ))
              }
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-20">
          <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="rounded-xl p-4 text-xs bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 border border-red-200/50 dark:border-red-900/50 flex gap-2 items-start">
          <ShieldAlert className="w-5 h-5 shrink-0" />
          <div>
            <strong className="font-bold block mb-0.5">Error de Carga:</strong>
            <p>{error}</p>
          </div>
        </div>
      ) : events.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-8 text-center space-y-2 max-w-lg mx-auto shadow-sm">
          <Info className="w-10 h-10 text-slate-400 mx-auto" />
          <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm">Sin datos para mostrar</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            No se encontraron registros de eventos detallados de ralentí para los filtros seleccionados. Asegúrate de procesar los archivos de ralentí quincenales/semanales (Ralenti 2) en el módulo "Procesador Satelital".
          </p>
        </div>
      ) : (
        <>
          {/* Main KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: % Ralentí */}
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm space-y-3 relative overflow-hidden group">
              <div className="flex justify-between items-start">
                <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider">Tiempo Ralentí &gt; 5 Min</span>
                <Clock className="w-4 h-4 text-indigo-500" />
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold text-slate-800 dark:text-slate-100">{stats.pctRalenti.toFixed(2)}%</span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px]">
                {stats.deltaPct > 0 ? (
                  <span className="text-red-500 font-bold">+{stats.deltaPct.toFixed(2)}%</span>
                ) : (
                  <span className="text-emerald-500 font-bold">{stats.deltaPct.toFixed(2)}%</span>
                )}
                <span className="text-slate-400 dark:text-slate-500">vs meta (10.0%)</span>
              </div>
              <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all duration-500 ${stats.pctRalenti > 15 ? 'bg-red-500' : stats.pctRalenti >= 10 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                  style={{ width: `${Math.min(stats.pctRalenti * 4, 100)}%` }}
                />
              </div>
            </div>

            {/* Card 2: Galones desperdiciados */}
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm space-y-3 relative overflow-hidden group">
              <div className="flex justify-between items-start">
                <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider">Galones Desperdiciados</span>
                <Fuel className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold text-slate-800 dark:text-slate-100">{stats.totalGalonesConsumidos.toFixed(2)}</span>
                <span className="text-xs text-slate-500">Gal</span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px]">
                {stats.deltaGalones > 0 ? (
                  <span className="text-red-500 font-bold">+{stats.deltaGalones.toFixed(1)} Gal</span>
                ) : (
                  <span className="text-emerald-500 font-bold">{stats.deltaGalones.toFixed(1)} Gal</span>
                )}
                <span className="text-slate-400 dark:text-slate-500">vs meta (37.0 Gal)</span>
              </div>
              <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min((stats.totalGalonesConsumidos / 37) * 100, 100)}%` }}
                />
              </div>
            </div>

            {/* Card 3: Costo promedio diario */}
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm space-y-3 relative overflow-hidden group">
              <div className="flex justify-between items-start">
                <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider">Costo Promedio Diario</span>
                <DollarSign className="w-4 h-4 text-amber-500" />
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-slate-800 dark:text-slate-100">${stats.costAvgDaily.toLocaleString('es-CO', { maximumFractionDigits: 0 })}</span>
                <span className="text-[10px] text-slate-400 uppercase font-bold">COP</span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px]">
                {stats.deltaCostoDiario > 0 ? (
                  <span className="text-red-500 font-bold">+$ {stats.deltaCostoDiario.toLocaleString('es-CO', { maximumFractionDigits: 0 })} COP</span>
                ) : (
                  <span className="text-emerald-500 font-bold">-$ {Math.abs(stats.deltaCostoDiario).toLocaleString('es-CO', { maximumFractionDigits: 0 })} COP</span>
                )}
                <span className="text-slate-400 dark:text-slate-500">vs meta ($28k)</span>
              </div>
              <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-amber-500 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min((stats.costAvgDaily / 28000) * 100, 100)}%` }}
                />
              </div>
            </div>

            {/* Card 4: Riesgo Operacional */}
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm space-y-3 relative overflow-hidden group">
              <div className="flex justify-between items-start">
                <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider">Riesgo Operacional</span>
                <AlertTriangle className="w-4 h-4 text-red-500" />
              </div>
              <div className="flex items-baseline">
                <span className={`text-2xl font-black rounded-lg px-2.5 py-0.5 border ${stats.riskColor}`}>
                  {stats.riskLevel}
                </span>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                {stats.riskDescription}
              </p>
            </div>
          </div>

          {/* Key Data & Environmental Impact */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* key stats box */}
            <div className="lg:col-span-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm space-y-6">
              <h2 className="font-bold text-slate-800 dark:text-slate-100 text-sm flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-500" /> Datos Clave del Período
              </h2>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                  <span className="text-[9px] uppercase font-bold text-slate-400 dark:text-slate-500 block">Tiempo Total en Ralentí</span>
                  <span className="text-lg font-black text-slate-700 dark:text-slate-200 mt-1 block">
                    {formatSeconds(stats.totalHorasMotorRalenti * 3600)}
                  </span>
                </div>

                <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                  <span className="text-[9px] uppercase font-bold text-slate-400 dark:text-slate-500 block">Promedio Evento</span>
                  <span className="text-lg font-black text-slate-700 dark:text-slate-200 mt-1 block">
                    {formatSeconds(stats.promedioEventoSegundos)}
                  </span>
                </div>

                <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                  <span className="text-[9px] uppercase font-bold text-slate-400 dark:text-slate-500 block">Mayor Evento Único</span>
                  <span className="text-lg font-black text-slate-700 dark:text-slate-200 mt-1 block">
                    {formatSeconds(stats.mayorEventoSegundos)}
                  </span>
                </div>

                <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                  <span className="text-[9px] uppercase font-bold text-slate-400 dark:text-slate-500 block">Eventos Excesivos &gt; 30 Min</span>
                  <span className="text-lg font-black text-red-500 mt-1 block">
                    {stats.eventosMas30Min}
                  </span>
                </div>

                <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                  <span className="text-[9px] uppercase font-bold text-slate-400 dark:text-slate-500 block">Costo Total Combustible</span>
                  <span className="text-lg font-black text-slate-700 dark:text-slate-200 mt-1 block">
                    $ {stats.costTotal.toLocaleString('es-CO', { maximumFractionDigits: 0 })}
                  </span>
                </div>

                <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                  <span className="text-[9px] uppercase font-bold text-slate-400 dark:text-slate-500 block">Eventos de Ralentí Totales</span>
                  <span className="text-lg font-black text-slate-700 dark:text-slate-200 mt-1 block">
                    {events.length}
                  </span>
                </div>
              </div>

              {/* FAP/AdBlue Box */}
              <div className="bg-slate-50 dark:bg-slate-900/40 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <strong className="text-xs font-bold text-slate-700 dark:text-slate-300 block">Filtro de Partículas Diésel (FAP/AdBlue)</strong>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 max-w-lg">
                    {stats.fapDescription}
                  </p>
                </div>
                <div className="flex flex-col items-end shrink-0">
                  <span className={`text-[10px] uppercase font-bold tracking-widest ${stats.fapTextColor}`}>Riesgo de Falla: {stats.fapRisk}</span>
                  <div className="w-32 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden mt-1.5">
                    <div className={`h-full ${stats.fapProgressColor}`} style={{ width: stats.fapRisk === 'Crítico' ? '100%' : stats.fapRisk === 'Moderado' ? '50%' : '20%' }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Environmental Impact Card */}
            <div className="bg-gradient-to-br from-emerald-600 to-teal-700 dark:from-emerald-950/80 dark:to-teal-950/80 rounded-xl p-6 text-white shadow-md flex flex-col justify-between space-y-6">
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <h3 className="font-bold text-sm text-emerald-100 uppercase tracking-widest">Impacto Ecológico</h3>
                  <span className="text-3xl font-black block">
                    {(stats.co2Kg / 1000).toFixed(3)} Tn
                  </span>
                  <span className="text-xs text-emerald-200">De emisiones de CO2 generadas</span>
                </div>
                <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
                  <Leaf className="w-5 h-5 text-emerald-200" />
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-[11px] text-emerald-100/90 leading-relaxed">
                  Para mitigar la huella ecológica dejada por el ralentí excesivo de este período, se requiere el equivalente de:
                </p>
                <div className="bg-white/10 border border-white/10 rounded-xl p-4 flex items-center gap-3">
                  <span className="text-2xl font-black">{Math.ceil(stats.treesEquivalent)}</span>
                  <div className="text-[10px] leading-snug">
                    <strong className="block text-white">Árboles compensados</strong>
                    <span className="text-emerald-200">Madurando de forma aislada por 1 año</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Chart: Top 10 Drivers by Time */}
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm space-y-4">
              <div className="flex justify-between items-center flex-wrap gap-2">
                <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm flex items-center gap-2">
                  <User className="w-4 h-4 text-indigo-500" /> Top 10 Conductores (Ralentí Acumulado)
                </h3>
              </div>
              {renderHorizontalBarChart(
                driverData.topByTime.map(d => ({ name: d.name, value: d.totalTime })),
                'time'
              )}
            </div>

            {/* Chart: Top 10 Drivers by Max Event */}
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm space-y-4">
              <div className="flex justify-between items-center flex-wrap gap-2">
                <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-purple-500" /> Top 10 Conductores (Mayor Evento Único)
                </h3>
              </div>
              {renderHorizontalBarChart(
                driverData.topByMax.map(d => ({ name: d.name, value: d.maxEvent })),
                'max'
              )}
            </div>
          </div>

          {/* Trend & Platform Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* CO2 Cumulative Trend (Line Chart) */}
            <div className="lg:col-span-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm space-y-4">
              <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-500" /> Emisión Acumulada de CO2 Diaria (Tendencia)
              </h3>
              {renderTrendLineChart(dailyCO2Trend)}
            </div>

            {/* CO2 by Provider/Platform */}
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm space-y-4">
              <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-teal-500" /> Emisiones de CO2 por Proveedor Satelital
              </h3>
              
              <div className="space-y-4">
                {providerCO2Data.length === 0 ? (
                  <div className="flex items-center justify-center h-40 bg-slate-50 dark:bg-slate-900/30 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-xs text-slate-400">
                    Sin datos
                  </div>
                ) : (
                  providerCO2Data.map((d, index) => (
                    <div key={index} className="space-y-2">
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-slate-600 dark:text-slate-300">{d.name}</span>
                        <span className="text-slate-800 dark:text-slate-100 font-bold">{d.co2Tons.toFixed(3)} Ton</span>
                      </div>
                      <div className="h-3 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-teal-500 rounded-full"
                          style={{ width: `${Math.min((d.co2Tons / Math.max(...providerCO2Data.map(x => x.co2Tons), 1)) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Details Table: Top 10 Drivers */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm space-y-4">
            <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-emerald-500" /> Clasificación de Conductores con Mayor Desviación en Ralentí
            </h3>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                    <th className="py-2.5 px-3">Conductor</th>
                    <th className="py-2.5 px-3">Tiempo Ralentí</th>
                    <th className="py-2.5 px-3">Mayor Evento</th>
                    <th className="py-2.5 px-3">Nº Eventos</th>
                    <th className="py-2.5 px-3">Calificación Estimada</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60 text-xs">
                  {driverData.topByTime.map((d, index) => {
                    const pctTime = (d.totalTime / (stats.totalHorasMotorRalenti * 3600 || 1)) * 100;
                    
                    let condScore = 100 - (d.totalTime / 3600) * 5; // basic penalty score estimate
                    condScore = Math.max(0, Math.min(100, condScore));

                    return (
                      <tr key={index} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-colors">
                        <td className="py-3 px-3 font-semibold text-slate-700 dark:text-slate-300">
                          {d.name}
                        </td>
                        <td className="py-3 px-3">
                          <span className="font-bold text-slate-800 dark:text-slate-200">
                            {formatSeconds(d.totalTime)}
                          </span>
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 ml-1.5">
                            ({pctTime.toFixed(1)}% del total)
                          </span>
                        </td>
                        <td className="py-3 px-3 font-medium text-slate-600 dark:text-slate-400">
                          {formatSeconds(d.maxEvent)}
                        </td>
                        <td className="py-3 px-3 font-semibold text-slate-700 dark:text-slate-300">
                          {d.count}
                        </td>
                        <td className="py-3 px-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            condScore >= 90 
                              ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400' 
                              : condScore >= 70 
                                ? 'bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400' 
                                : 'bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400'
                          }`}>
                            {condScore.toFixed(0)} / 100
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
