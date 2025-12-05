import React from 'react';
import { Alert, AlertSeverity } from '../types';
import { X, AlertTriangle, AlertCircle, Bell, BellRing, MapPin, User, Gauge, Clock, Briefcase, Save, Copy } from 'lucide-react';

interface AlertDetailModalProps {
  alert: Alert | null;
  isOpen: boolean;
  onClose: () => void;
  onSaveAlert?: (alert: Alert) => void;
  onCopyAlert?: (alert: Alert) => void;
}

export const AlertDetailModal: React.FC<AlertDetailModalProps> = ({
  alert,
  isOpen,
  onClose,
  onSaveAlert,
  onCopyAlert
}) => {
  if (!isOpen || !alert) return null;

  const getSeverityIcon = (severity: AlertSeverity) => {
    switch (severity) {
      case AlertSeverity.CRITICAL: return <AlertCircle className="w-8 h-8 text-red-600" />;
      case AlertSeverity.HIGH: return <AlertTriangle className="w-8 h-8 text-orange-600" />;
      case AlertSeverity.MEDIUM: return <Bell className="w-8 h-8 text-yellow-600" />;
      case AlertSeverity.LOW: return <BellRing className="w-8 h-8 text-blue-600" />;
    }
  };

  const getSeverityColor = (severity: AlertSeverity) => {
    switch (severity) {
      case AlertSeverity.CRITICAL: return 'bg-red-100 text-red-800 border-red-300';
      case AlertSeverity.HIGH: return 'bg-orange-100 text-orange-800 border-orange-300';
      case AlertSeverity.MEDIUM: return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case AlertSeverity.LOW: return 'bg-blue-100 text-blue-800 border-blue-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={`p-6 border-b-4 ${getSeverityColor(alert.severity)} flex items-start justify-between sticky top-0 bg-white z-10`}>
          <div className="flex items-start gap-4 flex-1">
            {getSeverityIcon(alert.severity)}
            <div>
              <h2 className="text-2xl font-bold text-slate-900">{alert.type}</h2>
              <div className="flex items-center gap-3 mt-2">
                <span className={`px-3 py-1 rounded-full text-xs font-semibold uppercase ${getSeverityColor(alert.severity)}`}>
                  {alert.severity}
                </span>
                <span className="text-lg text-sky-600 font-semibold">{alert.plate}</span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            title="Cerrar"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Detalles de la Alerta */}
          <div className="bg-slate-50 p-4 rounded-lg">
            <h3 className="font-semibold text-slate-900 mb-3 text-lg">Detalles</h3>
            <p className="text-slate-700 leading-relaxed">{alert.details}</p>
          </div>

          {/* Información del Conductor */}
          <div className="bg-blue-50 p-4 rounded-lg">
            <div className="flex items-center gap-2 mb-3">
              <User className="w-5 h-5 text-blue-600" />
              <h3 className="font-semibold text-slate-900">Conductor</h3>
            </div>
            <p className="text-lg font-medium text-slate-900">{alert.driver}</p>
          </div>

          {/* Contrato */}
          {alert.contract && alert.contract !== 'No asignado' && (
            <div className="bg-purple-50 p-4 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Briefcase className="w-5 h-5 text-purple-600" />
                <h3 className="font-semibold text-slate-900">Contrato</h3>
              </div>
              <p className="text-lg font-medium text-slate-900">{alert.contract}</p>
            </div>
          )}

          {/* Métricas */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Velocidad */}
            <div className="bg-red-50 p-4 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Gauge className="w-5 h-5 text-red-600" />
                <h3 className="font-semibold text-slate-900">Velocidad</h3>
              </div>
              <p className="text-3xl font-bold text-red-600">{alert.speed} <span className="text-lg text-slate-600">km/h</span></p>
            </div>

            {/* Fecha y Hora */}
            <div className="bg-amber-50 p-4 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-5 h-5 text-amber-600" />
                <h3 className="font-semibold text-slate-900">Fecha y Hora</h3>
              </div>
              <p className="text-lg font-medium text-slate-900">
                {new Date(alert.timestamp).toLocaleString('es-CO', {
                  day: '2-digit',
                  month: 'long',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </p>
            </div>
          </div>

          {/* Ubicación */}
          <div className="bg-green-50 p-4 rounded-lg">
            <div className="flex items-center gap-2 mb-3">
              <MapPin className="w-5 h-5 text-green-600" />
              <h3 className="font-semibold text-slate-900">Ubicación</h3>
            </div>
            <p className="text-slate-900">{alert.location}</p>
          </div>

          {/* Estado de Envío */}
          {alert.sent && alert.sentAt && (
            <div className="bg-sky-50 p-4 rounded-lg">
              <h3 className="font-semibold text-slate-900 mb-2">Estado de Notificación</h3>
              <div className="text-sm text-slate-700">
                <p>Copiada: {new Date(alert.sentAt).toLocaleString('es-CO')}</p>
                {alert.sentBy && <p className="mt-1">Por: {alert.sentBy}</p>}
              </div>
            </div>
          )}
        </div>

        {/* Footer con Acciones */}
        <div className="p-6 border-t border-slate-200 bg-slate-50 flex gap-3">
          {onSaveAlert && (
            <button
              onClick={() => {
                onSaveAlert(alert);
                onClose();
              }}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
            >
              <Save className="w-5 h-5" />
              Guardar Alerta
            </button>
          )}
          {onCopyAlert && (
            <button
              onClick={() => {
                onCopyAlert(alert);
                onClose();
              }}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              <Copy className="w-5 h-5" />
              Copiar Alerta
            </button>
          )}
          <button
            onClick={onClose}
            className="px-6 py-3 bg-slate-700 text-white rounded-lg hover:bg-slate-800 transition-colors font-medium"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
