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
  FileSpreadsheet,
  Printer,
  BrainCircuit,
  Truck
} from 'lucide-react';
import { supabase } from '../../services/supabaseClient';
import { descargarPDFRalenti } from '../../services/pdfTemplates';

interface ContractOption {
  id: string;
  nombre: string;
}

interface VehicleOption {
  id: string;
  placa: string;
  cliente?: string;
  contrato_id?: string | null;
  tipo_activo?: string | null;
}

interface MultiSelectDropdownProps {
  label: string;
  options: { value: string; label: string }[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
}

const MultiSelectDropdown: React.FC<MultiSelectDropdownProps> = ({
  label,
  options,
  selectedValues,
  onChange,
  placeholder = 'Seleccionar...',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggleOption = (val: string) => {
    if (selectedValues.includes(val)) {
      onChange(selectedValues.filter(v => v !== val));
    } else {
      onChange([...selectedValues, val]);
    }
  };

  const handleSelectAll = () => {
    onChange(options.map(o => o.value));
  };

  const handleClearAll = () => {
    onChange([]);
  };

  const displayText = useMemo(() => {
    if (selectedValues.length === 0) return placeholder;
    if (selectedValues.length === options.length) return `Todos (${options.length})`;
    if (selectedValues.length <= 2) {
      return selectedValues
        .map(v => options.find(o => o.value === v)?.label ?? v)
        .join(', ');
    }
    return `${selectedValues.length} seleccionados`;
  }, [selectedValues, options, placeholder]);

  return (
    <div ref={dropdownRef} className="relative w-full">
      <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">{label}</label>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-1 focus:ring-emerald-500 flex justify-between items-center text-left shadow-sm hover:border-slate-300 dark:hover:border-slate-600 transition-colors"
      >
        <span className="truncate pr-2">{displayText}</span>
        <span className="shrink-0 text-slate-400 text-[8px] transform transition-transform duration-200" style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl max-h-60 overflow-y-auto p-2 space-y-2">
          <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-700/60 px-1">
            <button
              type="button"
              onClick={handleSelectAll}
              className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
            >
              Seleccionar Todos
            </button>
            <button
              type="button"
              onClick={handleClearAll}
              className="text-[10px] font-bold text-slate-500 dark:text-slate-400 hover:underline"
            >
              Limpiar
            </button>
          </div>
          <div className="space-y-1">
            {options.map(opt => {
              const isChecked = selectedValues.includes(opt.value);
              return (
                <label
                  key={opt.value}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-slate-50 dark:hover:bg-slate-700/40 cursor-pointer text-xs text-slate-700 dark:text-slate-300 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => handleToggleOption(opt.value)}
                    className="rounded text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5 border-slate-300 dark:border-slate-600 dark:bg-slate-700"
                  />
                  <span className="truncate">{opt.label}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

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
  const [selectedContracts, setSelectedContracts] = useState<string[]>([]);
  const [selectedVehicleTypes, setSelectedVehicleTypes] = useState<string[]>([]);
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

  // Comparison metrics for the previous period
  const [prevSummaryMetrics, setPrevSummaryMetrics] = useState({
    totalHorasMotorEncendido: 0,
    totalHorasMotorRalenti: 0,
    totalGalonesConsumidos: 0,
  });

  // Derived Calculations
  const vehicleTypesOptions = useMemo(() => {
    const types = new Set<string>();
    vehicles.forEach(v => {
      if (v.tipo_activo) {
        const trimmed = v.tipo_activo.trim();
        if (trimmed) types.add(trimmed);
      }
    });
    return Array.from(types).sort().map(t => ({ value: t, label: t }));
  }, [vehicles]);

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
          .select('id, placa, cliente, contrato_id, tipo_activo')
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

      // 1. Resolve vehicles under chosen contracts and types if filters are active
      let vehIds: string[] = [];
      const isContractFilterActive = selectedContracts.length > 0 && selectedContracts.length < contracts.length;
      const isTypeFilterActive = selectedVehicleTypes.length > 0 && selectedVehicleTypes.length < vehicleTypesOptions.length;
      const hasFilters = isContractFilterActive || isTypeFilterActive;

      if (hasFilters) {
        let filteredVeh = vehicles;
        if (isContractFilterActive) {
          filteredVeh = filteredVeh.filter(v => v.contrato_id && selectedContracts.includes(v.contrato_id));
        }
        if (isTypeFilterActive) {
          filteredVeh = filteredVeh.filter(v => v.tipo_activo && selectedVehicleTypes.includes(v.tipo_activo.trim()));
        }
        vehIds = filteredVeh.map(v => v.id);

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
      const fields = hasFilters 
        ? 'vehiculo_id, horas_motor_encendido, horas_motor_ralenti, consumo_combustible, ralentis_excesivos, vehiculos!inner(contrato_id, tipo_activo)'
        : 'vehiculo_id, horas_motor_encendido, horas_motor_ralenti, consumo_combustible, ralentis_excesivos';

      let repVehQuery = supabase.from('ralentis_periodos')
        .select(fields)
        .gte('periodo_inicio', dateStart)
        .lte('periodo_fin', dateEnd);

      if (placa) {
        repVehQuery = repVehQuery.eq('vehiculo_id', placa);
      } else if (hasFilters) {
        if (isContractFilterActive) {
          repVehQuery = repVehQuery.in('vehiculos.contrato_id', selectedContracts);
        }
        if (isTypeFilterActive) {
          const rawTypes = new Set<string>();
          selectedVehicleTypes.forEach(t => {
            vehicles.forEach(v => {
              if (v.tipo_activo && v.tipo_activo.trim() === t) {
                rawTypes.add(v.tipo_activo);
              }
            });
          });
          repVehQuery = repVehQuery.in('vehiculos.tipo_activo', Array.from(rawTypes));
        }
      }

      // Compute previous period dates
      let prevYear = year;
      let prevMonth = month;
      let prevQuincena = quincena;
      if (quincena === '1') {
        prevQuincena = '2';
        prevMonth = month - 1;
        if (prevMonth === 0) {
          prevMonth = 12;
          prevYear = year - 1;
        }
      } else if (quincena === '2') {
        prevQuincena = '1';
      } else {
        prevMonth = month - 1;
        if (prevMonth === 0) {
          prevMonth = 12;
          prevYear = year - 1;
        }
      }

      const prevMonthStr = String(prevMonth).padStart(2, '0');
      let prevStart = `${prevYear}-${prevMonthStr}-01`;
      let prevEnd = '';
      if (prevQuincena === '1') {
        prevEnd = `${prevYear}-${prevMonthStr}-15`;
      } else if (prevQuincena === '2') {
        const lastDay = new Date(prevYear, prevMonth, 0).getDate();
        prevStart = `${prevYear}-${prevMonthStr}-16`;
        prevEnd = `${prevYear}-${prevMonthStr}-${lastDay}`;
      } else {
        const lastDay = new Date(prevYear, prevMonth, 0).getDate();
        prevEnd = `${prevYear}-${prevMonthStr}-${lastDay}`;
      }

      const prevFields = hasFilters
        ? 'vehiculo_id, horas_motor_encendido, horas_motor_ralenti, consumo_combustible, vehiculos!inner(contrato_id, tipo_activo)'
        : 'vehiculo_id, horas_motor_encendido, horas_motor_ralenti, consumo_combustible';

      let prevVehQuery = supabase.from('ralentis_periodos')
        .select(prevFields)
        .gte('periodo_inicio', prevStart)
        .lte('periodo_fin', prevEnd);

      if (placa) {
        prevVehQuery = prevVehQuery.eq('vehiculo_id', placa);
      } else if (hasFilters) {
        if (isContractFilterActive) {
          prevVehQuery = prevVehQuery.in('vehiculos.contrato_id', selectedContracts);
        }
        if (isTypeFilterActive) {
          const rawTypes = new Set<string>();
          selectedVehicleTypes.forEach(t => {
            vehicles.forEach(v => {
              if (v.tipo_activo && v.tipo_activo.trim() === t) {
                rawTypes.add(v.tipo_activo);
              }
            });
          });
          prevVehQuery = prevVehQuery.in('vehiculos.tipo_activo', Array.from(rawTypes));
        }
      }

      const [repVehRes, prevVehRes] = await Promise.all([repVehQuery, prevVehQuery]);
      if (repVehRes.error) throw repVehRes.error;

      const filteredRepVehs = repVehRes.data ?? [];
      const prevRepVehs = prevVehRes.data ?? [];

      // Sum metrics
      const sumEncendido = filteredRepVehs.reduce((acc, r) => acc + (Number(r.horas_motor_encendido) || 0), 0);
      const sumRalenti = filteredRepVehs.reduce((acc, r) => acc + (Number(r.horas_motor_ralenti) || 0), 0);
      const sumGalones = filteredRepVehs.reduce((acc, r) => acc + (Number(r.consumo_combustible) || 0), 0);
      const sumExcesivos = filteredRepVehs.reduce((acc, r) => acc + (Number(r.ralentis_excesivos) || 0), 0);

      const prevSumEncendido = prevRepVehs.reduce((acc, r) => acc + (Number(r.horas_motor_encendido) || 0), 0);
      const prevSumRalenti = prevRepVehs.reduce((acc, r) => acc + (Number(r.horas_motor_ralenti) || 0), 0);
      const prevSumGalones = prevRepVehs.reduce((acc, r) => acc + (Number(r.consumo_combustible) || 0), 0);

      setSummaryMetrics({
        totalHorasMotorEncendido: sumEncendido,
        totalHorasMotorRalenti: sumRalenti,
        totalGalonesConsumidos: sumGalones,
        totalRalentisExcesivos: sumExcesivos,
      });

      setPrevSummaryMetrics({
        totalHorasMotorEncendido: prevSumEncendido,
        totalHorasMotorRalenti: prevSumRalenti,
        totalGalonesConsumidos: prevSumGalones,
      });

      // 3. Fetch detailed ralentis_eventos (paginated in parallel to bypass the default 1000 limit)
      const eventFields = hasFilters
        ? '*, vehiculos!inner(contrato_id, tipo_activo)'
        : '*';

      let countQuery = supabase.from('ralentis_eventos')
        .select(eventFields, { count: 'exact', head: true })
        .gte('fecha_inicio', `${dateStart}T00:00:00Z`)
        .lte('fecha_inicio', `${dateEnd}T23:59:59Z`);

      if (placa) {
        countQuery = countQuery.eq('vehiculo_id', placa);
      } else if (hasFilters) {
        if (isContractFilterActive) {
          countQuery = countQuery.in('vehiculos.contrato_id', selectedContracts);
        }
        if (isTypeFilterActive) {
          const rawTypes = new Set<string>();
          selectedVehicleTypes.forEach(t => {
            vehicles.forEach(v => {
              if (v.tipo_activo && v.tipo_activo.trim() === t) {
                rawTypes.add(v.tipo_activo);
              }
            });
          });
          countQuery = countQuery.in('vehiculos.tipo_activo', Array.from(rawTypes));
        }
      }

      const { count, error: countErr } = await countQuery;
      if (countErr) throw countErr;

      const totalEvents = count ?? 0;
      const pageSize = 1000;
      const numPages = Math.ceil(totalEvents / pageSize);
      const promises = [];

      const evFields = hasFilters
        ? 'id, placa, conductor_nombre, fecha_inicio, fecha_fin, duracion_segundos, galones_consumidos, ubicacion, proveedor, vehiculo_id, conductor_id, vehiculos!inner(contrato_id, tipo_activo)'
        : 'id, placa, conductor_nombre, fecha_inicio, fecha_fin, duracion_segundos, galones_consumidos, ubicacion, proveedor, vehiculo_id, conductor_id';

      for (let page = 0; page < numPages; page++) {
        const start = page * pageSize;
        const end = start + pageSize - 1;
        
        let evQuery = supabase.from('ralentis_eventos')
          .select(evFields)
          .gte('fecha_inicio', `${dateStart}T00:00:00Z`)
          .lte('fecha_inicio', `${dateEnd}T23:59:59Z`)
          .range(start, end);

        if (placa) {
          evQuery = evQuery.eq('vehiculo_id', placa);
        } else if (hasFilters) {
          if (isContractFilterActive) {
            evQuery = evQuery.in('vehiculos.contrato_id', selectedContracts);
          }
          if (isTypeFilterActive) {
            const rawTypes = new Set<string>();
            selectedVehicleTypes.forEach(t => {
              vehicles.forEach(v => {
                if (v.tipo_activo && v.tipo_activo.trim() === t) {
                  rawTypes.add(v.tipo_activo);
                }
              });
            });
            evQuery = evQuery.in('vehiculos.tipo_activo', Array.from(rawTypes));
          }
        }

        promises.push(evQuery);
      }

      const results = await Promise.all(promises);
      let allEvents: IdlingEvent[] = [];
      for (const res of results) {
        if (res.error) throw res.error;
        allEvents = allEvents.concat((res.data ?? []) as IdlingEvent[]);
      }

      setEvents(allEvents);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error al obtener datos de telemetría.');
    } finally {
      setLoading(false);
    }
  }, [year, month, quincena, selectedContracts, selectedVehicleTypes, placa, vehicles, contracts, vehicleTypesOptions]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const daysInPeriod = useMemo(() => {
    if (quincena === '1') return 15;
    const lastDay = new Date(year, month, 0).getDate();
    if (quincena === '2') return lastDay - 15;
    return lastDay;
  }, [year, month, quincena]);

  const stats = useMemo(() => {
    const { totalHorasMotorEncendido, totalHorasMotorRalenti, totalGalonesConsumidos, totalRalentisExcesivos } = summaryMetrics;

    const segundosRalentiMas5Min = events
      .filter(e => e.duracion_segundos > 300)
      .reduce((acc, e) => acc + e.duracion_segundos, 0);
    const horasRalentiMas5Min = segundosRalentiMas5Min / 3600;

    const pctRalentiMas5MinDeRalenti = totalHorasMotorRalenti > 0
      ? (horasRalentiMas5Min / totalHorasMotorRalenti) * 100
      : 0;

    const pctRalentiMas5MinDeEncendido = totalHorasMotorEncendido > 0
      ? (horasRalentiMas5Min / totalHorasMotorEncendido) * 100
      : 0;

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

    // Previous Period derived calculations
    const prevPctRalenti = prevSummaryMetrics.totalHorasMotorEncendido > 0 
      ? (prevSummaryMetrics.totalHorasMotorRalenti / prevSummaryMetrics.totalHorasMotorEncendido) * 100 
      : 0;
    const pctRalentiDiff = pctRalenti - prevPctRalenti;
    const costTotalDiff = (totalGalonesConsumidos * 9922) - (prevSummaryMetrics.totalGalonesConsumidos * 9922);

    // Anomaly Outliers Detection (Mean + 1.2 * StdDev)
    const vehicleSummaryMap = new Map<string, { totalTime: number; count: number }>();
    events.forEach(e => {
      const p = e.placa || 'Desconocido';
      const current = vehicleSummaryMap.get(p) || { totalTime: 0, count: 0 };
      vehicleSummaryMap.set(p, {
        totalTime: current.totalTime + e.duracion_segundos,
        count: current.count + 1
      });
    });

    const vehicleTimes = Array.from(vehicleSummaryMap.values()).map(v => v.totalTime);
    let meanVehicleTime = 0;
    let stdDevVehicleTime = 0;
    let anomalies: Array<{ placa: string; totalHours: number; count: number; excessRatio: number }> = [];

    if (vehicleTimes.length > 0) {
      meanVehicleTime = vehicleTimes.reduce((acc, t) => acc + t, 0) / vehicleTimes.length;
      const variance = vehicleTimes.reduce((acc, t) => acc + Math.pow(t - meanVehicleTime, 2), 0) / vehicleTimes.length;
      stdDevVehicleTime = Math.sqrt(variance);

      const threshold = meanVehicleTime + (stdDevVehicleTime > 0 ? 1.2 * stdDevVehicleTime : 1000);
      vehicleSummaryMap.forEach((val, p) => {
        if (val.totalTime > threshold && val.totalTime > 3600) {
          anomalies.push({
            placa: p,
            totalHours: val.totalTime / 3600,
            count: val.count,
            excessRatio: val.totalTime / (meanVehicleTime || 1)
          });
        }
      });
      anomalies.sort((a, b) => b.totalHours - a.totalHours);
    }

    // ML regression-based trend forecast
    const trendRatio = prevPctRalenti > 0 ? pctRalenti / prevPctRalenti : 1;
    const predictedPct = Math.min(100, Math.max(1, pctRalenti * (trendRatio > 1.5 ? 1.15 : trendRatio < 0.5 ? 0.85 : trendRatio)));
    const predictedGalones = totalGalonesConsumidos * (predictedPct / (pctRalenti || 1));
    const predictedCosto = predictedGalones * 9922;

    const vehMap = new Map<string, number>();
    events.forEach(e => {
      const p = e.placa || 'SIN PLACA';
      vehMap.set(p, (vehMap.get(p) || 0) + e.duracion_segundos);
    });
    let placaCritica = 'NINGUNO';
    let tiempoCriticaSegundos = 0;
    for (const [p, t] of vehMap.entries()) {
      if (t > tiempoCriticaSegundos) {
        tiempoCriticaSegundos = t;
        placaCritica = p;
      }
    }

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
      prevPctRalenti,
      pctRalentiDiff,
      costTotalDiff,
      anomalies,
      predictedPct,
      predictedGalones,
      predictedCosto,
      horasRalentiMas5Min,
      pctRalentiMas5MinDeRalenti,
      pctRalentiMas5MinDeEncendido,
      totalHorasMotorEncendido,
      placaCritica,
      tiempoCriticaSegundos,
    };
  }, [summaryMetrics, events, daysInPeriod, prevSummaryMetrics]);

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

  // Group events by vehicle and compute metrics
  const vehicleData = useMemo(() => {
    const vehicleMap = new Map<string, { totalTime: number; maxEvent: number; count: number; name: string; type: string }>();

    events.forEach(e => {
      const name = e.placa || 'SIN PLACA';
      const current = vehicleMap.get(name) ?? { 
        totalTime: 0, 
        maxEvent: 0, 
        count: 0, 
        name,
        type: vehicles.find(v => v.placa === name)?.tipo_activo || 'NO REGISTRA'
      };
      current.totalTime += e.duracion_segundos;
      current.count += 1;
      if (e.duracion_segundos > current.maxEvent) {
        current.maxEvent = e.duracion_segundos;
      }
      vehicleMap.set(name, current);
    });

    const vehiclesList = Array.from(vehicleMap.values());
    
    const topByTime = [...vehiclesList]
      .sort((a, b) => b.totalTime - a.totalTime)
      .slice(0, 10);

    const topByMax = [...vehiclesList]
      .sort((a, b) => b.maxEvent - a.maxEvent)
      .slice(0, 10);

    return { topByTime, topByMax };
  }, [events, vehicles]);

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
                fill={index < 2 ? '#dc2626' : index < 5 ? '#ea580c' : '#eab308'}
                className="transition-all hover:opacity-85"
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
      {/* Print Styles */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          /* Ocultar elementos de la UI general */
          aside,
          header,
          .no-print,
          [class*="Sidebar"],
          aside[class*="Sidebar"],
          header[class*="header"],
          div[class*="ApiStatus"],
          button,
          select,
          input {
            display: none !important;
          }

          /* Quitar márgenes, scrollbars y padding del contenedor principal */
          body, html, #root, main, div {
            overflow: visible !important;
            height: auto !important;
            max-height: none !important;
            padding: 0 !important;
            margin: 0 !important;
            background: white !important;
            color: black !important;
          }

          main {
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            display: block !important;
          }

          /* Asegurar que se impriman los colores de fondo y bordes */
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }

          /* Evitar saltos de página huérfanos a la mitad de un gráfico o tarjeta */
          .grid, svg, table, tr, td, th {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        }
      `}} />

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
        
        {/* Print Button */}
        <button
          onClick={async () => {
            // Compute period strings
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
            const contratoNombre = selectedContracts.length === 0 || selectedContracts.length === contracts.length
              ? 'Todos los contratos'
              : selectedContracts.length <= 2
                ? selectedContracts.map(cid => contracts.find(c => c.id === cid)?.nombre ?? '').filter(Boolean).join(', ')
                : `Multicontrato (${selectedContracts.length})`;

            const vehMap = new Map<string, number>();
            events.forEach(e => {
              const p = e.placa || 'SIN PLACA';
              vehMap.set(p, (vehMap.get(p) || 0) + e.duracion_segundos);
            });
            let placaCritica = 'NINGUNO';
            let tiempoCriticaSegundos = 0;
            for (const [p, t] of vehMap.entries()) {
              if (t > tiempoCriticaSegundos) {
                tiempoCriticaSegundos = t;
                placaCritica = p;
              }
            }

            const quincenaLabel = quincena === 'all' ? 'Mes Completo' : quincena === '1' ? 'Q1' : 'Q2';
            const mesesNombres = [
              'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
              'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
            ];
            const mesNombre = mesesNombres[month - 1] ?? '';
            const periodoLabel = `${year} - ${mesNombre} (${quincenaLabel})`;

            const isPlaceholderDriver = (n: string) => {
              const norm = n.toLowerCase().trim();
              return (
                norm === 'n/a' ||
                norm === 'no registra' ||
                norm === 'sin conductor' ||
                norm === 'desconocido' ||
                norm === 'no asignado' ||
                norm === 'conductor n/a' ||
                norm === 'na' ||
                norm === ''
              );
            };

            const allDriversList = Array.from(
              events.reduce((map, e) => {
                const name = e.conductor_nombre || 'NO REGISTRA';
                const current = map.get(name) ?? { totalTime: 0, maxEvent: 0, count: 0, name };
                current.totalTime += e.duracion_segundos;
                current.count += 1;
                if (e.duracion_segundos > current.maxEvent) {
                  current.maxEvent = e.duracion_segundos;
                }
                map.set(name, current);
                return map;
              }, new Map<string, { totalTime: number; maxEvent: number; count: number; name: string }>()).values()
            );

            const filteredDrivers = allDriversList.filter(d => !isPlaceholderDriver(d.name));
            const topByTimePDF = [...filteredDrivers].sort((a, b) => b.totalTime - a.totalTime).slice(0, 10);
            const topByMaxPDF = [...filteredDrivers].sort((a, b) => b.maxEvent - a.maxEvent).slice(0, 10);

            const data = {
              periodoLabel,
              periodoInicio: dateStart,
              periodoFin: dateEnd,
              fechaReporte: new Date().toISOString(),
              pctRalenti: stats.pctRalenti,
              totalHorasMotorEncendido: summaryMetrics.totalHorasMotorEncendido,
              totalHorasMotorRalenti: summaryMetrics.totalHorasMotorRalenti,
              totalGalonesConsumidos: summaryMetrics.totalGalonesConsumidos,
              totalRalentisExcesivos: summaryMetrics.totalRalentisExcesivos,
              totalEventos: events.length,
              costTotal: stats.costTotal,
              costAvgDaily: stats.costAvgDaily,
              co2Kg: stats.co2Kg,
              treesEquivalent: stats.treesEquivalent,
              mayorEventoSegundos: stats.mayorEventoSegundos,
              promedioEventoSegundos: stats.promedioEventoSegundos,
              eventosMas30Min: stats.eventosMas30Min,
              riskLevel: stats.riskLevel,
              fapRisk: stats.fapRisk,
              topByTime: topByTimePDF,
              topByMax: topByMaxPDF,
              providerCO2: providerCO2Data,
              dailyCO2Trend: dailyCO2Trend,
              contratoNombre,
              placaCritica,
              tiempoCriticaSegundos,
              fapProbability: stats.fapRisk === 'Crítico' ? 70 : stats.fapRisk === 'Moderado' ? 40 : 15,
              horasRalentiMas5Min: stats.horasRalentiMas5Min,
              pctRalentiMas5MinDeRalenti: stats.pctRalentiMas5MinDeRalenti,
              pctRalentiMas5MinDeEncendido: stats.pctRalentiMas5MinDeEncendido,
            };
            await descargarPDFRalenti(data);
          }}
          className="no-print flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold shadow-md transition-colors"
        >
          <Printer className="w-4 h-4" />
          <span>Descargar PDF</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="no-print bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3 shadow-sm">
        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-semibold text-sm">
          <Filter className="w-4 h-4 text-emerald-500" />
          <span>Filtros Gerenciales</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
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
          <MultiSelectDropdown
            label="Contratos"
            options={contracts.map(c => ({ value: c.id, label: c.nombre }))}
            selectedValues={selectedContracts}
            onChange={(vals) => { setSelectedContracts(vals); setPlaca(''); }}
            placeholder="Todos los contratos"
          />

          {/* Vehicle Type */}
          <MultiSelectDropdown
            label="Tipos de Vehículo"
            options={vehicleTypesOptions}
            selectedValues={selectedVehicleTypes}
            onChange={(vals) => { setSelectedVehicleTypes(vals); setPlaca(''); }}
            placeholder="Todos los tipos"
          />

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
                .filter(v => {
                  const isContractFilterActive = selectedContracts.length > 0 && selectedContracts.length < contracts.length;
                  const isTypeFilterActive = selectedVehicleTypes.length > 0 && selectedVehicleTypes.length < vehicleTypesOptions.length;
                  const matchesContract = !isContractFilterActive || (v.contrato_id && selectedContracts.includes(v.contrato_id));
                  const matchesType = !isTypeFilterActive || (v.tipo_activo && selectedVehicleTypes.includes(v.tipo_activo.trim()));
                  return matchesContract && matchesType;
                })
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
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm space-y-3 relative overflow-hidden group flex flex-col justify-between">
              <div className="space-y-3">
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
                    className={`h-full rounded-full transition-all duration-500 ${stats.pctRalenti > 15 ? 'bg-red-500' : stats.pctRalenti >= 10 ? 'bg-orange-500' : 'bg-emerald-500'}`}
                    style={{ width: `${Math.min(stats.pctRalenti * 4, 100)}%` }}
                  />
                </div>
              </div>
              <div className="text-[10px] text-slate-400 dark:text-slate-500 leading-snug border-t border-slate-100 dark:border-slate-800/80 pt-2 font-medium">
                Cálculo: (Ralentí &gt; 5 min / Tiempo Motor Encendido) × 100. Proporción de motor inactivo encendido vs total.
              </div>
            </div>

            {/* Card 2: Galones desperdiciados */}
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm space-y-3 relative overflow-hidden group flex flex-col justify-between">
              <div className="space-y-3">
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
                    className={`h-full rounded-full transition-all duration-500 ${stats.totalGalonesConsumidos > 50 ? 'bg-red-500' : stats.totalGalonesConsumidos > 37 ? 'bg-orange-500' : 'bg-emerald-500'}`}
                    style={{ width: `${Math.min((stats.totalGalonesConsumidos / 37) * 100, 100)}%` }}
                  />
                </div>
              </div>
              <div className="text-[10px] text-slate-400 dark:text-slate-500 leading-snug border-t border-slate-100 dark:border-slate-800/80 pt-2 font-medium">
                Cálculo: Tiempo Ralentí × Tasa de consumo estimado (Gal/h). Combustible quemado de forma improductiva.
              </div>
            </div>

            {/* Card 3: Costo promedio diario */}
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm space-y-3 relative overflow-hidden group flex flex-col justify-between">
              <div className="space-y-3">
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
                    className={`h-full rounded-full transition-all duration-500 ${stats.costAvgDaily > 40000 ? 'bg-red-500' : stats.costAvgDaily > 28000 ? 'bg-orange-500' : 'bg-emerald-500'}`}
                    style={{ width: `${Math.min((stats.costAvgDaily / 28000) * 100, 100)}%` }}
                  />
                </div>
              </div>
              <div className="text-[10px] text-slate-400 dark:text-slate-500 leading-snug border-t border-slate-100 dark:border-slate-800/80 pt-2 font-medium">
                Cálculo: (Galones Desperdiciados × $9.922 COP/Gal) / Días. Impacto financiero diario del ralentí.
              </div>
            </div>

            {/* Card 4: Riesgo Operacional */}
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm space-y-3 relative overflow-hidden group flex flex-col justify-between">
              <div className="space-y-3">
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
              <div className="text-[10px] text-slate-400 dark:text-slate-500 leading-snug border-t border-slate-100 dark:border-slate-800/80 pt-2 font-medium">
                Evaluación: Basado en % ralentí y riesgo de taponamiento térmico del filtro de partículas FAP/AdBlue.
              </div>
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

          {/* Proportions Analysis Table */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm space-y-4">
              <h2 className="font-bold text-slate-800 dark:text-slate-100 text-sm flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-500" /> Distribución y Proporciones de Ralentí
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900/50 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-slate-700">
                      <th className="py-2.5 px-3">Métrica Base</th>
                      <th className="py-2.5 px-3">Métrica Comparativa</th>
                      <th className="py-2.5 px-3 text-right">Proporción (%)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                    <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30">
                      <td className="py-3 px-3">
                        <span className="text-slate-400 block text-[9px] uppercase font-semibold">Total tiempo de ralentí</span>
                        <span className="font-bold text-slate-700 dark:text-slate-300">
                          {formatSeconds(stats.totalHorasMotorRalenti * 3600)} ({stats.totalHorasMotorRalenti.toFixed(1)} h)
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span className="text-slate-400 block text-[9px] uppercase font-semibold">Ralentí &gt; 5 min</span>
                        <span className="font-bold text-slate-700 dark:text-slate-300">
                          {formatSeconds(stats.horasRalentiMas5Min * 3600)} ({stats.horasRalentiMas5Min.toFixed(1)} h)
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <span className="font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                            {stats.pctRalentiMas5MinDeRalenti.toFixed(0)}%
                          </span>
                          <div className="w-16 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden hidden sm:block">
                            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${stats.pctRalentiMas5MinDeRalenti}%` }} />
                          </div>
                        </div>
                      </td>
                    </tr>
                    <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30">
                      <td className="py-3 px-3">
                        <span className="text-slate-400 block text-[9px] uppercase font-semibold">Total de horas motor encendido</span>
                        <span className="font-bold text-slate-700 dark:text-slate-300">
                          {stats.totalHorasMotorEncendido.toFixed(1)} h
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span className="text-slate-400 block text-[9px] uppercase font-semibold">Ralentí &gt; 5 min</span>
                        <span className="font-bold text-slate-700 dark:text-slate-300">
                          {formatSeconds(stats.horasRalentiMas5Min * 3600)} ({stats.horasRalentiMas5Min.toFixed(1)} h)
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <span className="font-bold text-indigo-600 dark:text-indigo-400 text-sm">
                            {stats.pctRalentiMas5MinDeEncendido.toFixed(0)}%
                          </span>
                          <div className="w-16 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden hidden sm:block">
                            <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${stats.pctRalentiMas5MinDeEncendido}%` }} />
                          </div>
                        </div>
                      </td>
                    </tr>
                    <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30">
                      <td className="py-3 px-3">
                        <span className="text-slate-400 block text-[9px] uppercase font-semibold">Total de horas motor encendido</span>
                        <span className="font-bold text-slate-700 dark:text-slate-300">
                          {stats.totalHorasMotorEncendido.toFixed(1)} h
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span className="text-slate-400 block text-[9px] uppercase font-semibold">Total ralentí</span>
                        <span className="font-bold text-slate-700 dark:text-slate-300">
                          {formatSeconds(stats.totalHorasMotorRalenti * 3600)} ({stats.totalHorasMotorRalenti.toFixed(1)} h)
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <span className="font-bold text-amber-600 dark:text-amber-400 text-sm">
                            {stats.pctRalenti.toFixed(0)}%
                          </span>
                          <div className="w-16 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden hidden sm:block">
                            <div className="h-full bg-amber-500 rounded-full" style={{ width: `${stats.pctRalenti}%` }} />
                          </div>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <div className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800/40 dark:to-slate-900/40 border border-slate-200 dark:border-slate-700/60 rounded-xl p-5 shadow-sm flex flex-col justify-between">
              <div>
                <h3 className="font-bold text-slate-800 dark:text-slate-200 text-xs uppercase tracking-wider mb-2">Entendiendo las Proporciones</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed space-y-2">
                  <span><strong>% Ralentí &gt; 5 min de Ralentí ({stats.pctRalentiMas5MinDeRalenti.toFixed(0)}%):</strong> Indica qué porción del ralentí total es excesivo. Un valor alto sugiere que los conductores realizan paradas prolongadas sin apagar el motor.</span>
                  <br />
                  <span><strong>% Ralentí &gt; 5 min de Encendido ({stats.pctRalentiMas5MinDeEncendido.toFixed(0)}%):</strong> Representa el porcentaje de toda la jornada de operación que se desperdició en ralentí crítico.</span>
                </p>
              </div>
            </div>
          </div>

          {/* Sección de Análisis de Desviaciones, Impacto y Plan de Acción (NUEVO) */}
          <div className="space-y-6">
            <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-700 pb-2">
              <FileSpreadsheet className="w-5 h-5 text-indigo-500" />
              <h2 className="font-bold text-slate-800 dark:text-slate-100 text-sm uppercase tracking-wider">
                Análisis Ejecutivo de Desviaciones, Impacto y Plan de Acción
              </h2>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {/* Tabla 1: Resumen de Desviaciones */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm space-y-4">
                <h3 className="font-bold text-slate-800 dark:text-slate-200 text-xs uppercase tracking-wider border-b border-slate-100 dark:border-slate-700/60 pb-2">
                  1. Resumen de Desviaciones
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-900/50 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-slate-700">
                        <th className="py-2.5 px-3">Indicador</th>
                        <th className="py-2.5 px-3">Resultado</th>
                        <th className="py-2.5 px-3">Metas</th>
                        <th className="py-2.5 px-3">Desviación</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                      <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30">
                        <td className="py-3 px-3 font-semibold text-slate-700 dark:text-slate-300">% Tiempo de ralentí &gt; 5 min</td>
                        <td className="py-3 px-3 font-bold text-slate-800 dark:text-slate-200">{stats.pctRalenti.toFixed(1)}%</td>
                        <td className="py-3 px-3 text-slate-500 dark:text-slate-400">&lt; 10%</td>
                        <td className="py-3 px-3">
                          <span className={stats.deltaPct > 0 ? "text-red-500 font-bold" : "text-emerald-500 font-bold"}>
                            {stats.deltaPct > 0 ? `+${stats.deltaPct.toFixed(1)}% sobre meta` : `${stats.deltaPct.toFixed(1)}% bajo meta`}
                          </span>
                        </td>
                      </tr>
                      <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30">
                        <td className="py-3 px-3 font-semibold text-slate-700 dark:text-slate-300">Galones en ralentí &gt; 5 min</td>
                        <td className="py-3 px-3 font-bold text-slate-800 dark:text-slate-200">{stats.totalGalonesConsumidos.toFixed(1)} gal</td>
                        <td className="py-3 px-3 text-slate-500 dark:text-slate-400">&lt; 37 gal</td>
                        <td className="py-3 px-3">
                          <span className={stats.deltaGalones > 0 ? "text-red-500 font-bold" : "text-emerald-500 font-bold"}>
                            {stats.deltaGalones > 0 ? `${stats.deltaGalones.toFixed(1)} gal sobre meta` : `${Math.abs(stats.deltaGalones).toFixed(1)} gal bajo meta`}
                          </span>
                        </td>
                      </tr>
                      <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30">
                        <td className="py-3 px-3 font-semibold text-slate-700 dark:text-slate-300">Impacto económico estimado</td>
                        <td className="py-3 px-3 font-bold text-slate-800 dark:text-slate-200">${stats.costAvgDaily.toLocaleString('es-CO', { maximumFractionDigits: 0 })}/día</td>
                        <td className="py-3 px-3 text-slate-500 dark:text-slate-400">&lt; $28,000</td>
                        <td className="py-3 px-3">
                          <span className={stats.deltaCostoDiario > 0 ? "text-red-500 font-bold" : "text-emerald-500 font-bold"}>
                            {stats.deltaCostoDiario > 0 ? `$ ${stats.deltaCostoDiario.toLocaleString('es-CO', { maximumFractionDigits: 0 })} sobre meta` : `$ ${Math.abs(stats.deltaCostoDiario).toLocaleString('es-CO', { maximumFractionDigits: 0 })} bajo meta`}
                          </span>
                        </td>
                      </tr>
                      <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30">
                        <td className="py-3 px-3 font-semibold text-slate-700 dark:text-slate-300">Riesgo operacional</td>
                        <td className="py-3 px-3 font-bold text-slate-800 dark:text-slate-200 capitalize">{stats.riskLevel}</td>
                        <td className="py-3 px-3 text-slate-500 dark:text-slate-400">BAJO</td>
                        <td className="py-3 px-3">
                          <span className={stats.riskLevel === 'Alto' ? "text-red-500 font-bold" : stats.riskLevel === 'Medio' ? "text-amber-500 font-bold" : "text-emerald-500 font-bold"}>
                            {stats.riskLevel === 'Bajo' ? 'En meta' : 'Desviado'}
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Tabla 2: Datos Clave */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm space-y-4">
                <h3 className="font-bold text-slate-800 dark:text-slate-200 text-xs uppercase tracking-wider border-b border-slate-100 dark:border-slate-700/60 pb-2">
                  2. Datos Clave
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-900/50 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-slate-700">
                        <th className="py-2.5 px-3">Métrica</th>
                        <th className="py-2.5 px-3">Valor</th>
                        <th className="py-2.5 px-3">Interpretación Operativa</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                      <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30">
                        <td className="py-3 px-3 font-semibold text-slate-700 dark:text-slate-300">Total horas ralentí &gt; 5 min</td>
                        <td className="py-3 px-3 font-bold text-slate-800 dark:text-slate-200">{formatSeconds(stats.horasRalentiMas5Min * 3600)}</td>
                        <td className="py-3 px-3 text-slate-500 dark:text-slate-400">Equivale a {(stats.horasRalentiMas5Min / 24).toFixed(1)} días continuos de motor en ralentí innecesario.</td>
                      </tr>
                      <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30">
                        <td className="py-3 px-3 font-semibold text-slate-700 dark:text-slate-300">Mayor evento de ralentí</td>
                        <td className="py-3 px-3 font-bold text-slate-800 dark:text-slate-200">{formatSeconds(stats.mayorEventoSegundos)}</td>
                        <td className="py-3 px-3 text-slate-500 dark:text-slate-400">{(stats.mayorEventoSegundos / 3600).toFixed(1)} horas continuas sin generar valor operativo.</td>
                      </tr>
                      <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30">
                        <td className="py-3 px-3 font-semibold text-slate-700 dark:text-slate-300">Promedio ralentí &gt; 5 min/día</td>
                        <td className="py-3 px-3 font-bold text-slate-800 dark:text-slate-200">{formatSeconds((stats.horasRalentiMas5Min * 3600) / (daysInPeriod || 15))}</td>
                        <td className="py-3 px-3 text-slate-500 dark:text-slate-400">{(stats.horasRalentiMas5Min / (daysInPeriod || 15)).toFixed(1)} horas diarias de inactividad acumulada en la flota.</td>
                      </tr>
                      <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30">
                        <td className="py-3 px-3 font-semibold text-slate-700 dark:text-slate-300">Eventos con ralentí &gt; 30 min</td>
                        <td className="py-3 px-3 font-bold text-slate-800 dark:text-slate-200">{stats.eventosMas30Min}</td>
                        <td className="py-3 px-3 text-slate-500 dark:text-slate-400">Eventos de severidad crítica con alto riesgo para el motor.</td>
                      </tr>
                      <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30">
                        <td className="py-3 px-3 font-semibold text-slate-700 dark:text-slate-300">Mayor ralentí en un vehículo</td>
                        <td className="py-3 px-3 font-bold text-slate-800 dark:text-slate-200">{formatSeconds(stats.tiempoCriticaSegundos)}</td>
                        <td className="py-3 px-3 text-slate-500 dark:text-slate-400">{(stats.tiempoCriticaSegundos / 3600).toFixed(1)} horas acumuladas (Vehículo: {stats.placaCritica}).</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Tabla 3: Impacto Financiero y Ambiental */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm space-y-4">
                <h3 className="font-bold text-slate-800 dark:text-slate-200 text-xs uppercase tracking-wider border-b border-slate-100 dark:border-slate-700/60 pb-2">
                  3. Impacto Financiero y Ambiental
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-900/50 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-slate-700">
                        <th className="py-2.5 px-3">Concepto</th>
                        <th className="py-2.5 px-3">Valor</th>
                        <th className="py-2.5 px-3">Valoración Económica/Ambiental</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                      <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30">
                        <td className="py-3 px-3 font-semibold text-slate-700 dark:text-slate-300">Combustible desperdiciado (gal)</td>
                        <td className="py-3 px-3 font-bold text-slate-800 dark:text-slate-200">{stats.totalGalonesConsumidos.toFixed(1)} gal</td>
                        <td className="py-3 px-3 text-slate-800 dark:text-slate-100 font-bold">${stats.costTotal.toLocaleString('es-CO', { maximumFractionDigits: 0 })} COP</td>
                      </tr>
                      <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30">
                        <td className="py-3 px-3 font-semibold text-slate-700 dark:text-slate-300">Probabilidad de falla FAP/AdBlue</td>
                        <td className="py-3 px-3 font-bold text-slate-800 dark:text-slate-200">{stats.fapRisk === 'Crítico' ? 70 : stats.fapRisk === 'Moderado' ? 40 : 15}%</td>
                        <td className="py-3 px-3 text-slate-500 dark:text-slate-400">Riesgo {stats.fapRisk} de saturación por baja temperatura.</td>
                      </tr>
                      <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30">
                        <td className="py-3 px-3 font-semibold text-slate-700 dark:text-slate-300">Impacto diario en combustible</td>
                        <td className="py-3 px-3 text-slate-500 dark:text-slate-400">Total ÷ {daysInPeriod || 15} días</td>
                        <td className="py-3 px-3 text-slate-800 dark:text-slate-100 font-bold">${stats.costAvgDaily.toLocaleString('es-CO', { maximumFractionDigits: 0 })} COP/día</td>
                      </tr>
                      <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30">
                        <td className="py-3 px-3 font-semibold text-slate-700 dark:text-slate-300">Huella de Carbono (CO2)</td>
                        <td className="py-3 px-3 font-bold text-slate-800 dark:text-slate-200">{stats.co2Kg.toFixed(0)} Kg CO2</td>
                        <td className="py-3 px-3 text-slate-500 dark:text-slate-400">{(stats.co2Kg / 1000).toFixed(2)} Ton (Equivale a {Math.ceil(stats.treesEquivalent)} árboles madurando)</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Tabla 4: Plan de Acción Sugerido */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm space-y-4">
                <h3 className="font-bold text-slate-800 dark:text-slate-200 text-xs uppercase tracking-wider border-b border-slate-100 dark:border-slate-700/60 pb-2">
                  4. Plan de Acción Sugerido
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-900/50 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-slate-700">
                        <th className="py-2.5 px-3">Acción</th>
                        <th className="py-2.5 px-3">Responsable</th>
                        <th className="py-2.5 px-3">Fecha</th>
                        <th className="py-2.5 px-3">Indicador</th>
                        <th className="py-2.5 px-3">Impacto Esperado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                      <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30">
                        <td className="py-3 px-3 font-semibold text-slate-700 dark:text-slate-300">Reentrenamiento Conductores Top 10</td>
                        <td className="py-3 px-3 text-slate-500 dark:text-slate-400">Seguridad Vial</td>
                        <td className="py-3 px-3 text-slate-500 dark:text-slate-400">30/01/2026</td>
                        <td className="py-3 px-3 text-slate-500 dark:text-slate-400">100% certificado</td>
                        <td className="py-3 px-3 text-slate-500 dark:text-slate-400">Reducción del 30% en ralentí</td>
                      </tr>
                      <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30">
                        <td className="py-3 px-3 font-semibold text-slate-700 dark:text-slate-300">Instalar calcomanías Apague Motor</td>
                        <td className="py-3 px-3 text-slate-500 dark:text-slate-400">Gerente Contrato</td>
                        <td className="py-3 px-3 text-slate-500 dark:text-slate-400">Aprobación</td>
                        <td className="py-3 px-3 text-slate-500 dark:text-slate-400">100% flota</td>
                        <td className="py-3 px-3 text-slate-500 dark:text-slate-400">Reducción del 25% en paradas cortas</td>
                      </tr>
                      <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30">
                        <td className="py-3 px-3 font-semibold text-slate-700 dark:text-slate-300">Autorización Gerencial de Ralentí</td>
                        <td className="py-3 px-3 text-slate-500 dark:text-slate-400">Gerente Contrato</td>
                        <td className="py-3 px-3 text-slate-500 dark:text-slate-400">30/01/2026</td>
                        <td className="py-3 px-3 text-slate-500 dark:text-slate-400">100% justificado</td>
                        <td className="py-3 px-3 text-slate-500 dark:text-slate-400">Eliminación de ralentí injustificado</td>
                      </tr>
                      <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30">
                        <td className="py-3 px-3 font-semibold text-slate-700 dark:text-slate-300">Análisis Consolidado Semanal</td>
                        <td className="py-3 px-3 text-slate-500 dark:text-slate-400">Gestión Activos</td>
                        <td className="py-3 px-3 text-slate-500 dark:text-slate-400">Quincenal</td>
                        <td className="py-3 px-3 text-slate-500 dark:text-slate-400">Reporte Top 10</td>
                        <td className="py-3 px-3 text-slate-500 dark:text-slate-400">Focalización en unidades críticas</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          {/* Panel de Inteligencia Avanzada y Machine Learning */}
          <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-xl p-6 shadow-lg space-y-4 border border-indigo-500/20">
            <div className="flex items-center gap-2">
              <BrainCircuit className="w-5 h-5 text-indigo-400 animate-pulse" />
              <h2 className="font-bold text-sm uppercase tracking-wider text-indigo-300">
                Panel de Inteligencia Avanzada y Machine Learning (Predictivo)
              </h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* Comparativa de Período */}
              <div className="bg-slate-950/40 border border-slate-800 p-4 rounded-xl space-y-3">
                <h3 className="text-xs font-bold text-slate-400 uppercase">Analítica Comparativa Temporal</h3>
                <div className="space-y-2">
                  <div>
                    <span className="text-[10px] text-slate-500 block">Variación % Ralentí</span>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-black">
                        {stats.pctRalentiDiff > 0 ? `+${stats.pctRalentiDiff.toFixed(2)}%` : `${stats.pctRalentiDiff.toFixed(2)}%`}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${stats.pctRalentiDiff > 0 ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                        {stats.pctRalentiDiff > 0 ? 'Aumento Desperdicio' : 'Ahorro Operativo'}
                      </span>
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block">Variación Financiera Desperdicio</span>
                    <div className="flex items-center gap-2">
                      <span className={`text-base font-bold ${stats.costTotalDiff > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                        {stats.costTotalDiff > 0 ? `+ $${stats.costTotalDiff.toLocaleString('es-CO', { maximumFractionDigits: 0 })}` : `- $${Math.abs(stats.costTotalDiff).toLocaleString('es-CO', { maximumFractionDigits: 0 })}`}
                      </span>
                      <span className="text-[9px] text-slate-400">COP</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Detección de Anomalías (Outliers) */}
              <div className="bg-slate-950/40 border border-slate-800 p-4 rounded-xl space-y-3">
                <h3 className="text-xs font-bold text-slate-400 uppercase">Detección de Anomalías (Outliers)</h3>
                <div className="space-y-2 max-h-[110px] overflow-y-auto pr-1 custom-scrollbar">
                  {stats.anomalies.length === 0 ? (
                    <p className="text-[10px] text-slate-500 italic">No se detectaron vehículos con comportamiento anómalo en este período.</p>
                  ) : (
                    stats.anomalies.map((a, i) => (
                      <div key={i} className="flex justify-between items-center text-[10px] border-b border-slate-900 pb-1">
                        <div>
                          <span className="font-bold text-slate-300 block">Placa: {a.placa}</span>
                          <span className="text-slate-500">{a.count} eventos excesivos</span>
                        </div>
                        <div className="text-right">
                          <span className="text-red-400 font-bold block">{a.totalHours.toFixed(1)} h ralentí</span>
                          <span className="text-[9px] text-slate-500">{(a.excessRatio).toFixed(1)}x vs media</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Regresión y Modelado Predictivo */}
              <div className="bg-slate-950/40 border border-slate-800 p-4 rounded-xl space-y-3">
                <h3 className="text-xs font-bold text-slate-400 uppercase">Modelado de Regresión (Próximo Período)</h3>
                <div className="space-y-2">
                  <div>
                    <span className="text-[10px] text-slate-500 block">Proyección % Ralentí</span>
                    <span className="text-lg font-black text-indigo-400">{stats.predictedPct.toFixed(2)}%</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block">Pérdida Estimada Proyectada</span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-sm font-bold text-slate-300">{stats.predictedGalones.toFixed(1)} Gal</span>
                      <span className="text-[10px] text-slate-500">|</span>
                      <span className="text-xs font-semibold text-slate-400">${stats.predictedCosto.toLocaleString('es-CO', { maximumFractionDigits: 0 })} COP</span>
                    </div>
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

          {/* Details Tables Grid: Drivers & Vehicles */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            
            {/* Top 10 Drivers */}
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm space-y-4">
              <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-emerald-500" /> Clasificación de Conductores con Mayor Desviación en Ralentí
              </h3>
              
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse overflow-hidden rounded-lg">
                  <thead>
                    <tr className="bg-[#003366] text-white text-[10px] font-bold uppercase tracking-wider">
                      <th className="py-3 px-3">Conductor</th>
                      <th className="py-3 px-3">Tiempo Ralentí</th>
                      <th className="py-3 px-3">Mayor Evento</th>
                      <th className="py-3 px-3">Nº Eventos</th>
                      <th className="py-3 px-3">Calificación Estimada</th>
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
                              ({pctTime.toFixed(1)}%)
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

            {/* Top 10 Vehicles */}
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm space-y-4">
              <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm flex items-center gap-2">
                <Truck className="w-4 h-4 text-indigo-500" /> Clasificación de Vehículos con Mayor Desviación en Ralentí
              </h3>
              
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse overflow-hidden rounded-lg">
                  <thead>
                    <tr className="bg-[#003366] text-white text-[10px] font-bold uppercase tracking-wider">
                      <th className="py-3 px-3">Vehículo (Placa)</th>
                      <th className="py-3 px-3">Tipo</th>
                      <th className="py-3 px-3">Tiempo Ralentí</th>
                      <th className="py-3 px-3">Mayor Evento</th>
                      <th className="py-3 px-3">Nº Eventos</th>
                      <th className="py-3 px-3">Calificación Estimada</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60 text-xs">
                    {vehicleData.topByTime.map((v, index) => {
                      const pctTime = (v.totalTime / (stats.totalHorasMotorRalenti * 3600 || 1)) * 100;
                      
                      let vehScore = 100 - (v.totalTime / 3600) * 5; // basic penalty score estimate
                      vehScore = Math.max(0, Math.min(100, vehScore));

                      return (
                        <tr key={index} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-colors">
                          <td className="py-3 px-3 font-semibold text-slate-700 dark:text-slate-300">
                            {v.name}
                          </td>
                          <td className="py-3 px-3 font-medium text-slate-500 dark:text-slate-400 capitalize">
                            {String(v.type).toLowerCase()}
                          </td>
                          <td className="py-3 px-3">
                            <span className="font-bold text-slate-800 dark:text-slate-200">
                              {formatSeconds(v.totalTime)}
                            </span>
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 ml-1.5">
                              ({pctTime.toFixed(1)}%)
                            </span>
                          </td>
                          <td className="py-3 px-3 font-medium text-slate-600 dark:text-slate-400">
                            {formatSeconds(v.maxEvent)}
                          </td>
                          <td className="py-3 px-3 font-semibold text-slate-700 dark:text-slate-300">
                            {v.count}
                          </td>
                          <td className="py-3 px-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              vehScore >= 90 
                                ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400' 
                                : vehScore >= 70 
                                  ? 'bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400' 
                                  : 'bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400'
                            }`}>
                              {vehScore.toFixed(0)} / 100
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </>
      )}
    </div>
  );
};
