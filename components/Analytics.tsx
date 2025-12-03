import React, { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, Users, AlertTriangle, CheckCircle, Activity, FileText, Target } from 'lucide-react';
import { Vehicle } from '../types';
import { getAllSavedAlerts, getAlertStatistics, SavedAlertWithPlans } from '../services/databaseService';

interface AnalyticsProps {
  vehicles: Vehicle[];
}

interface ContractStats {
  contract: string;
  vehicleCount: number;
  alertCount: number;
  criticalAlerts: number;
  resolvedAlerts: number;
  completedPlans: number;
  totalPlans: number;
}

interface VehicleAlertStats {
  plate: string;
  driver: string;
  contract: string;
  alertCount: number;
  criticalCount: number;
  lastAlert?: string;
}

export const Analytics: React.FC<AnalyticsProps> = ({ vehicles }) => {
  const [savedAlerts, setSavedAlerts] = useState<SavedAlertWithPlans[]>([]);
  const [alertStats, setAlertStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    setLoading(true);

    // Cargar alertas guardadas
    const alertsResult = await getAllSavedAlerts();
    if (alertsResult.success && alertsResult.data) {
      setSavedAlerts(alertsResult.data);
    }

    // Cargar estadísticas de alertas
    const statsResult = await getAlertStatistics();
    if (statsResult.success && statsResult.data) {
      setAlertStats(statsResult.data);
    }

    setLoading(false);
  };

  // Calcular estadísticas por contrato
  const contractStats: ContractStats[] = React.useMemo(() => {
    const statsMap = new Map<string, ContractStats>();

    // Contar vehículos por contrato
    vehicles.forEach(vehicle => {
      const contract = vehicle.contract || 'Sin Contrato';
      if (!statsMap.has(contract)) {
        statsMap.set(contract, {
          contract,
          vehicleCount: 0,
          alertCount: 0,
          criticalAlerts: 0,
          resolvedAlerts: 0,
          completedPlans: 0,
          totalPlans: 0
        });
      }
      const stats = statsMap.get(contract)!;
      stats.vehicleCount++;
    });

    // Contar alertas por contrato
    savedAlerts.forEach(alert => {
      const contract = alert.contract || 'Sin Contrato';
      if (!statsMap.has(contract)) {
        statsMap.set(contract, {
          contract,
          vehicleCount: 0,
          alertCount: 0,
          criticalAlerts: 0,
          resolvedAlerts: 0,
          completedPlans: 0,
          totalPlans: 0
        });
      }
      const stats = statsMap.get(contract)!;
      stats.alertCount++;
      if (alert.severity === 'critical') stats.criticalAlerts++;
      if (alert.status === 'resolved') stats.resolvedAlerts++;
      if (alert.action_plans) {
        stats.totalPlans += alert.action_plans.length;
        stats.completedPlans += alert.action_plans.filter(p => p.status === 'completed').length;
      }
    });

    return Array.from(statsMap.values()).sort((a, b) => b.vehicleCount - a.vehicleCount);
  }, [vehicles, savedAlerts]);

  // Calcular estadísticas por vehículo
  const vehicleStats: VehicleAlertStats[] = React.useMemo(() => {
    const statsMap = new Map<string, VehicleAlertStats>();

    savedAlerts.forEach(alert => {
      if (!statsMap.has(alert.plate)) {
        statsMap.set(alert.plate, {
          plate: alert.plate,
          driver: alert.driver,
          contract: alert.contract || 'Sin Contrato',
          alertCount: 0,
          criticalCount: 0,
          lastAlert: undefined
        });
      }
      const stats = statsMap.get(alert.plate)!;
      stats.alertCount++;
      if (alert.severity === 'critical') stats.criticalCount++;
      if (!stats.lastAlert || new Date(alert.timestamp) > new Date(stats.lastAlert)) {
        stats.lastAlert = alert.timestamp;
      }
    });

    return Array.from(statsMap.values()).sort((a, b) => b.alertCount - a.alertCount);
  }, [savedAlerts]);

  // Calcular métricas generales
  const overallMetrics = React.useMemo(() => {
    const totalVehicles = vehicles.length;
    const totalAlerts = savedAlerts.length;
    const criticalAlerts = savedAlerts.filter(a => a.severity === 'critical').length;
    const resolvedAlerts = savedAlerts.filter(a => a.status === 'resolved').length;
    const pendingAlerts = savedAlerts.filter(a => a.status === 'pending').length;
    const inProgressAlerts = savedAlerts.filter(a => a.status === 'in_progress').length;

    const totalPlans = savedAlerts.reduce((sum, alert) =>
      sum + (alert.action_plans?.length || 0), 0);
    const completedPlans = savedAlerts.reduce((sum, alert) =>
      sum + (alert.action_plans?.filter(p => p.status === 'completed').length || 0), 0);

    const resolutionRate = totalAlerts > 0
      ? Math.round((resolvedAlerts / totalAlerts) * 100)
      : 0;

    const planCompletionRate = totalPlans > 0
      ? Math.round((completedPlans / totalPlans) * 100)
      : 0;

    return {
      totalVehicles,
      totalAlerts,
      criticalAlerts,
      resolvedAlerts,
      pendingAlerts,
      inProgressAlerts,
      totalPlans,
      completedPlans,
      resolutionRate,
      planCompletionRate
    };
  }, [vehicles, savedAlerts]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <Activity className="w-12 h-12 text-sky-600 animate-spin mx-auto mb-4" />
          <p className="text-slate-600 font-medium">Cargando análisis...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Título */}
      <div className="flex items-center gap-3">
        <BarChart3 className="w-8 h-8 text-sky-600" />
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Análisis y Estadísticas</h2>
          <p className="text-sm text-slate-600 mt-1">Dashboard de métricas y KPIs del sistema de alertas</p>
        </div>
      </div>

      {/* Métricas Generales */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-blue-700 uppercase tracking-wide">Total Vehículos</p>
              <p className="text-3xl font-bold text-blue-900 mt-2">{overallMetrics.totalVehicles}</p>
            </div>
            <div className="p-3 bg-blue-200 rounded-lg">
              <Users className="w-6 h-6 text-blue-700" />
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-amber-700 uppercase tracking-wide">Total Alertas</p>
              <p className="text-3xl font-bold text-amber-900 mt-2">{overallMetrics.totalAlerts}</p>
              <p className="text-xs text-amber-600 mt-1">{overallMetrics.criticalAlerts} críticas</p>
            </div>
            <div className="p-3 bg-amber-200 rounded-lg">
              <AlertTriangle className="w-6 h-6 text-amber-700" />
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-green-700 uppercase tracking-wide">Tasa de Resolución</p>
              <p className="text-3xl font-bold text-green-900 mt-2">{overallMetrics.resolutionRate}%</p>
              <p className="text-xs text-green-600 mt-1">{overallMetrics.resolvedAlerts} de {overallMetrics.totalAlerts}</p>
            </div>
            <div className="p-3 bg-green-200 rounded-lg">
              <TrendingUp className="w-6 h-6 text-green-700" />
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-purple-700 uppercase tracking-wide">Planes de Acción</p>
              <p className="text-3xl font-bold text-purple-900 mt-2">{overallMetrics.completedPlans}/{overallMetrics.totalPlans}</p>
              <p className="text-xs text-purple-600 mt-1">{overallMetrics.planCompletionRate}% completados</p>
            </div>
            <div className="p-3 bg-purple-200 rounded-lg">
              <FileText className="w-6 h-6 text-purple-700" />
            </div>
          </div>
        </div>
      </div>

      {/* Estado de Alertas */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
          <Target className="w-5 h-5 text-sky-600" />
          Estado de Alertas
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-sm font-semibold text-yellow-700">Pendientes</p>
            <p className="text-2xl font-bold text-yellow-900 mt-1">{overallMetrics.pendingAlerts}</p>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm font-semibold text-blue-700">En Proceso</p>
            <p className="text-2xl font-bold text-blue-900 mt-1">{overallMetrics.inProgressAlerts}</p>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-sm font-semibold text-green-700">Resueltas</p>
            <p className="text-2xl font-bold text-green-900 mt-1">{overallMetrics.resolvedAlerts}</p>
          </div>
        </div>
      </div>

      {/* Estadísticas por Contrato */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <h3 className="text-lg font-bold text-slate-900 mb-4">Estadísticas por Contrato</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Contrato</th>
                <th className="text-center py-3 px-4 text-sm font-semibold text-slate-700">Vehículos</th>
                <th className="text-center py-3 px-4 text-sm font-semibold text-slate-700">Alertas</th>
                <th className="text-center py-3 px-4 text-sm font-semibold text-slate-700">Críticas</th>
                <th className="text-center py-3 px-4 text-sm font-semibold text-slate-700">Resueltas</th>
                <th className="text-center py-3 px-4 text-sm font-semibold text-slate-700">Planes</th>
                <th className="text-center py-3 px-4 text-sm font-semibold text-slate-700">Tasa Resolución</th>
              </tr>
            </thead>
            <tbody>
              {contractStats.map((stat, index) => {
                const resolutionRate = stat.alertCount > 0
                  ? Math.round((stat.resolvedAlerts / stat.alertCount) * 100)
                  : 0;

                return (
                  <tr key={index} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 px-4 font-medium text-slate-900">{stat.contract}</td>
                    <td className="py-3 px-4 text-center text-slate-700">{stat.vehicleCount}</td>
                    <td className="py-3 px-4 text-center text-slate-700">{stat.alertCount}</td>
                    <td className="py-3 px-4 text-center">
                      <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-sm font-semibold">
                        {stat.criticalAlerts}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center text-slate-700">{stat.resolvedAlerts}</td>
                    <td className="py-3 px-4 text-center">
                      <span className="text-slate-700">{stat.completedPlans}/{stat.totalPlans}</span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`px-2 py-1 rounded text-sm font-semibold ${
                        resolutionRate >= 75 ? 'bg-green-100 text-green-700' :
                        resolutionRate >= 50 ? 'bg-yellow-100 text-yellow-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {resolutionRate}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Estadísticas por Vehículo */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <h3 className="text-lg font-bold text-slate-900 mb-4">Top 10 Vehículos con Más Alertas</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Placa</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Conductor</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Contrato</th>
                <th className="text-center py-3 px-4 text-sm font-semibold text-slate-700">Total Alertas</th>
                <th className="text-center py-3 px-4 text-sm font-semibold text-slate-700">Críticas</th>
                <th className="text-center py-3 px-4 text-sm font-semibold text-slate-700">Última Alerta</th>
              </tr>
            </thead>
            <tbody>
              {vehicleStats.slice(0, 10).map((stat, index) => (
                <tr key={index} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-3 px-4 font-medium text-slate-900">{stat.plate}</td>
                  <td className="py-3 px-4 text-slate-700">{stat.driver}</td>
                  <td className="py-3 px-4 text-sm text-sky-600 font-semibold">{stat.contract}</td>
                  <td className="py-3 px-4 text-center">
                    <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded text-sm font-semibold">
                      {stat.alertCount}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-sm font-semibold">
                      {stat.criticalCount}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center text-xs text-slate-600">
                    {stat.lastAlert ? new Date(stat.lastAlert).toLocaleString() : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
