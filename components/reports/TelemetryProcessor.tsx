import React, { useState, useMemo } from 'react';
import { Upload, BarChart3, RefreshCw, Calendar, CheckCircle2, AlertTriangle, Info, ShieldAlert, FileSpreadsheet, Fuel, Ban } from 'lucide-react';
import { importarDatosPlanosColtrack, importarDatosPlanosFagor, importarDatosPlanosGeotab, importarExcelConsolidado, descargarPlantilla, ImportResult } from '../../services/importService';

type Plataforma = 'coltrack' | 'fagor' | 'geotab' | 'plantilla';
type Destino = 'ralenti' | 'mensual';
type Requisito = 'Obligatorio' | 'Recomendado' | 'Opcional';

interface ArchivoSpec {
  /** Nombre con el que el operador reconoce el archivo. */
  archivo: string;
  /** Otros nombres reales que ha tenido el mismo export. */
  alias?: string;
  requisito: Requisito;
  /** Módulos que alimenta este archivo. */
  destinos: Destino[];
  /** Columnas por las que el motor lo identifica (la detección es por contenido, no por nombre). */
  deteccion: string;
  /** Qué datos aporta y a qué tabla van. */
  aporta: string;
}

/**
 * Especificación de insumos por plataforma.
 *
 * La fuente de verdad es `services/importService.ts`: cada `deteccion` corresponde
 * literalmente a la condición con la que el ingestor clasifica el archivo. Si allí
 * cambia una cabecera, este catálogo debe actualizarse en el mismo commit.
 */
