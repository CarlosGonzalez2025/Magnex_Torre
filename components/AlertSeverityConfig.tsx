import React, { useState, useEffect } from 'react';
import { Settings, Save, RefreshCw, AlertTriangle, Info, Shield, CheckCircle, XCircle } from 'lucide-react';
import { AlertSeverity } from '../types';
import { useAuth } from '../contexts/AuthContext';
import {
  AlertSeverityConfig as ConfigType,
  getAllAlertSeverityConfigs,
  updateAlertSeverityConfig,
  toggleAlertTypeStatus
} from '../services/alertSeverityConfigService';

export const AlertSeverityConfig: React.FC = () => {
  const [configs, setConfigs] = useState<ConfigType[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    setLoading(true);
    const result = await getAllAlertSeverityConfigs();

    if (result.success && result.data) {
      setConfigs(result.data);
    } else {
      console.error('Error loading alert severity configs:', result.error);
    }

    setLoading(false);
  };

  const handleSeverityChange = async (configId: string, newSeverity: AlertSeverity) => {
    if (!user) return;

    setSaving(configId);

    const config = configs.find(c => c.id === configId);
    if (!config) return;

    // Actualización optimista
    setConfigs(prevConfigs =>
      prevConfigs.map(c =>
        c.id === configId
          ? { ...c, severity: newSeverity, updated_by: user.email }
          : c
      )
    );

    const result = await updateAlertSeverityConfig(
      configId,
      newSeverity,
      config.description,
      user.email
    );

    if (!result.success) {
      console.error('Failed to update severity:', result.error);
      // Rollback
      await loadConfigs();
    }

    setSaving(null);
  };

  const handleToggleActive = async (configId: string, isActive: boolean) => {
    if (!user) return;

    setSaving(configId);

    // Actualización optimista
    setConfigs(prevConfigs =>
      prevConfigs.map(c =>
        c.id === configId
          ? { ...c, is_active: isActive, updated_by: user.email }
          : c
      )
    );

    const result = await toggleAlertTypeStatus(configId, isActive, user.email);

    if (!result.success) {
      console.error('Failed to toggle status:', result.error);
      // Rollback
      await loadConfigs();
    }

    setSaving(null);
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
      case 'critical': return '🚨';
      case 'high': return '⚠️';
      case 'medium': return '📢';
      case 'low': return 'ℹ️';
      default: return '❓';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <RefreshCw className="w-12 h-12 text-indigo-500 animate-spin mx-auto mb-4" />
          <p className="text-slate-600 font-medium">Cargando configuración...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-indigo-500 rounded-xl p-6 text-white shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Settings className="w-10 h-10" />
            <div>
              <h2 className="text-2xl font-bold">Configuración de Severidad de Alertas</h2>
              <p className="text-indigo-100 text-sm mt-1">
                Define qué alertas son críticas para tu operación
              </p>
            </div>
          </div>
          <button
            onClick={loadConfigs}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-white text-indigo-600 rounded-lg hover:bg-indigo-50 transition-colors font-medium"
            title="Recargar configuración"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Recargar
          </button>
        </div>
      </div>

      {/* Info Card */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-bold text-blue-900 text-sm">¿Cómo funciona?</h3>
            <p className="text-sm text-blue-800 mt-1">
              Configura el nivel de severidad para cada tipo de alerta. El sistema usará esta configuración
              para categorizar automáticamente las alertas detectadas. Las alertas <strong>críticas</strong> aparecerán
              primero en el Centro de Alertas.
            </p>
            <div className="mt-3 grid grid-cols-4 gap-2">
              <div className="flex items-center gap-2 text-xs">
                <span className="px-2 py-1 rounded-full bg-red-100 text-red-800 border border-red-300 font-bold">
                  🚨 Crítica
                </span>
                <span className="text-blue-700">Acción inmediata</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="px-2 py-1 rounded-full bg-orange-100 text-orange-800 border border-orange-300 font-bold">
                  ⚠️ Alta
                </span>
                <span className="text-blue-700">Atención pronto</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="px-2 py-1 rounded-full bg-yellow-100 text-yellow-800 border border-yellow-300 font-bold">
                  📢 Media
                </span>
                <span className="text-blue-700">Monitorear</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="px-2 py-1 rounded-full bg-blue-100 text-blue-800 border border-blue-300 font-bold">
                  ℹ️ Baja
                </span>
                <span className="text-blue-700">Informativa</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Configuration Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gradient-to-r from-slate-700 to-slate-600 text-white">
            <tr>
              <th className="px-6 py-4 text-left text-sm font-bold uppercase tracking-wider">Estado</th>
              <th className="px-6 py-4 text-left text-sm font-bold uppercase tracking-wider">Tipo de Alerta</th>
              <th className="px-6 py-4 text-left text-sm font-bold uppercase tracking-wider">Descripción</th>
              <th className="px-6 py-4 text-center text-sm font-bold uppercase tracking-wider">Severidad</th>
              <th className="px-6 py-4 text-center text-sm font-bold uppercase tracking-wider">Última Actualización</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {configs.map((config, index) => (
              <tr
                key={config.id}
                className={`${index % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-indigo-50 transition-colors ${
                  !config.is_active ? 'opacity-50' : ''
                }`}
              >
                {/* Estado (Activo/Inactivo) */}
                <td className="px-6 py-4">
                  <button
                    onClick={() => handleToggleActive(config.id, !config.is_active)}
                    disabled={saving === config.id}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-medium text-sm transition-colors ${
                      config.is_active
                        ? 'bg-green-100 text-green-800 border border-green-300 hover:bg-green-200'
                        : 'bg-gray-100 text-gray-600 border border-gray-300 hover:bg-gray-200'
                    }`}
                    title={config.is_active ? 'Desactivar' : 'Activar'}
                  >
                    {config.is_active ? (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        Activo
                      </>
                    ) : (
                      <>
                        <XCircle className="w-4 h-4" />
                        Inactivo
                      </>
                    )}
                  </button>
                </td>

                {/* Tipo de Alerta */}
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{getSeverityIcon(config.severity)}</span>
                    <span className="font-semibold text-slate-900">{config.alert_type}</span>
                  </div>
                </td>

                {/* Descripción */}
                <td className="px-6 py-4">
                  <span className="text-sm text-slate-600">{config.description || 'Sin descripción'}</span>
                </td>

                {/* Severidad Selector */}
                <td className="px-6 py-4">
                  <div className="flex justify-center">
                    <select
                      value={config.severity}
                      onChange={(e) => handleSeverityChange(config.id, e.target.value as AlertSeverity)}
                      disabled={saving === config.id || !config.is_active}
                      className={`px-4 py-2 rounded-lg border-2 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                        getSeverityColor(config.severity)
                      } ${saving === config.id ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}
                    >
                      <option value={AlertSeverity.CRITICAL}>🚨 Crítica</option>
                      <option value={AlertSeverity.HIGH}>⚠️ Alta</option>
                      <option value={AlertSeverity.MEDIUM}>📢 Media</option>
                      <option value={AlertSeverity.LOW}>ℹ️ Baja</option>
                    </select>
                  </div>
                </td>

                {/* Última Actualización */}
                <td className="px-6 py-4 text-center">
                  <div className="text-xs text-slate-600">
                    {config.updated_by && (
                      <div className="font-medium">{config.updated_by}</div>
                    )}
                    <div className="text-slate-500">
                      {new Date(config.updated_at).toLocaleDateString('es-CO', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Stats Footer */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="text-red-800 text-sm font-medium">Críticas</div>
          <div className="text-2xl font-bold text-red-900 mt-1">
            {configs.filter(c => c.severity === AlertSeverity.CRITICAL && c.is_active).length}
          </div>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
          <div className="text-orange-800 text-sm font-medium">Altas</div>
          <div className="text-2xl font-bold text-orange-900 mt-1">
            {configs.filter(c => c.severity === AlertSeverity.HIGH && c.is_active).length}
          </div>
        </div>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="text-yellow-800 text-sm font-medium">Medias</div>
          <div className="text-2xl font-bold text-yellow-900 mt-1">
            {configs.filter(c => c.severity === AlertSeverity.MEDIUM && c.is_active).length}
          </div>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="text-blue-800 text-sm font-medium">Bajas</div>
          <div className="text-2xl font-bold text-blue-900 mt-1">
            {configs.filter(c => c.severity === AlertSeverity.LOW && c.is_active).length}
          </div>
        </div>
      </div>
    </div>
  );
};
