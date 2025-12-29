import React, { useState, useEffect } from 'react';
import { AlertTriangle, AlertCircle, Bell, BellRing, CheckCircle, Clock, MapPin, User, Gauge, FileDown, Search, Calendar, Database, Info, Save, Copy, MessageCircle } from 'lucide-react';
import { Alert } from '../types';
import {
  getAllAutoSavedAlerts,
  getFilteredAutoSavedAlerts,
  SavedAlert
} from '../services/databaseService';
import { usePagination } from '../hooks/usePagination';
import { PaginationControls } from './PaginationControls';
import { useExportToExcel } from '../hooks/useExportToExcel';

interface SavedAlertsPanelProps {
  onRefresh?: () => void;
  onSaveAlert?: (alert: Alert) => void;
  onCopyAlert?: (alert: Alert) => void;
}

export const SavedAlertsPanel: React.FC<SavedAlertsPanelProps> = ({ onRefresh, onSaveAlert, onCopyAlert }) => {
  const [alerts, setAlerts] = useState<SavedAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInfo, setShowInfo] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'pending' | 'in_progress' | 'resolved'>('ALL');
  const [severityFilter, setSeverityFilter] = useState<'ALL' | 'critical' | 'high' | 'medium' | 'low'>('ALL');
  const [searchText, setSearchText] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const { exportToExcel } = useExportToExcel();

  // Filtrado adicional del lado del cliente (búsqueda y fechas)
  const filteredAndSearchedAlerts = alerts.filter(alert => {
    // 🔍 BÚSQUEDA DE TEXTO - Mejorada con manejo de null/undefined
    if (searchText && searchText.trim()) {
      const search = searchText.toLowerCase().trim();
      const matchesSearch =
        (alert.plate || '').toLowerCase().includes(search) ||
        (alert.driver || '').toLowerCase().includes(search) ||
        (alert.type || '').toLowerCase().includes(search) ||
        (alert.details || '').toLowerCase().includes(search) ||
        (alert.contract || '').toLowerCase().includes(search) ||
        (alert.location || '').toLowerCase().includes(search);

      if (!matchesSearch) return false;
    }

    // 📅 FILTRO DE FECHA INICIAL - Mejorado con comparación correcta
    if (startDate) {
      try {
        const alertDate = new Date(alert.timestamp);
        const filterStart = new Date(startDate);
        filterStart.setHours(0, 0, 0, 0); // Inicio del día

        // Comparar solo fechas (sin hora)
        const alertDateOnly = new Date(alertDate.getFullYear(), alertDate.getMonth(), alertDate.getDate());
        const filterStartOnly = new Date(filterStart.getFullYear(), filterStart.getMonth(), filterStart.getDate());

        if (alertDateOnly < filterStartOnly) return false;
      } catch (error) {
        console.error('Error comparando fecha inicial:', error);
      }
    }

    // 📅 FILTRO DE FECHA FINAL - Mejorado con comparación correcta
    if (endDate) {
      try {
        const alertDate = new Date(alert.timestamp);
        const filterEnd = new Date(endDate);
        filterEnd.setHours(23, 59, 59, 999); // Fin del día

        // Comparar solo fechas (sin hora)
        const alertDateOnly = new Date(alertDate.getFullYear(), alertDate.getMonth(), alertDate.getDate());
        const filterEndOnly = new Date(filterEnd.getFullYear(), filterEnd.getMonth(), filterEnd.getDate());

        if (alertDateOnly > filterEndOnly) return false;
      } catch (error) {
        console.error('Error comparando fecha final:', error);
      }
    }

    return true;
  });

  // Hook de paginación
  const pagination = usePagination(filteredAndSearchedAlerts, {
    initialPageSize: 20,
    pageSizeOptions: [10, 20, 50, 100]
  });

  // Función para exportar a Excel
  const handleExport = () => {
    exportToExcel(
      filteredAndSearchedAlerts,
      [
        { header: 'Tipo', key: 'type', width: 20 },
        { header: 'Placa', key: 'plate', width: 12 },
        { header: 'Contrato', key: 'contract', width: 15 },
        { header: 'Estado', key: 'status', width: 12 },
        { header: 'Severidad', key: 'severity', width: 12 },
        { header: 'Detalles', key: 'details', width: 40 },
        { header: 'Conductor', key: 'driver', width: 25 },
        { header: 'Velocidad', key: 'speed', width: 12 },
        { header: 'Ubicación', key: 'location', width: 40 },
        { header: 'Fecha Evento', key: 'timestamp', width: 20 },
        { header: 'Guardada Por', key: 'saved_by', width: 20 },
        { header: 'Fecha Guardado', key: 'saved_at', width: 20 },
      ],
      `Alertas_Automaticas_${new Date().toLocaleDateString('es-CO').replace(/\//g, '-')}`
    );
  };

  useEffect(() => {
    loadAlerts();
  }, [statusFilter, severityFilter]);

  const loadAlerts = async () => {
    setLoading(true);
    const filters: any = {};

    if (statusFilter !== 'ALL') filters.status = statusFilter;
    if (severityFilter !== 'ALL') filters.severity = severityFilter;

    const result = statusFilter === 'ALL' && severityFilter === 'ALL'
      ? await getAllAutoSavedAlerts()
      : await getFilteredAutoSavedAlerts(filters);

    if (result.success && result.data) {
      setAlerts(result.data);
    } else {
      console.error('Error loading auto-saved alerts:', result.error);
    }
    setLoading(false);
  };

  const handleSaveWrapper = (savedAlert: SavedAlert) => {
    if (!onSaveAlert) return;

    // Convert SavedAlert to Alert for compatibility
    const alert: Alert = {
      id: savedAlert.alert_id, // Use the original Alert ID
      vehicleId: savedAlert.vehicle_id,
      plate: savedAlert.plate,
      driver: savedAlert.driver,
      type: savedAlert.type as any,
      severity: savedAlert.severity as any,
      timestamp: savedAlert.timestamp,
      location: savedAlert.location,
      latitude: 0,
      longitude: 0,
      speed: savedAlert.speed,
      details: savedAlert.details,
      contract: savedAlert.contract,
      source: savedAlert.source as any,
      sent: false // Defaults
    };

    onSaveAlert(alert);
  };

  const handleCopyWrapper = (savedAlert: SavedAlert) => {
    if (!onCopyAlert) return;

    const alert: Alert = {
      id: savedAlert.alert_id,
      vehicleId: savedAlert.vehicle_id,
      plate: savedAlert.plate,
      driver: savedAlert.driver,
      type: savedAlert.type as any,
      severity: savedAlert.severity as any,
      timestamp: savedAlert.timestamp,
      location: savedAlert.location,
      latitude: 0,
      longitude: 0,
      speed: savedAlert.speed,
      details: savedAlert.details,
      contract: savedAlert.contract,
      source: savedAlert.source as any,
      sent: false
    };

    onCopyAlert(alert);
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-300';
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'low': return 'bg-blue-100 text-blue-800 border-blue-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return <AlertCircle className="w-5 h-5 text-red-600" />;
      case 'high': return <AlertTriangle className="w-5 h-5 text-orange-600" />;
      case 'medium': return <Bell className="w-5 h-5 text-yellow-600" />;
      case 'low': return <BellRing className="w-5 h-5 text-blue-600" />;
      default: return <Bell className="w-5 h-5 text-gray-600" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      pending: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      in_progress: 'bg-blue-100 text-blue-800 border-blue-300',
      resolved: 'bg-green-100 text-green-800 border-green-300'
    };
    const labels = {
      pending: 'Pendiente',
      in_progress: 'En Proceso',
      resolved: 'Resuelta'
    };
    return (
      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${styles[status as keyof typeof styles]}`}>
        {labels[status as keyof typeof labels]}
      </span>
    );
  };

  return (
    <div className="space-y-3">
      {/* Info Banner - Compacto */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <div className="flex items-start gap-3">
          <Database className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-blue-900 text-sm">📦 Alertas Guardadas Automáticamente (saved_alerts)</h3>
              <button
                onClick={() => setShowInfo(!showInfo)}
                className="text-blue-600 hover:text-blue-800 text-xs font-medium flex items-center gap-1"
              >
                <Info className="w-4 h-4" />
                {showInfo ? 'Ocultar' : 'Ver más'}
              </button>
            </div>
            <p className="text-sm text-blue-800 mt-1">
              Esta tabla muestra TODAS las alertas detectadas automáticamente cada 5 minutos.
            </p>
            {showInfo && (
              <div className="mt-3 text-xs text-blue-700 space-y-2 bg-blue-100/50 p-3 rounded-lg">
                <p><strong>✅ Guardado:</strong> Automático - Se guardan todas las alertas detectadas</p>
                <p><strong>🕐 Retención:</strong> 7-30 días según estado (pendiente/resuelta)</p>
                <p><strong>🗑️ Limpieza:</strong> Automática cada 7 días</p>
                <p><strong>🎯 Uso:</strong> Análisis, reportes, cumplimiento PESV</p>
                <p className="pt-2 border-t border-blue-200">
                  <strong>💡 Nota:</strong> Si una alerta requiere seguimiento, pulsa el botón <Save className="w-3 h-3 inline mx-1" /> <strong>Guardar</strong>
                  para moverla al "Historial", donde podrás asignar planes de acción y realizar seguimiento detallado.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Filtros y Búsqueda - Optimizado */}
      <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
        <div className="flex flex-wrap gap-2 items-center">
          {/* Búsqueda */}
          <div className="flex items-center gap-2 flex-1 min-w-[200px] max-w-[400px]">
            <Search className="w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por placa, conductor, tipo..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="flex-1 px-2 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>

          {/* Estado */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-sky-500"
          >
            <option value="ALL">📋 Todos</option>
            <option value="pending">⏳ Pendientes</option>
            <option value="in_progress">🔄 En Proceso</option>
            <option value="resolved">✅ Resueltas</option>
          </select>

          {/* Severidad */}
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value as any)}
            className="px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-sky-500"
          >
            <option value="ALL">🔔 Todas</option>
            <option value="critical">🚨 Críticas</option>
            <option value="high">⚠️ Altas</option>
            <option value="medium">📢 Medias</option>
            <option value="low">ℹ️ Bajas</option>
          </select>

          {/* Fecha Inicio */}
          <div className="flex items-center gap-1">
            <span className="text-xs text-slate-600">Desde:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>

          {/* Fecha Fin */}
          <div className="flex items-center gap-1">
            <span className="text-xs text-slate-600">Hasta:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>

          {/* Botón Exportar */}
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 transition-colors text-xs font-medium"
            title="Exportar a Excel"
          >
            <FileDown className="w-3.5 h-3.5" />
            Excel
          </button>

          {/* Contador */}
          <div className="ml-auto text-xs font-bold text-slate-700 bg-slate-100 px-3 py-1.5 rounded">
            {filteredAndSearchedAlerts.length} alerta{filteredAndSearchedAlerts.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* Tabla de Alertas */}
      {loading ? (
        <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
          <p className="text-slate-600">Cargando alertas...</p>
        </div>
      ) : alerts.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
          <Database className="w-16 h-16 text-slate-400 mx-auto mb-4" />
          <p className="text-slate-600 font-medium">No hay alertas guardadas automáticamente</p>
          <p className="text-slate-400 text-sm mt-1">Las alertas se guardarán automáticamente cada 5 minutos</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 shadow-sm bg-white">
          <table className="w-full text-xs">
            <thead className="bg-gradient-to-r from-blue-700 to-blue-600 text-white sticky top-0">
              <tr>
                <th className="px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">Acciones</th>
                <th className="px-2 py-2 text-left text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">Tipo</th>
                <th className="px-2 py-2 text-left text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">Placa/Contrato</th>
                <th className="px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">Estado</th>
                <th className="px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">Severidad</th>
                <th className="px-2 py-2 text-left text-[10px] font-bold uppercase tracking-wider">Detalles</th>
                <th className="px-2 py-2 text-left text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">Conductor</th>
                <th className="px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">Vel.</th>
                <th className="px-2 py-2 text-left text-[10px] font-bold uppercase tracking-wider">Ubicación</th>
                <th className="px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">Fecha</th>
                <th className="px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">Guardado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pagination.paginatedData.map((alert, index) => (
                <tr
                  key={alert.id}
                  className={`${index % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-blue-50 transition-colors`}
                >
                  {/* Acciones */}
                  <td className="px-2 py-1.5 text-center whitespace-nowrap bg-gray-50/50">
                    <div className="flex items-center justify-center gap-1">
                      {onSaveAlert && (
                        <button
                          onClick={() => handleSaveWrapper(alert)}
                          className="p-1.5 rounded text-white bg-green-600 hover:bg-green-700 transition-colors shadow-sm"
                          title="Mover a Historial (Seguimiento)"
                        >
                          <Save className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {onCopyAlert && (
                        <button
                          onClick={() => handleCopyWrapper(alert)}
                          className="p-1.5 rounded text-white bg-sky-500 hover:bg-sky-600 transition-colors shadow-sm"
                          title="Reportar por WhatsApp"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>

                  {/* Tipo */}
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1.5">
                      {getSeverityIcon(alert.severity)}
                      <span className="font-semibold text-slate-900 text-[11px]">{alert.type}</span>
                    </div>
                  </td>

                  {/* Placa/Contrato */}
                  <td className="px-2 py-1.5">
                    <div className="font-bold text-slate-900 text-[11px]">{alert.plate}</div>
                    {alert.contract && alert.contract !== 'No asignado' && (
                      <div className="text-[10px] text-sky-600 font-medium">{alert.contract}</div>
                    )}
                  </td>

                  {/* Estado */}
                  <td className="px-2 py-1.5 text-center whitespace-nowrap">
                    {getStatusBadge(alert.status)}
                  </td>

                  {/* Severidad */}
                  <td className="px-2 py-1.5 text-center whitespace-nowrap">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${getSeverityColor(alert.severity)}`}>
                      {alert.severity}
                    </span>
                  </td>

                  {/* Detalles */}
                  <td className="px-2 py-1.5 max-w-[200px]">
                    <span className="text-[11px] text-slate-700 line-clamp-2">{alert.details}</span>
                  </td>

                  {/* Conductor */}
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1 text-[11px] text-slate-700">
                      <User className="w-3 h-3" />
                      <span className="truncate max-w-[120px]">{alert.driver}</span>
                    </div>
                  </td>

                  {/* Velocidad */}
                  <td className="px-2 py-1.5 text-center whitespace-nowrap">
                    <div className="flex items-center justify-center gap-0.5">
                      <Gauge className="w-3 h-3 text-slate-600" />
                      <span className="font-semibold text-slate-900 text-[11px]">{alert.speed}</span>
                    </div>
                  </td>

                  {/* Ubicación */}
                  <td className="px-2 py-1.5 max-w-[180px]">
                    <div className="flex items-center gap-1 text-[11px] text-slate-700">
                      <MapPin className="w-3 h-3 flex-shrink-0 text-blue-600" />
                      <span className="truncate">{alert.location}</span>
                    </div>
                  </td>

                  {/* Fecha Evento */}
                  <td className="px-2 py-1.5 text-center whitespace-nowrap">
                    <div className="text-[11px] text-slate-700">
                      {new Date(alert.timestamp).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {new Date(alert.timestamp).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </td>

                  {/* Guardado */}
                  <td className="px-2 py-1.5 text-center whitespace-nowrap">
                    <div className="text-[10px] text-slate-600 font-medium">{alert.saved_by}</div>
                    <div className="text-[10px] text-slate-500">
                      {new Date(alert.saved_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Controles de paginación */}
          <PaginationControls
            currentPage={pagination.currentPage}
            totalPages={pagination.totalPages}
            pageSize={pagination.pageSize}
            pageSizeOptions={pagination.pageSizeOptions}
            recordInfo={pagination.recordInfo}
            visiblePages={pagination.visiblePages}
            canGoNext={pagination.canGoNext}
            canGoPrevious={pagination.canGoPrevious}
            onPageChange={pagination.goToPage}
            onPageSizeChange={pagination.changePageSize}
            onFirstPage={pagination.goToFirstPage}
            onLastPage={pagination.goToLastPage}
            onNextPage={pagination.goToNextPage}
            onPreviousPage={pagination.goToPreviousPage}
          />
        </div>
      )}
    </div>
  );
};
