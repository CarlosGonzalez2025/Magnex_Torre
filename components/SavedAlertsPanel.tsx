import React, { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, AlertCircle, Bell, BellRing, CheckCircle, Clock, MapPin, User, Gauge, FileDown, Search, Calendar, Database, Info, Save, Copy, MessageCircle, FolderCheck, Trash2, CheckSquare, Square } from 'lucide-react';
import { Alert } from '../types';
import {
  getFilteredAutoSavedAlerts,
  SavedAlert,
  markAlertAsMovedToHistory,
  deleteMultipleAutoSavedAlerts,
  deleteAutoSavedAlertsByPeriod,
  markMultipleAlertsAsMovedToHistory
} from '../services/databaseService';
import { usePagination } from '../hooks/usePagination';
import { PaginationControls } from './PaginationControls';
import { useExportToExcel } from '../hooks/useExportToExcel';
import { useAuth } from '../contexts/AuthContext';

interface SavedAlertsPanelProps {
  onRefresh?: () => void;
  onSaveAlert?: (alert: Alert) => void | Promise<boolean>;
  onCopyAlert?: (alert: Alert) => void;
}

// Tope de filas que la vista descarga (evita statement timeout en tablas grandes).
// El borrado por periodo NO depende de este tope: opera server-side sobre todo el rango.
const MAX_PANEL_RECORDS = 3000;

