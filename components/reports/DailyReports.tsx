import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { CalendarDays, Upload, FileText, RefreshCw, Download, BarChart3, Mail, FileSpreadsheet } from 'lucide-react';
import { ExcelDropzone } from './ExcelDropzone';
import { ReportsTable, ErroresTable } from './ReportsTable';
import { importarExcel, importarAlertasRaw, ImportResult } from '../../services/importService';
import { SheetsSyncPanel } from './SheetsSyncPanel';
import {
  getContratos,
  getReporteAlertasDiarias,
  listarAlertasDiarias,
  listarAlertasDiariasResumen,
  listarAlertasDiariasPendientes,
  esConductorIdentificado,
} from '../../services/reportService';
import { descargarPDFAlertasDiarias, descargarPDFAlertasDiariasGerencial } from '../../services/pdfTemplates';
import type { ContratoOption } from '../../services/reportService';
import { generarCorreoAlertasDiarias, type CorreoAlertas } from '../../services/dailyEmailTemplates';
import { descargarExcelAlertasDiarias } from '../../services/dailyAlertsExcel';
import { CorreoAlertasModal } from './CorreoAlertasModal';

type Vista = 'historial' | 'analisis' | 'subir';

const ayer = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toNum = (value: unknown) => Number(value ?? 0) || 0;
const fechaCorta = (value: unknown) => String(value ?? '').slice(0, 10);

