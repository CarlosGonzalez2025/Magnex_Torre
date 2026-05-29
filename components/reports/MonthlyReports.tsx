import React, { useState, useEffect, useCallback } from 'react';
import { BarChart3, Upload, FileText, RefreshCw, Download } from 'lucide-react';
import { ReportFilters, FiltroState } from './ReportFilters';
import { ExcelDropzone } from './ExcelDropzone';
import { ReportsTable, SemaforoBadge, ErroresTable } from './ReportsTable';
import { importarExcel, ImportResult } from '../../services/importService';
import { SheetsSyncPanel } from './SheetsSyncPanel';
import {
  getConductores, getVehiculos, getProyectos, getContratos,
  getReporteConductor, getReporteVehiculo,
  listarReportesConductores, listarReportesVehiculos,
} from '../../services/reportService';
import {
  descargarPDFConductor,
  descargarPDFVehiculo,
  descargarLotePDFs,
  descargarConsolidadoConductoresContrato,
  descargarConsolidadoVehiculosContrato,
} from '../../services/pdfTemplates';
import type { ConductorOption, ContratoOption, ReporteConductorData, ReporteVehiculoData, VehiculoOption } from '../../services/reportService';

type Vista = 'historial' | 'subir';

const primerDiaMes = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};
const ultimoDiaMes = () => {
  const d = new Date();
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return last.toISOString().slice(0, 10);
};

const defaultFiltro: FiltroState = {
  tipo: 'conductor',
  conductorId: '',
  vehiculoId: '',
  fechaInicio: primerDiaMes(),
  fechaFin: ultimoDiaMes(),
  proyecto: '',
  contratoId: '',
};

