import React, { useState } from 'react';
import { Upload, BarChart3, RefreshCw, FileText, Calendar, CheckCircle2, AlertTriangle, Info, ShieldAlert } from 'lucide-react';
import { importarDatosPlanosColtrack, importarDatosPlanosFagor, ImportResult } from '../../services/importService';

export const TelemetryProcessor: React.FC = () => {
  const [plataforma, setPlataforma] = useState<'coltrack' | 'fagor'>('coltrack');
  const [files, setFiles] = useState<File[]>([]);
  const [uploadRange, setUploadRange] = useState({
    inicio: (() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    })(),
    fin: (() => {
      const d = new Date();
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      return last.toISOString().slice(0, 10);
    })()
  });

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files) {
      setFiles(prev => [...prev, ...Array.from(e.dataTransfer.files)]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(prev => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const clearAllFiles = () => {
    setFiles([]);
    setResult(null);
    setError(null);
  };

  const handleProcesar = async () => {
    if (files.length === 0) {
      alert('Por favor selecciona al menos un archivo plano de telemetría.');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      let importResult: ImportResult;
      if (plataforma === 'coltrack') {
        importResult = await importarDatosPlanosColtrack(files, uploadRange.inicio, uploadRange.fin);
      } else {
        importResult = await importarDatosPlanosFagor(files, uploadRange.inicio, uploadRange.fin);
      }

      setResult(importResult);
      if (importResult.exito) {
        setFiles([]); // Limpiar archivos al éxito
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error durante la ingesta y unificación de datos planos.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 w-full mx-auto">
      {/* Encabezado */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-950/40 flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Procesador Satelital Directo</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Ingesta y unificación automática de telemetrías crudas (Coltrack y Fagor)</p>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 space-y-6 shadow-sm">
        
        {/* Explicación y Beneficio */}
        <div className="bg-gradient-to-r from-indigo-500/10 to-blue-500/10 text-indigo-900 dark:text-indigo-200 p-4 rounded-xl border border-indigo-200/30 dark:border-indigo-800/30 text-xs flex gap-3 items-start leading-relaxed">
          <Info className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <strong className="text-sm font-bold text-indigo-800 dark:text-indigo-300">¿Cómo funciona este módulo independiente?</strong>
            <p>
              Este procesador te permite cargar directamente los archivos <strong>originales y crudos</strong> exportados de las plataformas satelitales, sin necesidad de unificarlos manualmente en plantillas Excel. El motor consolida, calcula ralentís, promedia calificaciones y asocia iButtons/Cédulas de manera automática en la base de datos Supabase utilizando tu sesión de operador activa.
            </p>
          </div>
        </div>

        {/* Selector de Plataforma */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">1. Selecciona la Plataforma Satelital</label>
          <div className="flex bg-slate-100 dark:bg-slate-900 p-1.5 rounded-xl gap-1.5 max-w-md border border-slate-200/50 dark:border-slate-800">
            <button
              onClick={() => { setPlataforma('coltrack'); clearAllFiles(); }}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${plataforma === 'coltrack' ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm border border-slate-200/30 dark:border-slate-700' : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}
            >
              Coltrack (CSV Pipes)
            </button>
            <button
              onClick={() => { setPlataforma('fagor'); clearAllFiles(); }}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${plataforma === 'fagor' ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm border border-slate-200/30 dark:border-slate-700' : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}
            >
              Fagor / FlotasNet (XLSX)
            </button>
          </div>
        </div>

        {/* Instructivos de Archivos */}
        {plataforma === 'coltrack' ? (
          <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700/50 text-xs space-y-2">
            <strong className="text-indigo-700 dark:text-indigo-400 text-xs uppercase font-bold tracking-wide flex items-center gap-1.5">
              📁 Archivos Planos Solicitados para Coltrack:
            </strong>
            <ul className="list-disc pl-4 space-y-1 text-slate-600 dark:text-slate-300">
              <li><strong>Consolidado_Faltas_Por_Conductor_Coltrack.csv</strong> (Métricas de faltas de conductores)</li>
              <li><strong>Consolidado_Faltas_Por_Vehículo_Coltrack.csv</strong> (Métricas de faltas de vehículos)</li>
              <li><strong>Conductores_Coltrack.csv</strong> (Mapeador de iButtons y Cédulas - Requerido)</li>
              <li><strong>Ralenti_Coltrack.csv</strong> (Tiempos de ralentí y consumo de combustible - Opcional)</li>
            </ul>
          </div>
        ) : (
          <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700/50 text-xs space-y-2">
            <strong className="text-emerald-700 dark:text-emerald-400 text-xs uppercase font-bold tracking-wide flex items-center gap-1.5">
              📁 Archivos Planos Solicitados para Fagor / FlotasNet:
            </strong>
            <ul className="list-disc pl-4 space-y-1 text-slate-600 dark:text-slate-300">
              <li><strong>Km_Conductor_Fagor 1.xlsx</strong> (Trayectos y frenadas por conductor)</li>
              <li><strong>Km_Vehículos_Fagor 1.xlsx</strong> (Kilómetros y ralentís totales por matrícula)</li>
              <li><strong>Conductores_Fagor.xlsx</strong> (Mapeador maestro de iButtons y DNI - Requerido)</li>
              <li><strong>Ralenti 1, Ralenti 2, Ralenti 3.xlsx</strong> (Alarmas individuales de ralentí excesivo - Opcionales)</li>
              <li className="text-amber-700 dark:text-amber-400">
                <strong>Km_segundo_informe_vrhiculos.xlsx</strong>  <span className="font-normal text-slate-500">(Opcional — respaldo para vehículos no encontrados en el archivo principal. Columnas: Matrícula / Km-Iniciales / Km-Finales / Distancia(km))</span>
              </li>
            </ul>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 italic">Nota: Los km de un vehículo presente en varios grupos se suman automáticamente. El archivo de respaldo solo aplica para vehículos ausentes en el archivo principal.</p>
          </div>
        )}

        {/* Configuración de Rango de Fechas */}
        <div className="space-y-2 max-w-xl">
          <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" /> 2. Rango del Período de Telemetría
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700/50">
            <div className="space-y-1">
              <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-semibold">Fecha de Inicio</span>
              <input
                type="date"
                value={uploadRange.inicio}
                onChange={(e) => setUploadRange(prev => ({ ...prev, inicio: e.target.value }))}
                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div className="space-y-1">
              <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-semibold">Fecha de Finalización</span>
              <input
                type="date"
                value={uploadRange.fin}
                onChange={(e) => setUploadRange(prev => ({ ...prev, fin: e.target.value }))}
                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>

        {/* Zona de Arrastre de Archivos */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">3. Carga de Archivos Múltiples</label>
          <div
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className="flex flex-col items-center justify-center w-full h-36 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl cursor-pointer bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-all group"
          >
            <label className="flex flex-col items-center justify-center w-full h-full cursor-pointer">
              <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center px-4">
                <Upload className="w-8 h-8 text-slate-400 dark:text-slate-500 mb-2 group-hover:text-indigo-500 transition-colors" />
                <p className="text-xs text-slate-600 dark:text-slate-400 font-semibold mb-1">Arrastra tus archivos aquí o haz clic para buscarlos</p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500">Soporta múltiples archivos CSV y XLSX en paralelo</p>
              </div>
              <input
                type="file"
                multiple
                className="hidden"
                accept=".csv, .xlsx, .xls"
                onChange={handleFileChange}
              />
            </label>
          </div>
        </div>

        {/* Lista de archivos seleccionados */}
        {files.length > 0 && (
          <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-bold">Archivos a procesar ({files.length})</span>
              <button onClick={clearAllFiles} className="text-red-500 hover:text-red-700 text-xs font-bold transition-colors">Limpiar todos</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {files.map((file, idx) => (
                <div key={idx} className="flex items-center justify-between bg-white dark:bg-slate-800 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs shadow-sm">
                  <span className="font-semibold text-slate-700 dark:text-slate-300 truncate max-w-[80%]">{file.name}</span>
                  <button
                    onClick={() => removeFile(idx)}
                    className="text-red-500 hover:text-red-700 font-bold"
                  >
                    Quitar
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Acciones */}
        <div className="flex items-center gap-4 pt-2">
          <button
            onClick={handleProcesar}
            disabled={loading || files.length === 0}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 dark:disabled:bg-slate-700 text-white disabled:text-slate-400 dark:disabled:text-slate-500 px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 shadow-sm"
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" /> Procesando telemetría...
              </>
            ) : (
              <>
                <BarChart3 className="w-4 h-4" /> Procesar e Ingerir Telemetría
              </>
            )}
          </button>
        </div>

        {/* Panel de error */}
        {error && (
          <div className="rounded-xl p-4 text-xs bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 border border-red-200/50 dark:border-red-900/50 flex gap-2 items-start">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <strong className="font-bold block mb-0.5">✕ Error al procesar la telemetría satelital:</strong>
              <p>{error}</p>
            </div>
          </div>
        )}

        {/* Panel de resultados */}
        {result && (
          <div className={`rounded-xl p-4 text-xs border flex gap-3 items-start ${result.exito ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300 border-emerald-200/50 dark:border-emerald-900/50' : 'bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300 border-amber-200/50 dark:border-amber-900/50'}`}>
            <CheckCircle2 className={`w-5 h-5 shrink-0 mt-0.5 ${result.exito ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`} />
            <div className="space-y-1">
              <strong className="text-sm font-bold block">
                {result.exito ? '✓ Procesamiento e Ingesta Exitosos' : '⚠ Importación Parcial con Observaciones'}
              </strong>
              <p>
                Los archivos crudos se cargaron, procesaron, normalizaron y unificaron con éxito. Se guardaron un total de <strong>{result.registrosInsertados} registros operacionales</strong> en Supabase para el período del <strong>{uploadRange.inicio}</strong> al <strong>{uploadRange.fin}</strong>.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
