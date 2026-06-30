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
  Truck,
  BookOpen,
  Database,
  X
} from 'lucide-react';
import { supabase } from '../../services/supabaseClient';
import { descargarPDFRalenti } from '../../services/pdfTemplates';
import { RalentiAnalisisGeneral } from './RalentiAnalisisGeneral';

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
  tipo_combustible?: string | null;
}

// Factores de emisión de CO₂ por combustión, en kg CO₂ por galón consumido.
// Fuente: Calculadora FECOC (Factores de Emisión de los Combustibles Colombianos), UPME.
//   https://app.upme.gov.co/Calculadora_Emisiones1/new/calculadora.html
// La calculadora deriva el CO₂ por estequiometría del carbono (no es un valor tabulado):
//   kg CO₂/gal = (%C / 100) × (44.0095 / 12.0107) × Densidad[kg/L] × 3.7854118[L/gal]
// Valores tomados del dataset oficial (js/variables.js → combust_liquidos):
//   Diesel B2 (ACPM comercial): %C=85.89, Densidad=0.8519 → 10.15
//   Gasolina Motor:             %C=85.76, Densidad=0.7405 → 8.81
//   GLP Genérico:               %C=83.27, Densidad=0.5599 → 6.47
// El tipo de combustible proviene de la columna "Tipo combustible" de la base de
// vehículos (mapeada a vehiculos.tipo_combustible). El matching es por substring
// para tolerar variantes de captura ("DIESEL", "ACPM", "Gasolina corriente", etc.).
// IMPORTANTE: NO se usan factores promediados ni de respaldo. Si el tipo de combustible
// no está definido o no se reconoce, el galón NO entra al cálculo de CO₂ (se reporta
// aparte como "pendiente por definir"). Solo se emiten cifras con datos reales.
const CO2_FACTORES_GALON: { test: (t: string) => boolean; factor: number }[] = [
  { test: t => t.includes('diesel') || t.includes('diésel') || t.includes('acpm'), factor: 10.15 },
  { test: t => t.includes('gasolina') || t.includes('corriente'), factor: 8.81 },
  { test: t => t.includes('glp') || t.includes('gas licuado'), factor: 6.47 },
  // Eléctrico: cero emisiones por combustión (es un tipo conocido, no un faltante).
  { test: t => t.includes('electric') || t.includes('eléctric'), factor: 0 },
];

// Devuelve el factor kg CO₂/galón del combustible, o null si el tipo no está definido
// o no se reconoce (en cuyo caso ese consumo se excluye del cálculo).
const factorCO2PorGalon = (tipoCombustible?: string | null): number | null => {
  const t = (tipoCombustible ?? '').toLowerCase().trim();
  if (!t) return null;
  const match = CO2_FACTORES_GALON.find(f => f.test(t));
  return match ? match.factor : null;
};

// Precio de referencia del galón de combustible, en COP, DIFERENCIADO por tipo (mismo
// principio que el CO₂: cada galón se valora con el precio de SU combustible, no con un
// promedio plano). Estos valores se mantienen manualmente: actualizarlos cuando cambie
// la regulación del Ministerio de Minas y Energía / SICOM. NO se conectan a una fuente
// externa automática (no existe API oficial estable de precios en Colombia).
// Eléctrico = $0 (no consume combustible líquido). El GLP no se incluye porque la flota
// actual no tiene vehículos de GLP; si se agregaran, cargar aquí su precio vigente.
// Los galones sin tipo definido (o sin precio cargado) NO se estiman: se excluyen del
// costo y se reportan aparte (galonesSinTipo / vehiculosSinTipo). Solo cifras reales.
const PRECIO_COMBUSTIBLE_GALON: { test: (t: string) => boolean; precio: number }[] = [
  { test: t => t.includes('diesel') || t.includes('diésel') || t.includes('acpm'), precio: 11200 },
  { test: t => t.includes('gasolina') || t.includes('corriente'), precio: 16000 },
  { test: t => t.includes('electric') || t.includes('eléctric'), precio: 0 },
];

// Devuelve el precio COP/galón del combustible, o null si el tipo no está definido o no
// tiene precio cargado (en cuyo caso ese consumo se excluye del costo).
const precioCombustiblePorGalon = (tipoCombustible?: string | null): number | null => {
  const t = (tipoCombustible ?? '').toLowerCase().trim();
  if (!t) return null;
  const match = PRECIO_COMBUSTIBLE_GALON.find(f => f.test(t));
  return match ? match.precio : null;
};

// Umbral de "ralentí excesivo" (alerta) por proveedor satelital, en segundos.
// Cada plataforma define la alerta con un umbral propio: Coltrack a partir de 10 min,
// Fagor a partir de 5 min. El conteo de alertas y la analítica de excesos se calcula
// SOLO sobre los eventos que superan el umbral nativo de su proveedor (no se normaliza).
const UMBRAL_RALENTI_SEG: Record<string, number> = { COLTRACK: 600, FAGOR: 300 };
const umbralRalentiSeg = (proveedor?: string | null): number =>
  UMBRAL_RALENTI_SEG[(proveedor ?? '').toUpperCase().trim()] ?? 300;

// Conductores no atribuibles (N/A, no identificado, etc.). Se excluyen de las métricas
// que destacan a un conductor (p. ej. "Mayor evento único"), igual que en los Top.
const PLACEHOLDER_CONDUCTOR = new Set([
  '', 'N/A', 'NA', 'NO REGISTRA', 'NO IDENTIFICADO', 'SIN CONDUCTOR',
  'DESCONOCIDO', 'NO ASIGNADO', 'CONDUCTOR N/A', 'NINGUNO',
]);
const esConductorPlaceholder = (nombre?: string | null): boolean => {
  const n = (nombre ?? '').toUpperCase().trim();
  return PLACEHOLDER_CONDUCTOR.has(n);
};