export const DailyReports: React.FC = () => {
  const [vista, setVista] = useState<Vista>('historial');
  const [selectedSource, setSelectedSource] = useState<'STANDARD' | 'COLTRACK' | 'FAGOR' | 'GEOTAB'>('STANDARD');
  const [fechaInicio, setFechaInicio] = useState(ayer());
  const [fechaFin, setFechaFin] = useState(ayer());
  const [contratoId, setContratoId] = useState('');
  const [contratos, setContratos] = useState<ContratoOption[]>([]);

  const [generando, setGenerando] = useState(false);
  const [generandoGerencial, setGenerandoGerencial] = useState(false);
  const [historial, setHistorial] = useState<Record<string, unknown>[]>([]);
  const [pendientes, setPendientes] = useState<Record<string, unknown>[]>([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);

  const [uploadResult, setUploadResult] = useState<ImportResult | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Vista Análisis: alertas de TODOS los contratos en el rango (sin filtro de contrato).
  const [analisisRows, setAnalisisRows] = useState<Record<string, unknown>[]>([]);
  const [cargandoAnalisis, setCargandoAnalisis] = useState(false);
  const [generandoCorreo, setGenerandoCorreo] = useState('');
  const [generandoPDFContrato, setGenerandoPDFContrato] = useState('');
  const [generandoExcelContrato, setGenerandoExcelContrato] = useState('');
  const [correoModal, setCorreoModal] = useState<CorreoAlertas | null>(null);
  const [correoContrato, setCorreoContrato] = useState('');

  useEffect(() => {
    getContratos().then(setContratos).catch(console.error);
  }, []);

  const cargarHistorial = useCallback(async () => {
    setCargandoHistorial(true);
    try {
      const filtroConsulta = {
        fechaInicio,
        fechaFin,
        contratoId: contratoId || undefined,
      };
      const [data, dataPendiente] = await Promise.all([
        listarAlertasDiarias(filtroConsulta),
        listarAlertasDiariasPendientes(filtroConsulta),
      ]);
      setHistorial(data as Record<string, unknown>[]);
      setPendientes(dataPendiente as Record<string, unknown>[]);
    } catch (err) {
      console.error(err);
    } finally {
      setCargandoHistorial(false);
    }
  }, [fechaInicio, fechaFin, contratoId]);

  useEffect(() => { cargarHistorial(); }, [cargarHistorial]);

  // Carga de la vista Análisis (todos los contratos del rango)
  const cargarAnalisis = useCallback(async () => {
    setCargandoAnalisis(true);
    try {
      const data = await listarAlertasDiariasResumen({ fechaInicio, fechaFin });
      setAnalisisRows(data as Record<string, unknown>[]);
    } catch (err) {
      console.error(err);
    } finally {
      setCargandoAnalisis(false);
    }
  }, [fechaInicio, fechaFin]);

  useEffect(() => { if (vista === 'analisis') cargarAnalisis(); }, [vista, cargarAnalisis]);

  // Nombre REAL del contrato por id (alertas_diarias_gps.contrato_nombre guarda la
  // plataforma de GPS —COLTRACK/FAGOR—, no el contrato).
  const contratosPorId = useMemo(() => new Map(contratos.map(c => [c.id, c.nombre])), [contratos]);

  // Agrupa las alertas del rango por contrato; solo contratos con alertas.
  const analisisPorContrato = useMemo(() => {
    const grupos = new Map<string, {
      contratoId: string; contrato: string;
      infr80: number; exc50a80: number; excVarios: number; frenadas: number;
      placas: Set<string>; sinIdentificar: Set<string>; total: number;
    }>();
    for (const r of analisisRows) {
      const contratoId = String(r.contrato_id ?? '');
      const contrato = contratosPorId.get(contratoId)
        ?? (String(r.contrato_nombre ?? '').trim() || 'Sin contrato');
      const key = contratoId || contrato;
      const g = grupos.get(key) ?? {
        contratoId, contrato,
        infr80: 0, exc50a80: 0, excVarios: 0, frenadas: 0,
        placas: new Set<string>(), sinIdentificar: new Set<string>(), total: 0,
      };
      g.infr80 += toNum(r.infraccion_80_kmh);
      g.exc50a80 += toNum(r.excesos_50_80_kmh);
      g.excVarios += toNum(r.excesos_varios_parametros);
      g.frenadas += toNum(r.frenadas_bruscas);
      if (r.placa) g.placas.add(String(r.placa));
      if (!esConductorIdentificado(r.conductor)) g.sinIdentificar.add(`${r.placa}|${r.fecha_dia}`);
      grupos.set(key, g);
    }
    return Array.from(grupos.values())
      .map(g => ({ ...g, total: g.infr80 + g.exc50a80 + g.excVarios + g.frenadas, placasCount: g.placas.size, sinIdCount: g.sinIdentificar.size }))
      .filter(g => g.total > 0)
      .sort((a, b) => (b.infr80 > 0 ? 1 : 0) - (a.infr80 > 0 ? 1 : 0) || b.infr80 - a.infr80 || b.total - a.total);
  }, [analisisRows, contratosPorId]);

  // Generar el texto del correo para un contrato (cifras autoritativas via getReporteAlertasDiarias)
  const handleGenerarCorreo = async (cId: string, nombre: string) => {
    setGenerandoCorreo(cId || nombre);
    try {
      const data = await getReporteAlertasDiarias({ fechaInicio, fechaFin, contratoId: cId || undefined });
      if (!data) {
        alert('No se encontraron alertas GPS para el contrato en el rango seleccionado.');
        return;
      }
      setCorreoModal(generarCorreoAlertasDiarias(data));
      setCorreoContrato(data.contrato?.nombre ?? nombre);
    } catch (err) {
      console.error(err);
      alert(`Error generando el texto del correo.\n\nDetalle: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setGenerandoCorreo('');
    }
  };

  // Generar PDF diario para un contrato específico desde la lista de Análisis
  const handleGenerarPDFContrato = async (cId: string) => {
    setGenerandoPDFContrato(cId);
    try {
      const data = await getReporteAlertasDiarias({ fechaInicio, fechaFin, contratoId: cId || undefined });
      if (!data) {
        alert('No se encontraron alertas GPS para el contrato en el rango seleccionado.');
        return;
      }
      await descargarPDFAlertasDiarias(data);
    } catch (err) {
      console.error(err);
      alert(`Error generando el PDF.\n\nDetalle: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setGenerandoPDFContrato('');
    }
  };

  // Descargar el detalle de alertas del contrato en Excel (mismas cifras que el PDF)
  const handleGenerarExcelContrato = async (cId: string) => {
    setGenerandoExcelContrato(cId);
    try {
      const data = await getReporteAlertasDiarias({ fechaInicio, fechaFin, contratoId: cId || undefined });
      if (!data) {
        alert('No se encontraron alertas GPS para el contrato en el rango seleccionado.');
        return;
      }
      await descargarExcelAlertasDiarias(data);
    } catch (err) {
      console.error(err);
      alert(`Error generando el Excel.\n\nDetalle: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setGenerandoExcelContrato('');
    }
  };

  const handleGenerar = async () => {
    setGenerando(true);
    try {
      const data = await getReporteAlertasDiarias({
        fechaInicio,
        fechaFin,
        contratoId: contratoId || undefined,
      });
      if (!data) {
        alert('No se encontraron alertas GPS para el rango seleccionado.');
        return;
      }
      await descargarPDFAlertasDiarias(data);
    } catch (err) {
      console.error(err);
      alert(`Error generando el informe diario de alertas.\n\nDetalle: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setGenerando(false);
    }
  };

  const handleGenerarGerencial = async () => {
    setGenerandoGerencial(true);
    try {
      const data = await getReporteAlertasDiarias({
        fechaInicio,
        fechaFin,
        contratoId: contratoId || undefined,
      });
      if (!data) {
        alert('No se encontraron alertas GPS para el rango seleccionado.');
        return;
      }
      await descargarPDFAlertasDiariasGerencial(data);
    } catch (err) {
      console.error(err);
      alert(`Error generando el informe gerencial de alertas.\n\nDetalle: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setGenerandoGerencial(false);
    }
  };

  const handleFile = async (file: File) => {
    setUploadLoading(true);
    setUploadError(null);
    setUploadResult(null);
    try {
      const result = selectedSource === 'STANDARD'
        ? await importarExcel(file, 'daily')
        : await importarAlertasRaw(file, selectedSource);
      setUploadResult(result);
      if (result.exito) cargarHistorial();
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'Error al procesar el archivo');
    } finally {
      setUploadLoading(false);
    }
  };


  const analisisDiario = useMemo(() => {
    if (historial.length === 0) return null;
    const rows = historial as Record<string, unknown>[];
    const placas = new Set(rows.map(r => String(r.placa ?? '')).filter(Boolean));
    const conductoresId = new Set(rows.filter(r => esConductorIdentificado(r.conductor)).map(r => String(r.conductor ?? '').toUpperCase().trim()).filter(Boolean));
    const sinIbutton = new Set(rows.filter(r => !esConductorIdentificado(r.conductor)).map(r => `${r.placa}|${r.fecha_dia}`));
    const infracciones80 = rows.reduce((acc, r) => acc + toNum(r.infraccion_80_kmh), 0);
    const excesosVarios = rows.reduce((acc, r) => acc + toNum(r.excesos_varios_parametros), 0);
    const excesos50a80 = rows.reduce((acc, r) => acc + toNum(r.excesos_50_80_kmh), 0);
    const frenadas = rows.reduce((acc, r) => acc + toNum(r.frenadas_bruscas), 0);
    return { placas: placas.size, conductoresId: conductoresId.size, sinIbutton: sinIbutton.size, infracciones80, excesosVarios, excesos50a80, frenadas };
  }, [historial]);

  const resumenFechaContrato = useMemo(() => {
    const grupos = new Map<string, {
      fecha: string;
      contrato: string;
      excesos80: number;
      excesos50a80: number;
      excesosVarios: number;
      frenadas: number;
    }>();

    historial.forEach((row) => {
      const fecha = fechaCorta(row.fecha_dia || row.fecha);
      const contrato = String(row.contrato_nombre || 'Sin contrato').trim() || 'Sin contrato';
      const key = `${fecha}|${contrato}`;
      const current = grupos.get(key) ?? { fecha, contrato, excesos80: 0, excesos50a80: 0, excesosVarios: 0, frenadas: 0 };
      current.excesos80 += toNum(row.infraccion_80_kmh);
      current.excesos50a80 += toNum(row.excesos_50_80_kmh);
      current.excesosVarios += toNum(row.excesos_varios_parametros);
      current.frenadas += toNum(row.frenadas_bruscas);
      grupos.set(key, current);
    });

    return Array.from(grupos.values()).sort((a, b) =>
      a.fecha.localeCompare(b.fecha) || a.contrato.localeCompare(b.contrato)
    );
  }, [historial]);

  const colsAlertas = [
    { key: 'fecha', header: 'Fecha', render: (v: unknown) => String(v ?? '').replace('T', ' ').slice(0, 16) },
    { key: 'placa', header: 'Placa' },
    { key: 'conductor', header: 'Conductor', render: (v: unknown) => String(v || 'NO REGISTRA').toUpperCase() },
    { key: 'contrato_nombre', header: 'Contrato' },
    { key: 'velocidad', header: 'Vel.', render: (v: unknown) => Number(v ?? 0).toFixed(0) },
    { key: 'infraccion_80_kmh', header: '80 km/h' },
    { key: 'excesos_50_80_kmh', header: '50-80' },
    { key: 'excesos_varios_parametros', header: '10-40' },
    { key: 'frenadas_bruscas', header: 'Frenadas' },
    { key: 'gps', header: 'GPS' },
  ];

  const colsPendientes = [
    { key: 'fecha', header: 'Fecha', render: (v: unknown) => String(v ?? '').replace('T', ' ').slice(0, 16) },
    { key: 'placa', header: 'Placa' },
    { key: 'conductor', header: 'Conductor', render: (v: unknown) => String(v || 'NO REGISTRA').toUpperCase() },
    { key: 'contrato_nombre', header: 'Contrato' },
    { key: 'lugar', header: 'Lugar' },
    { key: 'velocidad', header: 'Vel.', render: (v: unknown) => Number(v ?? 0).toFixed(0) },
    { key: 'infraccion_80_kmh', header: '80 km/h' },
    { key: 'excesos_50_80_kmh', header: '50-80' },
    { key: 'excesos_varios_parametros', header: '10-40' },
    { key: 'frenadas_bruscas', header: 'Frenadas' },
    { key: 'gps', header: 'GPS' },
    { key: 'created_at', header: 'Registrada', render: (v: unknown) => String(v ?? '').replace('T', ' ').slice(0, 16) },
  ];

  return (
    <div className="space-y-4 w-full mx-auto">
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 shadow-sm">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-[260px]">
            <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-950/40 flex items-center justify-center">
              <CalendarDays className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Informes Diarios de Alertas GPS</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">Reporte dia vencido por rango de fechas y contrato</p>
            </div>
          </div>

          <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-lg">
            {([
              ['historial', 'Historial', CalendarDays],
              ['analisis', 'Análisis', BarChart3],
              ['subir', 'Subir Excel', Upload],
            ] as const).map(([v, label, Icon]) => (
              <button
                key={v}
                onClick={() => setVista(v)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                  vista === v
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800/60'
                }`}
              >
                <Icon className="w-4 h-4" /> {label}
              </button>
            ))}
          </div>
          </div>

          {vista === 'historial' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-[170px_170px_minmax(180px,1fr)_auto_auto] gap-3 xl:flex-1">
              <div>
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">Fecha inicio</label>
                <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">Fecha fin</label>
                <input type="date" value={fechaFin} min={fechaInicio} onChange={(e) => setFechaFin(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">Contrato</label>
                <select value={contratoId} onChange={(e) => setContratoId(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Todos los contratos</option>
                  {contratos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              <button
                onClick={handleGenerar}
                disabled={generando || generandoGerencial || !fechaInicio || !fechaFin}
                className="self-end w-full xl:w-auto px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
              >
                {generando ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Download className="w-4 h-4" />}
                {generando ? 'Generando...' : 'Generar PDF'}
              </button>
              <button
                onClick={handleGenerarGerencial}
                disabled={generando || generandoGerencial || !fechaInicio || !fechaFin}
                className="self-end w-full xl:w-auto px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
              >
                {generandoGerencial ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Download className="w-4 h-4" />}
                {generandoGerencial ? 'Generando...' : 'Generar PDF Gerencial'}
              </button>
            </div>
          )}
        </div>
      </div>

      <SheetsSyncPanel />

      {vista === 'subir' ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 space-y-4">
          <h2 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
            <Upload className="w-4 h-4" /> Carga masiva de alertas GPS
          </h2>

          {/* Selector de origen de datos */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
              Formato del Archivo a Cargar
            </label>
            <div className="flex flex-wrap gap-2 p-1 bg-slate-100 dark:bg-slate-900 rounded-lg">
              <button
                type="button"
                onClick={() => { setSelectedSource('STANDARD'); setUploadResult(null); setUploadError(null); }}
                className={`flex-1 min-w-[140px] py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                  selectedSource === 'STANDARD'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800/60'
                }`}
              >
                📋 Plantilla Estándar
              </button>
              <button
                type="button"
                onClick={() => { setSelectedSource('COLTRACK'); setUploadResult(null); setUploadError(null); }}
                className={`flex-1 min-w-[140px] py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                  selectedSource === 'COLTRACK'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800/60'
                }`}
              >
                📄 COLTRACK (.csv)
              </button>
              <button
                type="button"
                onClick={() => { setSelectedSource('FAGOR'); setUploadResult(null); setUploadError(null); }}
                className={`flex-1 min-w-[140px] py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                  selectedSource === 'FAGOR'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800/60'
                }`}
              >
                📊 FAGOR (.xlsx)
              </button>
              <button
                type="button"
                onClick={() => { setSelectedSource('GEOTAB'); setUploadResult(null); setUploadError(null); }}
                className={`flex-1 min-w-[140px] py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                  selectedSource === 'GEOTAB'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800/60'
                }`}
              >
                📈 GEOTAB (.xlsx)
              </button>
            </div>
          </div>

          <ExcelDropzone
            onFile={handleFile}
            loading={uploadLoading}
            exito={uploadResult?.exito ?? false}
            error={uploadError}
            accept={selectedSource === 'COLTRACK' ? '.csv' : '.xlsx,.xls'}
            plantillas={selectedSource === 'STANDARD' ? [['alertas', 'Alertas Diarias GPS']] : []}
            nota={
              selectedSource === 'STANDARD' ? (
                <>
                  <strong>Nota:</strong> La plantilla de alertas se cruza por <strong>placa</strong> con la base maestra de vehiculos activos.
                  El conductor se identifica por nombre cuando existe en la base; si viene vacio o como <strong>No registra</strong>, se cuenta como alerta sin identificar.
                </>
              ) : selectedSource === 'COLTRACK' ? (
                <>
                  <strong>Nota Coltrack:</strong> Sube el archivo CSV de alertas directo de la plataforma (tamaño máximo 50 MB, delimitado por tuberías `|`). Se cruzará con los vehículos activos.
                </>
              ) : selectedSource === 'GEOTAB' ? (
                <>
                  <strong>Nota Geotab:</strong> Sube el archivo Excel bruto de Geotab. Se procesará automáticamente la pestaña llamada <strong>Data</strong> (tamaño máximo 50 MB).
                </>
              ) : (
                <>
                  <strong>Nota Fagor:</strong> Sube el reporte Excel de excesos de velocidad o frenadas bruscas crudo desde la plataforma de Fagor (tamaño máximo 50 MB).
                </>
              )
            }
          />
          {uploadResult && (
            <div className={`rounded-lg p-3 text-sm ${uploadResult.exito ? 'bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400'}`}>
              {uploadResult.exito
                ? (() => {
                    const pendientes = uploadResult.novedades?.pendientes ?? 0;
                    const procesadas = uploadResult.registrosInsertados + pendientes;
                    return `✓ ${procesadas} alerta(s) procesadas: ${uploadResult.registrosInsertados} importada(s) al informe diario${pendientes ? ` · ${pendientes} guardada(s) como novedad pendiente` : ''}${uploadResult.errores.length ? ` · ${uploadResult.errores.length} observacion(es).` : '.'}`;
                  })()
                : `Se encontraron ${uploadResult.errores.length} errores. Ningun dato fue insertado.`
              }
            </div>
          )}
          {uploadResult?.novedades?.pendientes && (
            <div className="rounded-lg p-4 text-sm bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 space-y-1">
              <p className="font-semibold text-amber-800 dark:text-amber-300">
                {uploadResult.novedades.pendientes} alerta(s) con placa no encontrada en la base de vehículos activos
              </p>
              <p className="text-amber-700 dark:text-amber-400">
                Estas alertas quedaron registradas como <strong>novedades pendientes</strong> y no aparecerán en el informe diario hasta que la placa sea registrada o activada en la base maestra de vehículos.
              </p>
            </div>
          )}
          {uploadResult && uploadResult.errores.length > 0 && <ErroresTable errores={uploadResult.errores} />}
        </div>
      ) : vista === 'analisis' ? (
        <div className="space-y-4">
          {/* Filtro de fechas */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex flex-wrap items-end gap-3">
            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">Fecha inicio</label>
              <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} className="px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">Fecha fin</label>
              <input type="date" value={fechaFin} min={fechaInicio} onChange={(e) => setFechaFin(e.target.value)} className="px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <button onClick={cargarAnalisis} disabled={cargandoAnalisis} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold transition-colors flex items-center gap-2">
              <RefreshCw className={`w-4 h-4 ${cargandoAnalisis ? 'animate-spin' : ''}`} /> Actualizar
            </button>
          </div>

          {/* Contratos con alertas en el periodo */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-blue-600" /> Contratos con alertas
              </h2>
              <span className="text-xs text-slate-500 dark:text-slate-400">{analisisPorContrato.length} contrato(s) con alertas en el periodo</span>
            </div>

            {cargandoAnalisis ? (
              <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
            ) : analisisPorContrato.length === 0 ? (
              <div className="text-center py-10 text-slate-400 dark:text-slate-500 text-sm">No hay contratos con alertas en el periodo seleccionado.</div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-800 text-white">
                      <th className="text-left px-3 py-2.5 font-semibold">Contrato</th>
                      <th className="px-2 py-2.5 font-semibold">≥80</th>
                      <th className="px-2 py-2.5 font-semibold">50-80</th>
                      <th className="px-2 py-2.5 font-semibold">10-40</th>
                      <th className="px-2 py-2.5 font-semibold">Frenadas</th>
                      <th className="px-2 py-2.5 font-semibold">Placas</th>
                      <th className="px-2 py-2.5 font-semibold">Sin iButton</th>
                      <th className="px-2 py-2.5 font-semibold text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analisisPorContrato.map((g, i) => (
                      <tr key={g.contratoId || g.contrato} className={`border-t border-slate-100 dark:border-slate-800 ${g.infr80 > 0 ? 'bg-red-50/60 dark:bg-red-950/20' : i % 2 ? 'bg-slate-50/50 dark:bg-slate-800/20' : ''}`}>
                        <td className="px-3 py-2 font-medium text-slate-700 dark:text-slate-200">
                          {g.contrato}
                          {g.infr80 > 0 && <span className="ml-2 inline-block px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400 text-[9px] font-bold">CRÍTICO ≥80</span>}
                        </td>
                        <td className={`px-2 py-2 text-center font-bold ${g.infr80 > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-400'}`}>{g.infr80}</td>
                        <td className="px-2 py-2 text-center text-amber-600 dark:text-amber-400">{g.exc50a80}</td>
                        <td className="px-2 py-2 text-center text-slate-600 dark:text-slate-300">{g.excVarios}</td>
                        <td className="px-2 py-2 text-center text-orange-500 dark:text-orange-400">{g.frenadas}</td>
                        <td className="px-2 py-2 text-center text-slate-600 dark:text-slate-300">{g.placasCount}</td>
                        <td className="px-2 py-2 text-center text-amber-500 dark:text-amber-400">{g.sinIdCount}</td>
                        <td className="px-2 py-2">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleGenerarCorreo(g.contratoId, g.contrato)}
                              disabled={!g.contratoId || generandoCorreo === (g.contratoId || g.contrato)}
                              title={g.contratoId ? 'Generar texto del correo' : 'Contrato sin identificar: no disponible'}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold transition-colors"
                            >
                              {generandoCorreo === (g.contratoId || g.contrato)
                                ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                : <Mail className="w-3.5 h-3.5" />}
                              Correo
                            </button>
                            <button
                              onClick={() => handleGenerarPDFContrato(g.contratoId)}
                              disabled={!g.contratoId || generandoPDFContrato === g.contratoId}
                              title={g.contratoId ? 'Generar PDF del contrato' : 'Contrato sin identificar: no disponible'}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 text-slate-700 dark:text-slate-200 font-semibold transition-colors"
                            >
                              {generandoPDFContrato === g.contratoId
                                ? <div className="w-3 h-3 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
                                : <Download className="w-3.5 h-3.5" />}
                              PDF
                            </button>
                            <button
                              onClick={() => handleGenerarExcelContrato(g.contratoId)}
                              disabled={!g.contratoId || generandoExcelContrato === g.contratoId}
                              title={g.contratoId ? 'Descargar detalle de alertas en Excel' : 'Contrato sin identificar: no disponible'}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold transition-colors"
                            >
                              {generandoExcelContrato === g.contratoId
                                ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                : <FileSpreadsheet className="w-3.5 h-3.5" />}
                              Excel
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">

          {/* ── Panel de análisis de alertas ── */}
          {!cargandoHistorial && analisisDiario && (
            <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-blue-600" />
                  Análisis del período
                </h2>
                <span className="text-xs text-slate-500 dark:text-slate-400">{fechaInicio} a {fechaFin}</span>
              </div>
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Flota y trazabilidad</p>
                <div className="flex flex-wrap gap-2">
                  <div className="flex-1 min-w-[110px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 flex flex-col items-center gap-0.5">
                    <span className="text-xl font-bold text-slate-800 dark:text-slate-100">{analisisDiario.placas}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 text-center">Vehículos con alertas</span>
                  </div>
                  <div className="flex-1 min-w-[110px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 flex flex-col items-center gap-0.5">
                    <span className="text-xl font-bold text-green-600 dark:text-green-400">{analisisDiario.conductoresId}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 text-center">Conductores identificados</span>
                  </div>
                  <div className="flex-1 min-w-[110px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 flex flex-col items-center gap-0.5">
                    <span className="text-xl font-bold text-amber-500 dark:text-amber-400">{analisisDiario.sinIbutton}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 text-center">Sin iButton (veh-día)</span>
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Tipos de alerta</p>
                <div className="flex flex-wrap gap-2">
                  <div className="flex-1 min-w-[110px] bg-white dark:bg-slate-800 border border-red-200 dark:border-red-900 rounded-xl p-3 flex flex-col items-center gap-0.5">
                    <span className="text-xl font-bold text-red-600 dark:text-red-400">{analisisDiario.infracciones80}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 text-center">Infracciones ≥ 80 km/h</span>
                  </div>
                  <div className="flex-1 min-w-[110px] bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-900 rounded-xl p-3 flex flex-col items-center gap-0.5">
                    <span className="text-xl font-bold text-amber-500 dark:text-amber-400">{analisisDiario.excesos50a80}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 text-center">Excesos 50-80 km/h</span>
                  </div>
                  <div className="flex-1 min-w-[110px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 flex flex-col items-center gap-0.5">
                    <span className="text-xl font-bold text-slate-800 dark:text-slate-100">{analisisDiario.excesosVarios}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 text-center">Excesos varios (10-40)</span>
                  </div>
                  <div className="flex-1 min-w-[110px] bg-white dark:bg-slate-800 border border-orange-200 dark:border-orange-900 rounded-xl p-3 flex flex-col items-center gap-0.5">
                    <span className="text-xl font-bold text-orange-500 dark:text-orange-400">{analisisDiario.frenadas}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 text-center">Frenadas bruscas</span>
                  </div>
                </div>
              </div>
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Cantidades por fecha y contrato</p>
                  <span className="text-[10px] text-slate-400">{resumenFechaContrato.length} grupos</span>
                </div>
                <div className="overflow-auto max-h-64">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-slate-800 text-white">
                      <tr>
                        <th className="px-3 py-2 text-left">Fecha</th>
                        <th className="px-3 py-2 text-left">Contrato</th>
                        <th className="px-3 py-2 text-right">Excesos 80</th>
                        <th className="px-3 py-2 text-right">50-80</th>
                        <th className="px-3 py-2 text-right">10-40</th>
                        <th className="px-3 py-2 text-right">Frenadas</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                      {resumenFechaContrato.map(row => (
                        <tr key={`${row.fecha}-${row.contrato}`} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                          <td className="px-3 py-1.5 font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">{row.fecha}</td>
                          <td className="px-3 py-1.5 text-slate-700 dark:text-slate-300">{row.contrato}</td>
                          <td className="px-3 py-1.5 text-right font-semibold text-red-600">{row.excesos80}</td>
                          <td className="px-3 py-1.5 text-right font-semibold text-amber-600">{row.excesos50a80}</td>
                          <td className="px-3 py-1.5 text-right font-semibold text-slate-700 dark:text-slate-300">{row.excesosVarios}</td>
                          <td className="px-3 py-1.5 text-right font-semibold text-orange-600">{row.frenadas}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <FileText className="w-4 h-4" /> Alertas cargadas
              </h2>
              <button onClick={cargarHistorial} disabled={cargandoHistorial} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                <RefreshCw className={`w-4 h-4 text-slate-500 ${cargandoHistorial ? 'animate-spin' : ''}`} />
              </button>
            </div>
            {cargandoHistorial ? (
              <div className="flex justify-center py-8">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <ReportsTable
                columns={colsAlertas}
                data={historial}
                emptyMessage="No hay alertas cargadas para el rango seleccionado."
                exportFileName={`alertas_diarias_registradas_${fechaInicio}_${fechaFin}`}
                includeDateContractSheet={!contratoId}
              />
            )}
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl border border-amber-200 dark:border-amber-800 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-amber-500" /> Alertas no registradas en base activa
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Placas que quedaron como novedad porque no existen o estan inactivas en la base maestra de vehiculos.
                </p>
              </div>
              <span className="text-xs font-semibold px-2 py-1 rounded-full bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                {pendientes.length} pendiente(s)
              </span>
            </div>
            {cargandoHistorial ? (
              <div className="flex justify-center py-8">
                <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <ReportsTable
                columns={colsPendientes}
                data={pendientes}
                emptyMessage="No hay alertas pendientes para el rango seleccionado."
                exportFileName={`alertas_diarias_no_registradas_${fechaInicio}_${fechaFin}`}
                includeDateContractSheet={!contratoId}
              />
            )}
          </div>
        </div>
      )}

      {correoModal && (
        <CorreoAlertasModal
          correo={correoModal}
          contratoNombre={correoContrato}
          onClose={() => setCorreoModal(null)}
        />
      )}
    </div>
  );
};
