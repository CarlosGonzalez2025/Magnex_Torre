import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { BarChart3, FileText, RefreshCw, Download } from 'lucide-react';
import { ReportFilters, FiltroState } from './ReportFilters';
import { ReportsTable, SemaforoBadge } from './ReportsTable';
import { SheetsSyncPanel } from './SheetsSyncPanel';
import { MonthlyContractAnalysis } from './MonthlyContractAnalysis';
import {
  getConductores, getVehiculos, getContratos,
  getReporteConductor, getReporteVehiculo,
  listarReportesConductores, listarReportesVehiculos,
} from '../../services/reportService';
import {
  descargarPDFConductor,
  descargarPDFVehiculo,
  descargarLotePDFs,
} from '../../services/pdfTemplates';
import type { ConductorOption, ContratoOption, ReporteConductorData, ReporteVehiculoData, VehiculoOption } from '../../services/reportService';
import { descargarExcelInformesMensuales } from '../../services/monthlyReportExport';
import { descargarInformesMensualesContrato, obtenerPeriodoAnterior } from '../../services/monthlyContractReports';

type Vista = 'historial' | 'analisis';

const primerDiaMes = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};
const ultimoDiaMes = () => {
  const d = new Date();
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const year = last.getFullYear();
  const month = String(last.getMonth() + 1).padStart(2, '0');
  const day = String(last.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const defaultFiltro: FiltroState = {
  tipo: 'conductor',
  conductorId: '',
  vehiculoId: '',
  fechaInicio: primerDiaMes(),
  fechaFin: ultimoDiaMes(),
  cliente: '',
  contratoId: '',
};

function esMoto(tipo: unknown): boolean {
  return String(tipo ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase().includes('MOTO');
}

function fmt2(v: number, dec = 1): string {
  return v.toLocaleString('es-CO', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex-1 min-w-[120px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 flex flex-col items-center gap-0.5">
      <span className="text-xl font-bold text-slate-800 dark:text-slate-100">{value}</span>
      <span className="text-xs text-slate-500 dark:text-slate-400 text-center leading-tight">{label}</span>
      {sub && <span className="text-[10px] text-slate-400 dark:text-slate-500 text-center">{sub}</span>}
    </div>
  );
}

function StatGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{title}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

export const MonthlyReports: React.FC = () => {
  const [vista, setVista] = useState<Vista>('historial');
  const [filtro, setFiltro] = useState<FiltroState>(defaultFiltro);

  const [conductores, setConductores] = useState<ConductorOption[]>([]);
  const [vehiculos, setVehiculos] = useState<VehiculoOption[]>([]);
  const [contratos, setContratos] = useState<ContratoOption[]>([]);

  // Clientes/grupos derivados de vehiculos.cliente (un cliente agrupa varios contratos).
  const clientes = useMemo(() => {
    const set = new Set<string>();
    vehiculos.forEach(v => { const c = String(v.cliente ?? '').trim(); if (c) set.add(c); });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'));
  }, [vehiculos]);

  // cliente/grupo → contratos asociados (vía vehiculos.contrato_id)
  const contratoIdsDeCliente = useCallback((cliente: string): string[] => {
    if (!cliente) return [];
    const ids = new Set<string>();
    vehiculos.forEach(v => {
      if (String(v.cliente ?? '').trim() === cliente && v.contrato_id) ids.add(String(v.contrato_id));
    });
    return Array.from(ids);
  }, [vehiculos]);

  // Contratos efectivos para las consultas: contrato específico > cliente/grupo > todos.
  // Si el cliente no tiene contratos asociados, devuelve un centinela para no coincidir
  // con nada (en vez de un array vacío, que el servicio interpretaría como "sin filtro").
  const resolverContratoIds = useCallback((): string[] | undefined => {
    if (filtro.contratoId) return [filtro.contratoId];
    if (filtro.cliente) {
      const ids = contratoIdsDeCliente(filtro.cliente);
      return ids.length > 0 ? ids : ['__sin_contrato__'];
    }
    return undefined;
  }, [filtro.contratoId, filtro.cliente, contratoIdsDeCliente]);

  // Contratos visibles en el selector: los del cliente/grupo si hay uno seleccionado.
  const contratosVisibles = useMemo(() => {
    if (!filtro.cliente) return contratos;
    const ids = new Set(contratoIdsDeCliente(filtro.cliente));
    return contratos.filter(c => ids.has(c.id));
  }, [contratos, filtro.cliente, contratoIdsDeCliente]);

  const [generando, setGenerando] = useState(false);
  const [generandoContrato, setGenerandoContrato] = useState(false);
  const [generandoLote, setGenerandoLote] = useState(false);
  const [historial, setHistorial] = useState<Record<string, unknown>[]>([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());


  const obtenerClaveReporte = useCallback((row: Record<string, unknown>, tipo: 'conductor' | 'vehiculo'): string => {
    const entityId = String(row[tipo === 'conductor' ? 'conductor_id' : 'vehiculo_id'] ?? '');
    const pInicio = String(row.periodo_inicio ?? '');
    const pFin = String(row.periodo_fin ?? '');
    return `${entityId}_${pInicio}_${pFin}`;
  }, []);

  useEffect(() => {
    Promise.all([getConductores(), getVehiculos(), getContratos()]).then(([c, v, ct]) => {
      setConductores(c);
      setVehiculos(v);
      setContratos(ct);
    }).catch(console.error);
  }, []);

  const cargarHistorial = useCallback(async () => {
    setCargandoHistorial(true);
    setSeleccionados(new Set());
    const contratoIds = resolverContratoIds();
    try {
      if (filtro.tipo === 'conductor') {
        const data = await listarReportesConductores({
          conductorId: filtro.conductorId || undefined,
          contratoIds,
          fechaInicio: filtro.fechaInicio,
          fechaFin: filtro.fechaFin,
        });
        setHistorial(data as Record<string, unknown>[]);
      } else {
        const data = await listarReportesVehiculos({
          vehiculoId: filtro.vehiculoId || undefined,
          contratoIds,
          fechaInicio: filtro.fechaInicio,
          fechaFin: filtro.fechaFin,
        });
        setHistorial(data as Record<string, unknown>[]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCargandoHistorial(false);
    }
  }, [filtro.tipo, filtro.conductorId, filtro.vehiculoId, filtro.fechaInicio, filtro.fechaFin, resolverContratoIds]);

  useEffect(() => { if (vista === 'historial') cargarHistorial(); }, [vista, cargarHistorial]);

  // Generar PDF individual
  const handleGenerar = async () => {
    setGenerando(true);
    try {
      if (filtro.tipo === 'conductor' && filtro.conductorId) {
        const data = await getReporteConductor({
          conductorId: filtro.conductorId,
          fechaInicio: filtro.fechaInicio,
          fechaFin: filtro.fechaFin,
        });
        if (data) await descargarPDFConductor(data);
        else alert('Sin datos para el período seleccionado.');
      } else if (filtro.tipo === 'vehiculo' && filtro.vehiculoId) {
        const data = await getReporteVehiculo({
          vehiculoId: filtro.vehiculoId,
          fechaInicio: filtro.fechaInicio,
          fechaFin: filtro.fechaFin,
        });
        if (data) await descargarPDFVehiculo(data);
        else alert('Sin datos para el período seleccionado.');
      }
    } catch (err) {
      console.error(err);
      alert('Error generando PDF.');
    } finally {
      setGenerando(false);
    }
  };

  // Generar PDFs en lote para seleccionados
  const handleLote = async () => {
    if (seleccionados.size === 0) return;
    setGenerandoLote(true);
    try {
      const keys = Array.from(seleccionados);
      if (filtro.tipo === 'conductor') {
        const promises = keys.map(key => {
          const row = historial.find(r => obtenerClaveReporte(r, 'conductor') === key);
          return getReporteConductor({
            conductorId: String(row?.conductor_id ?? ''),
            fechaInicio: String(row?.periodo_inicio ?? filtro.fechaInicio),
            fechaFin: String(row?.periodo_fin ?? filtro.fechaFin),
            reporteId: String(row?.id ?? ''),
          });
        });
        const datos = (await Promise.all(promises)).filter(Boolean) as ReporteConductorData[];
        await descargarLotePDFs(datos, 'conductor');
      } else {
        const promises = keys.map(key => {
          const row = historial.find(r => obtenerClaveReporte(r, 'vehiculo') === key);
          return getReporteVehiculo({
            vehiculoId: String(row?.vehiculo_id ?? ''),
            fechaInicio: String(row?.periodo_inicio ?? filtro.fechaInicio),
            fechaFin: String(row?.periodo_fin ?? filtro.fechaFin),
            reporteId: String(row?.id ?? ''),
          });
        });
        const datos = (await Promise.all(promises)).filter(Boolean) as ReporteVehiculoData[];
        await descargarLotePDFs(datos, 'vehiculo');
      }
    } catch (err) {
      console.error(err);
      alert('Error en descarga en lote.');
    } finally {
      setGenerandoLote(false);
    }
  };

  const handleContrato = async () => {
    if (!filtro.contratoId) return;
    const contrato = contratos.find(c => c.id === filtro.contratoId);
    if (!contrato) {
      alert('Selecciona un contrato valido.');
      return;
    }

    setGenerandoContrato(true);
    try {
      const generados = await descargarInformesMensualesContrato({
        contrato,
        conductores,
        vehiculos,
        fechaInicio: filtro.fechaInicio,
        fechaFin: filtro.fechaFin,
      });
      if (generados.length === 0) {
        alert('No hay datos mensuales para el contrato seleccionado en el periodo indicado.');
      }
    } catch (err) {
      console.error(err);
      alert('Error generando informes por contrato.');
    } finally {
      setGenerandoContrato(false);
    }
  };

  // Exportación a Excel de informes mensuales (Resumen HSE-F-144 + detalle con contrato resuelto).
  // Trae conductores y vehículos del período (independiente del toggle) para un resumen completo,
  // más el período anterior para la comparativa "Aumento excesos vs período anterior".
  const handleExportExcel = useCallback(async () => {
    const prev = obtenerPeriodoAnterior(filtro.fechaInicio, filtro.fechaFin);
    const contratoIds = resolverContratoIds();
    const baseFiltro = {
      contratoIds,
      fechaInicio: filtro.fechaInicio,
      fechaFin: filtro.fechaFin,
    };

    const [conductorRows, vehiculoRows, conductorRowsPrev] = await Promise.all([
      listarReportesConductores(baseFiltro),
      listarReportesVehiculos(baseFiltro),
      listarReportesConductores({ ...baseFiltro, fechaInicio: prev.fechaInicio, fechaFin: prev.fechaFin }),
    ]);

    await descargarExcelInformesMensuales({
      filtro,
      contratos,
      conductores,
      vehiculos,
      contratoIdsScope: contratoIds,
      conductorRows: conductorRows as Record<string, unknown>[],
      vehiculoRows: vehiculoRows as Record<string, unknown>[],
      conductorRowsPrev: conductorRowsPrev as Record<string, unknown>[],
    });
  }, [filtro, contratos, conductores, vehiculos, resolverContratoIds]);

  const toggleSeleccion = (id: string) => {
    setSeleccionados(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleTodos = () => {
    if (seleccionados.size === historial.length) {
      setSeleccionados(new Set());
    } else {
      setSeleccionados(new Set(historial.map(r => obtenerClaveReporte(r, filtro.tipo))));
    }
  };

  // Columnas historial conductor con checkbox
  const colsConductor = [
    {
      key: 'conductor_id',
      header: '',
      render: (_: unknown, row: Record<string, unknown>) => {
        const key = obtenerClaveReporte(row, 'conductor');
        return (
          <input
            type="checkbox"
            checked={seleccionados.has(key)}
            onChange={() => toggleSeleccion(key)}
            className="accent-blue-600 w-3.5 h-3.5"
          />
        );
      },
      width: 'w-8',
    },
    { key: 'mes', header: 'Mes' },
    { key: 'conductores', header: 'Conductor', render: (_: unknown, row: Record<string, unknown>) => { const c = row.conductores as Record<string,unknown>; return c ? `${String(c.nombres ?? '').toUpperCase()} (${c.cedula})` : '—'; } },
    { key: 'calificacion', header: 'Calificación', render: (v: unknown) => <SemaforoBadge calificacion={Number(v ?? 0)} /> },
    { key: 'kms', header: 'Km', render: (v: unknown) => Number(v ?? 0).toFixed(1) },
    { key: 'horas_conduccion', header: 'Horas', render: (v: unknown) => Number(v ?? 0).toFixed(1) },
    { key: 'excesos_10_kph', header: 'Exc.10' },
    { key: 'excesos_20_kph', header: 'Exc.20' },
    { key: 'excesos_30_kph', header: 'Exc.30' },
    { key: 'excesos_50_kph', header: 'Exc.50' },
    { key: 'excesos_80_kph', header: 'Exc.80' },
    { key: 'aceleraciones_bruscas', header: 'Acel.' },
    { key: 'frenadas_bruscas', header: 'Fren.' },
    { key: 'proyecto', header: 'Proyecto' },
  ];

  const colsVehiculo = [
    {
      key: 'vehiculo_id',
      header: '',
      render: (_: unknown, row: Record<string, unknown>) => {
        const key = obtenerClaveReporte(row, 'vehiculo');
        return (
          <input
            type="checkbox"
            checked={seleccionados.has(key)}
            onChange={() => toggleSeleccion(key)}
            className="accent-blue-600 w-3.5 h-3.5"
          />
        );
      },
      width: 'w-8',
    },
    { key: 'mes', header: 'Mes' },
    { key: 'vehiculos', header: 'Placa', render: (_: unknown, row: Record<string, unknown>) => { const v = row.vehiculos as Record<string,unknown>; return v ? String(v.placa) : '—'; } },
    { key: 'calificacion', header: 'Calificación', render: (v: unknown) => <SemaforoBadge calificacion={Number(v ?? 0)} /> },
    { key: 'kms', header: 'Km', render: (v: unknown) => Number(v ?? 0).toFixed(1) },
    { key: 'horas_conduccion', header: 'Horas', render: (v: unknown) => Number(v ?? 0).toFixed(1) },
    { key: 'excesos_10_kph', header: 'Exc.10' },
    { key: 'excesos_20_kph', header: 'Exc.20' },
    { key: 'excesos_50_kph', header: 'Exc.50' },
    { key: 'excesos_80_kph', header: 'Exc.80' },
    { key: 'aceleraciones_bruscas', header: 'Acel.' },
    { key: 'frenadas_bruscas', header: 'Fren.' },
    { key: 'horas_motor_ralenti', header: 'H.Ralentí', render: (v: unknown) => Number(v ?? 0).toFixed(1) },
    { key: 'proyecto', header: 'Proyecto' },
  ];

  return (
    <div className="p-4 md:p-6 space-y-6 w-full mx-auto">
      {/* Encabezado */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-950/40 flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Informes Mensuales</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Genera y gestiona informes por período mensual</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {vista === 'historial' && seleccionados.size > 0 && (
            <button
              onClick={handleLote}
              disabled={generandoLote}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white text-sm font-semibold transition-colors"
            >
              {generandoLote
                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <Download className="w-4 h-4" />
              }
              Descargar {seleccionados.size} PDF{seleccionados.size !== 1 ? 's' : ''}
            </button>
          )}

          <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-lg">
            {([
              ['historial', 'Historial', FileText],
              ['analisis', 'Análisis por contrato', BarChart3],
            ] as const).map(([v, label, Icon]) => (
              <button
                key={v}
                onClick={() => setVista(v)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                  vista === v
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800/60'
                }`}
              >
                <Icon className="w-4 h-4" /> {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Panel de sincronización Google Sheets (siempre visible) */}
      <SheetsSyncPanel />

      {vista === 'analisis' ? (
        <MonthlyContractAnalysis
          contratos={contratos}
          conductores={conductores}
          vehiculos={vehiculos}
          fechaInicio={filtro.fechaInicio}
          fechaFin={filtro.fechaFin}
          onPeriodoChange={(fechaInicio, fechaFin) => setFiltro(f => ({ ...f, fechaInicio, fechaFin }))}
        />
      ) : (
      <div className="space-y-4">
          <ReportFilters
            filtro={filtro}
            onChange={(f) => { setFiltro(f); setSeleccionados(new Set()); }}
            conductores={conductores}
            vehiculos={vehiculos}
            contratos={contratosVisibles}
            clientes={clientes}
            modo="monthly"
            onGenerar={handleGenerar}
            onGenerarContrato={handleContrato}
            generando={generando}
            generandoContrato={generandoContrato}
          />

          {/* ── Panel de análisis de datos ── */}
          {!cargandoHistorial && historial.length > 0 && (() => {
            // Alcance de flota/personas según el filtro (contrato específico o cliente/grupo).
            const idsScope = resolverContratoIds();
            const enScope = (id: unknown) => !idsScope || (id != null && idsScope.includes(String(id)));
            if (filtro.tipo === 'conductor') {
              const vehFiltrados = vehiculos.filter(v => enScope(v.contrato_id));
              const motos = vehFiltrados.filter(v => esMoto(v.tipo_activo));
              const vehReg = vehFiltrados.filter(v => !esMoto(v.tipo_activo));
              const kmTotal = historial.reduce((acc, r) => acc + Number(r.kms ?? 0), 0);
              const horasCond = historial.reduce((acc, r) => acc + Number(r.horas_conduccion ?? 0), 0);
              return (
                <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
                  <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Análisis del período</h2>
                  <StatGroup title="Personas y flota">
                    <StatCard label="Conductores" value={String(historial.length)} />
                    <StatCard label="Vehículos totales" value={String(vehFiltrados.length)} />
                    <StatCard label="Vehículos (excl. motos)" value={String(vehReg.length)} />
                    <StatCard label="Motocicletas" value={String(motos.length)} />
                  </StatGroup>
                  <StatGroup title="Operación">
                    <StatCard label="Km recorridos" value={fmt2(kmTotal)} />
                    <StatCard label="Horas de conducción" value={fmt2(horasCond)} />
                  </StatGroup>
                </div>
              );
            } else {
              const condFiltrados = conductores.filter(c => enScope(c.contrato_id));
              const motosH = historial.filter(r => esMoto((r.vehiculos as Record<string, unknown>)?.tipo_activo));
              const vehRegH = historial.filter(r => !esMoto((r.vehiculos as Record<string, unknown>)?.tipo_activo));
              const kmTotal = historial.reduce((acc, r) => acc + Number(r.kms ?? 0), 0);
              const kmMotos = motosH.reduce((acc, r) => acc + Number(r.kms ?? 0), 0);
              const kmVeh = vehRegH.reduce((acc, r) => acc + Number(r.kms ?? 0), 0);
              const horasCond = historial.reduce((acc, r) => acc + Number(r.horas_conduccion ?? 0), 0);
              const horasRalenti = historial.reduce((acc, r) => acc + Number(r.horas_motor_ralenti ?? 0), 0);
              return (
                <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
                  <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Análisis del período</h2>
                  <StatGroup title="Personas y flota">
                    <StatCard label="Conductores" value={String(condFiltrados.length)} />
                    <StatCard label="Vehículos totales" value={String(historial.length)} />
                    <StatCard label="Vehículos (excl. motos)" value={String(vehRegH.length)} />
                    <StatCard label="Motocicletas" value={String(motosH.length)} />
                  </StatGroup>
                  <StatGroup title="Kilómetros recorridos">
                    <StatCard label="Km general" value={fmt2(kmTotal)} />
                    <StatCard label="Km vehículos" value={fmt2(kmVeh)} />
                    <StatCard label="Km motocicletas" value={fmt2(kmMotos)} />
                  </StatGroup>
                  <StatGroup title="Horas de operación">
                    <StatCard label="Horas conducción" value={fmt2(horasCond)} />
                    <StatCard label="Horas motor en ralentí" value={fmt2(horasRalenti)} />
                  </StatGroup>
                </div>
              );
            }
          })()}

          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <FileText className="w-4 h-4" /> Historial de informes mensuales
              </h2>
              <div className="flex items-center gap-2">
                {historial.length > 0 && (
                  <button
                    onClick={toggleTodos}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    {seleccionados.size === historial.length ? 'Deseleccionar todos' : 'Seleccionar todos'}
                  </button>
                )}
                <button
                  onClick={cargarHistorial}
                  disabled={cargandoHistorial}
                  className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                >
                  <RefreshCw className={`w-4 h-4 text-slate-500 ${cargandoHistorial ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {cargandoHistorial ? (
              <div className="flex justify-center py-8">
                <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <ReportsTable
                columns={filtro.tipo === 'conductor' ? colsConductor : colsVehiculo}
                data={historial}
                emptyMessage="No hay informes para el período seleccionado. Carga los datos desde el Procesador Satelital."
                exportFileName={`informes_mensuales_${filtro.tipo}_${filtro.fechaInicio}_${filtro.fechaFin}`}
                onExport={handleExportExcel}
              />
            )}
          </div>
      </div>
      )}
    </div>
  );
};