function tieneGpsConfigurado(valor?: string | null): boolean {
  const normalizado = String(valor ?? '').trim().toUpperCase();
  return Boolean(normalizado) && !['NO', 'N/A', 'NA', 'SIN GPS', 'NINGUNO', 'NO APLICA', '0'].includes(normalizado);
}

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
  const [proyectos, setProyectos] = useState<string[]>([]);

  const [generando, setGenerando] = useState(false);
  const [generandoContrato, setGenerandoContrato] = useState(false);
  const [generandoLote, setGenerandoLote] = useState(false);
  const [historial, setHistorial] = useState<Record<string, unknown>[]>([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());

  const [uploadResult, setUploadResult] = useState<ImportResult | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);



  useEffect(() => {
    Promise.all([getConductores(), getVehiculos(), getProyectos(), getContratos()]).then(([c, v, p, ct]) => {
      setConductores(c);
      setVehiculos(v);
      setProyectos(p);
      setContratos(ct);
    }).catch(console.error);
  }, []);

  const cargarHistorial = useCallback(async () => {
    setCargandoHistorial(true);
    setSeleccionados(new Set());
    try {
      if (filtro.tipo === 'conductor') {
        const data = await listarReportesConductores({
          conductorId: filtro.conductorId || undefined,
          proyecto: filtro.proyecto || undefined,
          contratoId: filtro.contratoId || undefined,
          fechaInicio: filtro.fechaInicio,
          fechaFin: filtro.fechaFin,
        });
        setHistorial(data as Record<string, unknown>[]);
      } else {
        const data = await listarReportesVehiculos({
          vehiculoId: filtro.vehiculoId || undefined,
          proyecto: filtro.proyecto || undefined,
          contratoId: filtro.contratoId || undefined,
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
  }, [filtro.tipo, filtro.conductorId, filtro.vehiculoId, filtro.proyecto, filtro.contratoId, filtro.fechaInicio, filtro.fechaFin]);

  useEffect(() => { cargarHistorial(); }, [cargarHistorial]);

  // Generar PDF individual
  const handleGenerar = async () => {
    setGenerando(true);
    try {
      if (filtro.tipo === 'conductor' && filtro.conductorId) {
        const data = await getReporteConductor({
          conductorId: filtro.conductorId,
          fechaInicio: filtro.fechaInicio,
          fechaFin: filtro.fechaFin,
          proyecto: filtro.proyecto || undefined,
        });
        if (data) await descargarPDFConductor(data);
        else alert('Sin datos para el período seleccionado.');
      } else if (filtro.tipo === 'vehiculo' && filtro.vehiculoId) {
        const data = await getReporteVehiculo({
          vehiculoId: filtro.vehiculoId,
          fechaInicio: filtro.fechaInicio,
          fechaFin: filtro.fechaFin,
          proyecto: filtro.proyecto || undefined,
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
      const ids = Array.from(seleccionados);
      if (filtro.tipo === 'conductor') {
        const promises = ids.map(id => getReporteConductor({
          conductorId: id,
          fechaInicio: filtro.fechaInicio,
          fechaFin: filtro.fechaFin,
        }));
        const datos = (await Promise.all(promises)).filter(Boolean) as ReporteConductorData[];
        await descargarLotePDFs(datos, 'conductor');
      } else {
        const promises = ids.map(id => getReporteVehiculo({
          vehiculoId: id,
          fechaInicio: filtro.fechaInicio,
          fechaFin: filtro.fechaFin,
        }));
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
      const conductoresContrato = conductores.filter(c => c.contrato_id === filtro.contratoId);
      const vehiculosContrato = vehiculos.filter(v => v.contrato_id === filtro.contratoId);

      const [datosConductores, datosVehiculos] = await Promise.all([
        Promise.all(conductoresContrato.map(c => getReporteConductor({
          conductorId: c.id,
          fechaInicio: filtro.fechaInicio,
          fechaFin: filtro.fechaFin,
          contratoId: filtro.contratoId,
        }))),
        Promise.all(vehiculosContrato.map(v => getReporteVehiculo({
          vehiculoId: v.id,
          fechaInicio: filtro.fechaInicio,
          fechaFin: filtro.fechaFin,
          contratoId: filtro.contratoId,
        }))),
      ]);

      const conductoresValidos = datosConductores.filter(Boolean) as ReporteConductorData[];
      const vehiculosValidos = datosVehiculos.filter(Boolean) as ReporteVehiculoData[];
      const vehiculosConGps = vehiculosContrato.filter(v => tieneGpsConfigurado(v.gps_compañia)).length;
      const resumenContrato = {
        totalVehiculos: vehiculosContrato.length,
        totalConductores: conductoresContrato.length,
        vehiculosConGps,
        vehiculosSinGps: Math.max(0, vehiculosContrato.length - vehiculosConGps),
      };

      if (conductoresValidos.length === 0 && vehiculosValidos.length === 0) {
        alert('No hay datos mensuales para el contrato seleccionado en el periodo indicado.');
        return;
      }

      if (conductoresValidos.length > 0) {
        await descargarConsolidadoConductoresContrato(contrato, conductoresValidos, vehiculosValidos, resumenContrato, filtro.fechaInicio, filtro.fechaFin);
      }
      if (vehiculosValidos.length > 0) {
        await descargarConsolidadoVehiculosContrato(contrato, vehiculosValidos, conductoresValidos, resumenContrato, filtro.fechaInicio, filtro.fechaFin);
      }
    } catch (err) {
      console.error(err);
      alert('Error generando informes por contrato.');
    } finally {
      setGenerandoContrato(false);
    }
  };

  const handleFile = async (file: File) => {
    setUploadLoading(true);
    setUploadError(null);
    setUploadResult(null);
    try {
      const result = await importarExcel(file, 'monthly');
      setUploadResult(result);
      if (result.exito) cargarHistorial();
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'Error al procesar el archivo');
    } finally {
      setUploadLoading(false);
    }
  };

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
      setSeleccionados(new Set(historial.map(r => String(r[filtro.tipo === 'conductor' ? 'conductor_id' : 'vehiculo_id'] ?? ''))));
    }
  };

  // Columnas historial conductor con checkbox
  const colsConductor = [
    {
      key: 'conductor_id',
      header: '',
      render: (_: unknown, row: Record<string, unknown>) => (
        <input
          type="checkbox"
          checked={seleccionados.has(String(row.conductor_id ?? ''))}
          onChange={() => toggleSeleccion(String(row.conductor_id ?? ''))}
          className="accent-blue-600 w-3.5 h-3.5"
        />
      ),
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
      render: (_: unknown, row: Record<string, unknown>) => (
        <input
          type="checkbox"
          checked={seleccionados.has(String(row.vehiculo_id ?? ''))}
          onChange={() => toggleSeleccion(String(row.vehiculo_id ?? ''))}
          className="accent-blue-600 w-3.5 h-3.5"
        />
      ),
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
        <div className="flex gap-2">
          {seleccionados.size > 0 && (
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
          <button
            onClick={() => setVista(v => v === 'historial' ? 'subir' : 'historial')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-medium text-slate-700 dark:text-slate-300 transition-colors"
          >
            <Upload className="w-4 h-4" />
            {vista === 'historial' ? 'Subir datos Excel' : 'Ver historial'}
          </button>
        </div>
      </div>

      {/* Panel de sincronización Google Sheets (siempre visible) */}
      <SheetsSyncPanel />

      {vista === 'subir' ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 space-y-6">
          <div className="flex flex-col gap-2">
            <h2 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2 text-lg">
              <Upload className="w-5 h-5 text-blue-600 dark:text-blue-400" /> Centro de Importación Mensual
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Sube el archivo consolidado tradicional que unifica los kilometrajes, ralentís y calificaciones en un solo libro de Excel. Asegúrate de que las hojas del archivo tengan los nombres correctos: <code>Conductor</code>, <code>Coltrack_Vehiculos</code> o <code>Ralentis</code>.
            </p>
          </div>

          <ExcelDropzone
            onFile={handleFile}
            loading={uploadLoading}
            exito={uploadResult?.exito ?? false}
            error={uploadError}
          />

          {uploadResult && (
            <div className={`rounded-xl p-4 text-xs border ${uploadResult.exito ? 'bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400 border-green-200/50 dark:border-green-900/50' : 'bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 border-amber-200/50 dark:border-amber-900/50'}`}>
              <strong className="font-bold block mb-1">
                {uploadResult.exito ? '✓ Importación exitosa' : '⚠ Advertencia en la importación'}
              </strong>
              {uploadResult.exito
                ? `Se han procesado e ingresado ${uploadResult.registrosInsertados} registros del informe consolidado tradicional.`
                : `Se presentaron observaciones en la carga. Registros insertados: ${uploadResult.registrosInsertados}.`
              }
            </div>
          )}
          {uploadResult && uploadResult.errores.length > 0 && <ErroresTable errores={uploadResult.errores} />}
        </div>
      ) : (
        <div className="space-y-4">
          <ReportFilters
            filtro={filtro}
            onChange={(f) => { setFiltro(f); setSeleccionados(new Set()); }}
            conductores={conductores}
            vehiculos={vehiculos}
            contratos={contratos}
            proyectos={proyectos}
            modo="monthly"
            onGenerar={handleGenerar}
            onGenerarContrato={handleContrato}
            generando={generando}
            generandoContrato={generandoContrato}
          />

          {/* ── Panel de análisis de datos ── */}
          {!cargandoHistorial && historial.length > 0 && (() => {
            if (filtro.tipo === 'conductor') {
              const vehFiltrados = filtro.contratoId
                ? vehiculos.filter(v => v.contrato_id === filtro.contratoId)
                : vehiculos;
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
              const condFiltrados = filtro.contratoId
                ? conductores.filter(c => c.contrato_id === filtro.contratoId)
                : conductores;
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
                emptyMessage="No hay informes mensuales guardados. Sube datos desde Excel o genera un PDF."
                exportFileName={`informes_mensuales_${filtro.tipo}_${filtro.fechaInicio}_${filtro.fechaFin}`}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};
