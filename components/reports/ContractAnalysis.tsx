import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { BarChart3, FileText, RefreshCw, Download, Copy, Check, Calendar, Users, Truck, Bike, AlertTriangle, Play, HelpCircle, Search, ChevronDown, ShieldAlert, AlertCircle, Printer } from 'lucide-react';
import {
  getConductores, getVehiculos, getContratos,
  listarReportesConductores, listarReportesVehiculos,
} from '../../services/reportService';
import type { ConductorOption, ContratoOption, VehiculoOption } from '../../services/reportService';
import { supabase } from '../../services/supabaseClient';
import { descargarPDFAnalisisContrato, descargarPDFConsolidadoGlobal } from '../../services/pdfTemplates';
import * as XLSX from 'xlsx';

const primerDiaMes = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};
const ultimoDiaMes = () => {
  const d = new Date();
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return last.toISOString().slice(0, 10);
};

interface FiltroState {
  contratoId: string;
  fechaInicio: string;
  fechaFin: string;
}

const defaultFiltro: FiltroState = {
  contratoId: '',
  fechaInicio: primerDiaMes(),
  fechaFin: ultimoDiaMes(),
};

function esMoto(tipo: unknown): boolean {
  return String(tipo ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase().includes('MOTO');
}

function fmt(v: number, dec = 1): string {
  return v.toLocaleString('es-CO', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function StatCardGerencial({ label, value, sub, color = 'blue' }: { label: string; value: string; sub?: string; color?: 'blue' | 'green' | 'amber' | 'red' | 'purple' }) {
  const colorMap = {
    blue: 'border-blue-200 dark:border-blue-800/40 bg-blue-50/50 dark:bg-blue-900/10 text-blue-700 dark:text-blue-400',
    green: 'border-green-200 dark:border-green-800/40 bg-green-50/50 dark:bg-green-900/10 text-green-700 dark:text-green-400',
    amber: 'border-amber-200 dark:border-amber-800/40 bg-amber-50/50 dark:bg-amber-900/10 text-amber-700 dark:text-amber-400',
    red: 'border-red-200 dark:border-red-800/40 bg-red-50/50 dark:bg-red-900/10 text-red-700 dark:text-red-400',
    purple: 'border-purple-200 dark:border-purple-800/40 bg-purple-50/50 dark:bg-purple-900/10 text-purple-700 dark:text-purple-400',
  };

  return (
    <div className={`flex-1 min-w-[200px] bg-white dark:bg-slate-800 border-2 rounded-xl p-4 flex flex-col justify-between transition-all hover:shadow-md ${colorMap[color]} print-card`}>
      <div>
        <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</span>
        <p className="text-3xl font-extrabold mt-1 text-slate-900 dark:text-white">{value}</p>
      </div>
      {sub && <span className="text-xs text-slate-400 dark:text-slate-500 mt-2 leading-snug">{sub}</span>}
    </div>
  );
}

// Componente reutilizable para los controles de paginación
function TablePagination({
  currentPage,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange
}: {
  currentPage: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  const totalPages = Math.ceil(totalItems / pageSize);
  const startItem = totalItems > 0 ? (currentPage - 1) * pageSize + 1 : 0;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/60 transition-colors no-print">
      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <span>Mostrar</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="px-2.5 py-1 border border-slate-200 dark:border-slate-600 rounded bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer transition-colors"
        >
          <option value={10}>10</option>
          <option value={25}>25</option>
          <option value={50}>50</option>
        </select>
        <span>registros</span>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
          Mostrando {startItem} a {endItem} de {totalItems}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="px-3 py-1 border border-slate-200 dark:border-slate-600 rounded text-xs bg-slate-50 hover:bg-slate-100 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 font-bold transition-colors disabled:opacity-50 disabled:pointer-events-none"
          >
            Anterior
          </button>
          <button
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage >= totalPages || totalPages === 0}
            className="px-3 py-1 border border-slate-200 dark:border-slate-600 rounded text-xs bg-slate-50 hover:bg-slate-100 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 font-bold transition-colors disabled:opacity-50 disabled:pointer-events-none"
          >
            Siguiente
          </button>
        </div>
      </div>
    </div>
  );
}

// Componente para barra de progreso detallada
function ProgressBarStat({ label, value, total, color = 'blue' }: { label: string; value: number; total: number; color?: 'blue' | 'green' | 'amber' | 'red' | 'purple' | 'emerald' | 'orange' }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  
  const barColors = {
    blue: 'bg-blue-500 dark:bg-blue-400',
    green: 'bg-green-500 dark:bg-green-400',
    amber: 'bg-amber-500 dark:bg-amber-400',
    red: 'bg-red-500 dark:bg-red-400',
    purple: 'bg-purple-500 dark:bg-purple-400',
    emerald: 'bg-emerald-500 dark:bg-emerald-400',
    orange: 'bg-orange-500 dark:bg-orange-400',
  };

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
        <span>{label}</span>
        <span className="font-bold">{value} / {total} <span className="text-slate-400 dark:text-slate-500 font-normal">({Math.round(pct)}%)</span></span>
      </div>
      <div className="w-full h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden transition-colors">
        <div className={`h-full rounded-full transition-all duration-1000 ${barColors[color]}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export const ContractAnalysis: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'individual' | 'global'>('individual');
  const [filtro, setFiltro] = useState<FiltroState>(defaultFiltro);
  const [contratos, setContratos] = useState<ContratoOption[]>([]);
  const [conductores, setConductores] = useState<ConductorOption[]>([]);
  const [vehiculos, setVehiculos] = useState<VehiculoOption[]>([]);

  // Estados para multiselección
  const [selectedContratoIds, setSelectedContratoIds] = useState<string[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Datos analíticos
  const [repConductores, setRepConductores] = useState<any[]>([]);
  const [repVehiculos, setRepVehiculos] = useState<any[]>([]);
  const [cargando, setCargando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [copiadoGlobal, setCopiadoGlobal] = useState(false);
  const [generandoPDF, setGenerandoPDF] = useState(false);

  // Entidades sin registrar (Google Sheets Pendientes)
  const [pendingDrivers, setPendingDrivers] = useState<any[]>([]);
  const [pendingVehicles, setPendingVehicles] = useState<any[]>([]);

  // Estado para ordenamiento de tabla global
  const [sortField, setSortField] = useState<string>('kms');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Paginación para tablas
  const [indPage, setIndPage] = useState(1);
  const [indPageSize, setIndPageSize] = useState(10);

  const [globalPage, setGlobalPage] = useState(1);
  const [globalPageSize, setGlobalPageSize] = useState(10);

  const [condPage, setCondPage] = useState(1);
  const [condPageSize, setCondPageSize] = useState(10);

  const [vehPage, setVehPage] = useState(1);
  const [vehPageSize, setVehPageSize] = useState(10);

  // Cerrar selector de multiselección al hacer clic afuera
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Cargar catálogos iniciales
  useEffect(() => {
    Promise.all([getContratos(), getConductores(), getVehiculos()]).then(([ct, c, v]) => {
      setContratos(ct);
      setConductores(c);
      setVehiculos(v);
      if (ct.length > 0) {
        // Por defecto seleccionar el primer contrato en la multiselección
        setSelectedContratoIds([ct[0].id]);
        setFiltro(prev => ({ ...prev, contratoId: ct[0].id }));
      }
    }).catch(console.error);
  }, []);

  // Carga de entidades marcadas como PENDIENTE GOOGLE SHEETS
  const cargarPendientes = async () => {
    try {
      const { data: dPending } = await supabase
        .from('conductores')
        .select('id, nombres, cedula, ibutton')
        .eq('proyecto', 'PENDIENTE GOOGLE SHEETS');
      
      const { data: vPending } = await supabase
        .from('vehiculos')
        .select('id, placa, cliente')
        .eq('cliente', 'PENDIENTE GOOGLE SHEETS');

      setPendingDrivers(dPending || []);
      setPendingVehicles(vPending || []);
    } catch (err) {
      console.error('Error cargando entidades pendientes:', err);
    }
  };

  // Carga de datos analíticos globales para las fechas dadas
  const cargarDatos = useCallback(async () => {
    setCargando(true);
    try {
      const [rCond, rVeh] = await Promise.all([
        listarReportesConductores({
          fechaInicio: filtro.fechaInicio,
          fechaFin: filtro.fechaFin,
        }),
        listarReportesVehiculos({
          fechaInicio: filtro.fechaInicio,
          fechaFin: filtro.fechaFin,
        }),
        cargarPendientes()
      ]);
      setRepConductores(rCond || []);
      setRepVehiculos(rVeh || []);
    } catch (err) {
      console.error('Error cargando reportes analíticos:', err);
    } finally {
      setCargando(false);
    }
  }, [filtro.fechaInicio, filtro.fechaFin]);

  useEffect(() => {
    cargarDatos();
  }, [filtro.fechaInicio, filtro.fechaFin]);

  // Contratos que coinciden con la búsqueda en el dropdown
  const filteredContratos = useMemo(() => {
    return contratos.filter(c => 
      c.nombre.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (c.cliente && c.cliente.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }, [contratos, searchQuery]);

  // Etiqueta del botón de dropdown
  const dropdownLabel = useMemo(() => {
    if (selectedContratoIds.length === 0) return 'Seleccionar contratos...';
    if (selectedContratoIds.length === contratos.length) return 'Todos los contratos';
    if (selectedContratoIds.length === 1) {
      const c = contratos.find(x => x.id === selectedContratoIds[0]);
      return c ? c.nombre : '1 contrato seleccionado';
    }
    return `${selectedContratoIds.length} contratos seleccionados`;
  }, [selectedContratoIds, contratos]);

  const toggleContrato = (id: string) => {
    setSelectedContratoIds(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      if (next.length === 1) {
        setFiltro(f => ({ ...f, contratoId: next[0] }));
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedContratoIds(contratos.map(c => c.id));
  };

  const clearAll = () => {
    setSelectedContratoIds([]);
  };

  // Determinar si una fila pertenece a los contratos seleccionados
  const belongsToSelected = useCallback((row: any, type: 'driver' | 'vehicle') => {
    if (type === 'vehicle') {
      const cId = row.contrato_id || row.vehiculos?.contrato_id;
      return cId && selectedContratoIds.includes(cId);
    } else {
      const cId = row.conductores?.contrato_id || row.contrato_id;
      return cId && selectedContratoIds.includes(cId);
    }
  }, [selectedContratoIds]);

  // --- CÁLCULO DE MÉTRICAS ANALÍTICAS PARA CONTRATOS SELECCIONADOS ---
  const metricas = useMemo(() => {
    if (selectedContratoIds.length === 0) {
      return {
        totalConductoresActivos: 0,
        totalVehiculosActivos: 0,
        totalMotosActivas: 0,
        totalFlotaActiva: 0,
        kmVehiculos: 0,
        kmMotos: 0,
        totalKms: 0,
        totalRalentiHoras: 0,
        vehsConKm: 0,
        vehsConExcess: 0,
        vehsConRalenti: 0,
        vehsConFrenadas: 0,
        vehsConAceleraciones: 0,
        totalExcesos: 0,
        totalExcesos80: 0,
        totalExcesosBajo80: 0,
        totalFrenadas: 0,
        totalAceleraciones: 0,
        pctVehConKm: 0,
        pctVehConExcess: 0,
        pctVehConRalenti: 0,
        filteredVehReports: [],
        filteredCondReports: [],
        // Conductores
        condConKm: 0,
        condConExcess: 0,
        condConFrenadas: 0,
        condConAceleraciones: 0,
      };
    }

    const condRoster = conductores.filter(c => c.contrato_id && selectedContratoIds.includes(c.contrato_id));
    const vehRoster = vehiculos.filter(v => v.contrato_id && selectedContratoIds.includes(v.contrato_id));

    const totalConductoresActivos = condRoster.length;
    const totalVehiculosActivos = vehRoster.filter(v => !esMoto(v.tipo_activo)).length;
    const totalMotosActivas = vehRoster.filter(v => esMoto(v.tipo_activo)).length;
    const totalFlotaActiva = vehRoster.length;

    const filteredVehReports = repVehiculos.filter(rv => belongsToSelected(rv, 'vehicle'));
    const filteredCondReports = repConductores.filter(rc => belongsToSelected(rc, 'driver'));

    let kmVehiculos = 0;
    let kmMotos = 0;
    let totalKms = 0;
    let totalRalentiHoras = 0;

    let vehsConKm = 0;
    let vehsConExcess = 0;
    let vehsConRalenti = 0;
    let vehsConFrenadas = 0;
    let vehsConAceleraciones = 0;

    let totalExcesos = 0;
    let totalExcesos80 = 0;
    let totalExcesosBajo80 = 0;
    let totalFrenadas = 0;
    let totalAceleraciones = 0;

    filteredVehReports.forEach(rv => {
      const kms = Number(rv.kms ?? 0);
      const isMotorcycle = esMoto(rv.vehiculos?.tipo_activo ?? rv.tipo_activo);
      
      if (isMotorcycle) {
        kmMotos += kms;
      } else {
        kmVehiculos += kms;
      }
      totalKms += kms;
      totalRalentiHoras += Number(rv.horas_motor_ralenti ?? 0);

      if (kms > 0) vehsConKm++;
      
      const exc80 = Number(rv.excesos_80_kph ?? 0);
      const excBajo80 = Number(rv.excesos_10_kph ?? 0) +
        Number(rv.excesos_20_kph ?? 0) +
        Number(rv.excesos_30_kph ?? 0) +
        Number(rv.excesos_40_kph ?? 0) +
        Number(rv.excesos_50_kph ?? 0) +
        Number(rv.excesos_60_kph ?? 0);

      const excesos = exc80 + excBajo80;
      
      if (excesos > 0) vehsConExcess++;
      totalExcesos += excesos;
      totalExcesos80 += exc80;
      totalExcesosBajo80 += excBajo80;

      const ralenti = Number(rv.horas_motor_ralenti ?? 0);
      if (ralenti > 0) vehsConRalenti++;

      const frenadas = Number(rv.frenadas_bruscas ?? rv.frenadas ?? 0);
      if (frenadas > 0) vehsConFrenadas++;
      totalFrenadas += frenadas;

      const aceleraciones = Number(rv.aceleraciones_bruscas ?? rv.aceleraciones ?? 0);
      if (aceleraciones > 0) vehsConAceleraciones++;
      totalAceleraciones += aceleraciones;
    });

    if (totalKms === 0 && filteredCondReports.length > 0) {
      filteredCondReports.forEach(rc => {
        totalKms += Number(rc.kms ?? 0);
        
        const exc80 = Number(rc.excesos_80_kph ?? 0);
        const excBajo80 = Number(rc.excesos_10_kph ?? 0) +
          Number(rc.excesos_20_kph ?? 0) +
          Number(rc.excesos_30_kph ?? 0) +
          Number(rc.excesos_40_kph ?? 0) +
          Number(rc.excesos_50_kph ?? 0) +
          Number(rc.excesos_60_kph ?? 0);
        
        totalExcesos += exc80 + excBajo80;
        totalExcesos80 += exc80;
        totalExcesosBajo80 += excBajo80;

        totalFrenadas += Number(rc.frenadas_bruscas ?? rc.frenadas ?? 0);
        totalAceleraciones += Number(rc.aceleraciones_bruscas ?? rc.aceleraciones ?? 0);
      });
    }

    // Calcular participación de Conductores
    let condConKm = 0;
    let condConExcess = 0;
    let condConFrenadas = 0;
    let condConAceleraciones = 0;

    filteredCondReports.forEach(rc => {
      const kms = Number(rc.kms ?? 0);
      if (kms > 0) condConKm++;

      const excesos = Number(rc.excesos_80_kph ?? 0) +
        Number(rc.excesos_10_kph ?? 0) +
        Number(rc.excesos_20_kph ?? 0) +
        Number(rc.excesos_30_kph ?? 0) +
        Number(rc.excesos_40_kph ?? 0) +
        Number(rc.excesos_50_kph ?? 0) +
        Number(rc.excesos_60_kph ?? 0);
      if (excesos > 0) condConExcess++;

      const frenadas = Number(rc.frenadas_bruscas ?? rc.frenadas ?? 0);
      if (frenadas > 0) condConFrenadas++;

      const aceleraciones = Number(rc.aceleraciones_bruscas ?? rc.aceleraciones ?? 0);
      if (aceleraciones > 0) condConAceleraciones++;
    });

    const pctVehConKm = totalFlotaActiva > 0 ? (vehsConKm / totalFlotaActiva) * 100 : 0;
    const pctVehConExcess = totalFlotaActiva > 0 ? (vehsConExcess / totalFlotaActiva) * 100 : 0;
    const pctVehConRalenti = totalFlotaActiva > 0 ? (vehsConRalenti / totalFlotaActiva) * 100 : 0;

    return {
      totalConductoresActivos,
      totalVehiculosActivos,
      totalMotosActivas,
      totalFlotaActiva,
      kmVehiculos,
      kmMotos,
      totalKms,
      totalRalentiHoras,
      vehsConKm,
      vehsConExcess,
      vehsConRalenti,
      vehsConFrenadas,
      vehsConAceleraciones,
      totalExcesos,
      totalExcesos80,
      totalExcesosBajo80,
      totalFrenadas,
      totalAceleraciones,
      pctVehConKm,
      pctVehConExcess,
      pctVehConRalenti,
      filteredVehReports,
      filteredCondReports,
      // Conductores
      condConKm,
      condConExcess,
      condConFrenadas,
      condConAceleraciones,
    };
  }, [repConductores, repVehiculos, conductores, vehiculos, selectedContratoIds, belongsToSelected]);

  // Formato WhatsApp para Reporte PRM
  const textoPRM = useMemo(() => {
    const r = metricas;
    let cNombre = 'CONTRATO NO ESPECIFICADO';
    if (selectedContratoIds.length === 1) {
      const c = contratos.find(x => x.id === selectedContratoIds[0]);
      cNombre = c ? `${c.nombre} (${c.cliente})` : 'CONTRATO NO ESPECIFICADO';
    } else if (selectedContratoIds.length > 1) {
      if (selectedContratoIds.length === contratos.length) {
        cNombre = 'TODOS LOS CONTRATOS';
      } else {
        cNombre = `${selectedContratoIds.length} CONTRATOS SELECCIONADOS`;
      }
    }

    return `📋 *REPORTE GERENCIAL PRM (Torre de Control)*\n` +
      `*Contrato:* ${cNombre}\n` +
      `*Periodo:* ${filtro.fechaInicio} al ${filtro.fechaFin}\n\n` +
      `👤 *N° Conductores:* ${r.totalConductoresActivos}\n` +
      `🚗 *N° Vehículos:* ${r.totalVehiculosActivos}\n` +
      `🏍️ *N° Motocicletas:* ${r.totalMotosActivas}\n` +
      `🛣️ *Km recorridos Vehículos:* ${fmt(r.kmVehiculos, 1)} km\n` +
      `🛵 *Km recorridos Motocicletas:* ${fmt(r.kmMotos, 1)} km\n\n` +
      `📈 *Total Km:* ${fmt(r.totalKms, 1)} km`;
  }, [metricas, contratos, selectedContratoIds, filtro]);

  const copiarPRM = async () => {
    try {
      await navigator.clipboard.writeText(textoPRM);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch (err) {
      console.error('Error copiando PRM:', err);
    }
  };

  // --- CÁLCULO DE CONSOLIDADO GLOBAL ---
  const consolidadoGlobal = useMemo(() => {
    return contratos.map(contrato => {
      const cId = contrato.id;

      const condRoster = conductores.filter(c => c.contrato_id === cId);
      const vehRoster = vehiculos.filter(v => v.contrato_id === cId);

      const totalConductores = condRoster.length;
      const totalVehiculos = vehRoster.filter(v => !esMoto(v.tipo_activo)).length;
      const totalMotos = vehRoster.filter(v => esMoto(v.tipo_activo)).length;
      const totalFlota = vehRoster.length;

      const contractVehReports = repVehiculos.filter(rv => {
        const rowContratoId = rv.contrato_id || rv.vehiculos?.contrato_id;
        return rowContratoId === cId;
      });

      const contractCondReports = repConductores.filter(rc => {
        const rowContratoId = rc.conductores?.contrato_id || rc.contrato_id;
        return rowContratoId === cId;
      });

      let kms = 0;
      let ralenti = 0;
      let excesos = 0;
      let excesos80 = 0;
      let excesosBajo80 = 0;
      let frenadas = 0;
      let aceleraciones = 0;
      let calificacionesAcum = 0;
      let calificacionesCount = 0;

      contractVehReports.forEach(rv => {
        kms += Number(rv.kms ?? 0);
        ralenti += Number(rv.horas_motor_ralenti ?? 0);
        
        const exc80 = Number(rv.excesos_80_kph ?? 0);
        const excBajo80 = Number(rv.excesos_10_kph ?? 0) +
          Number(rv.excesos_20_kph ?? 0) +
          Number(rv.excesos_30_kph ?? 0) +
          Number(rv.excesos_40_kph ?? 0) +
          Number(rv.excesos_50_kph ?? 0) +
          Number(rv.excesos_60_kph ?? 0);

        excesos80 += exc80;
        excesosBajo80 += excBajo80;
        excesos += exc80 + excBajo80;

        frenadas += Number(rv.frenadas_bruscas ?? rv.frenadas ?? 0);
        aceleraciones += Number(rv.aceleraciones_bruscas ?? rv.aceleraciones ?? 0);

        if (rv.calificacion !== undefined && rv.calificacion !== null) {
          calificacionesAcum += Number(rv.calificacion);
          calificacionesCount++;
        }
      });

      if (kms === 0 && contractCondReports.length > 0) {
        contractCondReports.forEach(rc => {
          kms += Number(rc.kms ?? 0);
          
          const exc80 = Number(rc.excesos_80_kph ?? 0);
          const excBajo80 = Number(rc.excesos_10_kph ?? 0) +
            Number(rc.excesos_20_kph ?? 0) +
            Number(rc.excesos_30_kph ?? 0) +
            Number(rc.excesos_40_kph ?? 0) +
            Number(rc.excesos_50_kph ?? 0) +
            Number(rc.excesos_60_kph ?? 0);

          excesos80 += exc80;
          excesosBajo80 += excBajo80;
          excesos += exc80 + excBajo80;

          frenadas += Number(rc.frenadas_bruscas ?? rc.frenadas ?? 0);
          aceleraciones += Number(rc.aceleraciones_bruscas ?? rc.aceleraciones ?? 0);

          if (rc.calificacion !== undefined && rc.calificacion !== null) {
            calificacionesAcum += Number(rc.calificacion);
            calificacionesCount++;
          }
        });
      }

      const calificacionPromedio = calificacionesCount > 0 ? (calificacionesAcum / calificacionesCount) : 100;

      return {
        id: contrato.id,
        nombre: contrato.nombre,
        cliente: contrato.cliente || 'Sin cliente',
        totalConductores,
        totalVehiculos,
        totalMotos,
        totalFlota,
        kms,
        ralenti,
        excesos,
        excesos80,
        excesosBajo80,
        frenadas,
        aceleraciones,
        calificacionPromedio: Math.round(calificacionPromedio * 10) / 10,
        activeReportsCount: contractVehReports.length || contractCondReports.length,
      };
    }).filter(c => c.activeReportsCount > 0 || c.totalConductores > 0 || c.totalVehiculos > 0);
  }, [contratos, conductores, vehiculos, repConductores, repVehiculos]);

  // Métricas Consolidadas Globales de todos los contratos
  const metricasGlobales = useMemo(() => {
    let totalConductores = 0;
    let totalVehiculos = 0;
    let totalMotos = 0;
    let kmVehiculos = 0;
    let kmMotos = 0;
    let totalKms = 0;
    let totalExcesos = 0;
    let totalExcesos80 = 0;
    let totalExcesosBajo80 = 0;
    let totalFrenadas = 0;
    let totalAceleraciones = 0;
    let totalRalenti = 0;
    let calificacionesAcum = 0;
    let calificacionesCount = 0;

    consolidadoGlobal.forEach(c => {
      totalConductores += c.totalConductores;
      totalVehiculos += c.totalVehiculos;
      totalMotos += c.totalMotos;
      totalExcesos += c.excesos;
      totalExcesos80 += c.excesos80;
      totalExcesosBajo80 += c.excesosBajo80;
      totalFrenadas += c.frenadas;
      totalAceleraciones += c.aceleraciones;
      totalRalenti += c.ralenti;
      
      if (c.activeReportsCount > 0) {
        calificacionesAcum += c.calificacionPromedio;
        calificacionesCount++;
      }
    });

    repVehiculos.forEach(rv => {
      const kms = Number(rv.kms ?? 0);
      const isMotorcycle = esMoto(rv.vehiculos?.tipo_activo ?? rv.tipo_activo);
      if (isMotorcycle) {
        kmMotos += kms;
      } else {
        kmVehiculos += kms;
      }
      totalKms += kms;
    });

    if (totalKms === 0 && repConductores.length > 0) {
      repConductores.forEach(rc => {
        totalKms += Number(rc.kms ?? 0);
      });
      kmVehiculos = totalKms;
    }

    const totalFlotaActiva = totalVehiculos + totalMotos;

    let vehsConKm = 0;
    let vehsConExcess = 0;
    let vehsConFrenadas = 0;
    let vehsConAceleraciones = 0;
    let vehsConRalenti = 0;

    repVehiculos.forEach(rv => {
      const kms = Number(rv.kms ?? 0);
      if (kms > 0) vehsConKm++;
      
      const excesos = Number(rv.excesos_80_kph ?? 0) +
        Number(rv.excesos_10_kph ?? 0) +
        Number(rv.excesos_20_kph ?? 0) +
        Number(rv.excesos_30_kph ?? 0) +
        Number(rv.excesos_40_kph ?? 0) +
        Number(rv.excesos_50_kph ?? 0) +
        Number(rv.excesos_60_kph ?? 0);
      if (excesos > 0) vehsConExcess++;

      const ralenti = Number(rv.horas_motor_ralenti ?? 0);
      if (ralenti > 0) vehsConRalenti++;

      const frenadas = Number(rv.frenadas_bruscas ?? rv.frenadas ?? 0);
      if (frenadas > 0) vehsConFrenadas++;

      const aceleraciones = Number(rv.aceleraciones_bruscas ?? rv.aceleraciones ?? 0);
      if (aceleraciones > 0) vehsConAceleraciones++;
    });

    // Calcular participación de Conductores
    let condConKm = 0;
    let condConExcess = 0;
    let condConFrenadas = 0;
    let condConAceleraciones = 0;

    repConductores.forEach(rc => {
      const kms = Number(rc.kms ?? 0);
      if (kms > 0) condConKm++;

      const excesos = Number(rc.excesos_80_kph ?? 0) +
        Number(rc.excesos_10_kph ?? 0) +
        Number(rc.excesos_20_kph ?? 0) +
        Number(rc.excesos_30_kph ?? 0) +
        Number(rc.excesos_40_kph ?? 0) +
        Number(rc.excesos_50_kph ?? 0) +
        Number(rc.excesos_60_kph ?? 0);
      if (excesos > 0) condConExcess++;

      const frenadas = Number(rc.frenadas_bruscas ?? rc.frenadas ?? 0);
      if (frenadas > 0) condConFrenadas++;

      const aceleraciones = Number(rc.aceleraciones_bruscas ?? rc.aceleraciones ?? 0);
      if (aceleraciones > 0) condConAceleraciones++;
    });

    const pctVehConKm = totalFlotaActiva > 0 ? (vehsConKm / totalFlotaActiva) * 100 : 0;
    const pctVehConExcess = totalFlotaActiva > 0 ? (vehsConExcess / totalFlotaActiva) * 100 : 0;
    const pctVehConRalenti = totalFlotaActiva > 0 ? (vehsConRalenti / totalFlotaActiva) * 100 : 0;

    const calificacionPromedio = calificacionesCount > 0 ? (calificacionesAcum / calificacionesCount) : 100;

    return {
      totalConductores,
      totalVehiculos,
      totalMotos,
      totalFlotaActiva,
      kmVehiculos,
      kmMotos,
      totalKms,
      totalExcesos,
      totalExcesos80,
      totalExcesosBajo80,
      totalFrenadas,
      totalAceleraciones,
      totalRalenti,
      calificacionPromedio: Math.round(calificacionPromedio * 10) / 10,
      vehsConKm,
      vehsConExcess,
      vehsConFrenadas,
      vehsConAceleraciones,
      vehsConRalenti,
      pctVehConKm,
      pctVehConExcess,
      pctVehConRalenti,
      // Conductores
      condConKm,
      condConExcess,
      condConFrenadas,
      condConAceleraciones
    };
  }, [consolidadoGlobal, repVehiculos, repConductores]);

  // Formato WhatsApp para Reporte PRM Global
  const textoPRMGlobal = useMemo(() => {
    const r = metricasGlobales;
    return `📋 *REPORTE GERENCIAL PRM (Torre de Control - Consolidado Global)*\n` +
      `*Periodo:* ${filtro.fechaInicio} al ${filtro.fechaFin}\n\n` +
      `👤 *N° Conductores:* ${r.totalConductores}\n` +
      `🚗 *N° Vehículos:* ${r.totalVehiculos}\n` +
      `🏍️ *N° Motocicletas:* ${r.totalMotos}\n` +
      `🛣️ *Km recorridos Vehículos:* ${fmt(r.kmVehiculos, 1)} km\n` +
      `🛵 *Km recorridos Motocicletas:* ${fmt(r.kmMotos, 1)} km\n\n` +
      `📈 *Total Km:* ${fmt(r.totalKms, 1)} km`;
  }, [metricasGlobales, filtro]);

  const copiarPRMGlobal = async () => {
    try {
      await navigator.clipboard.writeText(textoPRMGlobal);
      setCopiadoGlobal(true);
      setTimeout(() => setCopiadoGlobal(false), 2000);
    } catch (err) {
      console.error('Error copiando PRM global:', err);
    }
  };

  // --- DETECCION DE CONDUCTORES Y VEHICULOS FANTASMAS (NO REGISTRADOS EN SHEET) ---
  const ghostEntities = useMemo(() => {
    // 1. Conductores Fantasmas:
    const fantasmasConductores = pendingDrivers.map(pd => {
      const reps = repConductores.filter(rc => rc.conductor_id === pd.id);
      const kms = reps.reduce((acc, r) => acc + Number(r.kms ?? 0), 0);
      const excesos = reps.reduce((acc, r) => acc + 
        Number(r.excesos_80_kph ?? 0) + 
        Number(r.excesos_10_kph ?? 0) + 
        Number(r.excesos_20_kph ?? 0) + 
        Number(r.excesos_30_kph ?? 0) + 
        Number(r.excesos_40_kph ?? 0) + 
        Number(r.excesos_50_kph ?? 0) + 
        Number(r.excesos_60_kph ?? 0), 0);
      const frenadas = reps.reduce((acc, r) => acc + Number(r.frenadas_bruscas ?? r.frenadas ?? 0), 0);
      const calificacion = reps.length > 0 ? (reps.reduce((acc, r) => acc + Number(r.calificacion ?? 100), 0) / reps.length) : 100;
      
      return {
        id: pd.id,
        nombre: pd.nombres,
        cedula: pd.cedula,
        ibutton: pd.ibutton,
        kms,
        excesos,
        frenadas,
        calificacion: Math.round(calificacion),
        active: reps.length > 0 || kms > 0
      };
    }).filter(g => g.active);

    // 2. Vehículos Fantasmas:
    const fantasmasVehiculos = pendingVehicles.map(pv => {
      const reps = repVehiculos.filter(rv => rv.vehiculo_id === pv.id);
      const kms = reps.reduce((acc, r) => acc + Number(r.kms ?? 0), 0);
      const excesos = reps.reduce((acc, r) => acc + 
        Number(r.excesos_80_kph ?? 0) + 
        Number(r.excesos_10_kph ?? 0) + 
        Number(r.excesos_20_kph ?? 0) + 
        Number(r.excesos_30_kph ?? 0) + 
        Number(r.excesos_40_kph ?? 0) + 
        Number(r.excesos_50_kph ?? 0) + 
        Number(r.excesos_60_kph ?? 0), 0);
      const frenadas = reps.reduce((acc, r) => acc + Number(r.frenadas_bruscas ?? r.frenadas ?? 0), 0);
      const ralenti = reps.reduce((acc, r) => acc + Number(r.horas_motor_ralenti ?? 0), 0);
      const calificacion = reps.length > 0 ? (reps.reduce((acc, r) => acc + Number(r.calificacion ?? 100), 0) / reps.length) : 100;

      return {
        id: pv.id,
        placa: pv.placa,
        kms,
        excesos,
        frenadas,
        ralenti,
        calificacion: Math.round(calificacion),
        active: reps.length > 0 || kms > 0
      };
    }).filter(g => g.active);

    return {
      conductores: fantasmasConductores,
      vehiculos: fantasmasVehiculos,
      totalFantasmas: fantasmasConductores.length + fantasmasVehiculos.length
    };
  }, [pendingDrivers, pendingVehicles, repConductores, repVehiculos]);

  // Ordenar consolidado global
  const sortedConsolidadoGlobal = useMemo(() => {
    return [...consolidadoGlobal].sort((a: any, b: any) => {
      const valA = a[sortField];
      const valB = b[sortField];
      
      if (typeof valA === 'string') {
        return sortDirection === 'asc' 
          ? valA.localeCompare(valB) 
          : valB.localeCompare(valA);
      } else {
        return sortDirection === 'asc' 
          ? (valA ?? 0) - (valB ?? 0) 
          : (valB ?? 0) - (valA ?? 0);
      }
    });
  }, [consolidadoGlobal, sortField, sortDirection]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  // --- PAGINACIÓN DE TABLAS (Slicing) ---
  const paginatedIndVehicles = useMemo(() => {
    const start = (indPage - 1) * indPageSize;
    return metricas.filteredVehReports.slice(start, start + indPageSize);
  }, [metricas.filteredVehReports, indPage, indPageSize]);

  const paginatedConsolidadoGlobal = useMemo(() => {
    const start = (globalPage - 1) * globalPageSize;
    return sortedConsolidadoGlobal.slice(start, start + globalPageSize);
  }, [sortedConsolidadoGlobal, globalPage, globalPageSize]);

  const paginatedGhostConductores = useMemo(() => {
    const start = (condPage - 1) * condPageSize;
    return ghostEntities.conductores.slice(start, start + condPageSize);
  }, [ghostEntities.conductores, condPage, condPageSize]);

  const paginatedGhostVehiculos = useMemo(() => {
    const start = (vehPage - 1) * vehPageSize;
    return ghostEntities.vehiculos.slice(start, start + vehPageSize);
  }, [ghostEntities.vehiculos, vehPage, vehPageSize]);

  // Resetear páginas cuando cambian los conjuntos de datos
  useEffect(() => { setIndPage(1); }, [metricas.filteredVehReports.length, indPageSize]);
  useEffect(() => { setGlobalPage(1); }, [sortedConsolidadoGlobal.length, globalPageSize]);
  useEffect(() => { setCondPage(1); }, [ghostEntities.conductores.length, condPageSize]);
  useEffect(() => { setVehPage(1); }, [ghostEntities.vehiculos.length, vehPageSize]);

  // Exportar desglose de vehículos (individual/multicontrato) a XLSX
  const exportarExcel = () => {
    if (metricas.filteredVehReports.length === 0) return;
    
    const formattedRows = metricas.filteredVehReports.map(rv => {
      const exc80 = Number(rv.excesos_80_kph ?? 0);
      const excBajo80 = Number(rv.excesos_10_kph ?? 0) +
        Number(rv.excesos_20_kph ?? 0) +
        Number(rv.excesos_30_kph ?? 0) +
        Number(rv.excesos_40_kph ?? 0) +
        Number(rv.excesos_50_kph ?? 0) +
        Number(rv.excesos_60_kph ?? 0);
        
      return {
        'Placa': rv.vehiculos?.placa ?? rv.placa,
        'Marca': rv.vehiculos?.marca ?? rv.marca ?? '—',
        'Tipo Activo': rv.vehiculos?.tipo_activo ?? rv.tipo_activo ?? '—',
        'Kilómetros': Number(rv.kms ?? 0),
        'Horas Conducción': Number(rv.horas_conduccion ?? 0),
        'Horas Ralentí': Number(rv.horas_motor_ralenti ?? 0),
        'Excesos >= 80 Km/h': exc80,
        'Excesos < 80 Km/h': excBajo80,
        'Frenadas Bruscas': Number(rv.frenadas_bruscas ?? rv.frenadas ?? 0),
        'Aceleraciones Bruscas': Number(rv.aceleraciones_bruscas ?? rv.aceleraciones ?? 0),
        'Calificación': Number(rv.calificacion ?? 0)
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(formattedRows);
    const workbook = XLSX.utils.book_new();
    
    const columnWidths = [
      { wch: 12 }, // Placa
      { wch: 15 }, // Marca
      { wch: 18 }, // Tipo Activo
      { wch: 15 }, // Kilómetros
      { wch: 18 }, // Horas Conducción
      { wch: 15 }, // Horas Ralentí
      { wch: 20 }, // Excesos >= 80
      { wch: 20 }, // Excesos < 80
      { wch: 18 }, // Frenadas
      { wch: 22 }, // Aceleraciones
      { wch: 14 }  // Calificación
    ];
    worksheet['!cols'] = columnWidths;

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Desglose Vehículos');
    
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `desglose_multicontratos_${filtro.fechaInicio}_${filtro.fechaFin}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  // Exportar consolidado global a XLSX
  const exportarExcelGlobal = () => {
    if (consolidadoGlobal.length === 0) return;
    
    const formattedRows = consolidadoGlobal.map(c => ({
      'Contrato': c.nombre,
      'Cliente': c.cliente ?? '—',
      'Conductores Activos': Number(c.totalConductores ?? 0),
      'Vehículos Activos': Number(c.totalVehiculos ?? 0),
      'Motos Activas': Number(c.totalMotos ?? 0),
      'Kilómetros Totales': Number(c.kms ?? 0),
      'Excesos >= 80': Number(c.excesos80 ?? 0),
      'Excesos < 80': Number(c.excesosBajo80 ?? 0),
      'Frenadas Bruscas': Number(c.frenadas ?? 0),
      'Ralentí (Horas)': Number(c.ralenti ?? 0),
      'Calificación Promedio': Number(c.calificacionPromedio ?? 0)
    }));

    const worksheet = XLSX.utils.json_to_sheet(formattedRows);
    const workbook = XLSX.utils.book_new();
    
    const columnWidths = [
      { wch: 32 }, // Contrato
      { wch: 24 }, // Cliente
      { wch: 20 }, // Conductores Activos
      { wch: 18 }, // Vehículos Activos
      { wch: 16 }, // Motos Activas
      { wch: 20 }, // Kilómetros Totales
      { wch: 16 }, // Excesos >= 80
      { wch: 16 }, // Excesos < 80
      { wch: 18 }, // Frenadas
      { wch: 18 }, // Ralentí (Horas)
      { wch: 22 }  // Calificación Promedio
    ];
    worksheet['!cols'] = columnWidths;

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Consolidado Global');
    
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `consolidado_global_contratos_${filtro.fechaInicio}_${filtro.fechaFin}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const exportarPDFIndividual = async () => {
    if (selectedContratoIds.length === 0) return;
    setGenerandoPDF(true);
    try {
      const contratosSeleccionados = contratos.filter(c => selectedContratoIds.includes(c.id));
      await descargarPDFAnalisisContrato(
        contratosSeleccionados,
        { fechaInicio: filtro.fechaInicio, fechaFin: filtro.fechaFin },
        metricas,
        metricas.filteredVehReports
      );
    } catch (err) {
      console.error('Error al generar PDF individual:', err);
      alert('Hubo un error al generar el PDF del reporte por contrato.');
    } finally {
      setGenerandoPDF(false);
    }
  };

  const exportarPDFGlobal = async () => {
    if (consolidadoGlobal.length === 0) return;
    setGenerandoPDF(true);
    try {
      await descargarPDFConsolidadoGlobal(
        consolidadoGlobal,
        metricasGlobales,
        ghostEntities,
        { fechaInicio: filtro.fechaInicio, fechaFin: filtro.fechaFin }
      );
    } catch (err) {
      console.error('Error al generar PDF global:', err);
      alert('Hubo un error al generar el PDF del consolidado global.');
    } finally {
      setGenerandoPDF(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Reglas de impresión CSS dinámicas */}
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          body {
            background: white !important;
            color: black !important;
          }
          .no-print {
            display: none !important;
          }
          .print-only {
            display: block !important;
          }
          .print-card {
            border: 1px solid #e2e8f0 !important;
            box-shadow: none !important;
            page-break-inside: avoid !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          circle {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          table {
            width: 100% !important;
            border-collapse: collapse !important;
          }
          th, td {
            border: 1px solid #cbd5e1 !important;
            padding: 6px 8px !important;
            font-size: 10px !important;
          }
          .page-break {
            page-break-before: always !important;
          }
        }
        .print-only {
          display: none;
        }
      `}} />

      {/* Cabecera para impresión PDF */}
      <div className="print-only mb-6 border-b-2 border-slate-300 pb-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900">MAGNEX · TORRE DE CONTROL</h1>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Informe Gerencial de Seguridad Vial y Telemetría</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500 font-semibold">Generado: {new Date().toLocaleDateString('es-CO')}</p>
            <p className="text-[10px] text-slate-400 font-mono">magnex-report-prm-v1</p>
          </div>
        </div>
        <div className="mt-4 bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs text-slate-700 space-y-1">
          <p><strong>Periodo de Evaluación:</strong> {filtro.fechaInicio} al {filtro.fechaFin}</p>
          <p><strong>Contratos Evaluados:</strong> {activeSubTab === 'individual' ? dropdownLabel : 'Todos los Contratos Activos'}</p>
          <p><strong>Tipo de Análisis:</strong> {activeSubTab === 'individual' ? 'Análisis Gerencial por Contrato (Multiselección)' : 'Análisis Consolidado Global Corporativo'}</p>
        </div>
      </div>

      {/* Controles superiores */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between transition-colors no-print">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          
          {/* Selector de Contratos Multiselección (Solo en Pestaña Individual) */}
          {activeSubTab === 'individual' ? (
            <div className="flex flex-col relative w-64" ref={dropdownRef}>
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-1">Contrato (Multiselección)</span>
              <button
                type="button"
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="w-full flex items-center justify-between pl-3 pr-2.5 py-2 border border-slate-200 dark:border-slate-600 rounded-lg text-sm bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer transition-colors"
              >
                <span className="truncate mr-2 font-medium">{dropdownLabel}</span>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${dropdownOpen ? 'transform rotate-180' : ''}`} />
              </button>
              
              {dropdownOpen && (
                <div className="absolute top-[58px] left-0 w-80 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-50 p-3.5 space-y-3 animate-fade-in transition-all">
                  {/* Buscador interno */}
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Buscar contrato o cliente..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 border border-slate-200 dark:border-slate-600 rounded-lg text-xs bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  </div>

                  {/* Acciones Rápidas */}
                  <div className="flex justify-between items-center gap-2 border-b border-slate-100 dark:border-slate-700/60 pb-2">
                    <button
                      type="button"
                      onClick={selectAll}
                      className="text-[10px] font-extrabold text-blue-500 hover:text-blue-600 dark:hover:text-blue-400 uppercase tracking-wide"
                    >
                      Seleccionar Todos
                    </button>
                    <button
                      type="button"
                      onClick={clearAll}
                      className="text-[10px] font-extrabold text-slate-400 hover:text-slate-500 uppercase tracking-wide"
                    >
                      Limpiar
                    </button>
                  </div>

                  {/* Lista de Checkboxes */}
                  <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1 divide-y divide-slate-100 dark:divide-slate-700/40">
                    {filteredContratos.map(c => {
                      const isChecked = selectedContratoIds.includes(c.id);
                      return (
                        <label
                          key={c.id}
                          className="flex items-center gap-2.5 py-1.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/30 px-1 rounded transition-colors text-xs text-slate-700 dark:text-slate-300 first:pt-0 pt-1.5"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleContrato(c.id)}
                            className="rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500 dark:bg-slate-700"
                          />
                          <span className="truncate select-none font-medium flex-1">
                            {c.nombre} <span className="text-[10px] text-slate-400 dark:text-slate-500">({c.cliente})</span>
                          </span>
                        </label>
                      );
                    })}
                    {filteredContratos.length === 0 && (
                      <div className="text-center py-4 text-xs text-slate-400">
                        No se encontraron contratos.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-1">Contrato</span>
              <div className="px-3 py-2 border border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-700/30 text-slate-400 dark:text-slate-500 rounded-lg text-sm font-semibold tracking-wide select-none">
                🌐 Todos los Contratos Activos
              </div>
            </div>
          )}

          {/* Rango de Fechas */}
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-1">Fecha Inicio</span>
            <div className="relative">
              <input
                type="date"
                value={filtro.fechaInicio}
                onChange={(e) => setFiltro(prev => ({ ...prev, fechaInicio: e.target.value }))}
                className="pl-8 pr-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg text-sm bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              />
              <Calendar className="w-4 h-4 text-slate-400 absolute left-2.5 top-3 pointer-events-none" />
            </div>
          </div>

          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-1">Fecha Fin</span>
            <div className="relative">
              <input
                type="date"
                value={filtro.fechaFin}
                onChange={(e) => setFiltro(prev => ({ ...prev, fechaFin: e.target.value }))}
                className="pl-8 pr-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg text-sm bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              />
              <Calendar className="w-4 h-4 text-slate-400 absolute left-2.5 top-3 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Botón de Refrescar */}
        <button
          onClick={cargarDatos}
          disabled={cargando}
          className="w-full md:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-sm transition-colors disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 ${cargando ? 'animate-spin' : ''}`} />
          {cargando ? 'Analizando...' : 'Actualizar Análisis'}
        </button>
      </div>

      {/* Sub-navegación por Pestañas (Submódulos) */}
      <div className="flex border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-xl p-1 shadow-sm transition-colors no-print">
        <button
          onClick={() => setActiveSubTab('individual')}
          className={`flex-1 py-2.5 rounded-lg text-xs font-extrabold uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${activeSubTab === 'individual' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
        >
          <Users className="w-4 h-4" />
          Análisis por Contrato (Individual / Multiselección)
        </button>
        <button
          onClick={() => setActiveSubTab('global')}
          className={`flex-1 py-2.5 rounded-lg text-xs font-extrabold uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${activeSubTab === 'global' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
        >
          <BarChart3 className="w-4 h-4" />
          Consolidado Global ({consolidadoGlobal.length} Contratos)
        </button>
      </div>

      {cargando ? (
        <div className="flex flex-col justify-center items-center py-20 gap-3">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-medium text-slate-500 dark:text-slate-400 animate-pulse">Consolidando indicadores gerenciales de la base de datos...</span>
        </div>
      ) : (
        <div className="space-y-6 animate-fade-in">
          
          {/* PESTAÑA 1: VISTA GERENCIAL INDIVIDUAL O MULTICONTRATOS */}
          {activeSubTab === 'individual' && (
            selectedContratoIds.length === 0 ? (
              <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 rounded-2xl p-12 text-center text-slate-500 dark:text-slate-400 space-y-3 transition-colors">
                <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto animate-pulse" />
                <h3 className="font-extrabold text-slate-800 dark:text-white text-lg">Ningún contrato seleccionado</h3>
                <p className="text-sm max-w-md mx-auto">Por favor, despliega el selector de contratos superior y elige al menos un contrato para visualizar las métricas y generar el reporte PRM.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* KPIs Gerenciales */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <StatCardGerencial
                    label="Conductores Asignados"
                    value={String(metricas.totalConductoresActivos)}
                    sub={`Total operadores activos en el roster asignados a ${selectedContratoIds.length === 1 ? 'este contrato' : 'estos contratos'}.`}
                    color="blue"
                  />
                  <StatCardGerencial
                    label="Flota de Vehículos"
                    value={String(metricas.totalFlotaActiva)}
                    sub={`${metricas.totalVehiculosActivos} autos/camiones y ${metricas.totalMotosActivas} motocicletas activas en el roster.`}
                    color="purple"
                  />
                  <StatCardGerencial
                    label="Total Kilómetros"
                    value={`${fmt(metricas.totalKms, 0)} km`}
                    sub="Kilómetros acumulados recorridos por toda la flota asignada en el periodo."
                    color="green"
                  />
                  <StatCardGerencial
                    label="Tiempo en Ralentí"
                    value={`${fmt(metricas.totalRalentiHoras, 1)} h`}
                    sub="Horas improductivas con el motor encendido y vehículo detenido."
                    color="amber"
                  />
                </div>

                {/* Segunda Fila: Reporte PRM y Indicadores de Flota */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  
                  {/* PRM Card Panel */}
                  <div className="lg:col-span-5 bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-800 text-white rounded-2xl p-6 flex flex-col justify-between shadow-lg relative overflow-hidden group print-card">
                    <div className="absolute -right-16 -top-16 w-44 h-44 rounded-full bg-blue-500/10 blur-xl pointer-events-none group-hover:bg-blue-500/20 transition-all duration-500" />
                    
                    <div>
                      <div className="flex items-center justify-between border-b border-slate-700/50 pb-4 mb-4">
                        <div className="flex items-center gap-2.5">
                          <FileText className="w-5 h-5 text-blue-400" />
                          <span className="font-bold tracking-tight text-lg">Reporte Oficial PRM</span>
                        </div>
                        <button
                          onClick={copiarPRM}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all shadow-md no-print ${copiado ? 'bg-green-600 text-white animate-scale' : 'bg-slate-700/60 hover:bg-slate-700 text-slate-200'}`}
                        >
                          {copiado ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          {copiado ? '¡Copiado!' : 'Copiar Reporte'}
                        </button>
                      </div>

                      <div className="space-y-3.5 text-slate-300">
                        <div className="flex justify-between items-center text-sm py-1 border-b border-slate-800/40">
                          <span className="flex items-center gap-2"><Users className="w-4 h-4 text-blue-400" /> N° Conductores:</span>
                          <strong className="text-white text-base font-bold">{metricas.totalConductoresActivos}</strong>
                        </div>
                        <div className="flex justify-between items-center text-sm py-1 border-b border-slate-800/40">
                          <span className="flex items-center gap-2"><Truck className="w-4 h-4 text-blue-400" /> N° Vehículos:</span>
                          <strong className="text-white text-base font-bold">{metricas.totalVehiculosActivos}</strong>
                        </div>
                        <div className="flex justify-between items-center text-sm py-1 border-b border-slate-800/40">
                          <span className="flex items-center gap-2"><Bike className="w-4 h-4 text-blue-400" /> N° Motocicletas:</span>
                          <strong className="text-white text-base font-bold">{metricas.totalMotosActivas}</strong>
                        </div>
                        <div className="flex justify-between items-center text-sm py-1 border-b border-slate-800/40">
                          <span className="flex items-center gap-2"><Truck className="w-4 h-4 text-emerald-400" /> Km recorridos Vehículos:</span>
                          <strong className="text-white text-base font-bold">{fmt(metricas.kmVehiculos, 1)} km</strong>
                        </div>
                        <div className="flex justify-between items-center text-sm py-1 border-b border-slate-800/40">
                          <span className="flex items-center gap-2"><Bike className="w-4 h-4 text-emerald-400" /> Km recorridos Motocicletas:</span>
                          <strong className="text-white text-base font-bold">{fmt(metricas.kmMotos, 1)} km</strong>
                        </div>
                      </div>
                    </div>

                    <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-4 mt-6 flex justify-between items-center shadow-inner">
                      <span className="text-xs uppercase font-extrabold tracking-wider text-slate-400">Total Km Consolidado</span>
                      <strong className="text-emerald-400 text-2xl font-black">{fmt(metricas.totalKms, 1)} km</strong>
                    </div>
                  </div>

                  {/* Eficiencia de Uso de Flota (Métricas en Donut) */}
                  <div className="lg:col-span-7 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-sm flex flex-col justify-between transition-colors print-card">
                    <div>
                      <h3 className="font-bold text-slate-800 dark:text-white text-lg border-b border-slate-100 dark:border-slate-700 pb-3 mb-5 flex items-center gap-2">
                        <BarChart3 className="w-5 h-5 text-blue-500" /> Efectividad Operativa de Flota ({selectedContratoIds.length === 1 ? 'Contrato' : 'Consolidado'})
                      </h3>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                        {/* Gauge 1: Generaron Km */}
                        <div className="flex flex-col items-center">
                          <div className="relative w-28 h-28 flex items-center justify-center">
                            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                              <circle cx="18" cy="18" r="15.915" fill="none" stroke="#f1f5f9" strokeWidth="3" className="dark:stroke-slate-700" />
                              <circle cx="18" cy="18" r="15.915" fill="none" stroke="#10b981" strokeWidth="3" strokeDasharray={`${metricas.pctVehConKm} 100`} className="transition-all duration-1000" />
                            </svg>
                            <div className="absolute flex flex-col items-center justify-center">
                              <span className="text-lg font-black text-slate-800 dark:text-white">{Math.round(metricas.pctVehConKm)}%</span>
                            </div>
                          </div>
                          <span className="text-xs font-bold text-slate-700 dark:text-slate-300 mt-2 text-center">Flota Activa con Km</span>
                          <span className="text-[10px] text-slate-400 text-center leading-tight mt-1">{metricas.vehsConKm} de {metricas.totalFlotaActiva} rodaron</span>
                        </div>

                        {/* Gauge 2: Ralentí */}
                        <div className="flex flex-col items-center">
                          <div className="relative w-28 h-28 flex items-center justify-center">
                            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                              <circle cx="18" cy="18" r="15.915" fill="none" stroke="#f1f5f9" strokeWidth="3" className="dark:stroke-slate-700" />
                              <circle cx="18" cy="18" r="15.915" fill="none" stroke="#f59e0b" strokeWidth="3" strokeDasharray={`${metricas.pctVehConRalenti} 100`} className="transition-all duration-1000" />
                            </svg>
                            <div className="absolute flex flex-col items-center justify-center">
                              <span className="text-lg font-black text-slate-800 dark:text-white">{Math.round(metricas.pctVehConRalenti)}%</span>
                            </div>
                          </div>
                          <span className="text-xs font-bold text-slate-700 dark:text-slate-300 mt-2 text-center">Flota con Ralentí</span>
                          <span className="text-[10px] text-slate-400 text-center leading-tight mt-1">{metricas.vehsConRalenti} de {metricas.totalFlotaActiva} motores encendidos</span>
                        </div>

                        {/* Gauge 3: Excesos */}
                        <div className="flex flex-col items-center">
                          <div className="relative w-28 h-28 flex items-center justify-center">
                            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                              <circle cx="18" cy="18" r="15.915" fill="none" stroke="#f1f5f9" strokeWidth="3" className="dark:stroke-slate-700" />
                              <circle cx="18" cy="18" r="15.915" fill="none" stroke="#ef4444" strokeWidth="3" strokeDasharray={`${metricas.pctVehConExcess} 100`} className="transition-all duration-1000" />
                            </svg>
                            <div className="absolute flex flex-col items-center justify-center">
                              <span className="text-lg font-black text-slate-800 dark:text-white">{Math.round(metricas.pctVehConExcess)}%</span>
                            </div>
                          </div>
                          <span className="text-xs font-bold text-slate-700 dark:text-slate-300 mt-2 text-center">Flota con Excesos</span>
                          <span className="text-[10px] text-slate-400 text-center leading-tight mt-1">{metricas.vehsConExcess} de {metricas.totalFlotaActiva} presentaron alertas</span>
                        </div>
                      </div>
                    </div>

                    {/* Total Desviaciones */}
                    <div className="grid grid-cols-3 gap-2 border-t border-slate-100 dark:border-slate-700/60 pt-4 mt-6">
                      <div className="bg-slate-50 dark:bg-slate-900/40 p-2.5 rounded-lg flex flex-col items-center">
                        <span className="text-[10px] font-bold text-slate-400 uppercase leading-none">Excesos Velocidad</span>
                        <strong className="text-base text-red-500 font-extrabold mt-1">{metricas.totalExcesos}</strong>
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-900/40 p-2.5 rounded-lg flex flex-col items-center">
                        <span className="text-[10px] font-bold text-slate-400 uppercase leading-none">Frenadas Bruscas</span>
                        <strong className="text-base text-amber-500 font-extrabold mt-1">{metricas.totalFrenadas}</strong>
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-900/40 p-2.5 rounded-lg flex flex-col items-center">
                        <span className="text-[10px] font-bold text-slate-400 uppercase leading-none">Sobreaceleraciones</span>
                        <strong className="text-base text-blue-500 font-extrabold mt-1">{metricas.totalAceleraciones}</strong>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Participación en Conducción y Desviaciones - Individual */}
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-sm space-y-5 transition-colors print-card">
                  <h3 className="font-bold text-slate-800 dark:text-white text-lg border-b border-slate-100 dark:border-slate-700 pb-3 flex items-center gap-2">
                    <Users className="w-5 h-5 text-blue-500" /> Participación en Conducción y Desviaciones ({selectedContratoIds.length === 1 ? 'Contrato' : 'Consolidado'})
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Conductores */}
                    <div className="space-y-4">
                      <h4 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center justify-between">
                        <span>👤 Análisis de Conductores</span>
                        <span className="bg-slate-50 dark:bg-slate-700 px-2 py-0.5 rounded text-[10px] text-slate-700 dark:text-slate-300 font-bold">Total Roster: {metricas.totalConductoresActivos}</span>
                      </h4>
                      <div className="space-y-3.5">
                        <ProgressBarStat label="Generaron Recorridos (KMs > 0)" value={metricas.condConKm} total={metricas.totalConductoresActivos} color="emerald" />
                        <ProgressBarStat label="Presentaron Excesos de Velocidad" value={metricas.condConExcess} total={metricas.totalConductoresActivos} color="red" />
                        <ProgressBarStat label="Presentaron Frenadas Bruscas" value={metricas.condConFrenadas} total={metricas.totalConductoresActivos} color="orange" />
                        <ProgressBarStat label="Presentaron Sobreaceleraciones" value={metricas.condConAceleraciones} total={metricas.totalConductoresActivos} color="blue" />
                      </div>
                    </div>
                    {/* Vehículos */}
                    <div className="space-y-4">
                      <h4 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center justify-between">
                        <span>🚘 Análisis de Vehículos</span>
                        <span className="bg-slate-50 dark:bg-slate-700 px-2 py-0.5 rounded text-[10px] text-slate-700 dark:text-slate-300 font-bold">Flota Roster: {metricas.totalFlotaActiva}</span>
                      </h4>
                      <div className="space-y-3.5">
                        <ProgressBarStat label="Generaron Recorridos (KMs > 0)" value={metricas.vehsConKm} total={metricas.totalFlotaActiva} color="emerald" />
                        <ProgressBarStat label="Presentaron Excesos de Velocidad" value={metricas.vehsConExcess} total={metricas.totalFlotaActiva} color="red" />
                        <ProgressBarStat label="Presentaron Frenadas Bruscas" value={metricas.vehsConFrenadas} total={metricas.totalFlotaActiva} color="orange" />
                        <ProgressBarStat label="Presentaron Sobreaceleraciones" value={metricas.vehsConAceleraciones} total={metricas.totalFlotaActiva} color="blue" />
                        <ProgressBarStat label="Presentaron Ralentí Excesivo" value={metricas.vehsConRalenti} total={metricas.totalFlotaActiva} color="amber" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Tabla de Desglose Detallado por Vehículo con Paginación */}
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-sm space-y-4 transition-colors print-card">
                  <div className="flex flex-col sm:flex-row items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-3 gap-2">
                    <div>
                      <h3 className="font-bold text-slate-800 dark:text-white text-lg">Desglose Operativo por Vehículo</h3>
                      <p className="text-xs text-slate-400 leading-snug">Visualización detallada de la telemetría mensual consolidada por cada placa de los contratos activos.</p>
                    </div>
                    <div className="flex items-center gap-2 no-print">
                      <button
                        onClick={exportarPDFIndividual}
                        disabled={generandoPDF || metricas.filteredVehReports.length === 0}
                        className="inline-flex items-center gap-1.5 px-3 py-2 border-2 border-slate-200 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-bold transition-all disabled:opacity-50"
                      >
                        {generandoPDF ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Printer className="w-3.5 h-3.5" />
                        )}
                        {generandoPDF ? 'Generando PDF...' : 'Exportar PDF'}
                      </button>
                      <button
                        onClick={exportarExcel}
                        disabled={metricas.filteredVehReports.length === 0}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 border-2 border-slate-200 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-bold transition-all disabled:opacity-50"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Exportar Excel
                      </button>
                    </div>
                  </div>

                  {metricas.filteredVehReports.length === 0 ? (
                    <div className="text-center py-10 text-slate-400 text-sm">
                      No hay datos consolidados de vehículos en el período y contratos seleccionados. Carga y procesa archivos primero.
                    </div>
                  ) : (
                    <>
                      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700/60">
                          <thead className="bg-slate-50 dark:bg-slate-800/80 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center">
                            <tr>
                              <th className="px-4 py-3 text-left">Placa</th>
                              <th className="px-4 py-3">Contrato</th>
                              <th className="px-4 py-3">Tipo Activo</th>
                              <th className="px-4 py-3">Kilómetros</th>
                              <th className="px-4 py-3">Horas Ralentí</th>
                              <th className="px-3 py-3">Exc. &gt;= 80</th>
                              <th className="px-3 py-3">Exc. &lt; 80</th>
                              <th className="px-4 py-3">Frenadas Bruscas</th>
                              <th className="px-4 py-3">Sobreaceleraciones</th>
                              <th className="px-4 py-3">Calificación</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-700/40 text-xs text-slate-700 dark:text-slate-300 text-center">
                            {paginatedIndVehicles.map((rv, idx) => {
                              const placa = rv.vehiculos?.placa ?? rv.placa;
                              const tipo = rv.vehiculos?.tipo_activo ?? rv.tipo_activo ?? '—';
                              const isMotorcycle = esMoto(tipo);
                              const cNom = rv.contratos?.nombre ?? contratos.find(c => c.id === (rv.contrato_id || rv.vehiculos?.contrato_id))?.nombre ?? '—';
                              
                              const exc80 = Number(rv.excesos_80_kph ?? 0);
                              const excBajo80 = Number(rv.excesos_10_kph ?? 0) +
                                Number(rv.excesos_20_kph ?? 0) +
                                Number(rv.excesos_30_kph ?? 0) +
                                Number(rv.excesos_40_kph ?? 0) +
                                Number(rv.excesos_50_kph ?? 0) +
                                Number(rv.excesos_60_kph ?? 0);
                              
                              const score = Number(rv.calificacion ?? 100);
                              const scoreColor = score >= 90 ? 'text-emerald-500' : score >= 70 ? 'text-amber-500' : 'text-red-500';

                              return (
                                <tr key={rv.id || idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/20 transition-all">
                                  <td className="px-4 py-2.5 text-left font-black text-slate-900 dark:text-white uppercase tracking-tight">{placa}</td>
                                  <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400 font-semibold">{cNom}</td>
                                  <td className="px-4 py-2.5">
                                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold leading-none ${isMotorcycle ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'}`}>
                                      {isMotorcycle ? <Bike className="w-3 h-3" /> : <Truck className="w-3 h-3" />}
                                      {tipo}
                                    </span>
                                  </td>
                                  <td className="px-4 py-2.5 font-semibold">{fmt(rv.kms, 1)} km</td>
                                  <td className="px-4 py-2.5 font-semibold text-amber-500">{fmt(rv.horas_motor_ralenti ?? 0, 1)} h</td>
                                  <td className="px-3 py-2.5 font-semibold text-red-600 font-bold">{exc80}</td>
                                  <td className="px-3 py-2.5 font-semibold text-red-500">{excBajo80}</td>
                                  <td className="px-4 py-2.5 font-semibold text-orange-500">{rv.frenadas_bruscas ?? rv.frenadas ?? 0}</td>
                                  <td className="px-4 py-2.5 font-semibold text-blue-500">{rv.aceleraciones_bruscas ?? rv.aceleraciones ?? 0}</td>
                                  <td className={`px-4 py-2.5 font-black text-sm ${scoreColor}`}>{score}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <TablePagination
                        currentPage={indPage}
                        pageSize={indPageSize}
                        totalItems={metricas.filteredVehReports.length}
                        onPageChange={setIndPage}
                        onPageSizeChange={setIndPageSize}
                      />
                    </>
                  )}
                </div>
              </div>
            )
          )}

          {/* PESTAÑA 2: VISTA CONSOLIDADA GLOBAL DE TODOS LOS CONTRATOS */}
          {activeSubTab === 'global' && (
            <div className="space-y-6">
              
              {/* KPIs Consolidados Globales */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCardGerencial
                  label="Contratos Activos"
                  value={String(consolidadoGlobal.length)}
                  sub="Total de contratos con operaciones registradas en el periodo."
                  color="blue"
                />
                <StatCardGerencial
                  label="Conductores Consolidados"
                  value={String(metricasGlobales.totalConductores)}
                  sub={`Total operadores activos en roster general.`}
                  color="purple"
                />
                <StatCardGerencial
                  label="Kilometraje General"
                  value={`${fmt(metricasGlobales.totalKms, 0)} km`}
                  sub="Kilómetros globales sumados por toda la flota del sistema."
                  color="green"
                />
                <StatCardGerencial
                  label="Puntaje de Seguridad"
                  value={`${metricasGlobales.calificacionPromedio} pts`}
                  sub="Calificación promedio ponderada de seguridad vial a nivel nacional."
                  color="amber"
                />
              </div>

              {/* ANÁLISIS GLOBAL CONSOLIDADO PRM Y EFECTIVIDAD (SIDE BY SIDE) */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fade-in">
                
                {/* PRM Card Panel - Global */}
                <div className="lg:col-span-5 bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-800 text-white rounded-2xl p-6 flex flex-col justify-between shadow-lg relative overflow-hidden group print-card">
                  <div className="absolute -right-16 -top-16 w-44 h-44 rounded-full bg-emerald-500/10 blur-xl pointer-events-none group-hover:bg-emerald-500/20 transition-all duration-500" />
                  
                  <div>
                    <div className="flex items-center justify-between border-b border-slate-700/50 pb-4 mb-4">
                      <div className="flex items-center gap-2.5">
                        <FileText className="w-5 h-5 text-emerald-400" />
                        <span className="font-bold tracking-tight text-lg">Reporte Oficial PRM (Global)</span>
                      </div>
                      <button
                        onClick={copiarPRMGlobal}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all shadow-md no-print ${copiadoGlobal ? 'bg-green-600 text-white animate-scale' : 'bg-slate-700/60 hover:bg-slate-700 text-slate-200'}`}
                      >
                        {copiadoGlobal ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiadoGlobal ? '¡Copiado!' : 'Copiar Reporte'}
                      </button>
                    </div>

                    <div className="space-y-3.5 text-slate-300">
                      <div className="flex justify-between items-center text-sm py-1 border-b border-slate-800/40">
                        <span className="flex items-center gap-2"><Users className="w-4 h-4 text-emerald-400" /> N° Conductores:</span>
                        <strong className="text-white text-base font-bold">{metricasGlobales.totalConductores}</strong>
                      </div>
                      <div className="flex justify-between items-center text-sm py-1 border-b border-slate-800/40">
                        <span className="flex items-center gap-2"><Truck className="w-4 h-4 text-emerald-400" /> N° Vehículos:</span>
                        <strong className="text-white text-base font-bold">{metricasGlobales.totalVehiculos}</strong>
                      </div>
                      <div className="flex justify-between items-center text-sm py-1 border-b border-slate-800/40">
                        <span className="flex items-center gap-2"><Bike className="w-4 h-4 text-emerald-400" /> N° Motocicletas:</span>
                        <strong className="text-white text-base font-bold">{metricasGlobales.totalMotos}</strong>
                      </div>
                      <div className="flex justify-between items-center text-sm py-1 border-b border-slate-800/40">
                        <span className="flex items-center gap-2"><Truck className="w-4 h-4 text-emerald-400" /> Km recorridos Vehículos:</span>
                        <strong className="text-white text-base font-bold">{fmt(metricasGlobales.kmVehiculos, 1)} km</strong>
                      </div>
                      <div className="flex justify-between items-center text-sm py-1 border-b border-slate-800/40">
                        <span className="flex items-center gap-2"><Bike className="w-4 h-4 text-emerald-400" /> Km recorridos Motocicletas:</span>
                        <strong className="text-white text-base font-bold">{fmt(metricasGlobales.kmMotos, 1)} km</strong>
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-4 mt-6 flex justify-between items-center shadow-inner">
                    <span className="text-xs uppercase font-extrabold tracking-wider text-slate-400">Total Km Consolidado Global</span>
                    <strong className="text-emerald-400 text-2xl font-black">{fmt(metricasGlobales.totalKms, 1)} km</strong>
                  </div>
                </div>

                {/* Eficiencia de Uso de Flota (Métricas en Donut) - Global */}
                <div className="lg:col-span-7 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-sm flex flex-col justify-between transition-colors print-card">
                  <div>
                    <h3 className="font-bold text-slate-800 dark:text-white text-lg border-b border-slate-100 dark:border-slate-700 pb-3 mb-5 flex items-center gap-2">
                      <BarChart3 className="w-5 h-5 text-emerald-500" /> Efectividad Operativa de Flota (Consolidado Global)
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                      {/* Gauge 1: Generaron Km */}
                      <div className="flex flex-col items-center">
                        <div className="relative w-28 h-28 flex items-center justify-center">
                          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                            <circle cx="18" cy="18" r="15.915" fill="none" stroke="#f1f5f9" strokeWidth="3" className="dark:stroke-slate-700" />
                            <circle cx="18" cy="18" r="15.915" fill="none" stroke="#10b981" strokeWidth="3" strokeDasharray={`${metricasGlobales.pctVehConKm} 100`} className="transition-all duration-1000" />
                          </svg>
                          <div className="absolute flex flex-col items-center justify-center">
                            <span className="text-lg font-black text-slate-800 dark:text-white">{Math.round(metricasGlobales.pctVehConKm)}%</span>
                          </div>
                        </div>
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300 mt-2 text-center">Flota Activa con Km</span>
                        <span className="text-[10px] text-slate-400 text-center leading-tight mt-1">{metricasGlobales.vehsConKm} de {metricasGlobales.totalFlotaActiva} rodaron</span>
                      </div>

                      {/* Gauge 2: Ralentí */}
                      <div className="flex flex-col items-center">
                        <div className="relative w-28 h-28 flex items-center justify-center">
                          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                            <circle cx="18" cy="18" r="15.915" fill="none" stroke="#f1f5f9" strokeWidth="3" className="dark:stroke-slate-700" />
                            <circle cx="18" cy="18" r="15.915" fill="none" stroke="#f59e0b" strokeWidth="3" strokeDasharray={`${metricasGlobales.pctVehConRalenti} 100`} className="transition-all duration-1000" />
                          </svg>
                          <div className="absolute flex flex-col items-center justify-center">
                            <span className="text-lg font-black text-slate-800 dark:text-white">{Math.round(metricasGlobales.pctVehConRalenti)}%</span>
                          </div>
                        </div>
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300 mt-2 text-center">Flota con Ralentí</span>
                        <span className="text-[10px] text-slate-400 text-center leading-tight mt-1">{metricasGlobales.vehsConRalenti} de {metricasGlobales.totalFlotaActiva} motores encendidos</span>
                      </div>

                      {/* Gauge 3: Excesos */}
                      <div className="flex flex-col items-center">
                        <div className="relative w-28 h-28 flex items-center justify-center">
                          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                            <circle cx="18" cy="18" r="15.915" fill="none" stroke="#f1f5f9" strokeWidth="3" className="dark:stroke-slate-700" />
                            <circle cx="18" cy="18" r="15.915" fill="none" stroke="#ef4444" strokeWidth="3" strokeDasharray={`${metricasGlobales.pctVehConExcess} 100`} className="transition-all duration-1000" />
                          </svg>
                          <div className="absolute flex flex-col items-center justify-center">
                            <span className="text-lg font-black text-slate-800 dark:text-white">{Math.round(metricasGlobales.pctVehConExcess)}%</span>
                          </div>
                        </div>
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300 mt-2 text-center">Flota con Excesos</span>
                        <span className="text-[10px] text-slate-400 text-center leading-tight mt-1">{metricasGlobales.vehsConExcess} de {metricasGlobales.totalFlotaActiva} presentaron alertas</span>
                      </div>
                    </div>
                  </div>

                  {/* Total Desviaciones Globales */}
                  <div className="grid grid-cols-3 gap-2 border-t border-slate-100 dark:border-slate-700/60 pt-4 mt-6">
                    <div className="bg-slate-50 dark:bg-slate-900/40 p-2.5 rounded-lg flex flex-col items-center">
                      <span className="text-[10px] font-bold text-slate-400 uppercase leading-none">Excesos Velocidad</span>
                      <strong className="text-base text-red-500 font-extrabold mt-1">{metricasGlobales.totalExcesos}</strong>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-900/40 p-2.5 rounded-lg flex flex-col items-center">
                      <span className="text-[10px] font-bold text-slate-400 uppercase leading-none">Frenadas Bruscas</span>
                      <strong className="text-base text-amber-500 font-extrabold mt-1">{metricasGlobales.totalFrenadas}</strong>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-900/40 p-2.5 rounded-lg flex flex-col items-center">
                      <span className="text-[10px] font-bold text-slate-400 uppercase leading-none">Sobreaceleraciones</span>
                      <strong className="text-base text-blue-500 font-extrabold mt-1">{metricasGlobales.totalAceleraciones}</strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* Participación en Conducción y Desviaciones - Global */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-sm space-y-5 transition-colors print-card">
                <h3 className="font-bold text-slate-800 dark:text-white text-lg border-b border-slate-100 dark:border-slate-700 pb-3 flex items-center gap-2">
                  <Users className="w-5 h-5 text-emerald-500" /> Participación en Conducción y Desviaciones (Consolidado Global)
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Conductores */}
                  <div className="space-y-4">
                    <h4 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center justify-between">
                      <span>👤 Análisis de Conductores</span>
                      <span className="bg-slate-50 dark:bg-slate-700 px-2 py-0.5 rounded text-[10px] text-slate-700 dark:text-slate-300 font-bold">Total Roster: {metricasGlobales.totalConductores}</span>
                    </h4>
                    <div className="space-y-3.5">
                      <ProgressBarStat label="Generaron Recorridos (KMs > 0)" value={metricasGlobales.condConKm} total={metricasGlobales.totalConductores} color="emerald" />
                      <ProgressBarStat label="Presentaron Excesos de Velocidad" value={metricasGlobales.condConExcess} total={metricasGlobales.totalConductores} color="red" />
                      <ProgressBarStat label="Presentaron Frenadas Bruscas" value={metricasGlobales.condConFrenadas} total={metricasGlobales.totalConductores} color="orange" />
                      <ProgressBarStat label="Presentaron Sobreaceleraciones" value={metricasGlobales.condConAceleraciones} total={metricasGlobales.totalConductores} color="blue" />
                    </div>
                  </div>
                  {/* Vehículos */}
                  <div className="space-y-4">
                    <h4 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center justify-between">
                      <span>🚘 Análisis de Vehículos</span>
                      <span className="bg-slate-50 dark:bg-slate-700 px-2 py-0.5 rounded text-[10px] text-slate-700 dark:text-slate-300 font-bold">Flota Roster: {metricasGlobales.totalFlotaActiva}</span>
                    </h4>
                    <div className="space-y-3.5">
                      <ProgressBarStat label="Generaron Recorridos (KMs > 0)" value={metricasGlobales.vehsConKm} total={metricasGlobales.totalFlotaActiva} color="emerald" />
                      <ProgressBarStat label="Presentaron Excesos de Velocidad" value={metricasGlobales.vehsConExcess} total={metricasGlobales.totalFlotaActiva} color="red" />
                      <ProgressBarStat label="Presentaron Frenadas Bruscas" value={metricasGlobales.vehsConFrenadas} total={metricasGlobales.totalFlotaActiva} color="orange" />
                      <ProgressBarStat label="Presentaron Sobreaceleraciones" value={metricasGlobales.vehsConAceleraciones} total={metricasGlobales.totalFlotaActiva} color="blue" />
                      <ProgressBarStat label="Presentaron Ralentí Excesivo" value={metricasGlobales.vehsConRalenti} total={metricasGlobales.totalFlotaActiva} color="amber" />
                    </div>
                  </div>
                </div>
              </div>

              {/* PANEL DE DIAGNÓSTICO: OPERADORES Y VEHÍCULOS NO REGISTRADOS CON CONFIGURACIÓN DE DATATABLE Y PAGINACIÓN */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-sm space-y-4 transition-colors print-card">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-3">
                  <div className="flex items-center gap-2.5">
                    <ShieldAlert className={`w-5 h-5 ${ghostEntities.totalFantasmas > 0 ? 'text-amber-500' : 'text-emerald-500'}`} />
                    <div>
                      <h3 className="font-bold text-slate-800 dark:text-white text-lg">Diagnóstico de Telemetría sin Registro (Sheets)</h3>
                      <p className="text-xs text-slate-400">Cruza la telemetría del satélite con la base maestra de Google Sheets para detectar inconsistencias.</p>
                    </div>
                  </div>
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold leading-none ${ghostEntities.totalFantasmas > 0 ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'}`}>
                    {ghostEntities.totalFantasmas > 0 ? (
                      <>
                        <AlertCircle className="w-3.5 h-3.5" />
                        {ghostEntities.totalFantasmas} Anomalía(s) Activas
                      </>
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        Base 100% Conciliada
                      </>
                    )}
                  </span>
                </div>

                {ghostEntities.totalFantasmas === 0 ? (
                  <div className="bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-400 rounded-xl p-6 text-center text-xs font-semibold flex items-center justify-center gap-2.5">
                    <Check className="w-5 h-5 text-emerald-500 shrink-0" />
                    <span>¡Excelente! Todos los vehículos y conductores que generaron recorridos en este periodo están debidamente sincronizados y activos en las bases maestras.</span>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="text-xs text-amber-800 dark:text-amber-400 bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 rounded-xl p-3.5 no-print">
                      <p className="font-bold mb-1">💡 ¿Por qué aparece este panel?</p>
                      <p className="leading-relaxed">Los siguientes conductores y vehículos generaron telemetría (kms, excesos o ralentí) en Coltrack/Fagor pero <strong>no existen</strong> en los listados oficiales sincronizados de Google Sheets. Para solucionarlo, agrégalos a tu hoja maestra de Google Sheets y haz clic en <strong>Sincronizar Todo</strong> en el panel de sincronización.</p>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                      
                      {/* Conductores Fantasmas con Paginación Datatable */}
                      {ghostEntities.conductores.length > 0 && (
                        <div className="space-y-3 border border-slate-200 dark:border-slate-700/60 rounded-xl p-4 bg-slate-50/50 dark:bg-slate-900/10 transition-colors print-card">
                          <h4 className="text-xs font-black text-amber-600 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                            👤 Conductores Fantasmas ({ghostEntities.conductores.length})
                          </h4>
                          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700/60">
                            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                              <thead className="bg-slate-100 dark:bg-slate-800 text-[9px] font-bold text-slate-500 uppercase tracking-wider text-center">
                                <tr>
                                  <th className="px-3 py-2.5 text-left">Conductor</th>
                                  <th className="px-3 py-2.5">Identificación</th>
                                  <th className="px-3 py-2.5">KMs</th>
                                  <th className="px-3 py-2.5">Alertas</th>
                                  <th className="px-3 py-2.5">Calificación</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200 dark:divide-slate-700 text-[10px] text-slate-700 dark:text-slate-300 text-center">
                                {paginatedGhostConductores.map((gc, i) => (
                                  <tr key={gc.id || i} className="hover:bg-slate-100/50 dark:hover:bg-slate-800/30 transition-all">
                                    <td className="px-3 py-2.5 text-left font-bold text-slate-950 dark:text-white">{gc.nombre}</td>
                                    <td className="px-3 py-2.5"><code className="font-mono bg-slate-100 dark:bg-slate-900 px-1 py-0.5 rounded text-[9px]">{gc.cedula}</code></td>
                                    <td className="px-3 py-2.5 font-semibold text-blue-500">{fmt(gc.kms, 1)} km</td>
                                    <td className="px-3 py-2.5 font-semibold text-red-500">{gc.excesos + gc.frenadas}</td>
                                    <td className="px-3 py-2.5 font-black text-slate-900 dark:text-white">{gc.calificacion}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <TablePagination
                            currentPage={condPage}
                            pageSize={condPageSize}
                            totalItems={ghostEntities.conductores.length}
                            onPageChange={setCondPage}
                            onPageSizeChange={setCondPageSize}
                          />
                        </div>
                      )}

                      {/* Vehículos Fantasmas con Paginación Datatable */}
                      {ghostEntities.vehiculos.length > 0 && (
                        <div className="space-y-3 border border-slate-200 dark:border-slate-700/60 rounded-xl p-4 bg-slate-50/50 dark:bg-slate-900/10 transition-colors print-card">
                          <h4 className="text-xs font-black text-amber-600 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                            🚘 Vehículos Fantasmas ({ghostEntities.vehiculos.length})
                          </h4>
                          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700/60">
                            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                              <thead className="bg-slate-100 dark:bg-slate-800 text-[9px] font-bold text-slate-500 uppercase tracking-wider text-center">
                                <tr>
                                  <th className="px-3 py-2.5 text-left">Placa</th>
                                  <th className="px-3 py-2.5">KMs</th>
                                  <th className="px-3 py-2.5">Ralentí</th>
                                  <th className="px-3 py-2.5">Excesos</th>
                                  <th className="px-3 py-2.5">Calificación</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200 dark:divide-slate-700 text-[10px] text-slate-700 dark:text-slate-300 text-center">
                                {paginatedGhostVehiculos.map((gv, i) => (
                                  <tr key={gv.id || i} className="hover:bg-slate-100/50 dark:hover:bg-slate-800/30 transition-all">
                                    <td className="px-3 py-2.5 text-left font-black text-slate-950 dark:text-white uppercase tracking-tight">{gv.placa}</td>
                                    <td className="px-3 py-2.5 font-semibold text-blue-500">{fmt(gv.kms, 1)} km</td>
                                    <td className="px-3 py-2.5 font-semibold text-amber-500">{fmt(gv.ralenti, 1)} h</td>
                                    <td className="px-3 py-2.5 font-semibold text-red-500">{gv.excesos}</td>
                                    <td className="px-3 py-2.5 font-black text-slate-900 dark:text-white">{gv.calificacion}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <TablePagination
                            currentPage={vehPage}
                            pageSize={vehPageSize}
                            totalItems={ghostEntities.vehiculos.length}
                            onPageChange={setVehPage}
                            onPageSizeChange={setVehPageSize}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Tabla Comparativa Corporativa por Contrato con Paginación */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-sm space-y-4 transition-colors print-card">
                <div className="flex flex-col sm:flex-row items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-3 gap-2">
                  <div>
                    <h3 className="font-bold text-slate-800 dark:text-white text-lg">Comparativa Corporativa por Contrato</h3>
                    <p className="text-xs text-slate-400 leading-snug">Visualización y auditoría del comportamiento de seguridad vial y productividad para todos los contratos.</p>
                  </div>
                  <div className="flex items-center gap-2 no-print">
                    <button
                      onClick={exportarPDFGlobal}
                      disabled={generandoPDF || consolidadoGlobal.length === 0}
                      className="inline-flex items-center gap-1.5 px-3 py-2 border-2 border-slate-200 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-bold transition-all disabled:opacity-50"
                    >
                      {generandoPDF ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Printer className="w-3.5 h-3.5" />
                      )}
                      {generandoPDF ? 'Generando PDF...' : 'Exportar PDF'}
                    </button>
                    <button
                      onClick={exportarExcelGlobal}
                      disabled={consolidadoGlobal.length === 0}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 border-2 border-slate-200 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-bold transition-all disabled:opacity-50"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Exportar Consolidado Excel
                    </button>
                  </div>
                </div>

                {consolidadoGlobal.length === 0 ? (
                  <div className="text-center py-10 text-slate-400 text-sm">
                    No hay información disponible en este rango de fechas. Carga telemetría primero.
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                      <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700/60 font-semibold">
                        <thead className="bg-slate-50 dark:bg-slate-800/80 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center select-none">
                          <tr>
                            <th onClick={() => handleSort('nombre')} className="px-4 py-3 text-left cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/40">Contrato {sortField === 'nombre' && (sortDirection === 'asc' ? '▲' : '▼')}</th>
                            <th onClick={() => handleSort('cliente')} className="px-4 py-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/40">Cliente {sortField === 'cliente' && (sortDirection === 'asc' ? '▲' : '▼')}</th>
                            <th onClick={() => handleSort('totalConductores')} className="px-4 py-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/40">Conductores {sortField === 'totalConductores' && (sortDirection === 'asc' ? '▲' : '▼')}</th>
                            <th onClick={() => handleSort('totalFlota')} className="px-4 py-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/40">Flota {sortField === 'totalFlota' && (sortDirection === 'asc' ? '▲' : '▼')}</th>
                            <th onClick={() => handleSort('kms')} className="px-4 py-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/40">Kilómetros {sortField === 'kms' && (sortDirection === 'asc' ? '▲' : '▼')}</th>
                            <th onClick={() => handleSort('excesos80')} className="px-3 py-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/40">Exc. &gt;= 80 {sortField === 'excesos80' && (sortDirection === 'asc' ? '▲' : '▼')}</th>
                            <th onClick={() => handleSort('excesosBajo80')} className="px-3 py-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/40">Exc. &lt; 80 {sortField === 'excesosBajo80' && (sortDirection === 'asc' ? '▲' : '▼')}</th>
                            <th onClick={() => handleSort('frenadas')} className="px-4 py-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/40">Frenadas {sortField === 'frenadas' && (sortDirection === 'asc' ? '▲' : '▼')}</th>
                            <th onClick={() => handleSort('ralenti')} className="px-4 py-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/40">Ralentí {sortField === 'ralenti' && (sortDirection === 'asc' ? '▲' : '▼')}</th>
                            <th onClick={() => handleSort('calificacionPromedio')} className="px-4 py-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/40">Puntaje {sortField === 'calificacionPromedio' && (sortDirection === 'asc' ? '▲' : '▼')}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700/40 text-xs text-slate-700 dark:text-slate-300 text-center">
                          {paginatedConsolidadoGlobal.map((c, idx) => {
                            const score = Number(c.calificacionPromedio);
                            const scoreColor = score >= 90 ? 'text-emerald-500' : score >= 70 ? 'text-amber-500' : 'text-red-500';

                            return (
                              <tr key={c.id || idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/20 transition-all">
                                <td className="px-4 py-2.5 text-left font-black text-slate-900 dark:text-white uppercase tracking-tight">{c.nombre}</td>
                                <td className="px-4 py-2.5 font-semibold text-slate-500 dark:text-slate-400">{c.cliente}</td>
                                <td className="px-4 py-2.5 font-bold">{c.totalConductores}</td>
                                <td className="px-4 py-2.5 font-medium">{c.totalFlota} <span className="text-[10px] text-slate-400">({c.totalVehiculos} V / {c.totalMotos} M)</span></td>
                                <td className="px-4 py-2.5 font-semibold">{fmt(c.kms, 0)} km</td>
                                <td className="px-3 py-2.5 font-semibold text-red-600 font-bold">{c.excesos80}</td>
                                <td className="px-3 py-2.5 font-semibold text-red-500">{c.excesosBajo80}</td>
                                <td className="px-4 py-2.5 font-semibold text-orange-500">{c.frenadas}</td>
                                <td className="px-4 py-2.5 font-semibold text-amber-500">{fmt(c.ralenti, 1)} h</td>
                                <td className={`px-4 py-2.5 font-black text-sm ${scoreColor}`}>{score}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <TablePagination
                      currentPage={globalPage}
                      pageSize={globalPageSize}
                      totalItems={sortedConsolidadoGlobal.length}
                      onPageChange={setGlobalPage}
                      onPageSizeChange={setGlobalPageSize}
                    />
                  </>
                )}
              </div>

            </div>
          )}

        </div>
      )}
    </div>
  );
};
