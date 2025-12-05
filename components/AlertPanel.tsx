import React, { useState } from 'react';
import { Alert, AlertSeverity, AlertType } from '../types';
import { AlertTriangle, AlertCircle, Bell, BellRing, Copy, CheckCircle, Clock, MapPin, User, Gauge, Save } from 'lucide-react';
import { usePagination } from '../hooks/usePagination';
import { PaginationControls } from './PaginationControls';

interface AlertPanelProps {
  alerts: Alert[];
  onCopyAlert?: (alert: Alert) => void;
  onSaveAlert?: (alert: Alert) => void;
}

export const AlertPanel: React.FC<AlertPanelProps> = ({ alerts, onCopyAlert, onSaveAlert }) => {
  const [selectedSeverity, setSelectedSeverity] = useState<'ALL' | AlertSeverity>('ALL');
  const [selectedType, setSelectedType] = useState<'ALL' | AlertType>('ALL');

  const getSeverityColor = (severity: AlertSeverity) => {
    switch (severity) {
      case AlertSeverity.CRITICAL: return 'bg-red-100 text-red-800 border-red-300';
      case AlertSeverity.HIGH: return 'bg-orange-100 text-orange-800 border-orange-300';
      case AlertSeverity.MEDIUM: return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case AlertSeverity.LOW: return 'bg-blue-100 text-blue-800 border-blue-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getSeverityIcon = (severity: AlertSeverity) => {
    switch (severity) {
      case AlertSeverity.CRITICAL: return <AlertCircle className="w-5 h-5 text-red-600" />;
      case AlertSeverity.HIGH: return <AlertTriangle className="w-5 h-5 text-orange-600" />;
      case AlertSeverity.MEDIUM: return <Bell className="w-5 h-5 text-yellow-600" />;
      case AlertSeverity.LOW: return <BellRing className="w-5 h-5 text-blue-600" />;
    }
  };

  const filteredAlerts = alerts.filter(alert => {
    if (selectedSeverity !== 'ALL' && alert.severity !== selectedSeverity) return false;
    if (selectedType !== 'ALL' && alert.type !== selectedType) return false;
    return true;
  });

  const alertTypes = Array.from(new Set(alerts.map(a => a.type)));

  // Hook de paginación
  const pagination = usePagination(filteredAlerts, {
    initialPageSize: 20,
    pageSizeOptions: [10, 20, 50, 100]
  });

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap gap-4 items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-2">
          <label className="text-sm font-semibold text-slate-600">Severidad:</label>
          <select
            value={selectedSeverity}
            onChange={(e) => setSelectedSeverity(e.target.value as any)}
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            <option value="ALL">Todas</option>
            <option value={AlertSeverity.CRITICAL}>Críticas</option>
            <option value={AlertSeverity.HIGH}>Altas</option>
            <option value={AlertSeverity.MEDIUM}>Medias</option>
            <option value={AlertSeverity.LOW}>Bajas</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm font-semibold text-slate-600">Tipo:</label>
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value as any)}
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            <option value="ALL">Todos los tipos</option>
            {alertTypes.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>

        <div className="ml-auto text-sm font-semibold text-slate-600">
          {filteredAlerts.length} alerta{filteredAlerts.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Tabla de Alertas */}
      {filteredAlerts.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <p className="text-slate-600 font-medium">No hay alertas activas</p>
          <p className="text-slate-400 text-sm mt-1">El sistema está funcionando normalmente</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gradient-to-r from-slate-700 to-slate-600 text-white">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider">Tipo</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider">Placa/Contrato</th>
                <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider">Severidad</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider">Detalles</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider">Conductor</th>
                <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider">Velocidad</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider">Ubicación</th>
                <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider">Hora</th>
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

                  {/* Hora */}
                  <td className="px-4 py-3 text-center whitespace-nowrap">
                    <div className="flex items-center justify-center gap-1 text-sm text-slate-700">
                      <Clock className="w-3 h-3" />
                      <span>{new Date(alert.timestamp).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div className="text-xs text-slate-500">
                      {new Date(alert.timestamp).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}
                    </div>
                  </td>

                  {/* Acciones */}
                  <td className="px-4 py-3 text-center whitespace-nowrap">
                    <div className="flex items-center justify-center gap-2">
                      {onSaveAlert && (
                        <button
                          onClick={() => onSaveAlert(alert)}
                          className="p-2 rounded-lg text-white bg-green-600 hover:bg-green-700 transition-colors"
                          title="Guardar Alerta"
                        >
                          <Save className="w-4 h-4" />
                        </button>
                      )}
                      {onCopyAlert && (
                        <button
                          onClick={() => onCopyAlert(alert)}
                          className="p-2 rounded-lg text-white bg-blue-600 hover:bg-blue-700 transition-colors"
                          title="Copiar Alerta"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    {alert.sent && alert.sentAt && (
                      <div className="text-xs text-slate-500 mt-1">
                        Copiada: {new Date(alert.sentAt).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    )}
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
