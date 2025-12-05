import React from 'react';
import { ClipboardCheck, RefreshCw, AlertTriangle, CheckCircle, Clock, Download, Upload, FileSpreadsheet } from 'lucide-react';
import {
  importInspectionsToDatabase,
  getInspectionsByDateRange,
  getInspectionSummary,
  crossInspectionsWithIgnition,
  type PreoperationalInspection,
  type InspectionSummary,
  type InspectionCrossCheck
} from '../services/towerControlService';
import { useManualInspectionUpload } from '../hooks/useManualInspectionUpload';

interface InspectionsProps {
  selectedContract?: string;
}

export const Inspections: React.FC<InspectionsProps> = ({ selectedContract }) => {
  const [loading, setLoading] = React.useState(false);
  const [downloading, setDownloading] = React.useState(false);
  const [inspections, setInspections] = React.useState<PreoperationalInspection[]>([]);
  const [summary, setSummary] = React.useState<InspectionSummary[]>([]);
  const [crossCheck, setCrossCheck] = React.useState<InspectionCrossCheck[]>([]);

  // Rango de fechas para descargar desde Excel (por defecto: última semana)
  const [downloadStartDate, setDownloadStartDate] = React.useState<string>(() => {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return date.toISOString().split('T')[0];
  });
  const [downloadEndDate, setDownloadEndDate] = React.useState<string>(
    new Date().toISOString().split('T')[0]
  );

  // Rango de fechas para visualización desde Supabase
  const [viewStartDate, setViewStartDate] = React.useState<string>(() => {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return date.toISOString().split('T')[0];
  });
  const [viewEndDate, setViewEndDate] = React.useState<string>(
    new Date().toISOString().split('T')[0]
  );

  const [filterContract, setFilterContract] = React.useState<string>('');
  const [lastUpdate, setLastUpdate] = React.useState<string>('');
  const [errorMessage, setErrorMessage] = React.useState<string>('');
  const [apiStats, setApiStats] = React.useState<{ totalRecords: number; filteredRecords: number }>({ totalRecords: 0, filteredRecords: 0 });

  // Hook para carga manual
  const { loading: uploading, processFile, progress } = useManualInspectionUpload();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Cargar datos DESDE SUPABASE cuando cambien los filtros
  React.useEffect(() => {
    loadInspections();
  }, [viewStartDate, viewEndDate, filterContract]);

  // Auto-aplicar filtro de contrato si viene desde props
  React.useEffect(() => {
    if (selectedContract) {
      setFilterContract(selectedContract);
    }
  }, [selectedContract]);

  /**
   * Manejar carga manual de archivo Excel
   */
  const handleManualUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setDownloading(true);
    setErrorMessage('');

    try {
      console.log('[Inspections] Processing manual upload:', file.name);

      // Procesar archivo con el hook
      const inspections = await processFile(file, downloadStartDate, downloadEndDate, 3000);

      console.log(`[Inspections] Processed ${inspections.length} inspections from file`);

      // Actualizar estadísticas
      setApiStats({
        totalRecords: inspections.length,
        filteredRecords: inspections.length
      });

      // Importar a Supabase
      const importResult = await importInspectionsToDatabase(inspections);

      if (importResult.success) {
        alert(
          `✅ Archivo cargado y guardado en Supabase\n\n` +
          `Archivo: ${file.name}\n` +
          `Rango: ${downloadStartDate} a ${downloadEndDate}\n` +
          `Importadas: ${importResult.imported} inspecciones`
        );
        setLastUpdate(new Date().toLocaleString('es-CO'));

        // Actualizar fechas de visualización
        setViewStartDate(downloadStartDate);
        setViewEndDate(downloadEndDate);

        await loadInspections();
      } else {
        alert(
          `⚠️ Importación parcial\n\n` +
          `Importadas: ${importResult.imported}\n` +
          `Errores: ${importResult.errors.length}\n\n` +
          `${importResult.errors.slice(0, 5).join('\n')}`
        );
      }
    } catch (error: any) {
      console.error('[Inspections] Error:', error);
      const errorMsg = error.message || 'Error desconocido';
      setErrorMessage(errorMsg);
      alert('❌ Error al cargar el archivo:\n\n' + errorMsg);
    } finally {
      setDownloading(false);
      // Limpiar input para permitir subir el mismo archivo de nuevo
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  /**
   * Descarga Excel y actualiza base de datos (NUEVA ARQUITECTURA: Excel → Supabase → UI)
   */
  const handleUpdateInspections = async () => {
    setDownloading(true);
    setErrorMessage('');
    try {
      console.log('[Inspections] Fetching from API:', downloadStartDate, 'to', downloadEndDate);

      // Llamar al endpoint que descarga el Excel CON RANGO DE FECHAS
      const response = await fetch(
        `/api/inspections?startDate=${downloadStartDate}&endDate=${downloadEndDate}&limit=3000`
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || result.errorDetails || 'Error al descargar inspecciones');
      }

      console.log(`[Inspections] Downloaded ${result.data.length} inspections`);
      console.log(`[Inspections] Total in Excel: ${result.totalRecordsInExcel}, After filter: ${result.recordsAfterFilter}`);

      // Actualizar estadísticas de API
      setApiStats({
        totalRecords: result.totalRecordsInExcel || 0,
        filteredRecords: result.recordsAfterFilter || 0
      });

      if (result.data.length === 0) {
        alert(
          `ℹ️ No se encontraron inspecciones\n\n` +
          `Rango: ${downloadStartDate} a ${downloadEndDate}\n` +
          `El Excel tiene ${result.totalRecordsInExcel} registros en total, pero ninguno en este rango.`
        );
        setLastUpdate(new Date().toLocaleString('es-CO'));
        return;
      }

      // Importar a Supabase
      const importResult = await importInspectionsToDatabase(result.data);

      if (importResult.success) {
        alert(
          `✅ Semana descargada y guardada en Supabase\n\n` +
          `Rango: ${downloadStartDate} a ${downloadEndDate}\n` +
          `Importadas: ${importResult.imported}\n` +
          `Total en Excel: ${result.totalRecordsInExcel}`
        );
        setLastUpdate(new Date().toLocaleString('es-CO'));

        // Actualizar fechas de visualización para mostrar lo recién descargado
        setViewStartDate(downloadStartDate);
        setViewEndDate(downloadEndDate);

        await loadInspections();
      } else {
        alert(
          `⚠️ Importación parcial\n\n` +
          `Importadas: ${importResult.imported}\n` +
          `Errores: ${importResult.errors.length}\n\n` +
          `${importResult.errors.slice(0, 5).join('\n')}`
        );
      }
    } catch (error: any) {
      console.error('[Inspections] Error:', error);
      const errorMsg = error.message || 'Error desconocido';
      setErrorMessage(errorMsg);
      alert('❌ Error al actualizar inspecciones:\n\n' + errorMsg + '\n\nRevisa la consola del navegador para más detalles.');
    } finally {
      setDownloading(false);
    }
  };

  /**
   * Carga inspecciones desde Supabase (NO desde Excel)
   */
  const loadInspections = async () => {
    setLoading(true);
    try {
      console.log('[Inspections] Loading from Supabase:', viewStartDate, 'to', viewEndDate);

      // Cargar inspecciones por rango de fechas desde Supabase
      const inspectionsResult = await getInspectionsByDateRange(
        viewStartDate,
        viewEndDate,
        filterContract || undefined
      );

      if (inspectionsResult.success && inspectionsResult.data) {
        setInspections(inspectionsResult.data);
      }

      // Cargar resumen por rango
      const summaryResult = await getInspectionSummary({
        startDate: viewStartDate,
        endDate: viewEndDate,
        contract: filterContract || undefined
      });

      if (summaryResult.success && summaryResult.data) {
        setSummary(summaryResult.data);
      }

      // Cargar cruce con ignición (solo para el primer día del rango)
      const crossCheckResult = await crossInspectionsWithIgnition(viewStartDate);
      if (crossCheckResult.success && crossCheckResult.data) {
        let filteredCross = crossCheckResult.data;

        // Filtrar por contrato
        if (filterContract) {
          filteredCross = filteredCross.filter(c => c.contract === filterContract);
        }

        setCrossCheck(filteredCross);
      }

    } catch (error: any) {
      console.error('[Inspections] Error loading from Supabase:', error);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Obtener estadísticas consolidadas
   */
  const stats = React.useMemo(() => {
    const total = inspections.length;
    const ok = inspections.filter(i => i.status === 'OK').length;
    const sinInspeccion = inspections.filter(i =>
      i.status.toLowerCase().includes('sin inspección') ||
      i.status.toLowerCase().includes('sin inspeccion')
    ).length;
    const fueraDeTiempo = inspections.filter(i =>
      i.status.toLowerCase().includes('fuera de tiempo')
    ).length;

    return {
      total,
      ok,
      sinInspeccion,
      fueraDeTiempo,
      okPercentage: total > 0 ? ((ok / total) * 100).toFixed(1) : '0',
      sinInspeccionPercentage: total > 0 ? ((sinInspeccion / total) * 100).toFixed(1) : '0',
      fueraDeTiempoPercentage: total > 0 ? ((fueraDeTiempo / total) * 100).toFixed(1) : '0'
    };
  }, [inspections]);

  /**
   * Obtener lista única de contratos
   */
  const contracts = React.useMemo(() => {
    const contractSet = new Set(inspections.map(i => i.contract).filter(Boolean));
    return Array.from(contractSet).sort();
  }, [inspections]);

  /**
   * Exportar a CSV
   */
  const handleExportCSV = () => {
    const headers = [
      'Llave',
      'Fecha',
      'Matrícula',
      'Día',
      'Hora Inicio',
      'Lugar Inicio',
      'Hora Fin',
      'Conductor',
      'Fecha y Hora Inspección',
      'Nº Hallazgos',
      'Estado',
      'Contrato',
      'Tipo de Vehículo'
    ];

    const rows = inspections.map(i => [
      i.inspection_key || '',
      i.inspection_date,
      i.plate,
      i.day_of_week || '',
      i.start_time || '',
      i.start_location || '',
      i.end_time || '',
      i.driver || '',
      i.inspection_datetime || '',
      i.findings_count || 0,
      i.status,
      i.contract || '',
      i.vehicle_type || ''
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `inspecciones_${viewStartDate}_${viewEndDate}_${filterContract || 'todas'}.csv`;
    link.click();
  };

  /**
   * Determinar color de fila según estado
   */
  const getRowColor = (status: string): string => {
    const statusLower = status.toLowerCase();
    if (status === 'OK') return 'bg-green-50';
    if (statusLower.includes('sin inspección') || statusLower.includes('sin inspeccion')) {
      return 'bg-yellow-50';
    }
    if (statusLower.includes('fuera de tiempo')) return 'bg-orange-50';
    return 'bg-white';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <ClipboardCheck className="w-8 h-8 text-blue-600" />
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Inspecciones Preoperacionales</h2>
            <p className="text-xs sm:text-sm text-gray-600">
              Seguimiento y control de inspecciones diarias
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          {/* Botón de carga manual */}
          <label
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 cursor-pointer transition-colors w-full sm:w-auto justify-center"
          >
            <Upload className="w-5 h-5" />
            <span>Cargar Excel Manual</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleManualUpload}
              disabled={downloading || uploading}
              className="hidden"
            />
          </label>

          {/* Botón de descarga automática (Apps Script) - Deshabilitado temporalmente */}
          <button
            onClick={handleUpdateInspections}
            disabled={true} // Deshabilitado porque Apps Script tiene error 403
            className="flex items-center gap-2 px-4 py-2 bg-gray-400 text-white rounded-lg cursor-not-allowed transition-colors w-full sm:w-auto justify-center"
            title="Deshabilitado: El servidor bloquea la descarga automática. Usa 'Cargar Excel Manual'"
          >
            <RefreshCw className="w-5 h-5" />
            <span className="hidden sm:inline">Descarga Automática</span>
            <span className="sm:hidden">Auto</span>
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        {/* Sección: Configurar Rango de Fechas */}
        <div className="mb-6 pb-6 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-green-600" />
            Configurar Rango para Carga Manual
          </h3>
          <p className="text-xs text-gray-500 mb-3">
            Selecciona el rango de fechas, luego haz clic en "Cargar Excel Manual" arriba y sube el archivo.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Fecha Inicio:
              </label>
              <input
                type="date"
                value={downloadStartDate}
                onChange={(e) => setDownloadStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Fecha Fin:
              </label>
              <input
                type="date"
                value={downloadEndDate}
                onChange={(e) => setDownloadEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div className="flex items-end">
              <p className="text-xs text-gray-500">
                Rango seleccionado: {downloadStartDate} a {downloadEndDate}
                <br />
                (~7 días recomendado)
              </p>
            </div>
          </div>
        </div>

        {/* Sección: Visualizar desde Supabase */}
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4 text-green-600" />
            Visualizar desde Base de Datos
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Desde:
              </label>
              <input
                type="date"
                value={viewStartDate}
                onChange={(e) => setViewStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Hasta:
              </label>
              <input
                type="date"
                value={viewEndDate}
                onChange={(e) => setViewEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Contrato:
              </label>
              <select
                value={filterContract}
                onChange={(e) => setFilterContract(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
              >
                <option value="">Todos los contratos</option>
                {contracts.map(contract => (
                  <option key={contract} value={contract}>{contract}</option>
                ))}
              </select>
            </div>

            <div className="flex items-end">
              <button
                onClick={handleExportCSV}
                disabled={inspections.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors w-full justify-center"
              >
                <Download className="w-5 h-5" />
                <span className="hidden sm:inline">Exportar CSV</span>
                <span className="sm:hidden">CSV</span>
              </button>
            </div>
          </div>
        </div>

        {/* Error Message */}
        {errorMessage && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-800">
              <strong>Error:</strong> {errorMessage}
            </p>
          </div>
        )}

        {/* Info Message */}
        {lastUpdate && (
          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Última actualización: {lastUpdate}
            </p>
            {apiStats.totalRecords > 0 && (
              <p className="text-xs text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
                📊 Excel: {apiStats.totalRecords.toLocaleString()} registros → Filtrados: {apiStats.filteredRecords.toLocaleString()}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Resumen */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Resumen ({viewStartDate} a {viewEndDate})
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Estado</th>
                <th className="text-center py-3 px-4 font-semibold text-gray-700">Nº Vehículos</th>
                <th className="text-center py-3 px-4 font-semibold text-gray-700">%</th>
              </tr>
            </thead>
            <tbody>
              <tr className="bg-green-50 border-b border-gray-100">
                <td className="py-3 px-4 flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <span className="font-medium text-green-900">OK</span>
                </td>
                <td className="text-center py-3 px-4 font-bold text-green-900">{stats.ok}</td>
                <td className="text-center py-3 px-4 text-green-700">{stats.okPercentage}%</td>
              </tr>

              <tr className="bg-yellow-50 border-b border-gray-100">
                <td className="py-3 px-4 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-yellow-600" />
                  <span className="font-medium text-yellow-900">Sin inspección reportada</span>
                </td>
                <td className="text-center py-3 px-4 font-bold text-yellow-900">{stats.sinInspeccion}</td>
                <td className="text-center py-3 px-4 text-yellow-700">{stats.sinInspeccionPercentage}%</td>
              </tr>

              <tr className="bg-orange-50">
                <td className="py-3 px-4 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-orange-600" />
                  <span className="font-medium text-orange-900">Inspección fuera de tiempo</span>
                </td>
                <td className="text-center py-3 px-4 font-bold text-orange-900">{stats.fueraDeTiempo}</td>
                <td className="text-center py-3 px-4 text-orange-700">{stats.fueraDeTiempoPercentage}%</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-4 pt-4 border-t border-gray-200">
          <p className="text-lg font-bold text-gray-900">
            Total: {stats.total} vehículos
          </p>
        </div>
      </div>

      {/* Tabla Detallada */}
      <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Detalle de Inspecciones ({inspections.length})
        </h3>

        {loading ? (
          <div className="text-center py-8 text-gray-500">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2" />
            Cargando inspecciones...
          </div>
        ) : inspections.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <ClipboardCheck className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No hay inspecciones para el rango seleccionado</p>
            <p className="text-sm mt-2">Haz clic en "Descargar Semana" para importar datos del Excel</p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="w-full text-xs sm:text-sm min-w-max">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left py-3 px-2 font-semibold text-gray-700">Llave</th>
                  <th className="text-left py-3 px-2 font-semibold text-gray-700">Fecha</th>
                  <th className="text-left py-3 px-2 font-semibold text-gray-700">Matrícula</th>
                  <th className="text-left py-3 px-2 font-semibold text-gray-700">Día</th>
                  <th className="text-left py-3 px-2 font-semibold text-gray-700">Hora Inicio</th>
                  <th className="text-left py-3 px-2 font-semibold text-gray-700">Lugar Inicio</th>
                  <th className="text-left py-3 px-2 font-semibold text-gray-700">Conductor</th>
                  <th className="text-left py-3 px-2 font-semibold text-gray-700">Hora Inspección</th>
                  <th className="text-center py-3 px-2 font-semibold text-gray-700">Hallazgos</th>
                  <th className="text-left py-3 px-2 font-semibold text-gray-700">Estado</th>
                  <th className="text-left py-3 px-2 font-semibold text-gray-700">Contrato</th>
                  <th className="text-left py-3 px-2 font-semibold text-gray-700">Tipo</th>
                </tr>
              </thead>
              <tbody>
                {inspections.map((inspection, index) => (
                  <tr
                    key={inspection.id || index}
                    className={`border-b border-gray-100 ${getRowColor(inspection.status)}`}
                  >
                    <td className="py-2 px-2 text-gray-700">{inspection.inspection_key || '-'}</td>
                    <td className="py-2 px-2 text-gray-700">{inspection.inspection_date}</td>
                    <td className="py-2 px-2 font-semibold text-gray-900">{inspection.plate}</td>
                    <td className="py-2 px-2 text-gray-700">{inspection.day_of_week || '-'}</td>
                    <td className="py-2 px-2 text-gray-700">{inspection.start_time || '-'}</td>
                    <td className="py-2 px-2 text-gray-700 text-xs">{inspection.start_location || '-'}</td>
                    <td className="py-2 px-2 text-gray-700">{inspection.driver || '-'}</td>
                    <td className="py-2 px-2 text-gray-700 text-xs">
                      {inspection.inspection_datetime
                        ? new Date(inspection.inspection_datetime).toLocaleString('es-CO', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })
                        : '-'}
                    </td>
                    <td className="py-2 px-2 text-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        (inspection.findings_count || 0) > 0
                          ? 'bg-red-100 text-red-800'
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {inspection.findings_count || 0}
                      </span>
                    </td>
                    <td className="py-2 px-2">
                      <span className="font-medium text-gray-900">{inspection.status}</span>
                    </td>
                    <td className="py-2 px-2 text-gray-700">{inspection.contract || '-'}</td>
                    <td className="py-2 px-2 text-gray-700 text-xs">{inspection.vehicle_type || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Cruce con Ignición */}
      {crossCheck.length > 0 && (
        <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Cruce con Eventos de Ignición
          </h3>
          <p className="text-xs sm:text-sm text-gray-600 mb-4">
            Vehículos que encendieron motor y su estado de inspección
          </p>

          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="w-full text-xs sm:text-sm min-w-max">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left py-3 px-2 font-semibold text-gray-700">Placa</th>
                  <th className="text-left py-3 px-2 font-semibold text-gray-700">Hora Encendido</th>
                  <th className="text-left py-3 px-2 font-semibold text-gray-700">Hora Inspección</th>
                  <th className="text-left py-3 px-2 font-semibold text-gray-700">Estado</th>
                  <th className="text-left py-3 px-2 font-semibold text-gray-700">Conductor</th>
                  <th className="text-left py-3 px-2 font-semibold text-gray-700">Contrato</th>
                </tr>
              </thead>
              <tbody>
                {crossCheck.map((check, index) => (
                  <tr
                    key={index}
                    className={`border-b border-gray-100 ${getRowColor(check.status)}`}
                  >
                    <td className="py-2 px-2 font-semibold text-gray-900">{check.plate}</td>
                    <td className="py-2 px-2 text-gray-700">
                      {new Date(check.ignition_time).toLocaleTimeString('es-CO')}
                    </td>
                    <td className="py-2 px-2 text-gray-700">
                      {check.inspection_time
                        ? new Date(check.inspection_time).toLocaleTimeString('es-CO')
                        : '-'}
                    </td>
                    <td className="py-2 px-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        check.status === 'OK'
                          ? 'bg-green-100 text-green-800'
                          : check.status === 'Sin inspección'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-orange-100 text-orange-800'
                      }`}>
                        {check.status}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-gray-700">{check.driver || '-'}</td>
                    <td className="py-2 px-2 text-gray-700">{check.contract || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