// Registros cuyo conductor/operador es "Taller" corresponden a vehículos en
// mantenimiento, no a operación real. Se excluyen POR COMPLETO del informe
// (tops y todas las cifras basadas en eventos), no solo de los destacados.
const esConductorTaller = (nombre?: string | null): boolean =>
  (nombre ?? '').toUpperCase().includes('TALLER');

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
  const [search, setSearch] = useState('');
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearch('');
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

  const filteredOptions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter(o => o.label.toLowerCase().includes(q));
  }, [options, search]);

  // "Seleccionar"/"Limpiar" operan sobre lo visible cuando hay búsqueda activa,
  // para que el usuario pueda accionar exactamente sobre los resultados filtrados.
  const handleSelectAll = () => {
    const merged = new Set([...selectedValues, ...filteredOptions.map(o => o.value)]);
    onChange(Array.from(merged));
  };

  const handleClearAll = () => {
    if (search.trim()) {
      const toRemove = new Set(filteredOptions.map(o => o.value));
      onChange(selectedValues.filter(v => !toRemove.has(v)));
    } else {
      onChange([]);
    }
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

  const hasSelection = selectedValues.length > 0;
  const isPartial = hasSelection && selectedValues.length < options.length;

  return (
    <div ref={dropdownRef} className="relative w-full">
      <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">{label}</label>
      <button
        type="button"
        onClick={() => { setIsOpen(o => !o); setSearch(''); }}
        className={`w-full px-3 py-2 text-xs border rounded-lg bg-white dark:bg-slate-800 outline-none flex justify-between items-center text-left shadow-sm transition-colors ${isOpen ? 'border-emerald-500 ring-1 ring-emerald-500' : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'}`}
      >
        <span className={`truncate pr-2 ${hasSelection ? 'text-slate-900 dark:text-slate-100 font-medium' : 'text-slate-400 dark:text-slate-500'}`}>{displayText}</span>
        <span className="flex items-center gap-1.5 shrink-0">
          {isPartial && (
            <span className="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none">{selectedValues.length}</span>
          )}
          <span className="text-slate-400 text-[8px] transform transition-transform duration-200" style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
        </span>
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl overflow-hidden">
          <div className="p-2 border-b border-slate-100 dark:border-slate-700/60">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar..."
                className="w-full pl-8 pr-2 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-md bg-slate-50 dark:bg-slate-900/40 text-slate-900 dark:text-slate-100 outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>
          <div className="flex justify-between items-center py-1.5 px-3 border-b border-slate-100 dark:border-slate-700/60">
            <button
              type="button"
              onClick={handleSelectAll}
              className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
            >
              {search.trim() ? 'Seleccionar visibles' : 'Seleccionar Todos'}
            </button>
            <button
              type="button"
              onClick={handleClearAll}
              className="text-[10px] font-bold text-slate-500 dark:text-slate-400 hover:underline"
            >
              {search.trim() ? 'Quitar visibles' : 'Limpiar'}
            </button>
          </div>
          <div className="max-h-56 overflow-y-auto p-2 space-y-1">
            {filteredOptions.length === 0 ? (
              <div className="text-center text-[11px] text-slate-400 py-4">Sin resultados</div>
            ) : (
              filteredOptions.map(opt => {
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
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

interface SearchableSelectProps {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  allLabel?: string;
}

// Selector de un solo valor con buscador integrado (reemplaza al <select> nativo
// para mantener una experiencia consistente con los dropdowns multi-selección).
const SearchableSelect: React.FC<SearchableSelectProps> = ({
  label,
  options,
  value,
  onChange,
  placeholder = 'Buscar...',
  allLabel = 'Todos',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter(o => o.label.toLowerCase().includes(q));
  }, [options, search]);

  const selectedLabel = value ? (options.find(o => o.value === value)?.label ?? value) : allLabel;

  const handleSelect = (val: string) => {
    onChange(val);
    setIsOpen(false);
    setSearch('');
  };

  return (
    <div ref={dropdownRef} className="relative w-full">
      <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">{label}</label>
      <button
        type="button"
        onClick={() => { setIsOpen(o => !o); setSearch(''); }}
        className={`w-full px-3 py-2 text-xs border rounded-lg bg-white dark:bg-slate-800 outline-none flex justify-between items-center text-left shadow-sm transition-colors ${isOpen ? 'border-emerald-500 ring-1 ring-emerald-500' : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'}`}
      >
        <span className={`truncate pr-2 ${value ? 'text-slate-900 dark:text-slate-100 font-medium' : 'text-slate-400 dark:text-slate-500'}`}>{selectedLabel}</span>
        <span className="shrink-0 text-slate-400 text-[8px] transform transition-transform duration-200" style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl overflow-hidden">
          <div className="p-2 border-b border-slate-100 dark:border-slate-700/60">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={placeholder}
                className="w-full pl-8 pr-2 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-md bg-slate-50 dark:bg-slate-900/40 text-slate-900 dark:text-slate-100 outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto p-2 space-y-1">
            <button
              type="button"
              onClick={() => handleSelect('')}
              className={`w-full text-left px-2 py-1.5 rounded-md text-xs transition-colors ${!value ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 font-semibold' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/40'}`}
            >
              {allLabel}
            </button>
            {filteredOptions.length === 0 ? (
              <div className="text-center text-[11px] text-slate-400 py-4">Sin resultados</div>
            ) : (
              filteredOptions.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleSelect(opt.value)}
                  className={`w-full text-left px-2 py-1.5 rounded-md text-xs transition-colors truncate ${value === opt.value ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 font-semibold' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/40'}`}
                >
                  {opt.label}
                </button>
              ))
            )}
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
  // View mode: period report or general analysis across all periods
  const [activeView, setActiveView] = useState<'periodo' | 'general'>('periodo');

  // Filter States
  const [year, setYear] = useState<number>(2026);
  const [month, setMonth] = useState<number>(4); // Default to April, where our test data resides
  const [quincena, setQuincena] = useState<'1' | '2' | 'all'>('1');
  const [selectedClients, setSelectedClients] = useState<string[]>([]);
  const [selectedContracts, setSelectedContracts] = useState<string[]>([]);
  const [selectedVehicleTypes, setSelectedVehicleTypes] = useState<string[]>([]);
  const [placa, setPlaca] = useState<string>('');

  // Dropdown list options
  const [contracts, setContracts] = useState<ContractOption[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);

  // Telemetry Data
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Guía técnica de cálculo (colapsable)
  const [showTechGuide, setShowTechGuide] = useState<boolean>(false);
  
  // Summary Metrics from reportes_vehiculos/ralentis_periodos
  const [summaryMetrics, setSummaryMetrics] = useState<{
    totalHorasMotorEncendido: number;
    totalHorasMotorRalenti: number;
    totalGalonesConsumidos: number;
    totalRalentisExcesivos: number;
    galonesPorCombustible: Record<string, number>;
    galonesSinTipo: number;
    vehiculosSinTipo: number;
    totalVehiculosEvaluados: number;
  }>({
    totalHorasMotorEncendido: 0,
    totalHorasMotorRalenti: 0,
    totalGalonesConsumidos: 0,
    totalRalentisExcesivos: 0,
    galonesPorCombustible: {},
    galonesSinTipo: 0,
    vehiculosSinTipo: 0,
    totalVehiculosEvaluados: 0,
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

  // Opciones de Cliente derivadas de la base de vehículos (columna "cliente").
  const clientOptions = useMemo(() => {
    const set = new Set<string>();
    vehicles.forEach(v => {
      if (v.cliente) {
        const trimmed = v.cliente.trim();
        if (trimmed) set.add(trimmed);
      }
    });
    return Array.from(set).sort().map(c => ({ value: c, label: c }));
  }, [vehicles]);

  // Vehículos disponibles para el selector individual, respetando los filtros
  // de cliente, contrato y tipo activos (para no ofrecer placas fuera del alcance).
  const vehicleSelectOptions = useMemo(() => {
    const isContractFilterActive = selectedContracts.length > 0 && selectedContracts.length < contracts.length;
    const isTypeFilterActive = selectedVehicleTypes.length > 0 && selectedVehicleTypes.length < vehicleTypesOptions.length;
    const isClientFilterActive = selectedClients.length > 0 && selectedClients.length < clientOptions.length;
    return vehicles
      .filter(v => {
        const matchesClient = !isClientFilterActive || (v.cliente && selectedClients.includes(v.cliente.trim()));
        const matchesContract = !isContractFilterActive || (v.contrato_id && selectedContracts.includes(v.contrato_id));
        const matchesType = !isTypeFilterActive || (v.tipo_activo && selectedVehicleTypes.includes(v.tipo_activo.trim()));
        return matchesClient && matchesContract && matchesType;
      })
      .map(v => ({ value: v.id, label: v.placa }));
  }, [vehicles, selectedClients, clientOptions, selectedContracts, contracts, selectedVehicleTypes, vehicleTypesOptions]);

  // Fetch initial dropdown data
  useEffect(() => {
    const fetchDropdowns = async () => {
      try {
        const { data: dbContracts } = await supabase
          .from('contratos')
          .select('id, nombre')
          .order('nombre');
        if (dbContracts) setContracts(dbContracts);

        // Paginado para soportar flotas de más de 1000 vehículos (límite por request de Supabase).
        // Es indispensable traer la flota completa: el tipo de combustible de cada vehículo
        // se resuelve contra este arreglo para aplicar el factor de emisión correcto.
        const pageSize = 1000;
        const allVehicles: VehicleOption[] = [];
        for (let page = 0; ; page++) {
          const from = page * pageSize;
          const { data: chunk, error: vehErr } = await supabase
            .from('vehiculos')
            .select('id, placa, cliente, contrato_id, tipo_activo, tipo_combustible')
            .order('placa')
            .range(from, from + pageSize - 1);
          if (vehErr) throw vehErr;
          if (!chunk || chunk.length === 0) break;
          allVehicles.push(...(chunk as VehicleOption[]));
          if (chunk.length < pageSize) break;
        }
        setVehicles(allVehicles);
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
      const isClientFilterActive = selectedClients.length > 0 && selectedClients.length < clientOptions.length;
      const isContractFilterActive = selectedContracts.length > 0 && selectedContracts.length < contracts.length;
      const isTypeFilterActive = selectedVehicleTypes.length > 0 && selectedVehicleTypes.length < vehicleTypesOptions.length;
      const hasFilters = isClientFilterActive || isContractFilterActive || isTypeFilterActive;

      // Valores crudos (sin trim) de cliente para filtrar contra la BD, tolerando
      // variantes con espacios — mismo criterio que se usa para tipo de activo.
      const rawClients = new Set<string>();
      if (isClientFilterActive) {
        selectedClients.forEach(c => {
          vehicles.forEach(v => {
            if (v.cliente && v.cliente.trim() === c) rawClients.add(v.cliente);
          });
        });
      }

      if (hasFilters) {
        let filteredVeh = vehicles;
        if (isClientFilterActive) {
          filteredVeh = filteredVeh.filter(v => v.cliente && selectedClients.includes(v.cliente.trim()));
        }
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
            galonesPorCombustible: {},
            galonesSinTipo: 0,
            vehiculosSinTipo: 0,
            totalVehiculosEvaluados: 0,
          });
          setEvents([]);
          setLoading(false);
          return;
        }
      }

      // 2. Fetch vehicle summary statistics for the period
      const fields = hasFilters 
        ? 'vehiculo_id, horas_motor_encendido, horas_motor_ralenti, consumo_combustible, ralentis_excesivos, vehiculos!inner(contrato_id, tipo_activo, cliente)'
        : 'vehiculo_id, horas_motor_encendido, horas_motor_ralenti, consumo_combustible, ralentis_excesivos';

      let repVehQuery = supabase.from('ralentis_periodos')
        .select(fields)
        .gte('periodo_inicio', dateStart)
        .lte('periodo_fin', dateEnd);

      if (placa) {
        repVehQuery = repVehQuery.eq('vehiculo_id', placa);
      } else if (hasFilters) {
        if (isClientFilterActive) {
          repVehQuery = repVehQuery.in('vehiculos.cliente', Array.from(rawClients));
        }
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
        ? 'vehiculo_id, horas_motor_encendido, horas_motor_ralenti, consumo_combustible, vehiculos!inner(contrato_id, tipo_activo, cliente)'
        : 'vehiculo_id, horas_motor_encendido, horas_motor_ralenti, consumo_combustible';

      let prevVehQuery = supabase.from('ralentis_periodos')
        .select(prevFields)
        .gte('periodo_inicio', prevStart)
        .lte('periodo_fin', prevEnd);

      if (placa) {
        prevVehQuery = prevVehQuery.eq('vehiculo_id', placa);
      } else if (hasFilters) {
        if (isClientFilterActive) {
          prevVehQuery = prevVehQuery.in('vehiculos.cliente', Array.from(rawClients));
        }
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

      const filteredRepVehs: any[] = repVehRes.data ?? [];
      const prevRepVehs: any[] = prevVehRes.data ?? [];

      // Sum metrics
      const sumEncendido = filteredRepVehs.reduce((acc, r) => acc + (Number(r.horas_motor_encendido) || 0), 0);
      const sumRalenti = filteredRepVehs.reduce((acc, r) => acc + (Number(r.horas_motor_ralenti) || 0), 0);
      const sumGalones = filteredRepVehs.reduce((acc, r) => acc + (Number(r.consumo_combustible) || 0), 0);
      const sumExcesivos = filteredRepVehs.reduce((acc, r) => acc + (Number(r.ralentis_excesivos) || 0), 0);

      // Agrupar galones por tipo de combustible para emisiones diferenciadas (FECOC/UPME).
      // El tipo se resuelve por vehiculo_id contra la base de vehículos ("Tipo combustible").
      const vehFuelMap = new Map<string, string>();
      vehicles.forEach(v => vehFuelMap.set(String(v.id), (v.tipo_combustible ?? '').trim()));

      // Agrupamos por tipo y, en paralelo, contamos los vehículos/galones cuyo tipo de
      // combustible NO está definido o no se reconoce: esos NO entran al cálculo de CO₂
      // (no se promedia), sino que se reportan aparte como "pendiente por definir".
      const galonesPorCombustible: Record<string, number> = {};
      let galonesSinTipo = 0;
      let vehiculosSinTipo = 0;
      filteredRepVehs.forEach((r: any) => {
        const tipo = vehFuelMap.get(String(r.vehiculo_id)) || '';
        const key = (tipo || 'NO REGISTRA').toUpperCase();
        const gal = Number(r.consumo_combustible) || 0;
        galonesPorCombustible[key] = (galonesPorCombustible[key] ?? 0) + gal;
        if (factorCO2PorGalon(tipo) === null) {
          galonesSinTipo += gal;
          vehiculosSinTipo += 1;
        }
      });

      const prevSumEncendido = prevRepVehs.reduce((acc, r) => acc + (Number(r.horas_motor_encendido) || 0), 0);
      const prevSumRalenti = prevRepVehs.reduce((acc, r) => acc + (Number(r.horas_motor_ralenti) || 0), 0);
      const prevSumGalones = prevRepVehs.reduce((acc, r) => acc + (Number(r.consumo_combustible) || 0), 0);

      // Vehículos evaluados: cantidad de vehículos distintos con datos en el período.
      const totalVehiculosEvaluados = new Set(
        filteredRepVehs.map((r: any) => String(r.vehiculo_id))
      ).size;

      setSummaryMetrics({
        totalHorasMotorEncendido: sumEncendido,
        totalHorasMotorRalenti: sumRalenti,
        totalGalonesConsumidos: sumGalones,
        totalRalentisExcesivos: sumExcesivos,
        galonesPorCombustible,
        galonesSinTipo,
        vehiculosSinTipo,
        totalVehiculosEvaluados,
      });

      setPrevSummaryMetrics({
        totalHorasMotorEncendido: prevSumEncendido,
        totalHorasMotorRalenti: prevSumRalenti,
        totalGalonesConsumidos: prevSumGalones,
      });

      // 3. Fetch detailed ralentis_eventos (paginated in parallel to bypass the default 1000 limit)
      const eventFields = hasFilters
        ? '*, vehiculos!inner(contrato_id, tipo_activo, cliente)'
        : '*';

      let countQuery = supabase.from('ralentis_eventos')
        .select(eventFields, { count: 'exact', head: true })
        .gte('fecha_inicio', `${dateStart}T00:00:00Z`)
        .lte('fecha_inicio', `${dateEnd}T23:59:59Z`);

      if (placa) {
        countQuery = countQuery.eq('vehiculo_id', placa);
      } else if (hasFilters) {
        if (isClientFilterActive) {
          countQuery = countQuery.in('vehiculos.cliente', Array.from(rawClients));
        }
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
        ? 'id, placa, conductor_nombre, fecha_inicio, fecha_fin, duracion_segundos, galones_consumidos, ubicacion, proveedor, vehiculo_id, conductor_id, vehiculos!inner(contrato_id, tipo_activo, cliente)'
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
          if (isClientFilterActive) {
            evQuery = evQuery.in('vehiculos.cliente', Array.from(rawClients));
          }
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
  }, [year, month, quincena, selectedClients, selectedContracts, selectedVehicleTypes, placa, vehicles, contracts, clientOptions, vehicleTypesOptions]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Comparativo de galones consumidos en ralentí a través de TODOS los períodos.
  // A diferencia del resto del informe, este dataset IGNORA el filtro de período
  // (year/month/quincena) y trae el histórico completo. Sí respeta los demás
  // filtros de alcance (cliente/contrato/tipo/placa) para mantener la coherencia
  // con el ámbito del informe. Se usa exclusivamente para el gráfico del PDF.
  const fetchPeriodComparison = useCallback(async (): Promise<Array<{ label: string; galones: number }>> => {
    const isClientFilterActive = selectedClients.length > 0 && selectedClients.length < clientOptions.length;
    const isContractFilterActive = selectedContracts.length > 0 && selectedContracts.length < contracts.length;
    const isTypeFilterActive = selectedVehicleTypes.length > 0 && selectedVehicleTypes.length < vehicleTypesOptions.length;
    const hasFilters = isClientFilterActive || isContractFilterActive || isTypeFilterActive;

    const rawClients = new Set<string>();
    if (isClientFilterActive) {
      selectedClients.forEach(c => {
        vehicles.forEach(v => { if (v.cliente && v.cliente.trim() === c) rawClients.add(v.cliente); });
      });
    }
    const rawTypes = new Set<string>();
    if (isTypeFilterActive) {
      selectedVehicleTypes.forEach(t => {
        vehicles.forEach(v => { if (v.tipo_activo && v.tipo_activo.trim() === t) rawTypes.add(v.tipo_activo); });
      });
    }

    const selectFields = hasFilters
      ? 'periodo_inicio, periodo_fin, consumo_combustible, vehiculos!inner(contrato_id, tipo_activo, cliente)'
      : 'periodo_inicio, periodo_fin, consumo_combustible';

    // Paginado para superar el límite de 1000 filas por request (todo el histórico).
    const pageSize = 1000;
    const rows: any[] = [];
    for (let page = 0; ; page++) {
      const from = page * pageSize;
      let q = supabase.from('ralentis_periodos')
        .select(selectFields)
        .order('periodo_inicio', { ascending: true })
        .range(from, from + pageSize - 1);

      if (placa) {
        q = q.eq('vehiculo_id', placa);
      } else if (hasFilters) {
        if (isClientFilterActive) q = q.in('vehiculos.cliente', Array.from(rawClients));
        if (isContractFilterActive) q = q.in('vehiculos.contrato_id', selectedContracts);
        if (isTypeFilterActive) q = q.in('vehiculos.tipo_activo', Array.from(rawTypes));
      }

      const { data, error } = await q;
      if (error) throw error;
      if (!data || data.length === 0) break;
      rows.push(...data);
      if (data.length < pageSize) break;
    }

    // El módulo de ralentí trabaja SIEMPRE por quincenas: Q1 = 1→15 y Q2 = 16→fin
    // de mes (igual que el "Informe por Período"). En ralentis_periodos conviven
    // períodos de OTRA procedencia —el informe mensual usa ciclos tipo 29→28— que
    // NO corresponden a ralentí y distorsionan el comparativo. Este guard deja pasar
    // únicamente las quincenas reales (misma lógica que RalentiAnalisisGeneral).
    const isQuincenaPeriodo = (inicio: string, fin: string): boolean => {
      const [yi, mi, di] = inicio.split('-').map(Number);
      const [yf, mf, df] = fin.split('-').map(Number);
      if (!yi || !yf || yi !== yf || mi !== mf) return false; // debe iniciar y terminar en el mismo mes
      const ultimoDia = new Date(yi, mi, 0).getDate();
      return (di === 1 && df === 15) || (di === 16 && df === ultimoDia);
    };

    // Agrupar por período (par periodo_inicio/periodo_fin) y sumar galones,
    // EXCLUYENDO todo lo que no sea una quincena de ralentí.
    const byPeriod = new Map<string, { inicio: string; fin: string; galones: number }>();
    rows.forEach((r: any) => {
      const inicio = String(r.periodo_inicio ?? '').slice(0, 10);
      const fin = String(r.periodo_fin ?? '').slice(0, 10);
      if (!inicio || !fin || !isQuincenaPeriodo(inicio, fin)) return;
      const key = `${inicio}|${fin}`;
      const cur = byPeriod.get(key) ?? { inicio, fin, galones: 0 };
      cur.galones += Number(r.consumo_combustible) || 0;
      byPeriod.set(key, cur);
    });

    const mesesAbbr = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    // Solo llegan quincenas válidas, por lo que el día de inicio basta para el rótulo.
    const periodLabel = (inicio: string): string => {
      const [year, month, day] = inicio.split('-').map(Number);
      const mes = mesesAbbr[(month ?? 1) - 1] ?? '';
      const yy = String(year).slice(2);
      const q = day <= 15 ? 'Q1' : 'Q2';
      return `${mes} ${q} '${yy}`;
    };

    return Array.from(byPeriod.values())
      .sort((a, b) => a.inicio.localeCompare(b.inicio))
      .map(p => ({ label: periodLabel(p.inicio), galones: Number(p.galones.toFixed(1)) }))
      .slice(-12); // últimos 12 períodos para mantener el gráfico legible
  }, [selectedClients, clientOptions, selectedContracts, contracts, selectedVehicleTypes, vehicleTypesOptions, placa, vehicles]);

  const daysInPeriod = useMemo(() => {
    if (quincena === '1') return 15;
    const lastDay = new Date(year, month, 0).getDate();
    if (quincena === '2') return lastDay - 15;
    return lastDay;
  }, [year, month, quincena]);

  // Eventos que constituyen "alerta de ralentí" según el umbral NATIVO de cada proveedor
  // (Coltrack ≥10 min, Fagor ≥5 min). Toda la analítica de excesos se calcula sobre este conjunto,
  // no sobre los eventos crudos (que incluyen ralentís cortos por debajo del umbral de alerta).
  const alertEvents = useMemo(
    () => events.filter(e =>
      !esConductorTaller(e.conductor_nombre) &&
      e.duracion_segundos >= umbralRalentiSeg(e.proveedor)
    ),
    [events]
  );

  const stats = useMemo(() => {
    const { totalHorasMotorEncendido, totalHorasMotorRalenti, totalGalonesConsumidos } = summaryMetrics;

    // Nº de alertas de ralentí = eventos que superan el umbral nativo de su proveedor.
    // NO se usa el conteo del agregado (que incluye todos los ralentís, no solo las alertas).
    const totalRalentisExcesivos = alertEvents.length;

    // Horas en ralentí excesivo: suma real de la duración de los eventos que son alerta.
    const segundosRalentiMas5Min = alertEvents.reduce((acc, e) => acc + e.duracion_segundos, 0);
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

    // Huella de carbono diferenciada por tipo de combustible (FECOC/UPME): se aplica
    // el factor kg CO₂/galón propio de cada combustible SOLO sobre los galones cuyo tipo
    // está definido y reconocido. Los galones sin tipo NO se promedian ni se estiman: se
    // excluyen del CO₂ y se reportan aparte (galonesSinTipo / vehiculosSinTipo).
    const galonesPorCombustible = summaryMetrics.galonesPorCombustible ?? {};
    const galonesSinTipo = summaryMetrics.galonesSinTipo ?? 0;
    const vehiculosSinTipo = summaryMetrics.vehiculosSinTipo ?? 0;
    // Galones realmente clasificados (con factor conocido, incluido eléctrico = 0).
    const galonesClasificados = Math.max(totalGalonesConsumidos - galonesSinTipo, 0);
    const co2Kg = Object.entries(galonesPorCombustible).reduce((acc, [tipo, gal]) => {
      const f = factorCO2PorGalon(tipo);
      return f === null ? acc : acc + gal * f;
    }, 0);
    // Factor de distribución del CO₂ real sobre el total de galones, para que la suma
    // de la tendencia diaria y del desglose por proveedor reconcilie con co2Kg.
    const co2FactorEfectivo = totalGalonesConsumidos > 0 ? co2Kg / totalGalonesConsumidos : 0;

    // Costo del combustible DIFERENCIADO por tipo (mismo principio que el CO₂): cada
    // galón se valora con el precio de SU combustible (diésel ≠ gasolina), SOLO sobre los
    // galones cuyo tipo está definido y tiene precio cargado. Los galones sin tipo/precio
    // NO se estiman: quedan fuera del costo (se reportan en galonesSinTipo). Eléctrico=$0.
    const costTotal = Object.entries(galonesPorCombustible).reduce((acc, [tipo, gal]) => {
      const p = precioCombustiblePorGalon(tipo);
      return p === null ? acc : acc + gal * p;
    }, 0);
    const costAvgDaily = daysInPeriod > 0 ? costTotal / daysInPeriod : 0;
    // Precio efectivo (mezcla real) por galón consumido, para reconciliar la proyección y
    // la comparación con el periodo anterior (que solo guarda el total de galones, sin
    // desglose por combustible). Diluye el costo sobre TODOS los galones, igual que
    // co2FactorEfectivo hace con el CO₂.
    const costFactorEfectivo = totalGalonesConsumidos > 0 ? costTotal / totalGalonesConsumidos : 0;
    const treesEquivalent = co2Kg / 22; // Trees formula

    // "Mayor evento único" se mide solo entre eventos con conductor identificado
    // (se excluyen N/A, No registra, etc.), igual que los Top de conductores.
    // Se conserva el evento completo para poder mostrar el conductor y la placa.
    const alertEventsConConductor = alertEvents.filter(e => !esConductorPlaceholder(e.conductor_nombre));
    let mayorEvento: IdlingEvent | null = null;
    for (const e of alertEventsConConductor) {
      if (!mayorEvento || e.duracion_segundos > mayorEvento.duracion_segundos) mayorEvento = e;
    }
    const mayorEventoSegundos = mayorEvento ? mayorEvento.duracion_segundos : 0;
    const mayorEventoConductor = mayorEvento ? mayorEvento.conductor_nombre : 'No registra';
    const mayorEventoPlaca = mayorEvento ? mayorEvento.placa : '';

    const totalDuracionEventosSegundos = alertEvents.reduce((acc, e) => acc + e.duracion_segundos, 0);
    const promedioEventoSegundos = alertEvents.length > 0
      ? totalDuracionEventosSegundos / alertEvents.length
      : 0;

    const eventosMas30Min = alertEvents.filter(e => e.duracion_segundos > 1800).length;

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
    const costTotalDiff = costTotal - (prevSummaryMetrics.totalGalonesConsumidos * costFactorEfectivo);

    // Anomaly Outliers Detection (Mean + 1.2 * StdDev)
    const vehicleSummaryMap = new Map<string, { totalTime: number; count: number }>();
    alertEvents.forEach(e => {
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
    const predictedCosto = predictedGalones * costFactorEfectivo;

    const vehMap = new Map<string, number>();
    alertEvents.forEach(e => {
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
      co2FactorEfectivo,
      treesEquivalent,
      galonesClasificados,
      galonesSinTipo,
      vehiculosSinTipo,
      mayorEventoSegundos,
      mayorEventoConductor,
      mayorEventoPlaca,
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
  }, [summaryMetrics, alertEvents, daysInPeriod, prevSummaryMetrics]);

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

    alertEvents.forEach(e => {
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
  }, [alertEvents]);

  // Group events by vehicle and compute metrics
  const vehicleData = useMemo(() => {
    const vehicleMap = new Map<string, { totalTime: number; maxEvent: number; count: number; name: string; type: string }>();

    alertEvents.forEach(e => {
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
  }, [alertEvents, vehicles]);

  // Daily CO2 trend logic (distribute total summary gallons over events timeline)
  const dailyCO2Trend = useMemo(() => {
    const dailyDurations = new Map<string, number>();
    alertEvents.forEach(e => {
      const dateKey = String(e.fecha_inicio ?? '').slice(0, 10);
      if (dateKey) {
        dailyDurations.set(dateKey, (dailyDurations.get(dateKey) ?? 0) + e.duracion_segundos);
      }
    });

    // Sort dates chronologically
    const sortedDates = Array.from(dailyDurations.keys()).sort();
    
    // Total duration of all detailed events
    const totalEventSecs = alertEvents.reduce((acc, e) => acc + e.duracion_segundos, 0);

    let cumulativeCO2 = 0;
    const dataPoints: { date: string; value: number }[] = [];

    sortedDates.forEach(date => {
      const duration = dailyDurations.get(date) ?? 0;
      
      // Distribute total gallons proportionally to this day's duration
      const galonesDia = totalEventSecs > 0 
        ? (duration / totalEventSecs) * stats.totalGalonesConsumidos 
        : 0;

      const co2KgDia = galonesDia * stats.co2FactorEfectivo;
      cumulativeCO2 += co2KgDia;
      
      dataPoints.push({
        date: date.slice(5), // Keep MM-DD for label
        value: Number(cumulativeCO2.toFixed(1)),
      });
    });

    return dataPoints;
  }, [alertEvents, stats.totalGalonesConsumidos, stats.co2FactorEfectivo]);

  // Group CO2 by provider/platform
  const providerCO2Data = useMemo(() => {
    const provMap = new Map<string, number>();
    alertEvents.forEach(e => {
      const prov = e.proveedor || 'COLTRACK';
      provMap.set(prov, (provMap.get(prov) ?? 0) + e.duracion_segundos);
    });

    const totalEventSecs = alertEvents.reduce((acc, e) => acc + e.duracion_segundos, 0);

    return Array.from(provMap.entries()).map(([provider, secs]) => {
      const galones = totalEventSecs > 0 
        ? (secs / totalEventSecs) * stats.totalGalonesConsumidos 
        : 0;
      const co2Kg = galones * stats.co2FactorEfectivo;
      return {
        name: provider,
        co2Tons: Number((co2Kg / 1000).toFixed(3)),
      };
    });
  }, [alertEvents, stats.totalGalonesConsumidos, stats.co2FactorEfectivo]);

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
            const isClientSel = selectedClients.length > 0 && selectedClients.length < clientOptions.length;
            const isContractSel = selectedContracts.length > 0 && selectedContracts.length < contracts.length;
            const isTypeSel = selectedVehicleTypes.length > 0 && selectedVehicleTypes.length < vehicleTypesOptions.length;

            const clienteNombre = !isClientSel
              ? 'Todos los clientes'
              : selectedClients.length <= 2
                ? selectedClients.join(', ')
                : `Multicliente (${selectedClients.length})`;

            // Contratos a mostrar: si se seleccionó contrato explícitamente, ese(esos);
            // si no, pero hay un cliente (grupo) seleccionado, los contratos de ese grupo;
            // en su defecto, todos.
            let contratoNombre: string;
            if (isContractSel) {
              contratoNombre = selectedContracts.length <= 3
                ? selectedContracts.map(cid => contracts.find(c => c.id === cid)?.nombre ?? '').filter(Boolean).join(', ')
                : `Multicontrato (${selectedContracts.length})`;
            } else if (isClientSel) {
              const ids = new Set<string>();
              vehicles.forEach(v => {
                if (v.cliente && selectedClients.includes(v.cliente.trim()) && v.contrato_id) ids.add(v.contrato_id);
              });
              const nombres = Array.from(ids)
                .map(id => contracts.find(c => c.id === id)?.nombre)
                .filter(Boolean) as string[];
              contratoNombre = nombres.length > 0 ? nombres.sort().join(', ') : 'Todos los contratos';
            } else {
              contratoNombre = 'Todos los contratos';
            }

            const tiposNombre = !isTypeSel ? 'Todos los tipos' : selectedVehicleTypes.join(', ');

            const vehMap = new Map<string, number>();
            alertEvents.forEach(e => {
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
              alertEvents.reduce((map, e) => {
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

            // Comparativo histórico transversal (no obedece al filtro de período).
            // Si falla, no se bloquea la generación del PDF: el gráfico mostrará un
            // mensaje de datos insuficientes.
            let periodComparison: Array<{ label: string; galones: number }> = [];
            try {
              periodComparison = await fetchPeriodComparison();
            } catch (e) {
              console.error('Error construyendo el comparativo de períodos para el PDF:', e);
            }

            const data = {
              periodoLabel,
              periodoInicio: dateStart,
              periodoFin: dateEnd,
              fechaReporte: new Date().toISOString(),
              pctRalenti: stats.pctRalenti,
              totalHorasMotorEncendido: summaryMetrics.totalHorasMotorEncendido,
              totalHorasMotorRalenti: summaryMetrics.totalHorasMotorRalenti,
              totalGalonesConsumidos: summaryMetrics.totalGalonesConsumidos,
              totalRalentisExcesivos: stats.totalRalentisExcesivos,
              totalVehiculosEvaluados: summaryMetrics.totalVehiculosEvaluados,
              totalEventos: alertEvents.length,
              costTotal: stats.costTotal,
              costAvgDaily: stats.costAvgDaily,
              co2Kg: stats.co2Kg,
              treesEquivalent: stats.treesEquivalent,
              mayorEventoSegundos: stats.mayorEventoSegundos,
              mayorEventoConductor: stats.mayorEventoConductor,
              promedioEventoSegundos: stats.promedioEventoSegundos,
              eventosMas30Min: stats.eventosMas30Min,
              riskLevel: stats.riskLevel,
              fapRisk: stats.fapRisk,
              topByTime: topByTimePDF,
              topByMax: topByMaxPDF,
              providerCO2: providerCO2Data,
              dailyCO2Trend: dailyCO2Trend,
              periodComparison,
              contratoNombre,
              clienteNombre,
              tiposNombre,
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

      {/* View Tab Switcher */}
      <div className="no-print flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1 w-fit border border-slate-200 dark:border-slate-700">
        <button
          onClick={() => setActiveView('periodo')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
            activeView === 'periodo'
              ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          Informe por Período
        </button>
        <button
          onClick={() => setActiveView('general')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
            activeView === 'general'
              ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5" />
          Análisis General
        </button>
      </div>

      {/* Filter Bar — only shown in "por período" view */}
      {activeView === 'periodo' && <div className="no-print bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3 shadow-sm">
        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-semibold text-sm">
          <Filter className="w-4 h-4 text-emerald-500" />
          <span>Filtros Gerenciales</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {activeView === 'periodo' && (
            <>
              {/* Year */}
              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">Año</label>
                <select
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  {Array.from({ length: 4 }, (_, i) => new Date().getFullYear() - 1 + i).map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
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
            </>
          )}

          {/* Client */}
          <MultiSelectDropdown
            label="Clientes"
            options={clientOptions}
            selectedValues={selectedClients}
            onChange={(vals) => { setSelectedClients(vals); setPlaca(''); }}
            placeholder="Todos los clientes"
          />

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

          {/* Vehicle — solo en vista por período */}
          {activeView === 'periodo' && (
            <SearchableSelect
              label="Vehículo (Matrícula)"
              options={vehicleSelectOptions}
              value={placa}
              onChange={setPlaca}
              placeholder="Buscar placa..."
              allLabel="Todos los vehículos"
            />
          )}
        </div>
      </div>}

      {activeView === 'general' ? (
        <RalentiAnalisisGeneral
          vehicles={vehicles}
          contracts={contracts}
        />
      ) : loading ? (
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
                  <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider">% Total de Ralentí</span>
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
                Cálculo: (Horas Motor Ralentí / Horas Motor Encendido) × 100. Proporción del tiempo total de motor encendido en ralentí.
              </div>
            </div>

            {/* Card 2: Galones consumidos en ralentí */}
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm space-y-3 relative overflow-hidden group flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex justify-between items-start">
                  <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider">Galones Consumidos en Ralentí</span>
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
                Cálculo: (Galones por combustible × precio de su tipo) / Días. Diésel $11.200 y gasolina $16.000 COP/Gal. Impacto financiero diario del ralentí.
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
                  <span className="text-[9px] uppercase font-bold text-slate-400 dark:text-slate-500 block">Alertas de Ralentí (≥ umbral por proveedor)</span>
                  <span className="text-lg font-black text-slate-700 dark:text-slate-200 mt-1 block">
                    {alertEvents.length}
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
                    {(stats.co2Kg / 1000).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Tn
                  </span>
                  <span className="text-xs text-emerald-200">De emisiones de CO₂ generadas</span>
                  <span className="text-[10px] text-emerald-200/80 block pt-1">
                    Cálculo real con factores FECOC/UPME, solo sobre vehículos con tipo de combustible definido ({stats.galonesClasificados.toLocaleString('es-CO', { maximumFractionDigits: 0 })} gal).
                  </span>
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

              {stats.vehiculosSinTipo > 0 && (
                <div className="bg-amber-400/15 border border-amber-300/40 rounded-xl p-3 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-200 shrink-0 mt-0.5" />
                  <div className="text-[10px] leading-snug text-amber-50">
                    <strong className="block text-amber-100">
                      {stats.vehiculosSinTipo} vehículo(s) sin tipo de combustible definido
                    </strong>
                    Sus {stats.galonesSinTipo.toLocaleString('es-CO', { maximumFractionDigits: 1 })} gal NO se incluyen en el CO₂ (no se estima con promedios). Defínelos en la base de vehículos para un cálculo completo.
                  </div>
                </div>
              )}
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
                        <td className="py-3 px-3 font-semibold text-slate-700 dark:text-slate-300">% Total de Ralentí</td>
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
                        <td className="py-3 px-3 font-semibold text-slate-700 dark:text-slate-300">Combustible consumido en ralentí (gal)</td>
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

          {/* Methodology & Sources */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm space-y-4">
            <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm flex items-center gap-2">
              <Info className="w-4 h-4 text-sky-500" /> Metodología de Cálculo y Fuentes
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              Los indicadores económicos y ambientales de este informe se derivan del combustible consumido en
              ralentí (galones). El cálculo es transparente y trazable:
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Costos */}
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-2 bg-slate-50/60 dark:bg-slate-900/30">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-amber-500" />
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide">Costo del combustible</span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                  <code className="text-[10px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0.5">Costo Total = Σ (Galones por combustible × Precio del combustible)</code>
                </p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Cada galón se valora con el precio de su tipo de combustible, sin promediar: <span className="font-semibold">diésel $11.200</span> y <span className="font-semibold">gasolina $16.000 COP/Gal</span> (eléctrico $0).
                  Los galones sin tipo definido se excluyen del costo. El costo promedio diario divide el costo total entre los días del período.
                </p>
              </div>

              {/* CO2 */}
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-2 bg-emerald-50/50 dark:bg-emerald-950/20">
                <div className="flex items-center gap-2">
                  <Leaf className="w-4 h-4 text-emerald-500" />
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide">Huella de carbono (CO₂)</span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                  <code className="text-[10px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0.5">CO₂ = Σ (Galones por combustible × Factor del combustible)</code>
                </p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Cada vehículo aplica el factor de su tipo de combustible (columna <span className="font-semibold">"Tipo combustible"</span>),
                  sin promediar. La equivalencia en árboles es <code className="text-[10px]">CO₂ kg / 22</code> (absorción anual de un árbol maduro).
                </p>
              </div>
            </div>

            {/* Factor table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/50 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-slate-700">
                    <th className="py-2 px-3">Tipo de combustible</th>
                    <th className="py-2 px-3 text-right">Factor de emisión</th>
                    <th className="py-2 px-3">Base de cálculo (UPME)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                  <tr>
                    <td className="py-2.5 px-3 font-semibold text-slate-700 dark:text-slate-200">Diésel / ACPM</td>
                    <td className="py-2.5 px-3 text-right font-bold text-slate-800 dark:text-slate-100">10,15 kg CO₂/gal</td>
                    <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400">Diesel B2 · %C 85,89 · densidad 0,8519 kg/L</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-semibold text-slate-700 dark:text-slate-200">Gasolina</td>
                    <td className="py-2.5 px-3 text-right font-bold text-slate-800 dark:text-slate-100">8,81 kg CO₂/gal</td>
                    <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400">Gasolina Motor · %C 85,76 · densidad 0,7405 kg/L</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-semibold text-slate-700 dark:text-slate-200">GLP</td>
                    <td className="py-2.5 px-3 text-right font-bold text-slate-800 dark:text-slate-100">6,47 kg CO₂/gal</td>
                    <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400">GLP Genérico · %C 83,27 · densidad 0,5599 kg/L</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed border-t border-slate-100 dark:border-slate-800/80 pt-3 space-y-1">
              <p>
                <span className="font-semibold text-slate-600 dark:text-slate-300">Fuente:</span> Factores de Emisión de los
                Combustibles Colombianos (FECOC) — Unidad de Planeación Minero Energética (UPME). Los factores se derivan por
                estequiometría del carbono: <code className="text-[10px]">kg CO₂/gal = (%C/100) × (44,0095/12,0107) × Densidad × 3,7854118</code>.
              </p>
              <p>
                Calculadora oficial:{' '}
                <a href="https://app.upme.gov.co/Calculadora_Emisiones1/new/calculadora.html" target="_blank" rel="noopener noreferrer" className="text-sky-600 dark:text-sky-400 font-semibold hover:underline">
                  app.upme.gov.co/Calculadora_Emisiones1
                </a>
                . Mezcla efectiva de la flota en el período: <span className="font-semibold">{stats.co2FactorEfectivo.toFixed(2)} kg CO₂/gal</span>.
              </p>
            </div>
          </div>

          {/* ====================== GUÍA TÉCNICA DE CÁLCULO (botón flotante + modal) ====================== */}
          {/* Botón flotante: abre la guía como ventana modal */}
          <button
            type="button"
            onClick={() => setShowTechGuide(true)}
            title="Guía Técnica de Cálculo del Informe"
            className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-3 rounded-full shadow-lg bg-sky-600 hover:bg-sky-700 active:scale-95 text-white transition-all"
          >
            <BookOpen className="w-5 h-5" />
            <span className="text-sm font-semibold hidden sm:inline">Guía Técnica</span>
          </button>

          {/* Modal de la guía técnica */}
          {showTechGuide && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
              onClick={() => setShowTechGuide(false)}
            >
              <div
                className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[88vh] flex flex-col overflow-hidden"
                onClick={e => e.stopPropagation()}
              >
                {/* Header del modal */}
                <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
                  <span className="flex items-center gap-2.5">
                    <span className="w-8 h-8 rounded-lg bg-sky-50 dark:bg-sky-950/40 flex items-center justify-center">
                      <BookOpen className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                    </span>
                    <span>
                      <span className="block font-bold text-slate-800 dark:text-slate-100 text-sm">Guía Técnica de Cálculo del Informe</span>
                      <span className="block text-[11px] text-slate-500 dark:text-slate-400">Fórmulas, fuentes de datos y definiciones de cada indicador del módulo</span>
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowTechGuide(false)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors shrink-0"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Cuerpo desplazable */}
                <div className="px-6 pb-6 pt-2 space-y-6 overflow-y-auto">
                {/* Intro */}
                <p className="text-[11.5px] text-slate-600 dark:text-slate-300 leading-relaxed pt-4">
                  Este documento describe, con detalle técnico, cómo se obtiene <span className="font-semibold">cada cifra y porcentaje</span> del
                  informe. Todos los valores se calculan exclusivamente con datos reales de telemetría; <span className="font-semibold">no se usan
                  promedios, estimaciones ni valores de respaldo</span>. Cuando un dato no está disponible (p. ej. el tipo de combustible de un
                  vehículo), el registro se excluye del cálculo y se reporta aparte, nunca se rellena con supuestos.
                </p>

                {/* 1. Fuentes de datos */}
                <section className="space-y-2">
                  <h4 className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide">
                    <Database className="w-4 h-4 text-sky-500" /> 1. Fuentes de datos
                  </h4>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                    El informe combina tres tablas de la base de datos. La granularidad es distinta en cada una y por eso cada métrica
                    indica explícitamente de cuál proviene:
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-[11px]">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-900/50 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-slate-700">
                          <th className="py-2 px-3">Tabla</th>
                          <th className="py-2 px-3">Granularidad</th>
                          <th className="py-2 px-3">Columnas clave usadas</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60 align-top">
                        <tr>
                          <td className="py-2.5 px-3 font-mono font-semibold text-slate-700 dark:text-slate-200">ralentis_periodos</td>
                          <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400">1 fila por vehículo y período (quincena)</td>
                          <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400">horas_motor_encendido, horas_motor_ralenti, consumo_combustible</td>
                        </tr>
                        <tr>
                          <td className="py-2.5 px-3 font-mono font-semibold text-slate-700 dark:text-slate-200">ralentis_eventos</td>
                          <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400">1 fila por cada evento de ralentí detectado</td>
                          <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400">duracion_segundos, conductor_nombre, placa, proveedor, fecha_inicio</td>
                        </tr>
                        <tr>
                          <td className="py-2.5 px-3 font-mono font-semibold text-slate-700 dark:text-slate-200">vehiculos</td>
                          <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400">1 fila por vehículo (maestro)</td>
                          <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400">tipo_combustible, cliente, contrato_id, tipo_activo, placa</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[10.5px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    <span className="font-semibold">Relación fundamental:</span> <code className="text-[10px] bg-slate-100 dark:bg-slate-900 rounded px-1">horas_motor_encendido</code> ya
                    <span className="font-semibold"> incluye</span> a <code className="text-[10px] bg-slate-100 dark:bg-slate-900 rounded px-1">horas_motor_ralenti</code> (el ralentí
                    es un subconjunto del tiempo con motor encendido). Por eso el porcentaje de ralentí se calcula sobre el encendido, nunca
                    sobre su suma.
                  </p>
                </section>

                {/* 2. Filtros y periodo */}
                <section className="space-y-2">
                  <h4 className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide">
                    <Filter className="w-4 h-4 text-indigo-500" /> 2. Filtros y período de análisis
                  </h4>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                    Todas las cifras son <span className="font-semibold">dinámicas</span>: se recalculan al aplicar cualquier combinación de filtros
                    (Cliente, Contrato, Tipo de vehículo, Placa y período). El período se determina por Año + Mes + Quincena:
                  </p>
                  <code className="block w-full text-[10.5px] font-mono bg-slate-900 text-emerald-300 dark:bg-black/40 rounded-md px-3 py-2 leading-relaxed whitespace-pre-wrap">
{`Quincena 1  →  día 01 al 15 del mes
Quincena 2  →  día 16 al último día del mes
"Todo el mes" → día 01 al último día del mes
N.º de días del período = (fecha_fin − fecha_inicio) + 1`}
                  </code>
                  <p className="text-[10.5px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    Los filtros se aplican en la consulta SQL mediante <code className="text-[10px] bg-slate-100 dark:bg-slate-900 rounded px-1">JOIN</code> con la
                    tabla <code className="text-[10px] bg-slate-100 dark:bg-slate-900 rounded px-1">vehiculos</code>, de modo que afectan por igual a los agregados
                    (ralentis_periodos) y a los eventos (ralentis_eventos).
                  </p>
                </section>

                {/* 3. Tiempos y % de ralentí */}
                <section className="space-y-2">
                  <h4 className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide">
                    <Clock className="w-4 h-4 text-amber-500" /> 3. Tiempos y porcentaje de ralentí
                  </h4>
                  <code className="block w-full text-[10.5px] font-mono bg-slate-900 text-emerald-300 dark:bg-black/40 rounded-md px-3 py-2 leading-relaxed whitespace-pre-wrap">
{`Tiempo Total en Ralentí  = Σ horas_motor_ralenti        (todas las filas del período)
Tiempo Motor Encendido   = Σ horas_motor_encendido
% Ralentí                = (Tiempo Ralentí ÷ Tiempo Encendido) × 100
Tiempo en Movimiento     = Tiempo Encendido − Tiempo Ralentí`}
                  </code>
                  <p className="text-[10.5px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    El <span className="font-semibold">% Ralentí</span> es el indicador maestro del informe: representa qué fracción del tiempo con
                    motor encendido el vehículo estuvo detenido quemando combustible sin desplazarse.
                  </p>
                </section>

                {/* 4. Eventos, umbrales y alertas */}
                <section className="space-y-2">
                  <h4 className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide">
                    <ShieldAlert className="w-4 h-4 text-rose-500" /> 4. Eventos, umbrales y alertas
                  </h4>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                    Un <span className="font-semibold">evento de ralentí</span> se convierte en <span className="font-semibold">alerta</span> solo si su
                    duración supera el umbral nativo del proveedor satelital que lo reportó. No se normaliza a un umbral común porque cada
                    plataforma define la alerta de forma distinta:
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-[11px]">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-900/50 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-slate-700">
                          <th className="py-2 px-3">Proveedor</th>
                          <th className="py-2 px-3 text-right">Umbral de alerta</th>
                          <th className="py-2 px-3 text-right">En segundos</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                        <tr>
                          <td className="py-2.5 px-3 font-semibold text-slate-700 dark:text-slate-200">Coltrack</td>
                          <td className="py-2.5 px-3 text-right text-slate-600 dark:text-slate-300">≥ 10 minutos</td>
                          <td className="py-2.5 px-3 text-right font-bold text-slate-800 dark:text-slate-100">600 s</td>
                        </tr>
                        <tr>
                          <td className="py-2.5 px-3 font-semibold text-slate-700 dark:text-slate-200">Fagor</td>
                          <td className="py-2.5 px-3 text-right text-slate-600 dark:text-slate-300">≥ 5 minutos</td>
                          <td className="py-2.5 px-3 text-right font-bold text-slate-800 dark:text-slate-100">300 s</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <code className="block w-full text-[10.5px] font-mono bg-slate-900 text-emerald-300 dark:bg-black/40 rounded-md px-3 py-2 leading-relaxed whitespace-pre-wrap">
{`alerta  ⇔  duracion_segundos ≥ umbral(proveedor)
N.º de Alertas (ralentís excesivos) = cantidad de eventos que son alerta
Horas en ralentí > umbral           = Σ duracion_segundos(alertas) ÷ 3600`}
                  </code>
                  <p className="text-[10.5px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    El conteo de alertas se calcula <span className="font-semibold">sobre los eventos reales</span>, no a partir del contador agregado
                    de la tabla de períodos (que incluiría todos los ralentís, no solo los que superan el umbral).
                  </p>
                </section>

                {/* 5. Combustible y costo */}
                <section className="space-y-2">
                  <h4 className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide">
                    <DollarSign className="w-4 h-4 text-amber-500" /> 5. Combustible y costo
                  </h4>
                  <code className="block w-full text-[10.5px] font-mono bg-slate-900 text-emerald-300 dark:bg-black/40 rounded-md px-3 py-2 leading-relaxed whitespace-pre-wrap">
{`Galones en Ralentí  = Σ consumo_combustible          (galones)
Costo Total         = Σ (galones_del_combustible × precio_del_combustible)
Costo Promedio Diario = Costo Total ÷ N.º de días del período
Precio efectivo/gal   = Costo Total ÷ Galones totales (mezcla real de la flota)`}
                  </code>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                    El costo se valora <span className="font-semibold">por tipo de combustible</span>, no con una tarifa plana. Cada galón usa el precio
                    de su propio combustible (columna <span className="font-semibold">"Tipo combustible"</span> del vehículo). Precios de referencia,
                    actualizables manualmente cuando cambie la regulación:
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-[11px]">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-900/50 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-slate-700">
                          <th className="py-2 px-3">Combustible</th>
                          <th className="py-2 px-3 text-right">Precio COP / galón</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                        <tr><td className="py-2.5 px-3 font-semibold text-slate-700 dark:text-slate-200">Diésel / ACPM</td><td className="py-2.5 px-3 text-right font-bold text-slate-800 dark:text-slate-100">$11.200</td></tr>
                        <tr><td className="py-2.5 px-3 font-semibold text-slate-700 dark:text-slate-200">Gasolina</td><td className="py-2.5 px-3 text-right font-bold text-slate-800 dark:text-slate-100">$16.000</td></tr>
                        <tr><td className="py-2.5 px-3 font-semibold text-slate-700 dark:text-slate-200">Eléctrico</td><td className="py-2.5 px-3 text-right font-bold text-slate-800 dark:text-slate-100">$0</td></tr>
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[10.5px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    Los galones de vehículos <span className="font-semibold">sin tipo de combustible definido</span> se excluyen del costo (no se
                    estiman con promedios) y se reportan aparte en la tarjeta ambiental.
                  </p>
                </section>

                {/* 6. Huella de carbono */}
                <section className="space-y-2">
                  <h4 className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide">
                    <Leaf className="w-4 h-4 text-emerald-500" /> 6. Huella de carbono (CO₂)
                  </h4>
                  <code className="block w-full text-[10.5px] font-mono bg-slate-900 text-emerald-300 dark:bg-black/40 rounded-md px-3 py-2 leading-relaxed whitespace-pre-wrap">
{`CO₂ (kg) = Σ (galones_del_combustible × factor_del_combustible)
Factor (kg CO₂/gal) = (%C ÷ 100) × (44,0095 ÷ 12,0107) × Densidad[kg/L] × 3,7854118[L/gal]
Equivalente en árboles = CO₂(kg) ÷ 22      (absorción anual de un árbol maduro)
Factor efectivo flota  = CO₂(kg) ÷ Galones totales`}
                  </code>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-[11px]">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-900/50 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-slate-700">
                          <th className="py-2 px-3">Combustible</th>
                          <th className="py-2 px-3 text-right">Factor</th>
                          <th className="py-2 px-3">Base FECOC/UPME</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                        <tr><td className="py-2.5 px-3 font-semibold text-slate-700 dark:text-slate-200">Diésel / ACPM</td><td className="py-2.5 px-3 text-right font-bold text-slate-800 dark:text-slate-100">10,15</td><td className="py-2.5 px-3 text-slate-500 dark:text-slate-400">%C 85,89 · dens. 0,8519</td></tr>
                        <tr><td className="py-2.5 px-3 font-semibold text-slate-700 dark:text-slate-200">Gasolina</td><td className="py-2.5 px-3 text-right font-bold text-slate-800 dark:text-slate-100">8,81</td><td className="py-2.5 px-3 text-slate-500 dark:text-slate-400">%C 85,76 · dens. 0,7405</td></tr>
                        <tr><td className="py-2.5 px-3 font-semibold text-slate-700 dark:text-slate-200">GLP</td><td className="py-2.5 px-3 text-right font-bold text-slate-800 dark:text-slate-100">6,47</td><td className="py-2.5 px-3 text-slate-500 dark:text-slate-400">%C 83,27 · dens. 0,5599</td></tr>
                        <tr><td className="py-2.5 px-3 font-semibold text-slate-700 dark:text-slate-200">Eléctrico</td><td className="py-2.5 px-3 text-right font-bold text-slate-800 dark:text-slate-100">0</td><td className="py-2.5 px-3 text-slate-500 dark:text-slate-400">Sin combustión</td></tr>
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[10.5px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    Fuente: Factores de Emisión de los Combustibles Colombianos (FECOC) — UPME. Igual que en el costo, los galones sin tipo
                    de combustible se excluyen y se reportan aparte.
                  </p>
                </section>

                {/* 7. Datos clave */}
                <section className="space-y-2">
                  <h4 className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide">
                    <Activity className="w-4 h-4 text-violet-500" /> 7. Datos clave de eventos
                  </h4>
                  <code className="block w-full text-[10.5px] font-mono bg-slate-900 text-emerald-300 dark:bg-black/40 rounded-md px-3 py-2 leading-relaxed whitespace-pre-wrap">
{`Mayor Evento Único   = máx(duracion_segundos) entre eventos con conductor identificado
Promedio por Evento  = Σ duracion_segundos(alertas) ÷ N.º de alertas
Eventos > 30 min     = cantidad de alertas con duracion_segundos > 1800
Formato h:mm:ss      = se deriva de los segundos totales del evento`}
                  </code>
                  <p className="text-[10.5px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    "Mayor Evento Único" se mide solo entre eventos con conductor plenamente identificado (se descartan "N/A", "No registra",
                    etc.), para poder atribuir el evento a una persona.
                  </p>
                </section>

                {/* 8. Riesgo operacional y metas */}
                <section className="space-y-2">
                  <h4 className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide">
                    <AlertTriangle className="w-4 h-4 text-orange-500" /> 8. Riesgo operacional y metas
                  </h4>
                  <code className="block w-full text-[10.5px] font-mono bg-slate-900 text-emerald-300 dark:bg-black/40 rounded-md px-3 py-2 leading-relaxed whitespace-pre-wrap">
{`Riesgo Operacional según % Ralentí:
   % > 15           →  ALTO
   10 ≤ % ≤ 15      →  MEDIO
   % < 10           →  BAJO

Metas de referencia (objetivos de gestión):
   Meta % Ralentí        = 10 %
   Meta Galones/período  = 37 gal
   Meta Costo diario     = $28.000 COP/día
Desviación (Δ) = valor real − meta   (se muestra en rojo si supera la meta)`}
                  </code>
                  <p className="text-[10.5px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    Las metas son objetivos de gestión definidos por la operación; no alteran las cifras reales, solo sirven para colorear y
                    contextualizar las desviaciones.
                  </p>
                </section>

                {/* 9. Comparación y proyección */}
                <section className="space-y-2">
                  <h4 className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide">
                    <TrendingUp className="w-4 h-4 text-sky-500" /> 9. Comparación con período anterior y proyección
                  </h4>
                  <code className="block w-full text-[10.5px] font-mono bg-slate-900 text-emerald-300 dark:bg-black/40 rounded-md px-3 py-2 leading-relaxed whitespace-pre-wrap">
{`Δ % vs período anterior = % Ralentí actual − % Ralentí anterior
Δ Costo vs anterior     = Costo actual − (Galones anteriores × precio efectivo actual)

Proyección (tendencia):
   ratio       = % actual ÷ % anterior
   % proyectado = % actual × factor_suavizado(ratio)   [límite 1–100 %]
   Galones proy. = Galones actuales × (% proyectado ÷ % actual)
   Costo proy.   = Galones proy. × precio efectivo`}
                  </code>
                  <p className="text-[10.5px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    La proyección es un indicador de tendencia (suavizado para evitar saltos extremos), no una predicción contractual. El
                    período anterior solo almacena el total de galones, por eso su costo se reconstruye con el precio efectivo del período actual.
                  </p>
                </section>

                {/* 10. Anomalías */}
                <section className="space-y-2">
                  <h4 className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide">
                    <BrainCircuit className="w-4 h-4 text-fuchsia-500" /> 10. Detección de anomalías (outliers)
                  </h4>
                  <code className="block w-full text-[10.5px] font-mono bg-slate-900 text-emerald-300 dark:bg-black/40 rounded-md px-3 py-2 leading-relaxed whitespace-pre-wrap">
{`Por cada vehículo:  tiempo_total = Σ duracion_segundos(sus alertas)
media (μ)   = promedio de tiempo_total entre vehículos
desv. (σ)   = desviación estándar
umbral      = μ + 1,2 × σ
Es anomalía ⇔ tiempo_total > umbral  Y  tiempo_total > 3600 s (1 h)
excessRatio = tiempo_total ÷ μ`}
                  </code>
                  <p className="text-[10.5px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    Identifica vehículos cuyo ralentí se desvía estadísticamente del comportamiento de la flota, priorizándolos para revisión.
                  </p>
                </section>

                {/* 11. Tops y calificación */}
                <section className="space-y-2">
                  <h4 className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide">
                    <FileSpreadsheet className="w-4 h-4 text-emerald-500" /> 11. Clasificación de conductores y vehículos
                  </h4>
                  <code className="block w-full text-[10.5px] font-mono bg-slate-900 text-emerald-300 dark:bg-black/40 rounded-md px-3 py-2 leading-relaxed whitespace-pre-wrap">
{`Tiempo por conductor/vehículo = Σ duracion_segundos de sus alertas
Top = orden descendente por ese tiempo acumulado
% del total = tiempo_del_conductor ÷ Tiempo Total en Ralentí × 100
Calificación estimada = 100 − (horas_en_ralentí × 5)   [acotada a 0–100]`}
                  </code>
                  <p className="text-[10.5px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    La calificación es un puntaje indicativo que penaliza el tiempo acumulado en ralentí; sirve para priorizar
                    retroalimentación, no como evaluación formal de desempeño.
                  </p>
                </section>

                {/* 12. Reglas de exclusión */}
                <section className="space-y-2">
                  <h4 className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide">
                    <CheckCircle className="w-4 h-4 text-emerald-500" /> 12. Reglas de exclusión y calidad del dato
                  </h4>
                  <ul className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed list-disc pl-5 space-y-1.5">
                    <li>Los registros cuyo conductor es <span className="font-semibold">"Taller"</span> se excluyen de los tops y de las cifras de eventos: corresponden a vehículos en mantenimiento, no a operación real.</li>
                    <li>Los eventos sin conductor identificado (<span className="font-semibold">"N/A", "No registra"</span>) se excluyen de los rankings y del "Mayor Evento Único", pero se mantienen en los totales de tiempo/costo de la flota.</li>
                    <li>Los galones de vehículos <span className="font-semibold">sin tipo de combustible</span> se excluyen del costo y del CO₂, y se reportan como pendientes por definir.</li>
                    <li>Vehículos <span className="font-semibold">eléctricos</span>: factor de CO₂ y precio = 0 (es un tipo conocido, no un dato faltante).</li>
                    <li><span className="font-semibold">Principio rector:</span> ninguna cifra se completa con promedios o supuestos. Si el dato real no existe, se excluye y se informa.</li>
                  </ul>
                </section>

                {/* Cierre */}
                <div className="text-[10px] text-slate-400 dark:text-slate-500 leading-relaxed border-t border-slate-100 dark:border-slate-800/80 pt-3">
                  Documento técnico del módulo de Informe de Ralentí · Magnex Torre de Control. Las cifras mostradas reflejan los filtros
                  activos en pantalla. Fuentes regulatorias: FECOC/UPME (emisiones) y Ministerio de Minas y Energía (precios de combustible).
                </div>
                </div>
              </div>
            </div>
          )}

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
