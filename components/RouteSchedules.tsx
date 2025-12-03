import React from 'react';
import { Map, Upload, Download, Calendar, Clock, TrendingUp, AlertCircle } from 'lucide-react';
import {
  saveRouteSchedule,
  importRouteSchedulesFromCSV,
  getRouteSchedules,
  type RouteSchedule
} from '../services/towerControlService';

export const RouteSchedules: React.FC = () => {
  const [schedules, setSchedules] = React.useState<RouteSchedule[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [filterDate, setFilterDate] = React.useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [filterContract, setFilterContract] = React.useState<string>('');
  const [filterPlate, setFilterPlate] = React.useState<string>('');

  // Cargar cronogramas al montar
  React.useEffect(() => {
    loadSchedules();
  }, [filterDate, filterContract, filterPlate]);

  /**
   * Cargar cronogramas desde la base de datos
   */
  const loadSchedules = async () => {
    setLoading(true);
    try {
      const result = await getRouteSchedules({
        date: filterDate || undefined,
        contract: filterContract || undefined,
        plate: filterPlate || undefined
      });

      if (result.success && result.data) {
        setSchedules(result.data);
      }
    } catch (error: any) {
      console.error('[RouteSchedules] Error loading:', error);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Descargar plantilla CSV
   */
  const handleDownloadTemplate = () => {
    const headers = [
      'Placa',
      'Contrato',
      'Conductor',
      'Nombre Ruta',
      'Fecha',
      'Hora Inicio',
      'Hora Fin',
      'Origen',
      'Destino',
      'Distancia KM',
      'Notas'
    ];

    const exampleRow = [
      'LHR713',
      'CAMPO TECA',
      'Juan Perez',
      'Ruta Norte',
      '2025-12-04',
      '06:00',
      '18:00',
      'Bogotá',
      'Medellín',
      '415',
      'Ruta regular'
    ];

    const csv = [
      headers.join(','),
      exampleRow.map(cell => `"${cell}"`).join(',')
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'plantilla_cronogramas.csv';
    link.click();

    alert('✅ Plantilla descargada\n\nEdita el archivo CSV y luego cárgalo usando el botón "Cargar CSV"');
  };

  /**
   * Cargar CSV
   */
  const handleUploadCSV = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());

      if (lines.length < 2) {
        throw new Error('El archivo CSV está vacío o no tiene datos');
      }

      // Parsear CSV
      const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
      const schedules: RouteSchedule[] = [];

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.replace(/"/g, '').trim());

        if (values.length < 5) continue; // Skip incomplete rows

        const schedule: RouteSchedule = {
          plate: values[0],
          contract: values[1],
          driver: values[2],
          route_name: values[3],
          scheduled_date: values[4],
          scheduled_start_time: values[5] + ':00', // Asegurar formato HH:MM:SS
          scheduled_end_time: values[6] ? values[6] + ':00' : undefined,
          departure_location: values[7],
          arrival_location: values[8],
          estimated_distance: values[9] ? parseFloat(values[9]) : undefined,
          notes: values[10],
          status: 'scheduled',
          created_by: 'CSV Import'
        };

        schedules.push(schedule);
      }

      console.log(`[RouteSchedules] Parsed ${schedules.length} schedules from CSV`);

      // Importar a la base de datos
      const result = await importRouteSchedulesFromCSV(schedules);

      if (result.success) {
        alert(`✅ Cronogramas importados correctamente\n\nImportados: ${result.imported}`);
        await loadSchedules();
      } else {
        alert(`⚠️ Importación parcial\n\nImportados: ${result.imported}\nErrores: ${result.errors.length}\n\n${result.errors.slice(0, 5).join('\n')}`);
      }

      // Reset file input
      event.target.value = '';
    } catch (error: any) {
      console.error('[RouteSchedules] Error uploading CSV:', error);
      alert('❌ Error al cargar CSV: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Exportar cronogramas actuales a CSV
   */
  const handleExportCSV = () => {
    const headers = [
      'Placa',
      'Contrato',
      'Conductor',
      'Nombre Ruta',
      'Fecha',
      'Hora Inicio Programada',
      'Hora Fin Programada',
      'Hora Inicio Real',
      'Hora Fin Real',
      'Origen',
      'Destino',
      'Distancia KM',
      'Estado',
      'Notas'
    ];

    const rows = schedules.map(s => [
      s.plate,
      s.contract || '',
      s.driver || '',
      s.route_name,
      s.scheduled_date,
      s.scheduled_start_time,
      s.scheduled_end_time || '',
      s.actual_start_time || '',
      s.actual_end_time || '',
      s.departure_location || '',
      s.arrival_location || '',
      s.estimated_distance || '',
      s.status || 'scheduled',
      s.notes || ''
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `cronogramas_${filterDate || 'all'}.csv`;
    link.click();
  };

  /**
   * Calcular diferencia de tiempo (minutos)
   */
  const calculateTimeDifference = (scheduled: string, actual?: string): number | null => {
    if (!actual) return null;

    try {
      const scheduledTime = new Date(`2000-01-01T${scheduled}`).getTime();
      const actualTime = new Date(actual).getTime();
      return Math.round((actualTime - scheduledTime) / (1000 * 60));
    } catch (error) {
      return null;
    }
  };

  /**
   * Determinar color según puntualidad
   */
  const getTimeDifferenceColor = (diffMinutes: number | null): string => {
    if (diffMinutes === null) return 'text-gray-400';
    if (Math.abs(diffMinutes) <= 15) return 'text-green-600'; // A tiempo (±15 min)
    if (Math.abs(diffMinutes) <= 30) return 'text-yellow-600'; // Tolerancia (±30 min)
    return 'text-red-600'; // Fuera de tiempo
  };

  /**
   * Obtener icono de puntualidad
   */
  const getTimeDifferenceIcon = (diffMinutes: number | null): string => {
    if (diffMinutes === null) return '⚪';
    if (Math.abs(diffMinutes) <= 15) return '🟢';
    if (Math.abs(diffMinutes) <= 30) return '🟡';
    return '🔴';
  };

  /**
   * Obtener lista única de contratos
   */
  const contracts = React.useMemo(() => {
    const contractSet = new Set(schedules.map(s => s.contract).filter(Boolean));
    return Array.from(contractSet).sort();
  }, [schedules]);

  /**
   * Calcular estadísticas
   */
  const stats = React.useMemo(() => {
    const total = schedules.length;
    const completed = schedules.filter(s => s.status === 'completed').length;
    const inProgress = schedules.filter(s => s.status === 'in_progress').length;
    const scheduled = schedules.filter(s => s.status === 'scheduled').length;
    const cancelled = schedules.filter(s => s.status === 'cancelled').length;

    // Puntualidad
    const withActualTime = schedules.filter(s => s.actual_start_time);
    const onTime = withActualTime.filter(s => {
      const diff = calculateTimeDifference(s.scheduled_start_time, s.actual_start_time);
      return diff !== null && Math.abs(diff) <= 15;
    }).length;

    return {
      total,
      completed,
      inProgress,
      scheduled,
      cancelled,
      onTime,
      onTimePercentage: withActualTime.length > 0
        ? ((onTime / withActualTime.length) * 100).toFixed(1)
        : '0'
    };
  }, [schedules]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Map className="w-8 h-8 text-purple-600" />
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Cronogramas de Rutas</h2>
            <p className="text-sm text-gray-600">
              Gestión y seguimiento de rutas planificadas
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleDownloadTemplate}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
          >
            <Download className="w-5 h-5" />
            Descargar Plantilla
          </button>

          <label className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors cursor-pointer">
            <Upload className="w-5 h-5" />
            Cargar CSV
            <input
              type="file"
              accept=".csv"
              onChange={handleUploadCSV}
              className="hidden"
              disabled={loading}
            />
          </label>
        </div>
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Rutas</p>
              <p className="text-3xl font-bold text-gray-900">{stats.total}</p>
            </div>
            <Calendar className="w-10 h-10 text-purple-600 opacity-50" />
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Completadas</p>
              <p className="text-3xl font-bold text-green-600">{stats.completed}</p>
            </div>
            <TrendingUp className="w-10 h-10 text-green-600 opacity-50" />
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">En Progreso</p>
              <p className="text-3xl font-bold text-blue-600">{stats.inProgress}</p>
            </div>
            <Clock className="w-10 h-10 text-blue-600 opacity-50" />
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Puntualidad</p>
              <p className="text-3xl font-bold text-purple-600">{stats.onTimePercentage}%</p>
            </div>
            <AlertCircle className="w-10 h-10 text-purple-600 opacity-50" />
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Fecha:
            </label>
            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Contrato:
            </label>
            <select
              value={filterContract}
              onChange={(e) => setFilterContract(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            >
              <option value="">Todos</option>
              {contracts.map(contract => (
                <option key={contract} value={contract}>{contract}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Placa:
            </label>
            <input
              type="text"
              value={filterPlate}
              onChange={(e) => setFilterPlate(e.target.value.toUpperCase())}
              placeholder="Ej: ABC123"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            />
          </div>

          <div className="flex items-end">
            <button
              onClick={handleExportCSV}
              disabled={schedules.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors w-full justify-center"
            >
              <Download className="w-5 h-5" />
              Exportar
            </button>
          </div>
        </div>
      </div>

      {/* Tabla de Cronogramas */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Cronogramas ({schedules.length})
        </h3>

        {loading ? (
          <div className="text-center py-8 text-gray-500">
            Cargando cronogramas...
          </div>
        ) : schedules.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Map className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No hay cronogramas para los filtros seleccionados</p>
            <p className="text-sm mt-2">Descarga la plantilla y carga un archivo CSV</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left py-3 px-2 font-semibold text-gray-700">Estado</th>
                  <th className="text-left py-3 px-2 font-semibold text-gray-700">Fecha</th>
                  <th className="text-left py-3 px-2 font-semibold text-gray-700">Placa</th>
                  <th className="text-left py-3 px-2 font-semibold text-gray-700">Conductor</th>
                  <th className="text-left py-3 px-2 font-semibold text-gray-700">Ruta</th>
                  <th className="text-left py-3 px-2 font-semibold text-gray-700">Origen → Destino</th>
                  <th className="text-center py-3 px-2 font-semibold text-gray-700">Hora Prog.</th>
                  <th className="text-center py-3 px-2 font-semibold text-gray-700">Hora Real</th>
                  <th className="text-center py-3 px-2 font-semibold text-gray-700">Diferencia</th>
                  <th className="text-left py-3 px-2 font-semibold text-gray-700">Contrato</th>
                </tr>
              </thead>
              <tbody>
                {schedules.map((schedule, index) => {
                  const timeDiff = calculateTimeDifference(
                    schedule.scheduled_start_time,
                    schedule.actual_start_time
                  );

                  return (
                    <tr key={schedule.id || index} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2 px-2">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          schedule.status === 'completed'
                            ? 'bg-green-100 text-green-800'
                            : schedule.status === 'in_progress'
                            ? 'bg-blue-100 text-blue-800'
                            : schedule.status === 'cancelled'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {schedule.status}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-gray-700">{schedule.scheduled_date}</td>
                      <td className="py-2 px-2 font-semibold text-gray-900">{schedule.plate}</td>
                      <td className="py-2 px-2 text-gray-700">{schedule.driver || '-'}</td>
                      <td className="py-2 px-2 text-gray-700">{schedule.route_name}</td>
                      <td className="py-2 px-2 text-gray-700 text-xs">
                        {schedule.departure_location || '?'} → {schedule.arrival_location || '?'}
                      </td>
                      <td className="py-2 px-2 text-center text-gray-700">
                        {schedule.scheduled_start_time.substring(0, 5)}
                      </td>
                      <td className="py-2 px-2 text-center text-gray-700">
                        {schedule.actual_start_time
                          ? new Date(schedule.actual_start_time).toLocaleTimeString('es-CO', {
                              hour: '2-digit',
                              minute: '2-digit'
                            })
                          : '-'}
                      </td>
                      <td className={`py-2 px-2 text-center font-semibold ${getTimeDifferenceColor(timeDiff)}`}>
                        {getTimeDifferenceIcon(timeDiff)}{' '}
                        {timeDiff !== null
                          ? `${timeDiff > 0 ? '+' : ''}${timeDiff} min`
                          : '-'}
                      </td>
                      <td className="py-2 px-2 text-gray-700">{schedule.contract || '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Leyenda */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <h4 className="font-semibold text-gray-900 mb-3">Leyenda de Puntualidad:</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🟢</span>
            <span className="text-gray-700">A tiempo (±15 minutos)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">🟡</span>
            <span className="text-gray-700">Tolerancia (±30 minutos)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">🔴</span>
            <span className="text-gray-700">Fuera de tiempo (&gt;30 minutos)</span>
          </div>
        </div>
      </div>
    </div>
  );
};
