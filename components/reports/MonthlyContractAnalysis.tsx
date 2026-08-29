import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3, RefreshCw, Mail, Download, Search, ArrowUpDown, Users, Truck, AlertTriangle, Route, Send,
} from 'lucide-react';
import { listarReportesConductores, listarReportesVehiculos } from '../../services/reportService';
import type { ConductorOption, ContratoOption, VehiculoOption } from '../../services/reportService';
import { SemaforoBadge } from './ReportsTable';
import { CorreoModal } from './CorreoModal';
import { generarCorreoInformeMensual, etiquetaMesPeriodo, type CorreoMensual } from '../../services/monthlyEmailTemplates';
import { descargarInformesMensualesContrato, type TipoInformeMensual } from '../../services/monthlyContractReports';
import { listarEnviosMensuales, marcarEnvioMensual, mesPeriodo, type EnvioMensual } from '../../services/monthlyDeliveryService';
import { fechaHoraBogota } from '../../services/dateNormalization';
import { useAuth } from '../../contexts/AuthContext';

type Row = Record<string, unknown>;

const SIN_CONTRATO = '__SIN_CONTRATO__';

const UMBRALES_EXCESO = [
  'excesos_10_kph', 'excesos_20_kph', 'excesos_30_kph', 'excesos_40_kph',
  'excesos_50_kph', 'excesos_60_kph', 'excesos_80_kph',
] as const;

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fmt(v: number, dec = 1): string {
  return v.toLocaleString('es-CO', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function entero(v: number): string {
  return Math.round(v).toLocaleString('es-CO');
}

/** contrato_id de una fila de conductor (el contrato vive en el conductor anidado). */
function contratoIdConductor(row: Row): string {
  const cond = row.conductores as Row | null;
  const id = cond?.contrato_id ?? row.contrato_id;
  return id ? String(id) : SIN_CONTRATO;
}

/** contrato_id de una fila de vehículo (columna directa o vehículo anidado). */
function contratoIdVehiculo(row: Row): string {
  const veh = row.vehiculos as Row | null;
  const id = row.contrato_id ?? veh?.contrato_id;
  return id ? String(id) : SIN_CONTRATO;
}

interface Agregado {
  kms: number;
  horas: number;
  exc80: number;
  excTotales: number;
  aceleraciones: number;
  frenadas: number;
  ralenti: number;
  calificaciones: number[];
}

function agregadoVacio(): Agregado {
  return { kms: 0, horas: 0, exc80: 0, excTotales: 0, aceleraciones: 0, frenadas: 0, ralenti: 0, calificaciones: [] };
}

function acumular(acc: Agregado, row: Row): void {
  acc.kms += num(row.kms);
  acc.horas += num(row.horas_conduccion);
  acc.exc80 += num(row.excesos_80_kph);
  acc.excTotales += UMBRALES_EXCESO.reduce((s, campo) => s + num(row[campo]), 0);
  acc.aceleraciones += num(row.aceleraciones_bruscas ?? row.aceleraciones);
  acc.frenadas += num(row.frenadas_bruscas ?? row.frenadas);
  acc.ralenti += num(row.horas_motor_ralenti);
  const cal = num(row.calificacion);
  if (cal > 0) acc.calificaciones.push(cal);
}

function promedio(valores: number[]): number {
  if (valores.length === 0) return 0;
  return valores.reduce((a, b) => a + b, 0) / valores.length;
}

interface FilaContrato {
  contratoId: string;
  nombre: string;
  cliente: string;
  /** Conductores/vehículos con informe mensual en el período. */
  conductoresConDatos: number;
  vehiculosConDatos: number;
  /** Personas/flota registradas en la base maestra para el contrato. */
  conductoresRoster: number;
  vehiculosRoster: number;
  kms: number;
  horas: number;
  exc80: number;
  excTotales: number;
  aceleraciones: number;
  frenadas: number;
  ralenti: number;
  calificacion: number;
  /** De dónde salieron las cifras de operación (los vehículos son la fuente preferente). */
  fuente: 'vehiculos' | 'conductores' | 'sin datos';
  tieneDatos: boolean;
}

type SortField = 'nombre' | 'kms' | 'horas' | 'exc80' | 'excTotales' | 'frenadas' | 'aceleraciones' | 'ralenti' | 'calificacion';

/** Encabezado de columna ordenable. */
const ThOrden: React.FC<{
  field: SortField;
  activo: SortField;
  onOrdenar: (field: SortField) => void;
  alineado?: 'left' | 'center';
  children: React.ReactNode;
}> = ({ field, activo, onOrdenar, alineado = 'center', children }) => (
  <th className={`px-2 py-2.5 font-semibold whitespace-nowrap ${alineado === 'left' ? 'text-left' : ''}`}>
    <button
      onClick={() => onOrdenar(field)}
      className={`inline-flex items-center gap-1 hover:text-blue-300 transition-colors ${activo === field ? 'text-blue-300' : ''}`}
      title="Ordenar"
    >
      {children}
      <ArrowUpDown className="w-3 h-3 opacity-60" />
    </button>
  </th>
);

interface MonthlyContractAnalysisProps {
  contratos: ContratoOption[];
  conductores: ConductorOption[];
  vehiculos: VehiculoOption[];
  fechaInicio: string;
  fechaFin: string;
  onPeriodoChange: (fechaInicio: string, fechaFin: string) => void;
}

export const MonthlyContractAnalysis: React.FC<MonthlyContractAnalysisProps> = ({
  contratos, conductores, vehiculos, fechaInicio, fechaFin, onPeriodoChange,
}) => {
  const { user } = useAuth();
  const [condRows, setCondRows] = useState<Row[]>([]);
  const [vehRows, setVehRows] = useState<Row[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [busqueda, setBusqueda] = useState('');
  const [mostrarSinDatos, setMostrarSinDatos] = useState(false);
  const [sortField, setSortField] = useState<SortField>('exc80');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const [generandoPDF, setGenerandoPDF] = useState('');
  const [correo, setCorreo] = useState<{ contrato: string; mes: string; correo: CorreoMensual } | null>(null);

  // Marcas de "informe enviado" del mes del período, indexadas por contrato_id.
  const [envios, setEnvios] = useState<Map<string, EnvioMensual>>(new Map());
  const [guardandoEnvio, setGuardandoEnvio] = useState<Set<string>>(new Set());
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);

  const mes = useMemo(() => mesPeriodo(fechaFin), [fechaFin]);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    setErrorEnvio(null);
    try {
      const [rCond, rVeh] = await Promise.all([
        listarReportesConductores({ fechaInicio, fechaFin }),
        listarReportesVehiculos({ fechaInicio, fechaFin }),
      ]);
      setCondRows(rCond as Row[]);
      setVehRows(rVeh as Row[]);
    } catch (err) {
      console.error('Error cargando informes mensuales por contrato:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCargando(false);
    }

    // El control de envío se lee aparte: si la tabla todavía no existe en el
    // entorno, el resto del análisis tiene que seguir mostrándose igual.
    try {
      setEnvios(await listarEnviosMensuales(mes));
    } catch (err) {
      console.error('Error cargando el control de envío mensual:', err);
      setEnvios(new Map());
      setErrorEnvio(err instanceof Error ? err.message : String(err));
    }
  }, [fechaInicio, fechaFin, mes]);

  useEffect(() => { cargar(); }, [cargar]);

  const filas = useMemo<FilaContrato[]>(() => {
    // Agregados por contrato, separados por fuente: los vehículos son la fuente
    // preferente de kilómetros y eventos; los conductores son el respaldo cuando
    // el contrato no tiene informes de vehículos en el período.
    const porVehiculo = new Map<string, Agregado>();
    const porConductor = new Map<string, Agregado>();
    const conductoresConDatos = new Map<string, Set<string>>();
    const vehiculosConDatos = new Map<string, Set<string>>();

    for (const row of vehRows) {
      const id = contratoIdVehiculo(row);
      if (!porVehiculo.has(id)) porVehiculo.set(id, agregadoVacio());
      acumular(porVehiculo.get(id)!, row);
      const set = vehiculosConDatos.get(id) ?? new Set<string>();
      set.add(String(row.vehiculo_id ?? (row.vehiculos as Row | null)?.placa ?? ''));
      vehiculosConDatos.set(id, set);
    }

    for (const row of condRows) {
      const id = contratoIdConductor(row);
      if (!porConductor.has(id)) porConductor.set(id, agregadoVacio());
      acumular(porConductor.get(id)!, row);
      const set = conductoresConDatos.get(id) ?? new Set<string>();
      set.add(String(row.conductor_id ?? ''));
      conductoresConDatos.set(id, set);
    }

    const rosterConductores = new Map<string, number>();
    conductores.forEach(c => {
      const id = c.contrato_id ? String(c.contrato_id) : SIN_CONTRATO;
      rosterConductores.set(id, (rosterConductores.get(id) ?? 0) + 1);
    });
    const rosterVehiculos = new Map<string, number>();
    vehiculos.forEach(v => {
      const id = v.contrato_id ? String(v.contrato_id) : SIN_CONTRATO;
      rosterVehiculos.set(id, (rosterVehiculos.get(id) ?? 0) + 1);
    });

    // Universo: contratos del catálogo + cualquier contrato presente en los datos.
    const ids = new Set<string>([
      ...contratos.map(c => c.id),
      ...porVehiculo.keys(),
      ...porConductor.keys(),
    ]);

    const meta = new Map(contratos.map(c => [c.id, c]));

    return Array.from(ids).map(id => {
      const contrato = meta.get(id);
      const aggVeh = porVehiculo.get(id);
      const aggCond = porConductor.get(id);
      const usaVehiculos = Boolean(aggVeh && (aggVeh.kms > 0 || aggVeh.excTotales > 0 || aggVeh.frenadas > 0));
      const agg = usaVehiculos ? aggVeh! : (aggCond ?? aggVeh ?? agregadoVacio());
      const nVeh = vehiculosConDatos.get(id)?.size ?? 0;
      const nCond = conductoresConDatos.get(id)?.size ?? 0;

      return {
        contratoId: id === SIN_CONTRATO ? '' : id,
        nombre: contrato?.nombre ?? (id === SIN_CONTRATO ? 'Sin contrato' : 'Contrato no registrado'),
        cliente: contrato?.cliente ?? '',
        conductoresConDatos: nCond,
        vehiculosConDatos: nVeh,
        conductoresRoster: rosterConductores.get(id) ?? 0,
        vehiculosRoster: rosterVehiculos.get(id) ?? 0,
        kms: agg.kms,
        horas: agg.horas,
        exc80: agg.exc80,
        excTotales: agg.excTotales,
        aceleraciones: agg.aceleraciones,
        frenadas: agg.frenadas,
        // El ralentí solo se registra a nivel de vehículo.
        ralenti: aggVeh?.ralenti ?? 0,
        calificacion: promedio(usaVehiculos ? aggVeh!.calificaciones : (aggCond?.calificaciones ?? [])),
        fuente: nVeh > 0 || nCond > 0 ? (usaVehiculos ? 'vehiculos' : 'conductores') : 'sin datos',
        tieneDatos: nVeh > 0 || nCond > 0,
      } satisfies FilaContrato;
    });
  }, [condRows, vehRows, contratos, conductores, vehiculos]);

  const filasVisibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const filtradas = filas.filter(f => {
      if (!mostrarSinDatos && !f.tieneDatos) return false;
      if (!q) return true;
      return f.nombre.toLowerCase().includes(q) || f.cliente.toLowerCase().includes(q);
    });

    const dir = sortDir === 'asc' ? 1 : -1;
    return filtradas.sort((a, b) => {
      if (sortField === 'nombre') return a.nombre.localeCompare(b.nombre, 'es') * dir;
      const diff = (a[sortField] - b[sortField]) * dir;
      return diff !== 0 ? diff : a.nombre.localeCompare(b.nombre, 'es');
    });
  }, [filas, busqueda, mostrarSinDatos, sortField, sortDir]);

  const totales = useMemo(() => filasVisibles.reduce((acc, f) => ({
    contratos: acc.contratos + 1,
    conductores: acc.conductores + f.conductoresConDatos,
    vehiculos: acc.vehiculos + f.vehiculosConDatos,
    kms: acc.kms + f.kms,
    horas: acc.horas + f.horas,
    exc80: acc.exc80 + f.exc80,
    excTotales: acc.excTotales + f.excTotales,
    aceleraciones: acc.aceleraciones + f.aceleraciones,
    frenadas: acc.frenadas + f.frenadas,
    ralenti: acc.ralenti + f.ralenti,
  }), {
    contratos: 0, conductores: 0, vehiculos: 0, kms: 0, horas: 0,
    exc80: 0, excTotales: 0, aceleraciones: 0, frenadas: 0, ralenti: 0,
  }), [filasVisibles]);

  // Avance del envío sobre lo que se está viendo. Solo cuentan los contratos
  // identificados: los que no lo están no se pueden marcar.
  const avanceEnvio = useMemo(() => {
    const marcables = filasVisibles.filter(f => f.contratoId);
    return {
      total: marcables.length,
      enviados: marcables.filter(f => envios.get(f.contratoId)?.enviado).length,
    };
  }, [filasVisibles, envios]);

  // Misma columna → invierte el sentido; columna nueva → orden natural (texto asc, cifras desc).
  const ordenarPor = (field: SortField) => {
    if (field === sortField) {
      setSortDir(d => (d === 'desc' ? 'asc' : 'desc'));
      return;
    }
    setSortField(field);
    setSortDir(field === 'nombre' ? 'asc' : 'desc');
  };

  const handleCorreo = (fila: FilaContrato) => {
    setCorreo({
      contrato: fila.nombre,
      mes: etiquetaMesPeriodo(fechaFin),
      correo: generarCorreoInformeMensual({
        contratoNombre: fila.nombre,
        periodoInicio: fechaInicio,
        periodoFin: fechaFin,
      }),
    });
  };

  /**
   * Marca/desmarca el informe del contrato como enviado.
   *
   * Optimista: el check responde al instante y se revierte si la base rechaza
   * el cambio, porque el usuario marca varias filas seguidas y esperar una ida
   * y vuelta por cada una hace el repaso incómodo.
   */
  const handleEnviado = async (fila: FilaContrato, enviado: boolean) => {
    if (!fila.contratoId) return;

    // Solo se guarda —y solo se revierte— la entrada de ESTE contrato: marcar
    // varias filas seguidas no debe pisar lo que otra fila acaba de guardar.
    const previo = envios.get(fila.contratoId);
    const aplicar = (valor: EnvioMensual | undefined) => setEnvios(prev => {
      const siguiente = new Map(prev);
      if (valor?.enviado) siguiente.set(fila.contratoId, valor);
      else siguiente.delete(fila.contratoId);
      return siguiente;
    });
    const marcarGuardando = (activo: boolean) => setGuardandoEnvio(prev => {
      const siguiente = new Set(prev);
      if (activo) siguiente.add(fila.contratoId);
      else siguiente.delete(fila.contratoId);
      return siguiente;
    });

    aplicar(enviado
      ? {
          contratoId: fila.contratoId,
          mes,
          enviado: true,
          enviadoAt: new Date().toISOString(),
          enviadoPor: user?.name ?? user?.email ?? null,
        }
      : undefined);
    marcarGuardando(true);
    setErrorEnvio(null);

    try {
      // Se reemplaza con lo que quedó en la base: la hora y el autor los fija
      // el guardado, no el optimismo local.
      aplicar(await marcarEnvioMensual({
        contratoId: fila.contratoId,
        periodoInicio: fechaInicio,
        periodoFin: fechaFin,
        enviado,
        usuario: user?.name ?? user?.email ?? null,
      }));
    } catch (err) {
      console.error('Error guardando la marca de envío mensual:', err);
      aplicar(previo);
      setErrorEnvio(
        `No se pudo guardar la marca de "${fila.nombre}": ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      marcarGuardando(false);
    }
  };

  const handlePDF = async (fila: FilaContrato, tipo: TipoInformeMensual) => {
    const contrato = contratos.find(c => c.id === fila.contratoId);
    if (!contrato) {
      alert('El contrato no está registrado en el catálogo: no es posible generar el PDF.');
      return;
    }
    const clave = `${fila.contratoId}|${tipo}`;
    setGenerandoPDF(clave);
    try {
      const generados = await descargarInformesMensualesContrato({
        contrato,
        conductores,
        vehiculos,
        fechaInicio,
        fechaFin,
        tipos: [tipo],
      });
      if (generados.length === 0) {
        alert(`No hay datos de ${tipo} para ${contrato.nombre} en el período seleccionado.`);
      }
    } catch (err) {
      console.error(err);
      alert(`Error generando el PDF.\n\nDetalle: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setGenerandoPDF('');
    }
  };

  const th = (field: SortField, label: string, alineado?: 'left' | 'center') => (
    <ThOrden field={field} activo={sortField} onOrdenar={ordenarPor} alineado={alineado}>{label}</ThOrden>
  );

  return (
    <div className="space-y-4">
      {/* Filtros del período */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">Período inicio</label>
          <input
            type="date"
            value={fechaInicio}
            onChange={(e) => onPeriodoChange(e.target.value, fechaFin)}
            className="px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">Período fin</label>
          <input
            type="date"
            value={fechaFin}
            min={fechaInicio}
            onChange={(e) => onPeriodoChange(fechaInicio, e.target.value)}
            className="px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">Buscar contrato o cliente</label>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Ej. ECOPETROL TERMICAS"
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
        </div>
        <button
          onClick={cargar}
          disabled={cargando}
          className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white text-sm font-semibold transition-colors flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${cargando ? 'animate-spin' : ''}`} /> Actualizar
        </button>
      </div>

      {/* Resumen del período */}
      <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-purple-600" /> Resumen del período
          </h2>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {etiquetaMesPeriodo(fechaFin)} · {fechaInicio} a {fechaFin}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {([
            [BarChart3, 'Contratos', entero(totales.contratos), 'text-slate-800 dark:text-slate-100'],
            [Users, 'Conductores con informe', entero(totales.conductores), 'text-slate-800 dark:text-slate-100'],
            [Truck, 'Vehículos con informe', entero(totales.vehiculos), 'text-slate-800 dark:text-slate-100'],
            [Route, 'Km recorridos', fmt(totales.kms), 'text-blue-600 dark:text-blue-400'],
            [AlertTriangle, 'Excesos ≥ 80 km/h', entero(totales.exc80), 'text-red-600 dark:text-red-400'],
            [AlertTriangle, 'Excesos totales', entero(totales.excTotales), 'text-amber-600 dark:text-amber-400'],
          ] as const).map(([Icon, label, value, color]) => (
            <div key={label} className="flex-1 min-w-[130px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 flex flex-col items-center gap-0.5">
              <Icon className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
              <span className={`text-xl font-bold ${color}`}>{value}</span>
              <span className="text-xs text-slate-500 dark:text-slate-400 text-center leading-tight">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Tabla de contratos */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-purple-600" /> Informes mensuales por contrato
          </h2>
          <div className="flex items-center gap-3">
            <span
              className="text-xs font-semibold px-2 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1.5"
              title={`Informes marcados como enviados en ${etiquetaMesPeriodo(fechaFin)}`}
            >
              <Send className="w-3 h-3" />
              {avanceEnvio.enviados} / {avanceEnvio.total} enviados
            </span>
            <label className="text-xs text-slate-500 dark:text-slate-400 inline-flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={mostrarSinDatos}
                onChange={(e) => setMostrarSinDatos(e.target.checked)}
                className="accent-purple-600 w-3.5 h-3.5"
              />
              Mostrar contratos sin datos
            </label>
            <span className="text-xs text-slate-500 dark:text-slate-400">{filasVisibles.length} contrato(s)</span>
          </div>
        </div>

        {error && (
          <div className="rounded-lg p-3 text-sm bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400">
            Error cargando los informes del período: {error}
          </div>
        )}

        {errorEnvio && (
          <div className="rounded-lg p-3 text-sm bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400">
            {errorEnvio}
          </div>
        )}

        {cargando ? (
          <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" /></div>
        ) : filasVisibles.length === 0 ? (
          <div className="text-center py-10 text-slate-400 dark:text-slate-500 text-sm">
            No hay informes mensuales para el período seleccionado. Carga los datos desde el Procesador Satelital.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-800 text-white">
                  <th
                    className="px-2 py-2.5 font-semibold whitespace-nowrap w-10"
                    title={`Marca de informe enviado — ${etiquetaMesPeriodo(fechaFin)}`}
                  >
                    <Send className="w-3.5 h-3.5 inline-block" />
                  </th>
                  {th('nombre', 'Contrato', 'left')}
                  <th className="px-2 py-2.5 font-semibold whitespace-nowrap">Conductores</th>
                  <th className="px-2 py-2.5 font-semibold whitespace-nowrap">Vehículos</th>
                  {th('kms', 'Km')}
                  {th('horas', 'Horas')}
                  {th('exc80', '≥80')}
                  {th('excTotales', 'Excesos')}
                  {th('aceleraciones', 'Acel.')}
                  {th('frenadas', 'Fren.')}
                  {th('ralenti', 'H.Ralentí')}
                  {th('calificacion', 'Calificación')}
                  <th className="px-2 py-2.5 font-semibold text-right whitespace-nowrap">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filasVisibles.map((f, i) => {
                  const envio = f.contratoId ? envios.get(f.contratoId) : undefined;
                  const enviado = Boolean(envio?.enviado);
                  return (
                  <tr
                    key={f.contratoId || f.nombre}
                    className={`border-t border-slate-100 dark:border-slate-800 ${
                      f.exc80 > 0 ? 'bg-red-50/60 dark:bg-red-950/20' : i % 2 ? 'bg-slate-50/50 dark:bg-slate-800/20' : ''
                    }`}
                  >
                    <td className={`px-2 py-2 text-center border-l-2 ${enviado ? 'border-emerald-500' : 'border-transparent'}`}>
                      {guardandoEnvio.has(f.contratoId) ? (
                        <div className="w-3.5 h-3.5 mx-auto border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <input
                          type="checkbox"
                          checked={enviado}
                          disabled={!f.contratoId}
                          onChange={(e) => handleEnviado(f, e.target.checked)}
                          aria-label={`Marcar el informe de ${f.nombre} como enviado`}
                          title={!f.contratoId
                            ? 'Contrato sin identificar: no se puede marcar'
                            : enviado
                              ? `Enviado${envio?.enviadoPor ? ` por ${envio.enviadoPor}` : ''}${envio?.enviadoAt ? ` · ${fechaHoraBogota(envio.enviadoAt)}` : ''} — clic para desmarcar`
                              : `Marcar el informe de ${etiquetaMesPeriodo(fechaFin)} como enviado`}
                          className="accent-emerald-600 w-4 h-4 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                        />
                      )}
                    </td>
                    <td className="px-3 py-2 font-medium text-slate-700 dark:text-slate-200">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span>{f.nombre}</span>
                        {enviado && (
                          <span
                            className="inline-block px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 text-[9px] font-bold"
                            title={`${envio?.enviadoPor ? `Marcado por ${envio.enviadoPor}` : 'Marcado'}${envio?.enviadoAt ? ` · ${fechaHoraBogota(envio.enviadoAt)}` : ''}`}
                          >
                            ENVIADO
                          </span>
                        )}
                        {f.exc80 > 0 && (
                          <span className="inline-block px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400 text-[9px] font-bold">
                            CRÍTICO ≥80
                          </span>
                        )}
                        {f.fuente === 'conductores' && (
                          <span
                            className="inline-block px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 text-[9px] font-bold"
                            title="Sin informes de vehículos en el período: las cifras provienen de los informes de conductores."
                          >
                            SOLO CONDUCTORES
                          </span>
                        )}
                      </div>
                      {f.cliente && <span className="block text-[10px] text-slate-400 dark:text-slate-500">{f.cliente}</span>}
                    </td>
                    <td className="px-2 py-2 text-center text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {f.conductoresConDatos}
                      <span className="text-slate-400 dark:text-slate-500"> / {f.conductoresRoster}</span>
                    </td>
                    <td className="px-2 py-2 text-center text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {f.vehiculosConDatos}
                      <span className="text-slate-400 dark:text-slate-500"> / {f.vehiculosRoster}</span>
                    </td>
                    <td className="px-2 py-2 text-center text-slate-700 dark:text-slate-200">{fmt(f.kms)}</td>
                    <td className="px-2 py-2 text-center text-slate-600 dark:text-slate-300">{fmt(f.horas)}</td>
                    <td className={`px-2 py-2 text-center font-bold ${f.exc80 > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-400'}`}>{entero(f.exc80)}</td>
                    <td className="px-2 py-2 text-center text-amber-600 dark:text-amber-400">{entero(f.excTotales)}</td>
                    <td className="px-2 py-2 text-center text-slate-600 dark:text-slate-300">{entero(f.aceleraciones)}</td>
                    <td className="px-2 py-2 text-center text-orange-500 dark:text-orange-400">{entero(f.frenadas)}</td>
                    <td className="px-2 py-2 text-center text-slate-600 dark:text-slate-300">{fmt(f.ralenti)}</td>
                    <td className="px-2 py-2 text-center">
                      {f.calificacion > 0 ? <SemaforoBadge calificacion={f.calificacion} /> : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleCorreo(f)}
                          disabled={!f.contratoId}
                          title={f.contratoId
                            ? 'Ver y copiar el correo de remisión del informe mensual'
                            : 'Contrato sin identificar: no disponible'}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold transition-colors"
                        >
                          <Mail className="w-3.5 h-3.5" /> Correo
                        </button>
                        <button
                          onClick={() => handlePDF(f, 'conductores')}
                          disabled={!f.contratoId || generandoPDF === `${f.contratoId}|conductores`}
                          title={f.contratoId ? 'Descargar el consolidado mensual de conductores' : 'Contrato sin identificar: no disponible'}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-semibold transition-colors"
                        >
                          {generandoPDF === `${f.contratoId}|conductores`
                            ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            : <Download className="w-3.5 h-3.5" />}
                          PDF Cond.
                        </button>
                        <button
                          onClick={() => handlePDF(f, 'vehiculos')}
                          disabled={!f.contratoId || generandoPDF === `${f.contratoId}|vehiculos`}
                          title={f.contratoId ? 'Descargar el consolidado mensual de vehículos' : 'Contrato sin identificar: no disponible'}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 text-slate-700 dark:text-slate-200 font-semibold transition-colors"
                        >
                          {generandoPDF === `${f.contratoId}|vehiculos`
                            ? <div className="w-3 h-3 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
                            : <Download className="w-3.5 h-3.5" />}
                          PDF Veh.
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-900/50 font-bold text-slate-700 dark:text-slate-200">
                  <td
                    className="px-2 py-2 text-center text-emerald-600 dark:text-emerald-400 whitespace-nowrap"
                    title="Contratos marcados como enviados / contratos que se pueden marcar"
                  >
                    {avanceEnvio.enviados}/{avanceEnvio.total}
                  </td>
                  <td className="px-3 py-2">Total ({totales.contratos})</td>
                  <td className="px-2 py-2 text-center">{entero(totales.conductores)}</td>
                  <td className="px-2 py-2 text-center">{entero(totales.vehiculos)}</td>
                  <td className="px-2 py-2 text-center">{fmt(totales.kms)}</td>
                  <td className="px-2 py-2 text-center">{fmt(totales.horas)}</td>
                  <td className="px-2 py-2 text-center text-red-600 dark:text-red-400">{entero(totales.exc80)}</td>
                  <td className="px-2 py-2 text-center text-amber-600 dark:text-amber-400">{entero(totales.excTotales)}</td>
                  <td className="px-2 py-2 text-center">{entero(totales.aceleraciones)}</td>
                  <td className="px-2 py-2 text-center text-orange-500 dark:text-orange-400">{entero(totales.frenadas)}</td>
                  <td className="px-2 py-2 text-center">{fmt(totales.ralenti)}</td>
                  <td className="px-2 py-2" colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <p className="text-[11px] text-slate-400 dark:text-slate-500">
          Los períodos mensuales corren del día 29 al 28; el mes del informe es el del fin de período
          (<span className="font-semibold">{etiquetaMesPeriodo(fechaFin)}</span> para {fechaInicio} → {fechaFin}).
          La marca de <span className="font-semibold">enviado</span> se guarda por contrato y mes del informe, así que
          se conserva aunque el rango de fechas se ajuste unos días.
        </p>
      </div>

      {correo && (
        <CorreoModal
          titulo={`Correo del informe mensual — ${correo.contrato}`}
          subtitulo={`Plantilla institucional PESV / SG-SST · ${correo.mes}`}
          tono="morado"
          asunto={correo.correo.asunto}
          cuerpo={correo.correo.cuerpo}
          onClose={() => setCorreo(null)}
        />
      )}
    </div>
  );
};
