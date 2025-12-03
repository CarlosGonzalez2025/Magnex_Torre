import React from 'react';
import { ClipboardCheck, RefreshCw, AlertTriangle, CheckCircle, Clock, Download } from 'lucide-react';
import {
  importInspectionsToDatabase,
  getInspectionsByDate,
  getInspectionSummary,
  crossInspectionsWithIgnition,
  type PreoperationalInspection,
  type InspectionSummary,
  type InspectionCrossCheck
} from '../services/towerControlService';

interface InspectionsProps {
  selectedContract?: string;
}

export const Inspections: React.FC<InspectionsProps> = ({ selectedContract }) => {
  const [loading, setLoading] = React.useState(false);
  const [inspections, setInspections] = React.useState<PreoperationalInspection[]>([]);
  const [summary, setSummary] = React.useState<InspectionSummary[]>([]);
  const [crossCheck, setCrossCheck] = React.useState<InspectionCrossCheck[]>([]);
  const [selectedDate, setSelectedDate] = React.useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [filterContract, setFilterContract] = React.useState<string>('');
  const [lastUpdate, setLastUpdate] = React.useState<string>('');

  // Cargar datos al montar el componente
  React.useEffect(() => {
    loadInspections();
  }, [selectedDate, filterContract]);

  // Auto-aplicar filtro de contrato si viene desde props
  React.useEffect(() => {
    if (selectedContract) {
      setFilterContract(selectedContract);
    }
  }, [selectedContract]);

  /**
   * Descarga Excel y actualiza base de datos
   */
  const handleUpdateInspections = async () => {
    setLoading(true);
    try {
      console.log('[Inspections] Fetching data from API...');

      // Llamar al endpoint que descarga el Excel
      const response = await fetch('/api/inspections');
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Error al descargar inspecciones');
      }

      console.log(`[Inspections] Downloaded ${result.data.length} inspections`);

      // Importar a la base de datos
      const importResult = await importInspectionsToDatabase(result.data);

      if (importResult.success) {
        alert(`✅ Inspecciones actualizadas correctamente\n\nImportadas: ${importResult.imported}`);
        setLastUpdate(new Date().toLocaleString('es-CO'));
        await loadInspections();
      } else {
        alert(`⚠️ Importación parcial\n\nImportadas: ${importResult.imported}\nErrores: ${importResult.errors.length}\n\n${importResult.errors.slice(0, 5).join('\n')}`);
      }
    } catch (error: any) {
      console.error('[Inspections] Error:', error);
      alert('❌ Error al actualizar inspecciones: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Carga inspecciones desde la base de datos
   */
  const loadInspections = async () => {
    setLoading(true);
    try {
      // Cargar inspecciones del día
      const inspectionsResult = await getInspectionsByDate(selectedDate);
      if (inspectionsResult.success && inspectionsResult.data) {
        let filtered = inspectionsResult.data;

        // Filtrar por contrato si está seleccionado
        if (filterContract) {
          filtered = filtered.filter(i => i.contract === filterContract);
        }

        setInspections(filtered);
      }

      // Cargar resumen
      const summaryResult = await getInspectionSummary({
        startDate: selectedDate,
        endDate: selectedDate,
        contract: filterContract || undefined
      });

      if (summaryResult.success && summaryResult.data) {
        setSummary(summaryResult.data);
      }

      // Cargar cruce con ignición
      const crossCheckResult = await crossInspectionsWithIgnition(selectedDate);
      if (crossCheckResult.success && crossCheckResult.data) {
        let filteredCross = crossCheckResult.data;

        // Filtrar por contrato
        if (filterContract) {
          filteredCross = filteredCross.filter(c => c.contract === filterContract);
        }

        setCrossCheck(filteredCross);
      }

    } catch (error: any) {
      console.error('[Inspections] Error loading:', error);
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
    link.download = `inspecciones_${selectedDate}_${filterContract || 'todas'}.csv`;
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ClipboardCheck className="w-8 h-8 text-blue-600" />
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Inspecciones Preoperacionales</h2>
            <p className="text-sm text-gray-600">
              Seguimiento y control de inspecciones diarias
            </p>
          </div>
        </div>

        <button
          onClick={handleUpdateInspections}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Actualizando...' : 'Actualizar Inspecciones'}
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Fecha:
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Contrato:
            </label>
            <select
              value={filterContract}
              onChange={(e) => setFilterContract(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
              Exportar CSV
            </button>
          </div>
        </div>

        {lastUpdate && (
          <p className="text-sm text-gray-500 mt-4">
            Última actualización: {lastUpdate}
          </p>
        )}
      </div>

      {/* Resumen */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Resumen del Día</h3>

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
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
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
            <p>No hay inspecciones para la fecha y filtros seleccionados</p>
            <p className="text-sm mt-2">Haz clic en "Actualizar Inspecciones" para descargar datos</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
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
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Cruce con Eventos de Ignición
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            Vehículos que encendieron motor y su estado de inspección
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
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