const ESPECIFICACIONES: Record<Exclude<Plataforma, 'plantilla'>, ArchivoSpec[]> = {
  coltrack: [
    {
      archivo: 'Ralentí consolidado por vehículo (CSV)',
      alias: 'Ralenti_Coltrack.csv · «Documento Ralenti 1 … Coltrack.csv»',
      requisito: 'Obligatorio',
      destinos: ['ralenti', 'mensual'],
      deteccion: 'Columnas «Unidad» + «Ralentis excesivos»',
      aporta: 'Horas motor encendido, horas en ralentí, kms y nº de ralentís excesivos → ralentis_periodos. Es el ÚNICO archivo que aporta el denominador del % Ralentí.',
    },
    {
      archivo: 'Excesos de Ralentí semanal (XLSX)',
      alias: 'Excesos_Ralentí_Semanal_DDMMAAAA_HHMM.xlsx',
      requisito: 'Recomendado',
      destinos: ['ralenti'],
      deteccion: 'Columnas «Placa» + «Inicio Exceso» + «Duracion»',
      aporta: 'Evento por evento con duración y galones REALES → ralentis_eventos. Habilita el detalle por conductor, el ranking y el CO₂ exacto. Suba TODAS las semanas que cubren la quincena.',
    },
    {
      archivo: 'Ralentí detalle de eventos (CSV)',
      alias: '«Documento Ralenti 2 … Coltrack.csv»',
      requisito: 'Opcional',
      destinos: ['ralenti'],
      deteccion: 'Columnas «Nombre» + «Metros» + «Hora Reporte»',
      aporta: 'Alternativa al semanal cuando este no existe. La duración se ESTIMA por reparto uniforme y no trae galones. Se ignora si se sube el semanal.',
    },
    {
      archivo: 'Consolidado de faltas por vehículo (CSV)',
      alias: 'Consolidado_Faltas_Por_Vehículo_Coltrack.csv',
      requisito: 'Opcional',
      destinos: ['mensual'],
      deteccion: 'Columnas «Vehiculo» + «Calificacion»',
      aporta: 'Calificación, kms, excesos de velocidad, frenadas y aceleraciones → reportes_vehiculos.',
    },
    {
      archivo: 'Consolidado de faltas por conductor (CSV)',
      alias: 'Consolidado_Faltas_Por_Conductor_Coltrack.csv',
      requisito: 'Opcional',
      destinos: ['mensual'],
      deteccion: 'Columnas «Conductor» + «Calificacion»',
      aporta: 'Mismas métricas a nivel conductor → reportes_conductores.',
    },
    {
      archivo: 'Maestro de conductores (CSV)',
      alias: 'Conductores_Coltrack.csv',
      requisito: 'Opcional',
      destinos: ['mensual'],
      deteccion: 'Columnas «No. Identificación» o «iButton» + «Rh»',
      aporta: 'Mapa nombre → cédula / iButton. Solo se usa junto al consolidado de faltas por conductor; el Informe de Ralentí no lo necesita.',
    },
  ],
  fagor: [
    {
      archivo: 'Alarmas de ralentí, evento por evento (XLSX)',
      alias: '«Documento Ralenti 2 … Fagor.xlsx» · Ralenti 1.xlsx / Ralenti 2.xlsx / Ralenti 3.xlsx',
      requisito: 'Obligatorio',
      destinos: ['ralenti'],
      deteccion: 'Columnas «Matrícula» + «T. Ralentí»',
      aporta: 'Duración real y «Gal. Consumidos» por evento → ralentis_eventos, y el agregado por vehículo → ralentis_periodos. Puede subir varios archivos a la vez.',
    },
    {
      archivo: 'Grilla de telemetría diaria (XLSX)',
      alias: 'Grid_telemetría….xlsx · Km_Vehículos_Fagor….xlsx · «Documento Ralenti 1 … Fagor.xlsx»',
      requisito: 'Obligatorio',
      destinos: ['ralenti', 'mensual'],
      deteccion: 'Columnas «Matrícula» + «Horas Motor» + «Ralentí Tiempo Total»',
      aporta: 'Se agrega por matrícula y aporta las horas de motor encendido (denominador del % Ralentí), el ralentí TOTAL, los km y los galones de ralentí. Sin este archivo TODO el ralentí de Fagor queda excluido del informe. Expórtelo con el rango exacto de la quincena.',
    },
    {
      archivo: 'Km por conductor (XLSX)',
      alias: 'Km_Conductor_Fagor 1.xlsx',
      requisito: 'Opcional',
      destinos: ['mensual'],
      deteccion: 'Columnas «Conductor» + «Km. Recorridos» (sin «Horas Motor»)',
      aporta: 'Trayectos y kms por conductor → reportes_conductores.',
    },
    {
      archivo: 'Kilometraje por selección (XLSX)',
      alias: 'Informe_de_kilometraje_seleccion_….xlsx',
      requisito: 'Opcional',
      destinos: ['mensual'],
      deteccion: 'Columnas «Matrícula» + «Distancia(km)»',
      aporta: 'Solo completa vehículos ausentes del archivo principal de Km. No trae horas de motor, así que NO sirve para el Informe de Ralentí.',
    },
    {
      archivo: 'Maestro de conductores (XLSX)',
      alias: 'Conductores_Fagor.xlsx',
      requisito: 'Opcional',
      destinos: ['mensual'],
      deteccion: 'Columnas «Código iButton» + «DNI»',
      aporta: 'Mapa nombre → DNI / iButton para el informe mensual.',
    },
    {
      archivo: 'Alarmas de Excesos / Frenadas / Aceleraciones (XLSX)',
      alias: 'Excesos.xlsx · Frenadas.xlsx · Aceleraciones.xlsx',
      requisito: 'Opcional',
      destinos: ['mensual'],
      deteccion: 'Nombre del archivo (EXCESO / FRENADA / ACELERACION) o la columna de Estado',
      aporta: 'Conteo de eventos de velocidad y conducción brusca → reportes_vehiculos / reportes_conductores.',
    },
  ],
  geotab: [
    {
      archivo: 'Cumplimiento y Utilización (XLSX)',
      alias: 'GA_…_Cumplimiento_y_Utilización_*.xlsx',
      requisito: 'Obligatorio',
      destinos: ['mensual'],
      deteccion: 'Hoja «data» con la columna «Kilómetros conducidos»',
      aporta: 'Kms, horas conducidas y tiempo en ralentí por vehículo → reportes_vehiculos (columna informativa).',
    },
    {
      archivo: 'Scorecard (XLSX)',
      alias: 'GA_…_Scorecard_*.xlsx',
      requisito: 'Obligatorio',
      destinos: ['mensual'],
      deteccion: 'Hoja «data» con «Puntaje» / «Exceso Velocidad 60 Km/h»',
      aporta: 'Excesos 10–60 km/h, aceleraciones y frenadas → calificación propia comparable con Coltrack y Fagor.',
    },
  ],
};

