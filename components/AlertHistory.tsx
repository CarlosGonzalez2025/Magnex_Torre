import React, { useState, useEffect } from 'react';
import { AlertTriangle, AlertCircle, Bell, BellRing, CheckCircle, Clock, MapPin, User, Gauge, FileText, Plus, Trash2, Edit, X } from 'lucide-react';
import {
  getAllSavedAlerts,
  getFilteredAlerts,
  updateAlertStatus,
  deleteAlert,
  addActionPlan,
  updateActionPlan,
  deleteActionPlan,
  SavedAlertWithPlans,
  ActionPlan
} from '../services/databaseService';
import { usePagination } from '../hooks/usePagination';
import { PaginationControls } from './PaginationControls';

interface AlertHistoryProps {
  onRefresh?: () => void;
}

export const AlertHistory: React.FC<AlertHistoryProps> = ({ onRefresh }) => {
  const [alerts, setAlerts] = useState<SavedAlertWithPlans[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAlert, setSelectedAlert] = useState<SavedAlertWithPlans | null>(null);
  const [showActionModal, setShowActionModal] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'pending' | 'in_progress' | 'resolved'>('ALL');
  const [severityFilter, setSeverityFilter] = useState<'ALL' | 'critical' | 'high' | 'medium' | 'low'>('ALL');

  // Action Plan Form
  const [newActionPlan, setNewActionPlan] = useState({
    description: '',
    responsible: '',
    status: 'pending' as const,
    observations: ''
  });

  // Hook de paginación
  const pagination = usePagination(alerts, {
    initialPageSize: 20,
    pageSizeOptions: [10, 20, 50, 100]
  });

  useEffect(() => {
    loadAlerts();
  }, [statusFilter, severityFilter]);

  const loadAlerts = async () => {
    setLoading(true);
    const filters: any = {};

    if (statusFilter !== 'ALL') filters.status = statusFilter;
    if (severityFilter !== 'ALL') filters.severity = severityFilter;

    const result = statusFilter === 'ALL' && severityFilter === 'ALL'
      ? await getAllSavedAlerts()
      : await getFilteredAlerts(filters);

    if (result.success && result.data) {
      setAlerts(result.data);
    } else {
      console.error('Error loading alerts:', result.error);
    }
    setLoading(false);
  };

  const handleStatusChange = async (alertId: string, newStatus: 'pending' | 'in_progress' | 'resolved') => {
    const result = await updateAlertStatus(alertId, newStatus);
    if (result.success) {
      loadAlerts();
      onRefresh?.();
    } else {
      alert('Error al actualizar el estado: ' + result.error);
    }
  };

  const handleDeleteAlert = async (alertId: string) => {
    if (!confirm('¿Estás seguro de eliminar esta alerta del historial?')) return;

    const result = await deleteAlert(alertId);
    if (result.success) {
      loadAlerts();
      onRefresh?.();
    } else {
      alert('Error al eliminar la alerta: ' + result.error);
    }
  };

  const handleOpenActionModal = (alert: SavedAlertWithPlans) => {
    setSelectedAlert(alert);
    setShowActionModal(true);
    setNewActionPlan({
      description: '',
      responsible: '',
      status: 'pending',
      observations: ''
    });
  };

  const handleAddActionPlan = async () => {
    if (!selectedAlert || !newActionPlan.description || !newActionPlan.responsible) {
      alert('Por favor completa la descripción y el responsable');
      return;
    }

    const result = await addActionPlan(selectedAlert.id, newActionPlan);
    if (result.success) {
      setNewActionPlan({
        description: '',
        responsible: '',
        status: 'pending',
        observations: ''
      });
      loadAlerts();
      alert('✅ Plan de acción agregado correctamente');
    } else {
      alert('❌ Error al agregar plan de acción: ' + result.error);
    }
  };

  const handleUpdateActionPlanStatus = async (planId: string, newStatus: 'pending' | 'in_progress' | 'completed') => {
    const result = await updateActionPlan(planId, { status: newStatus });
    if (result.success) {
      loadAlerts();
    } else {
      alert('Error al actualizar el plan: ' + result.error);
    }
  };

  const handleDeleteActionPlan = async (planId: string) => {
    if (!confirm('¿Eliminar este plan de acción?')) return;

    const result = await deleteActionPlan(planId);
    if (result.success) {
      loadAlerts();
    } else {
      alert('Error al eliminar el plan: ' + result.error);
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
      <span className={`px-2 py-1 rounded-md text-xs font-semibold border ${styles[status as keyof typeof styles]}`}>
        {labels[status as keyof typeof labels]}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap gap-4 items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-2">
          <label className="text-sm font-semibold text-slate-600">Estado:</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            <option value="ALL">Todos</option>
            <option value="pending">Pendientes</option>
            <option value="in_progress">En Proceso</option>
            <option value="resolved">Resueltas</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm font-semibold text-slate-600">Severidad:</label>
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value as any)}
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            <option value="ALL">Todas</option>
            <option value="critical">Críticas</option>
            <option value="high">Altas</option>
            <option value="medium">Medias</option>
            <option value="low">Bajas</option>
          </select>
        </div>

        <div className="ml-auto text-sm font-semibold text-slate-600">
          {alerts.length} alerta{alerts.length !== 1 ? 's' : ''} guardada{alerts.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Tabla de Alertas */}
      {loading ? (
        <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
          <p className="text-slate-600">Cargando alertas...</p>
        </div>
      ) : alerts.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
          <CheckCircle className="w-16 h-16 text-slate-400 mx-auto mb-4" />
          <p className="text-slate-600 font-medium">No hay alertas guardadas</p>
          <p className="text-slate-400 text-sm mt-1">Las alertas guardadas aparecerán aquí</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gradient-to-r from-slate-700 to-slate-600 text-white">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider">Tipo</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider">Placa/Contrato</th>
                <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider">Estado</th>
                <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider">Severidad</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider">Detalles</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider">Conductor</th>
                <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider">Velocidad</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider">Ubicación</th>
                <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider">Fecha</th>
                <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider">Planes</th>
                <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pagination.paginatedData.map((alert, index) => (
                <tr
                  key={alert.id}
                  className={`${index % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-blue-50 transition-colors`}
                >
                  {/* Tipo */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {getSeverityIcon(alert.severity)}
                      <span className="font-semibold text-slate-900">{alert.type}</span>
                    </div>
                  </td>

                  {/* Placa/Contrato */}
                  <td className="px-4 py-3">
                    <div className="font-bold text-slate-900">{alert.plate}</div>
                    {alert.contract && alert.contract !== 'No asignado' && (
                      <div className="text-xs text-sky-600 font-medium">{alert.contract}</div>
                    )}
                  </td>

                  {/* Estado */}
                  <td className="px-4 py-3 text-center whitespace-nowrap">
                    <select
                      value={alert.status}
                      onChange={(e) => handleStatusChange(alert.id, e.target.value as any)}
                      className="px-2 py-1 text-xs font-medium border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                    >
                      <option value="pending">Pendiente</option>
                      <option value="in_progress">En Proceso</option>
                      <option value="resolved">Resuelta</option>
                    </select>
                  </td>

                  {/* Severidad */}
                  <td className="px-4 py-3 text-center whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${getSeverityColor(alert.severity)}`}>
                      {alert.severity}
                    </span>
                  </td>

                  {/* Detalles */}
                  <td className="px-4 py-3">
                    <span className="text-sm text-slate-700">{alert.details}</span>
                  </td>

                  {/* Conductor */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 text-sm text-slate-700">
                      <User className="w-3 h-3" />
                      <span>{alert.driver}</span>
                    </div>
                  </td>

                  {/* Velocidad */}
                  <td className="px-4 py-3 text-center whitespace-nowrap">
                    <div className="flex items-center justify-center gap-1">
                      <Gauge className="w-3 h-3 text-slate-600" />
                      <span className="font-semibold text-slate-900">{alert.speed}</span>
                      <span className="text-xs text-slate-500">km/h</span>
                    </div>
                  </td>

                  {/* Ubicación */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 text-sm text-slate-700 max-w-xs">
                      <MapPin className="w-3 h-3 flex-shrink-0 text-blue-600" />
                      <span className="truncate">{alert.location}</span>
                    </div>
                  </td>

                  {/* Fecha */}
                  <td className="px-4 py-3 text-center whitespace-nowrap">
                    <div className="text-sm text-slate-700">
                      {new Date(alert.timestamp).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}
                    </div>
                    <div className="text-xs text-slate-500">
                      {new Date(alert.timestamp).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </td>

                  {/* Planes de Acción */}
                  <td className="px-4 py-3 text-center whitespace-nowrap">
                    {alert.action_plans && alert.action_plans.length > 0 ? (
                      <div className="text-xs">
                        <span className="font-semibold text-slate-900">{alert.action_plans.length}</span>
                        <span className="text-slate-600"> plan{alert.action_plans.length !== 1 ? 'es' : ''}</span>
                        <div className="text-xs text-slate-500 mt-1">
                          {alert.action_plans.filter(p => p.status === 'completed').length} completado{alert.action_plans.filter(p => p.status === 'completed').length !== 1 ? 's' : ''}
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">-</span>
                    )}
                  </td>

                  {/* Acciones */}
                  <td className="px-4 py-3 text-center whitespace-nowrap">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => handleOpenActionModal(alert)}
                        className="p-2 rounded-lg text-white bg-sky-600 hover:bg-sky-700 transition-colors"
                        title="Gestionar Planes de Acción"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteAlert(alert.id)}
                        className="p-2 rounded-lg text-white bg-red-600 hover:bg-red-700 transition-colors"
                        title="Eliminar Alerta"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
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

      {/* Modal de Plan de Acción */}
      {showActionModal && selectedAlert && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Agregar Plan de Acción</h3>
                <p className="text-sm text-slate-600 mt-1">Alerta: {selectedAlert.plate} - {selectedAlert.type}</p>
              </div>
              <button
                onClick={() => setShowActionModal(false)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Descripción del Plan de Acción *
                </label>
                <textarea
                  value={newActionPlan.description}
                  onChange={(e) => setNewActionPlan({ ...newActionPlan, description: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                  rows={3}
                  placeholder="Describe las acciones que se tomarán..."
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Responsable *
                </label>
                <input
                  type="text"
                  value={newActionPlan.responsible}
                  onChange={(e) => setNewActionPlan({ ...newActionPlan, responsible: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                  placeholder="Nombre del responsable"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Estado Inicial
                </label>
                <select
                  value={newActionPlan.status}
                  onChange={(e) => setNewActionPlan({ ...newActionPlan, status: e.target.value as any })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="pending">Pendiente</option>
                  <option value="in_progress">En Proceso</option>
                  <option value="completed">Completado</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Observaciones
                </label>
                <textarea
                  value={newActionPlan.observations}
                  onChange={(e) => setNewActionPlan({ ...newActionPlan, observations: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                  rows={2}
                  placeholder="Observaciones adicionales (opcional)"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleAddActionPlan}
                  className="flex-1 px-4 py-2 bg-sky-600 text-white rounded-lg font-medium hover:bg-sky-700 transition-colors"
                >
                  Guardar Plan de Acción
                </button>
                <button
                  onClick={() => setShowActionModal(false)}
                  className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg font-medium hover:bg-slate-300 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>

            {/* Planes existentes */}
            {selectedAlert.action_plans && selectedAlert.action_plans.length > 0 && (
              <div className="p-6 bg-slate-50 border-t border-slate-200">
                <h4 className="font-bold text-sm text-slate-700 mb-3">Planes de Acción Existentes</h4>
                <div className="space-y-2">
                  {selectedAlert.action_plans.map((plan) => (
                    <div key={plan.id} className="bg-white p-3 rounded-lg border border-slate-200 text-sm">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <p className="font-medium text-slate-800">{plan.description}</p>
                          <p className="text-xs text-slate-600 mt-1">Responsable: {plan.responsible}</p>
                          {plan.observations && (
                            <p className="text-xs text-slate-500 mt-1 italic">{plan.observations}</p>
                          )}
                        </div>
                        <span className={`text-xs px-2 py-1 rounded ${
                          plan.status === 'completed' ? 'bg-green-100 text-green-700' :
                          plan.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                          'bg-yellow-100 text-yellow-700'
                        }`}>
                          {plan.status === 'completed' ? 'Completado' :
                           plan.status === 'in_progress' ? 'En Proceso' : 'Pendiente'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