export const SavedAlertsPanel: React.FC<SavedAlertsPanelProps> = ({ onRefresh, onSaveAlert, onCopyAlert }) => {
  const [alerts, setAlerts] = useState<SavedAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInfo, setShowInfo] = useState(false);
  const { user } = useAuth();

  // Selection state
  const [selectedAlertIds, setSelectedAlertIds] = useState<Set<string>>(new Set());

  // Estado de borrado por periodo
  const [deletingPeriod, setDeletingPeriod] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'pending' | 'in_progress' | 'resolved'>('ALL');
  const [severityFilter, setSeverityFilter] = useState<'ALL' | 'critical' | 'high' | 'medium' | 'low'>('ALL');
  const [sourceFilter, setSourceFilter] = useState<'ALL' | string>('ALL');
  const [movedFilter, setMovedFilter] = useState<'ALL' | 'MOVED' | 'NOT_MOVED'>('NOT_MOVED'); // Default: hide moved alerts
  const [searchText, setSearchText] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const { exportToExcel } = useExportToExcel();

  // Filtrado adicional del lado del cliente (búsqueda y fechas)
  const filteredAndSearchedAlerts = alerts.filter(alert => {
    // 🔄 FILTRO DE ALERTAS MOVIDAS AL HISTORIAL
    if (movedFilter === 'MOVED' && !alert.moved_to_history) return false;
    if (movedFilter === 'NOT_MOVED' && alert.moved_to_history) return false;

    // 🛰️ FILTRO POR FUENTE / PLATAFORMA
    if (sourceFilter !== 'ALL' && alert.source !== sourceFilter) return false;

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

  // Fuentes / plataformas disponibles en las alertas cargadas
  const availableSources = Array.from(new Set(alerts.map(a => a.source))).filter(Boolean);

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
        { header: 'Plataforma GPS', key: 'source', width: 15 },
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

  const loadAlerts = useCallback(async () => {
    setLoading(true);

    // Filtros aplicados en el servidor para acotar la descarga y evitar timeouts.
    const filters: {
      status?: 'pending' | 'in_progress' | 'resolved';
      severity?: string;
      startDate?: string;
      endDate?: string;
    } = {};

    if (statusFilter !== 'ALL') filters.status = statusFilter;
    if (severityFilter !== 'ALL') filters.severity = severityFilter;
    // Empujar el rango de fechas al servidor (día completo en el límite superior).
    if (startDate) filters.startDate = new Date(`${startDate}T00:00:00.000`).toISOString();
    if (endDate) filters.endDate = new Date(`${endDate}T23:59:59.999`).toISOString();

    // Tope de seguridad: nunca traer más de MAX_PANEL_RECORDS filas a la vista.
    const result = await getFilteredAutoSavedAlerts(filters, MAX_PANEL_RECORDS);

    if (result.success && result.data) {
      setAlerts(result.data);
      if (result.data.length >= MAX_PANEL_RECORDS) {
        console.warn(`⚠️ Vista limitada a ${MAX_PANEL_RECORDS} alertas más recientes. Usa filtros de fecha para acotar; el borrado por periodo sí abarca todo el rango.`);
      }
      console.log(`✅ ${result.data.length} alertas cargadas desde servidor`);
    } else {
      console.error('Error loading auto-saved alerts:', result.error);
    }

    setLoading(false);
  }, [statusFilter, severityFilter, startDate, endDate]);

  useEffect(() => {
    // 🧹 Limpiar caché antiguo si existe (evitar errors de quota)
    try {
      localStorage.removeItem('saved_alerts_cache');
      localStorage.removeItem('saved_alerts_cache_timestamp');
    } catch (error) {
      console.error('Error limpiando caché:', error);
    }

    // 🌐 Cargar alertas desde servidor
    loadAlerts();
  }, [loadAlerts]);

  const handleSaveWrapper = async (savedAlert: SavedAlert) => {
    if (!onSaveAlert || !user) return;

    // 🚀 ACTUALIZACIÓN OPTIMISTA: Actualizar UI inmediatamente
    setAlerts(prevAlerts =>
      prevAlerts.map(alert =>
        alert.id === savedAlert.id
          ? {
              ...alert,
              moved_to_history: true,
              moved_at: new Date().toISOString(),
              moved_by: user.email
            }
          : alert
      )
    );

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
      sent: false, // Defaults
      screenshot_url: savedAlert.screenshot_url,
      validation_reason: savedAlert.validation_reason,
      is_valid: savedAlert.is_real_alert
    };

    const saveResult = await onSaveAlert(alert);
    if (saveResult === false) {
      setAlerts(prevAlerts =>
        prevAlerts.map(alert =>
          alert.id === savedAlert.id
            ? {
                ...alert,
                moved_to_history: false,
                moved_at: undefined,
                moved_by: undefined
              }
            : alert
        )
      );
      return;
    }

    // 🔄 Actualizar BD en segundo plano (sin bloquear la UI)
    markAlertAsMovedToHistory(savedAlert.id, user.email).then(result => {
      if (!result.success) {
        console.error('Failed to mark alert as moved:', result.error);

        // ⚠️ ROLLBACK: Si falla, revertir el cambio visual
        setAlerts(prevAlerts =>
          prevAlerts.map(alert =>
            alert.id === savedAlert.id
              ? {
                  ...alert,
                  moved_to_history: false,
                  moved_at: undefined,
                  moved_by: undefined
                }
              : alert
          )
        );
      }
    });
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
      sent: false,
      screenshot_url: savedAlert.screenshot_url,
      validation_reason: savedAlert.validation_reason,
      is_valid: savedAlert.is_real_alert
    };

    onCopyAlert(alert);
  };

  // ==================== SELECTION HANDLERS ====================

  const toggleSelectAll = () => {
    const currentPageAlertIds = pagination.paginatedData
      .filter(alert => !alert.moved_to_history)
      .map(alert => alert.id);

    if (currentPageAlertIds.every(id => selectedAlertIds.has(id))) {
      // Deseleccionar todos de la página actual
      setSelectedAlertIds(prev => {
        const newSet = new Set(prev);
        currentPageAlertIds.forEach(id => newSet.delete(id));
        return newSet;
      });
    } else {
      // Seleccionar todos de la página actual
      setSelectedAlertIds(prev => {
        const newSet = new Set(prev);
        currentPageAlertIds.forEach(id => newSet.add(id));
        return newSet;
      });
    }
  };

  const toggleSelectAlert = (alertId: string) => {
    setSelectedAlertIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(alertId)) {
        newSet.delete(alertId);
      } else {
        newSet.add(alertId);
      }
      return newSet;
    });
  };

  const handleBulkSaveToHistory = async () => {
    if (selectedAlertIds.size === 0 || !onSaveAlert || !user) return;

    const confirmText = window.confirm(
      `¿Deseas guardar ${selectedAlertIds.size} alerta${selectedAlertIds.size > 1 ? 's' : ''} seleccionada${selectedAlertIds.size > 1 ? 's' : ''} al Historial?`
    );

    if (!confirmText) return;

    const selectedAlerts = alerts.filter(alert => selectedAlertIds.has(alert.id));

    // Actualización optimista
    setAlerts(prevAlerts =>
      prevAlerts.map(alert =>
        selectedAlertIds.has(alert.id)
          ? {
              ...alert,
              moved_to_history: true,
              moved_at: new Date().toISOString(),
              moved_by: user.email
            }
          : alert
      )
    );

    const successfullySavedIds: string[] = [];

    // Guardar cada alerta en el historial
    for (const savedAlert of selectedAlerts) {
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
        sent: false,
        screenshot_url: savedAlert.screenshot_url,
        validation_reason: savedAlert.validation_reason,
        is_valid: savedAlert.is_real_alert
      };
      const saveResult = await onSaveAlert(alert);
      if (saveResult !== false) {
        successfullySavedIds.push(savedAlert.id);
      }
    }

    if (successfullySavedIds.length === 0) {
      window.alert('No se pudo guardar ninguna alerta en el Historial.');
      loadAlerts();
      return;
    }

    // Marcar en la BD
    const result = await markMultipleAlertsAsMovedToHistory(successfullySavedIds, user.email);

    if (result.success) {
      window.alert(`✅ ${result.updatedCount} alerta${result.updatedCount! > 1 ? 's' : ''} guardada${result.updatedCount! > 1 ? 's' : ''} en el Historial`);
      setSelectedAlertIds(new Set());
    } else {
      window.alert('❌ Error: ' + result.error);
      // Revertir cambios optimistas
      loadAlerts();
    }
  };

  const handleBulkDelete = async () => {
    if (selectedAlertIds.size === 0) return;

    const confirmText = window.prompt(
      `⚠️ ADVERTENCIA: Esta acción eliminará ${selectedAlertIds.size} alerta${selectedAlertIds.size > 1 ? 's' : ''} seleccionada${selectedAlertIds.size > 1 ? 's' : ''}.\n\n` +
      'Esta acción NO se puede deshacer.\n\n' +
      'Para confirmar, escribe: ELIMINAR'
    );

    if (confirmText !== 'ELIMINAR') {
      if (confirmText !== null) {
        window.alert('Operación cancelada. El texto no coincide.');
      }
      return;
    }

    const result = await deleteMultipleAutoSavedAlerts(Array.from(selectedAlertIds));

    if (result.success) {
      if ((result.deletedCount || 0) === 0) {
        window.alert('⚠️ No se eliminó ninguna alerta. Es posible que no tengas permisos de borrado (RLS). Verifica con el administrador.');
      } else {
        window.alert(`✅ ${result.deletedCount} alerta${result.deletedCount! > 1 ? 's' : ''} eliminada${result.deletedCount! > 1 ? 's' : ''}`);
      }
      setSelectedAlertIds(new Set());
      loadAlerts();
    } else {
      window.alert('❌ Error: ' + result.error);
    }
  };

  // ==================== ELIMINACIÓN POR PERIODO ====================

  const handleDeletePeriod = async () => {
    if (!startDate || !endDate) {
      window.alert('⚠️ Debes seleccionar "Desde" y "Hasta" para eliminar un periodo completo.');
      return;
    }

    // Filtros del servidor que acotan el borrado (los mismos activos en la vista).
    const periodFilters: {
      status?: 'pending' | 'in_progress' | 'resolved';
      severity?: string;
      source?: string;
    } = {};
    if (statusFilter !== 'ALL') periodFilters.status = statusFilter;
    if (severityFilter !== 'ALL') periodFilters.severity = severityFilter;
    if (sourceFilter !== 'ALL') periodFilters.source = sourceFilter;

    // Estimación visible para el usuario (según lo cargado en pantalla).
    const estimate = filteredAndSearchedAlerts.length;

    const activeFiltersText = [
      statusFilter !== 'ALL' ? `Estado: ${statusFilter}` : null,
      severityFilter !== 'ALL' ? `Severidad: ${severityFilter}` : null,
      sourceFilter !== 'ALL' ? `Plataforma: ${sourceFilter}` : null,
    ].filter(Boolean).join(' · ') || 'Ninguno (todo el periodo)';

    const confirmText = window.prompt(
      `⚠️ ELIMINAR PERIODO COMPLETO\n\n` +
      `Se eliminarán TODAS las alertas autoguardadas entre:\n` +
      `  ${startDate}  →  ${endDate}\n\n` +
      `Filtros aplicados: ${activeFiltersText}\n` +
      `Aproximadamente ${estimate} alerta(s) visibles coinciden (el servidor borrará todas las del periodo, incluidas las movidas al Historial).\n\n` +
      `Esta acción NO se puede deshacer.\n\n` +
      `Para confirmar, escribe: ELIMINAR PERIODO`
    );

    if (confirmText !== 'ELIMINAR PERIODO') {
      if (confirmText !== null) {
        window.alert('Operación cancelada. El texto no coincide.');
      }
      return;
    }

    setDeletingPeriod(true);
    const result = await deleteAutoSavedAlertsByPeriod(startDate, endDate, periodFilters);
    setDeletingPeriod(false);

    if (result.success) {
      if ((result.deletedCount || 0) === 0) {
        window.alert('⚠️ No se eliminó ninguna alerta en ese periodo. Puede que no existan registros o que no tengas permisos de borrado (RLS).');
      } else {
        window.alert(`✅ ${result.deletedCount} alerta${result.deletedCount! > 1 ? 's' : ''} del periodo eliminada${result.deletedCount! > 1 ? 's' : ''}`);
      }
      setSelectedAlertIds(new Set());
      loadAlerts();
    } else {
      window.alert('❌ Error: ' + result.error);
    }
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

  const getPlatformBadge = (source: string) => {
    const styles = source === 'COLTRACK'
      ? 'bg-purple-100 text-purple-800 border border-purple-300'
      : source === 'GEOTAB'
        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
        : 'bg-teal-100 text-teal-800 border border-teal-300';
    return (
      <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold ${styles}`}>
        {source}
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

          {/* Filtro Fuente / Plataforma */}
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-sky-500"
          >
            <option value="ALL">🛰️ Todas las plataformas</option>
            {availableSources.map(source => (
              <option key={source} value={source}>{source}</option>
            ))}
          </select>

          {/* Filtro Movidas a Historial */}
          <select
            value={movedFilter}
            onChange={(e) => setMovedFilter(e.target.value as any)}
            className="px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-sky-500"
          >
            <option value="NOT_MOVED">🆕 Sin mover</option>
            <option value="ALL">📂 Todas</option>
            <option value="MOVED">✅ En Historial</option>
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

          {/* Botón Eliminar Periodo (solo con rango de fechas definido) */}
          {startDate && endDate && (
            <button
              onClick={handleDeletePeriod}
              disabled={deletingPeriod}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-700 text-white rounded hover:bg-red-800 transition-colors text-xs font-medium disabled:bg-slate-300 disabled:cursor-not-allowed"
              title="Eliminar TODAS las alertas del periodo seleccionado (Desde → Hasta)"
            >
              {deletingPeriod ? (
                <>
                  <Clock className="w-3.5 h-3.5 animate-spin" />
                  Eliminando...
                </>
              ) : (
                <>
                  <Calendar className="w-3.5 h-3.5" />
                  <Trash2 className="w-3.5 h-3.5" />
                  Eliminar periodo
                </>
              )}
            </button>
          )}

          {/* Botones de Acción Masiva */}
          {selectedAlertIds.size > 0 && (
            <>
              <button
                onClick={handleBulkSaveToHistory}
                disabled={!onSaveAlert}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-xs font-medium disabled:bg-slate-300 disabled:cursor-not-allowed"
                title={`Guardar ${selectedAlertIds.size} alertas al Historial`}
              >
                <Save className="w-3.5 h-3.5" />
                Guardar ({selectedAlertIds.size})
              </button>
              <button
                onClick={handleBulkDelete}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 transition-colors text-xs font-medium"
                title={`Eliminar ${selectedAlertIds.size} alertas`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Eliminar ({selectedAlertIds.size})
              </button>
            </>
          )}

          {/* Contador */}
          <div className="ml-auto text-xs font-bold text-slate-700 bg-slate-100 px-3 py-1.5 rounded">
            {filteredAndSearchedAlerts.length} alerta{filteredAndSearchedAlerts.length !== 1 ? 's' : ''}
            {selectedAlertIds.size > 0 && (
              <span className="ml-2 text-blue-600">
                ({selectedAlertIds.size} seleccionada{selectedAlertIds.size !== 1 ? 's' : ''})
              </span>
            )}
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
                <th className="px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">
                  <button
                    onClick={toggleSelectAll}
                    className="p-1 rounded hover:bg-blue-800 transition-colors"
                    title="Seleccionar/Deseleccionar todos"
                  >
                    {pagination.paginatedData.filter(a => !a.moved_to_history).length > 0 &&
                     pagination.paginatedData.filter(a => !a.moved_to_history).every(a => selectedAlertIds.has(a.id)) ? (
                      <CheckSquare className="w-4 h-4" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                </th>
                <th className="px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">Acciones</th>
                <th className="px-2 py-2 text-left text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">Tipo</th>
                <th className="px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">GPS</th>
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
              {pagination.paginatedData.map((alert, index) => {
                const isMovedToHistory = alert.moved_to_history;
                return (
                <tr
                  key={alert.id}
                  className={`${index % 2 === 0 ? 'bg-white' : 'bg-slate-50'} ${isMovedToHistory ? 'opacity-60 bg-green-50/30' : ''} ${selectedAlertIds.has(alert.id) ? 'bg-blue-100' : ''} hover:bg-blue-50 transition-colors`}
                >
                  {/* Checkbox */}
                  <td className="px-2 py-1.5 text-center whitespace-nowrap">
                    {!isMovedToHistory && (
                      <button
                        onClick={() => toggleSelectAlert(alert.id)}
                        className="p-1 rounded hover:bg-slate-200 transition-colors"
                      >
                        {selectedAlertIds.has(alert.id) ? (
                          <CheckSquare className="w-4 h-4 text-blue-600" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-400" />
                        )}
                      </button>
                    )}
                  </td>

                  {/* Acciones */}
                  <td className="px-2 py-1.5 text-center whitespace-nowrap bg-gray-50/50">
                    <div className="flex items-center justify-center gap-1">
                      {onSaveAlert && (
                        isMovedToHistory ? (
                          <div className="px-2 py-1 bg-green-100 text-green-800 rounded border border-green-300 flex items-center gap-1">
                            <FolderCheck className="w-3 h-3" />
                            <span className="text-[9px] font-bold">En Historial</span>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleSaveWrapper(alert)}
                            className="p-1.5 rounded text-white bg-green-600 hover:bg-green-700 transition-colors shadow-sm"
                            title="Mover a Historial (Seguimiento)"
                          >
                            <Save className="w-3.5 h-3.5" />
                          </button>
                        )
                      )}
                      {onCopyAlert && !isMovedToHistory && (
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

                  {/* Plataforma GPS */}
                  <td className="px-2 py-1.5 text-center whitespace-nowrap">
                    {getPlatformBadge(alert.source)}
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
                );
              })}
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