/** Resumen de una línea: qué se necesita para que el Informe de Ralentí quede completo. */
const RESUMEN_RALENTI: Record<Plataforma, { texto: string; alimenta: boolean }> = {
  coltrack: {
    alimenta: true,
    texto: 'Ralentí consolidado por vehículo (obligatorio) + todos los Excesos de Ralentí semanales de la quincena (recomendado).',
  },
  fagor: {
    alimenta: true,
    texto: 'Alarmas de ralentí evento por evento + la grilla de telemetría diaria (Grid_telemetría), que es la que aporta las horas de motor encendido y el ralentí total.',
  },
  geotab: {
    alimenta: false,
    texto: 'Por archivo, Geotab solo nutre los informes mensuales. Su aporte al Informe de Ralentí es AUTOMÁTICO vía la API de MyGeotab: no hay que cargar nada aquí.',
  },
  plantilla: {
    alimenta: false,
    texto: 'La plantilla consolidada alimenta los informes mensuales. Para el Informe de Ralentí use los archivos crudos de Coltrack o Fagor.',
  },
};

const ESTILO_REQUISITO: Record<Requisito, string> = {
  Obligatorio: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-900/50',
  Recomendado: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900/50',
  Opcional: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
};

const ESTILO_DESTINO: Record<Destino, { label: string; clase: string }> = {
  ralenti: {
    label: 'Informe Ralentí',
    clase: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900/50',
  },
  mensual: {
    label: 'Informe Mensual',
    clase: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/30 dark:text-indigo-300 dark:border-indigo-900/50',
  },
};

const Badge: React.FC<{ clase: string; children: React.ReactNode }> = ({ clase, children }) => (
  <span className={`inline-block whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[10px] font-bold leading-tight ${clase}`}>
    {children}
  </span>
);

