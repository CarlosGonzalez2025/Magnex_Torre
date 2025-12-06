import React, { useState, useEffect } from 'react';
import { Database, Trash2, Download, AlertTriangle, CheckCircle, Clock, HardDrive, RefreshCw } from 'lucide-react';
import { DataCleanupService } from '../services/dataCleanupService';
import { DATA_RETENTION_CONFIG } from '../config/dataRetentionConfig';

interface DatabaseStats {
  alertCount: number;
  inspectionCount: number;
  actionPlanCount: number;
  estimatedSizeMB: number;
  percentageUsed: number;
}

export const MaintenancePanel: React.FC = () => {
  const [stats, setStats] = useState<DatabaseStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [cleaning, setCleaning] = useState(false);
  const [lastCleanup, setLastCleanup] = useState<Date | null>(null);
  const [cleanupResult, setCleanupResult] = useState<string | null>(null);

  useEffect(() => {
    loadStats();
    loadLastCleanupInfo();
  }, []);

  const loadStats = async () => {
    setLoading(true);
    try {
      const dbStats = await DataCleanupService.getDatabaseStats();
      setStats(dbStats);
    } catch (error) {
      console.error('Error al cargar estadísticas:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadLastCleanupInfo = () => {
    const lastCleanupStr = localStorage.getItem('lastCleanupDate');
    if (lastCleanupStr) {
      setLastCleanup(new Date(lastCleanupStr));
    }
  };

  const handleManualCleanup = async () => {
    if (!confirm('¿Estás seguro de ejecutar la limpieza de datos? Los registros antiguos serán eliminados según las políticas configuradas.')) {
      return;
    }

    setCleaning(true);
    setCleanupResult(null);

    try {
      const result = await DataCleanupService.runFullCleanup(true);

      const total = result.deletedAlerts + result.deletedInspections + result.deletedActionPlans;
      const message = `✅ Limpieza completada:\n- ${result.deletedAlerts} alertas eliminadas\n- ${result.deletedInspections} inspecciones eliminadas\n- ${result.deletedActionPlans} planes de acción eliminados\n\nTotal: ${total} registros eliminados`;

      if (result.archivedFiles.length > 0) {
        alert(message + `\n\nArchivos descargados:\n${result.archivedFiles.join('\n')}`);
      } else {
        alert(message);
      }

      setCleanupResult(`${total} registros eliminados`);
      setLastCleanup(new Date());

      // Recargar estadísticas
      await loadStats();
    } catch (error) {
      alert(`❌ Error al ejecutar limpieza: ${error}`);
    } finally {
      setCleaning(false);
    }
  };

  const getStorageColor = (percentage: number): string => {
    if (percentage >= 80) return 'bg-red-500';
    if (percentage >= 60) return 'bg-orange-500';
    if (percentage >= 40) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-8 h-8 animate-spin text-sky-600" />
        <span className="ml-3 text-slate-600">Cargando estadísticas...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
            <Database className="w-8 h-8 text-sky-600" />
            Mantenimiento de Base de Datos
          </h2>
          <p className="text-slate-600 mt-1">Gestión de almacenamiento y limpieza de datos</p>
        </div>
        <button
          onClick={loadStats}
          className="px-4 py-2 bg-slate-200 hover:bg-slate-300 rounded-lg transition-colors flex items-center gap-2"
          title="Actualizar estadísticas"
        >
          <RefreshCw className="w-4 h-4" />
          Actualizar
        </button>
      </div>

      {/* Uso de Almacenamiento */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-sky-600" />
            Uso de Almacenamiento
          </h3>
          {stats && stats.percentageUsed >= 80 && (
            <div className="flex items-center gap-2 text-red-600 text-sm font-medium">
              <AlertTriangle className="w-4 h-4" />
              Espacio limitado
            </div>
          )}
        </div>

        {stats && (
          <>
            {/* Barra de progreso */}
            <div className="mb-4">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-slate-600">Espacio usado: {stats.estimatedSizeMB.toFixed(2)} MB / 500 MB</span>
                <span className="font-semibold text-slate-900">{stats.percentageUsed.toFixed(2)}%</span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-4 overflow-hidden">
                <div
                  className={`h-full ${getStorageColor(stats.percentageUsed)} transition-all duration-500`}
                  style={{ width: `${Math.min(stats.percentageUsed, 100)}%` }}
                ></div>
              </div>
            </div>

            {/* Distribución de datos */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-blue-900">Alertas Guardadas</span>
                  <AlertTriangle className="w-5 h-5 text-blue-600" />
                </div>
                <p className="text-2xl font-bold text-blue-900">{stats.alertCount.toLocaleString()}</p>
                <p className="text-xs text-blue-700 mt-1">
                  ~{((stats.alertCount * DATA_RETENTION_CONFIG.storageLimits.avgAlertSize) / 1024).toFixed(2)} KB
                </p>
              </div>

              <div className="bg-green-50 p-4 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-green-900">Inspecciones</span>
                  <Database className="w-5 h-5 text-green-600" />
                </div>
                <p className="text-2xl font-bold text-green-900">{stats.inspectionCount.toLocaleString()}</p>
                <p className="text-xs text-green-700 mt-1">
                  ~{((stats.inspectionCount * DATA_RETENTION_CONFIG.storageLimits.avgInspectionSize) / 1024).toFixed(2)} KB
                </p>
              </div>

              <div className="bg-purple-50 p-4 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-purple-900">Planes de Acción</span>
                  <CheckCircle className="w-5 h-5 text-purple-600" />
                </div>
                <p className="text-2xl font-bold text-purple-900">{stats.actionPlanCount.toLocaleString()}</p>
                <p className="text-xs text-purple-700 mt-1">
                  ~{((stats.actionPlanCount * DATA_RETENTION_CONFIG.storageLimits.avgActionPlanSize) / 1024).toFixed(2)} KB
                </p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Políticas de Retención */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5 text-sky-600" />
          Políticas de Retención Configuradas
        </h3>

        <div className="space-y-3">
          <div className="flex items-center justify-between py-2 px-3 bg-slate-50 rounded-lg">
            <span className="text-sm text-slate-700">Alertas resueltas</span>
            <span className="text-sm font-semibold text-slate-900">
              {DATA_RETENTION_CONFIG.resolvedAlerts.retentionDays} días (máx. {DATA_RETENTION_CONFIG.resolvedAlerts.maxRecords})
            </span>
          </div>

          <div className="flex items-center justify-between py-2 px-3 bg-slate-50 rounded-lg">
            <span className="text-sm text-slate-700">Alertas activas</span>
            <span className="text-sm font-semibold text-slate-900">
              {DATA_RETENTION_CONFIG.activeAlerts.retentionDays} días (máx. {DATA_RETENTION_CONFIG.activeAlerts.maxRecords})
            </span>
          </div>

          <div className="flex items-center justify-between py-2 px-3 bg-slate-50 rounded-lg">
            <span className="text-sm text-slate-700">Inspecciones</span>
            <span className="text-sm font-semibold text-slate-900">
              {DATA_RETENTION_CONFIG.inspections.retentionDays} días (máx. {DATA_RETENTION_CONFIG.inspections.maxRecords})
            </span>
          </div>

          <div className="flex items-center justify-between py-2 px-3 bg-slate-50 rounded-lg">
            <span className="text-sm text-slate-700">Planes completados</span>
            <span className="text-sm font-semibold text-slate-900">
              {DATA_RETENTION_CONFIG.completedActionPlans.retentionDays} días
            </span>
          </div>
        </div>
      </div>

      {/* Limpieza Manual */}
      <div className="bg-gradient-to-br from-red-50 to-orange-50 rounded-xl border border-red-200 p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <Trash2 className="w-6 h-6 text-red-600 mt-1" />
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Limpieza Manual</h3>
            <p className="text-sm text-slate-700 mb-4">
              Elimina datos antiguos según las políticas configuradas. Los datos se exportarán a Excel antes de ser eliminados.
            </p>

            {lastCleanup && (
              <div className="mb-4 p-3 bg-white rounded-lg">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Clock className="w-4 h-4" />
                  <span>
                    Última limpieza: {lastCleanup.toLocaleDateString('es-CO')} a las{' '}
                    {lastCleanup.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                {cleanupResult && (
                  <div className="text-sm text-green-600 font-medium mt-1">{cleanupResult}</div>
                )}
              </div>
            )}

            <button
              onClick={handleManualCleanup}
              disabled={cleaning}
              className="flex items-center gap-2 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {cleaning ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  Ejecutando limpieza...
                </>
              ) : (
                <>
                  <Trash2 className="w-5 h-5" />
                  Ejecutar Limpieza Ahora
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Información adicional */}
      <div className="bg-blue-50 rounded-xl border border-blue-200 p-6">
        <div className="flex items-start gap-3">
          <Database className="w-6 h-6 text-blue-600 mt-1" />
          <div>
            <h4 className="font-semibold text-blue-900 mb-2">Información Importante</h4>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• La limpieza automática se ejecuta diariamente a las 2:00 AM</li>
              <li>• Los datos se exportan a Excel antes de ser eliminados</li>
              <li>• Las alertas en tiempo real NO se guardan automáticamente en la BD</li>
              <li>• Los vehículos solo se consultan desde las APIs en tiempo real</li>
              <li>• Solo se guardan las alertas que el usuario marca explícitamente</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
