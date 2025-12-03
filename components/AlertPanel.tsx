import React, { useState } from 'react';
import { Alert, AlertSeverity, AlertType } from '../types';
import { AlertTriangle, AlertCircle, Bell, BellRing, Copy, CheckCircle, Clock, MapPin, User, Gauge, Save } from 'lucide-react';

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

      {/* Lista de Alertas */}
      <div className="space-y-3">
        {filteredAlerts.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <p className="text-slate-600 font-medium">No hay alertas activas</p>
            <p className="text-slate-400 text-sm mt-1">El sistema está funcionando normalmente</p>
          </div>
        ) : (
          filteredAlerts.map((alert) => (
            <div
              key={alert.id}
              className={`p-4 rounded-xl border-2 ${getSeverityColor(alert.severity)} shadow-sm hover:shadow-md transition-all`}
            >
              <div className="flex items-start gap-4">
                {/* Icono */}
                <div className="flex-shrink-0 mt-1">
                  {getSeverityIcon(alert.severity)}
                </div>

                {/* Contenido */}
                <div className="flex-1 space-y-2">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h4 className="font-bold text-lg text-slate-900">{alert.type}</h4>
                      <p className="text-sm font-semibold text-slate-700 mt-1">
                        {alert.plate}
                        {alert.contract && alert.contract !== 'No asignado' && (
                          <span className="ml-2 text-sky-600">· {alert.contract}</span>
                        )}
                      </p>
                    </div>
                    <span className="text-xs font-medium px-2 py-1 rounded-full bg-white border border-current uppercase">
                      {alert.severity}
                    </span>
                  </div>

                  {/* Detalles */}
                  <p className="text-sm text-slate-700">{alert.details}</p>

                  {/* Información adicional */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-slate-600">
                    <div className="flex items-center gap-1">
                      <User className="w-3 h-3" />
                      <span>{alert.driver}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Gauge className="w-3 h-3" />
                      <span>{alert.speed} km/h</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      <span className="truncate">{alert.location}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>{new Date(alert.timestamp).toLocaleTimeString()}</span>
                    </div>
                  </div>

                  {/* Acciones */}
                  <div className="flex items-center gap-3 pt-2 border-t border-current border-opacity-20">
                    {onSaveAlert && (
                      <button
                        onClick={() => onSaveAlert(alert)}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all bg-green-600 text-white hover:bg-green-700 active:scale-95"
                      >
                        <Save className="w-4 h-4" />
                        Guardar Alerta
                      </button>
                    )}
                    {onCopyAlert && (
                      <button
                        onClick={() => onCopyAlert(alert)}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all bg-blue-600 text-white hover:bg-blue-700 active:scale-95"
                      >
                        <Copy className="w-4 h-4" />
                        Copiar Alerta
                      </button>
                    )}
                    {alert.sent && alert.sentAt && (
                      <span className="text-xs text-slate-500">
                        Copiada: {new Date(alert.sentAt).toLocaleString()}
                        {alert.sentBy && ` por ${alert.sentBy}`}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