/** Tabla de insumos de una plataforma. */
const TablaArchivos: React.FC<{ specs: ArchivoSpec[] }> = ({ specs }) => (
  <div className="overflow-x-auto -mx-1 px-1">
    <table className="w-full min-w-[720px] text-left border-collapse text-[11px]">
      <thead>
        <tr className="bg-slate-100/70 dark:bg-slate-900/60 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-200 dark:border-slate-700">
          <th className="py-2 px-3">Archivo a cargar</th>
          <th className="py-2 px-3 w-[104px]">Requisito</th>
          <th className="py-2 px-3 w-[130px]">Alimenta</th>
          <th className="py-2 px-3">Cómo lo reconoce el sistema</th>
          <th className="py-2 px-3">Qué aporta</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60 align-top">
        {specs.map(spec => (
          <tr key={spec.archivo}>
            <td className="py-2.5 px-3">
              <span className="block font-semibold text-slate-700 dark:text-slate-200">{spec.archivo}</span>
              {spec.alias && (
                <span className="block mt-0.5 font-mono text-[10px] text-slate-400 dark:text-slate-500 break-words">{spec.alias}</span>
              )}
            </td>
            <td className="py-2.5 px-3">
              <Badge clase={ESTILO_REQUISITO[spec.requisito]}>{spec.requisito}</Badge>
            </td>
            <td className="py-2.5 px-3">
              <span className="flex flex-col gap-1 items-start">
                {spec.destinos.map(d => (
                  <Badge key={d} clase={ESTILO_DESTINO[d].clase}>{ESTILO_DESTINO[d].label}</Badge>
                ))}
              </span>
            </td>
            <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400">{spec.deteccion}</td>
            <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400 leading-relaxed">{spec.aporta}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const ultimoDiaDelMes = (year: number, month1: number) => new Date(year, month1, 0).getDate();

/**
 * El Informe de Ralentí trabaja SIEMPRE por quincenas (día 1→15 y 16→fin de mes); es la
 * misma convención que aplican `RalentiReports` y `RalentiAnalisisGeneral` para filtrar
 * `ralentis_periodos`. Un rango distinto se guarda igual, pero queda invisible en el
 * Análisis General y en el comparativo histórico, así que lo advertimos antes de procesar.
 */
const esQuincena = (inicio: string, fin: string): boolean => {
  const [yi, mi, di] = inicio.split('-').map(Number);
  const [yf, mf, df] = fin.split('-').map(Number);
  if (!yi || !yf || yi !== yf || mi !== mf) return false;
  return (di === 1 && df === 15) || (di === 16 && df === ultimoDiaDelMes(yi, mi));
};

export const TelemetryProcessor: React.FC = () => {
  const [plataforma, setPlataforma] = useState<Plataforma>('coltrack');
  const [files, setFiles] = useState<File[]>([]);
  const [uploadRange, setUploadRange] = useState({
    inicio: (() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    })(),
    fin: (() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-15`;
    })()
  });

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const alimentaRalenti = RESUMEN_RALENTI[plataforma].alimenta;
  const rangoEsQuincena = useMemo(
    () => esQuincena(uploadRange.inicio, uploadRange.fin),
    [uploadRange.inicio, uploadRange.fin]
  );
  const rangoInvertido = Boolean(uploadRange.inicio && uploadRange.fin && uploadRange.inicio > uploadRange.fin);

  /** Aplica Q1 / Q2 / mes completo sobre el mes que ya está seleccionado. */
  const aplicarPreset = (preset: 'q1' | 'q2' | 'mes') => {
    const [year, month] = uploadRange.inicio.split('-').map(Number);
    if (!year || !month) return;
    const mm = String(month).padStart(2, '0');
    const ultimo = String(ultimoDiaDelMes(year, month)).padStart(2, '0');
    if (preset === 'q1') setUploadRange({ inicio: `${year}-${mm}-01`, fin: `${year}-${mm}-15` });
    else if (preset === 'q2') setUploadRange({ inicio: `${year}-${mm}-16`, fin: `${year}-${mm}-${ultimo}` });
    else setUploadRange({ inicio: `${year}-${mm}-01`, fin: `${year}-${mm}-${ultimo}` });
  };

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
      } else if (plataforma === 'fagor') {
        importResult = await importarDatosPlanosFagor(files, uploadRange.inicio, uploadRange.fin);
      } else if (plataforma === 'geotab') {
        importResult = await importarDatosPlanosGeotab(files, uploadRange.inicio, uploadRange.fin);
      } else {
        importResult = await importarExcelConsolidado(files, uploadRange.inicio, uploadRange.fin);
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

  const botonPlataforma = (id: Plataforma, label: string) => (
    <button
      key={id}
      onClick={() => { setPlataforma(id); clearAllFiles(); }}
      className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${plataforma === id ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm border border-slate-200/30 dark:border-slate-700' : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}
    >
      {label}
    </button>
  );

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
            <p className="text-sm text-slate-500 dark:text-slate-400">Ingesta y unificación automática de telemetrías crudas (Coltrack, Fagor y Geotab)</p>
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
            <p>
              <strong>Los archivos se reconocen por sus columnas, no por el nombre del archivo</strong>: puedes subirlos tal como salen de la
              plataforma, renombrados o en cualquier orden. Cada plataforma alimenta módulos distintos; el detalle está en la tabla de abajo.
            </p>
          </div>
        </div>

        {/* Mapa rápido: qué plataforma alimenta qué módulo */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {([
            { id: 'coltrack' as const, nombre: 'Coltrack', detalle: 'Ralentí + Mensual · con combustible y CO₂' },
            { id: 'fagor' as const, nombre: 'Fagor / FlotasNet', detalle: 'Ralentí + Mensual · con combustible y CO₂' },
            { id: 'geotab' as const, nombre: 'Geotab (MyGeotab)', detalle: 'Solo Mensual · sin combustible ni CO₂' },
          ]).map(p => (
            <div key={p.id} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{p.nombre}</span>
                {RESUMEN_RALENTI[p.id].alimenta
                  ? <Badge clase={ESTILO_DESTINO.ralenti.clase}>Alimenta Ralentí</Badge>
                  : <Badge clase="bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700">No alimenta Ralentí</Badge>}
              </div>
              <p className="text-[10.5px] text-slate-500 dark:text-slate-400 leading-relaxed">{p.detalle}</p>
            </div>
          ))}
        </div>

        {/* Selector de Plataforma */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">1. Selecciona la Plataforma Satelital o Plantilla</label>
          <div className="flex bg-slate-100 dark:bg-slate-900 p-1.5 rounded-xl gap-1.5 max-w-lg border border-slate-200/50 dark:border-slate-800">
            {botonPlataforma('coltrack', 'Coltrack (CSV)')}
            {botonPlataforma('fagor', 'Fagor (XLSX)')}
            {botonPlataforma('geotab', 'Geotab (XLSX)')}
            {botonPlataforma('plantilla', 'Plantilla Consolidada (Excel)')}
          </div>
        </div>

        {/* Resumen del objetivo "Informe de Ralentí" para la plataforma activa */}
        <div className={`rounded-xl border p-4 text-xs flex gap-3 items-start leading-relaxed ${alimentaRalenti
          ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200/60 dark:border-emerald-900/50 text-emerald-900 dark:text-emerald-200'
          : 'bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}>
          {alimentaRalenti
            ? <Fuel className="w-5 h-5 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
            : <Ban className="w-5 h-5 shrink-0 mt-0.5 text-slate-400" />}
          <div className="space-y-1">
            <strong className="block text-sm font-bold">
              {alimentaRalenti ? 'Para alimentar el Informe de Ralentí necesitas:' : 'Esta selección no alimenta el Informe de Ralentí'}
            </strong>
            <p>{RESUMEN_RALENTI[plataforma].texto}</p>
            {plataforma === 'geotab' && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Estos dos export alimentan los <strong>informes mensuales</strong> de vehículos y conductores; no generan registros de ralentí
                ni de combustible/CO₂. El Informe de Ralentí de Geotab se alimenta <strong>solo</strong> por la sincronización automática
                (<span className="font-mono">/api/geotab-ralenti-sync</span>), que toma las horas de motor y los eventos de la regla «Idling»
                directamente de MyGeotab. <strong>No suba aquí el «Reporte avanzado de viajes en detalle»</strong>: pesa decenas de MB, se
                procesa en el navegador y no aporta nada que la API no entregue ya.
              </p>
            )}
          </div>
        </div>

        {/* Instructivos de Archivos */}
        {plataforma !== 'plantilla' && (
          <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700/50 text-xs space-y-3">
            <strong className="text-indigo-700 dark:text-indigo-400 text-xs uppercase font-bold tracking-wide flex items-center gap-1.5">
              📁 Archivos aceptados para {plataforma === 'coltrack' ? 'Coltrack' : plataforma === 'fagor' ? 'Fagor / FlotasNet' : 'Geotab (export de MyGeotab)'}
            </strong>
            <TablaArchivos specs={ESPECIFICACIONES[plataforma]} />

            {plataforma === 'coltrack' && (
              <p className="text-[10px] text-slate-400 dark:text-slate-500 italic leading-relaxed">
                Nota: cuando se incluyen los archivos semanales de excesos, el informe usa sus duraciones y galones reales por evento, y los
                totales de galones/CO₂ del período se reconcilian con ese detalle. Los eventos cuya fecha caiga fuera del período seleccionado
                se descartan y se reportan como advertencia al finalizar la carga.
              </p>
            )}
            {plataforma === 'fagor' && (
              <p className="text-[10px] text-slate-400 dark:text-slate-500 italic leading-relaxed">
                Nota: los km de un vehículo presente en varios grupos se suman automáticamente. La grilla de telemetría se agrega por matrícula
                (cada fila es un día y un conductor), así que <strong>expórtela con el rango exacto de la quincena</strong>: si exporta el mes
                completo para una quincena, las horas de motor quedarán sobredimensionadas y el % Ralentí subestimado. Cuando la grilla está
                presente, el ralentí y los galones del período salen de ella (ralentí total, comparable con Coltrack) y los archivos de alarmas
                aportan el detalle por evento y el conteo de ralentís excesivos.
              </p>
            )}
            {plataforma === 'geotab' && (
              <p className="text-[10px] text-slate-400 dark:text-slate-500 italic leading-relaxed">
                Suba ambos archivos juntos: el sistema cruza por placa, lee la hoja <strong>data</strong> y calcula una calificación propia
                comparable con Coltrack/Fagor. Los conductores se imputan por la columna <strong>«Conductor actual»</strong> (los vehículos sin
                conductor identificado solo alimentan el informe de vehículos). Si una placa también viene en Coltrack o Fagor para el mismo
                período, sus valores se <strong>suman</strong> en el informe mensual.
              </p>
            )}
          </div>
        )}

        {plataforma === 'plantilla' && (
          <div className="bg-slate-50 dark:bg-slate-900/50 p-5 rounded-xl border border-slate-200 dark:border-slate-700/50 text-xs space-y-3">
            <strong className="text-indigo-700 dark:text-indigo-400 text-xs uppercase font-bold tracking-wide flex items-center gap-1.5">
              📁 Modo Plantilla Consolidada Unificada:
            </strong>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-xs">
              Sube tu <strong>plantilla de operación unificada</strong> en formato Excel (.xlsx). El procesador importará directamente tus cifras consolidadas de Conducción y Kilómetros para asegurar una coincidencia exacta de los reportes mensuales.
            </p>
            <div className="p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 space-y-1.5 text-xs text-slate-600 dark:text-slate-400 shadow-sm leading-relaxed">
              <strong>💡 Opciones de Resolución de Cédulas Avanzadas:</strong>
              <p>Puedes arrastrar junto con tu plantilla consolidada archivos de mapeo como <strong>Conductores_Coltrack.csv</strong>, <strong>Conductores_Fagor.xlsx</strong>, o la <strong>Base General de Colaboradores (Roster)</strong>. El procesador usará estas referencias en paralelo para deducir automáticamente las cédulas y iButtons reales de tus conductores mediante cruce de nombres completos.</p>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200/50 dark:border-slate-700/50">
              <span className="text-xs text-slate-500 font-semibold">Descargar plantillas vacías:</span>
              <button
                onClick={() => descargarPlantilla('conductor')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors shadow-sm bg-white dark:bg-slate-900"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-green-600 animate-pulse" />
                Plantilla Conductores
              </button>
              <button
                onClick={() => descargarPlantilla('vehiculo')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors shadow-sm bg-white dark:bg-slate-900"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
                Plantilla Vehículos (e Idling)
              </button>
            </div>
          </div>
        )}

        {/* Configuración de Rango de Fechas */}
        <div className="space-y-2 max-w-xl">
          <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" /> 2. Rango del Período de Telemetría
          </label>
          <div className="space-y-3 bg-slate-50 dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700/50">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-semibold">Atajos del mes seleccionado:</span>
              {([
                { id: 'q1' as const, label: 'Quincena 1 (1–15)' },
                { id: 'q2' as const, label: 'Quincena 2 (16–fin)' },
                { id: 'mes' as const, label: 'Mes completo' },
              ]).map(p => (
                <button
                  key={p.id}
                  onClick={() => aplicarPreset(p.id)}
                  className="px-2.5 py-1 text-[11px] font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

          {rangoInvertido && (
            <div className="rounded-xl p-3 text-[11px] bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 border border-red-200/50 dark:border-red-900/50 flex gap-2 items-start leading-relaxed">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <span>La fecha de inicio es posterior a la de finalización. Corrige el rango antes de procesar.</span>
            </div>
          )}

          {alimentaRalenti && !rangoInvertido && !rangoEsQuincena && (
            <div className="rounded-xl p-3 text-[11px] bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300 border border-amber-200/50 dark:border-amber-900/50 flex gap-2 items-start leading-relaxed">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                El <strong>Informe de Ralentí trabaja por quincenas</strong> (día 1→15 y 16→fin de mes). Con este rango los datos se guardarán,
                pero <strong>no aparecerán</strong> en «Análisis General» ni en el comparativo histórico del informe, y el «Informe por Período»
                solo los mostrará si eliges exactamente el mismo rango. Usa los atajos de quincena salvo que la carga sea únicamente para el
                informe mensual.
              </span>
            </div>
          )}
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
            disabled={loading || files.length === 0 || rangoInvertido}
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
              {result.advertencias && result.advertencias.length > 0 && (
                <div className="mt-2 space-y-1">
                  {result.advertencias.map((adv, i) => (
                    <div key={i} className="flex gap-2 items-start text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-900/50 rounded-lg p-2.5">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span className="text-[11px] leading-relaxed">{adv}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
