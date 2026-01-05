import React, { useState, useEffect, useMemo } from 'react';
import { TrendingUp, Activity, AlertTriangle, Shield, Clock, Award, Users } from 'lucide-react';
import { Vehicle, Alert } from '../types';
import { getAllSavedAlerts, getAlertStatistics, SavedAlertWithPlans } from '../services/databaseService';
import { getIdleTimeByContract, type IdleTimeRecord } from '../services/towerControlService';
import { getCurrentIdleStats } from '../services/alertService';
import { TrendChart, DonutChart, ScoreGauge, EfficiencyBar } from './AnalyticsCharts';

interface AnalyticsProps {
  vehicles: Vehicle[];
  alerts?: Alert[]; // Optional: realtime alerts
}

interface VehicleAlertStats {
  plate: string;
  driver: string;
  contract: string;
  alertCount: number;
  criticalCount: number;
  lastAlert?: string;
  score: number;
}

export const Analytics: React.FC<AnalyticsProps> = ({ vehicles, alerts: realtimeAlerts = [] }) => {
  const [savedAlerts, setSavedAlerts] = useState<SavedAlertWithPlans[]>([]);
  const [alertStats, setAlertStats] = useState<any>(null);
  const [idleRecords, setIdleRecords] = useState<IdleTimeRecord[]>([]);
  const [currentIdleVehicles, setCurrentIdleVehicles] = useState<Array<{ plate: string; durationMinutes: number; driver?: string; location?: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnalytics();

    // Actualizar vehículos en ralentí cada 30 segundos
    const interval = setInterval(() => {
      setCurrentIdleVehicles(getCurrentIdleStats());
    }, 30000);

    return () => clearInterval(interval);
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

    // Cargar datos de ralentí del último mes
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    // Cargar idle records de todos los contratos
    const contracts = new Set(vehicles.map(v => v.contract).filter(Boolean));
    const allIdleRecords: IdleTimeRecord[] = [];

    for (const contract of contracts) {
      const idleResult = await getIdleTimeByContract(
        contract,
        startDate.toISOString(),
        endDate.toISOString()
      );

      if (idleResult.success && idleResult.data?.records) {
        allIdleRecords.push(...idleResult.data.records);
      }
    }

    setIdleRecords(allIdleRecords);

    // Cargar vehículos actualmente en ralentí
    setCurrentIdleVehicles(getCurrentIdleStats());

    setLoading(false);
  };

  // --- MEMO: Trend Data (Last 7 Days) ---
  const trendData = useMemo(() => {
    const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const last7Days = Array(7).fill(0).map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return {
        date: d,
        label: days[d.getDay()],
        total: 0,
        critical: 0
      };
    });

    savedAlerts.forEach(alert => {
      const alertDate = new Date(alert.timestamp);
      // Find matching day in last7Days by comparing date/month/year
      const dayStat = last7Days.find(d =>
        d.date.getDate() === alertDate.getDate() &&
        d.date.getMonth() === alertDate.getMonth() &&
        d.date.getFullYear() === alertDate.getFullYear()
      );

      if (dayStat) {
        dayStat.total++;
        if (alert.severity === 'critical') dayStat.critical++;
      }
    });

    return last7Days;
  }, [savedAlerts]);

  // --- MEMO: Alert Distribution ---
  const alertDistribution = useMemo(() => {
    const dist = new Map<string, number>();
    savedAlerts.forEach(a => {
      const type = a.type || 'Otros';
      dist.set(type, (dist.get(type) || 0) + 1);
    });

    // Top 5 types + Others
    const sorted = Array.from(dist.entries()).sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 4);
    const others = sorted.slice(4).reduce((sum, item) => sum + item[1], 0);

    const colors = ['#3b82f6', '#ef4444', '#f59e0b', '#10b981', '#64748b']; // Blue, Red, Amber, Green, Slate

    const data = top.map((item, i) => ({
      name: item[0],
      value: item[1],
      color: colors[i]
    }));

    if (others > 0) {
      data.push({ name: 'Otros', value: others, color: colors[4] });
    }

    return data;
  }, [savedAlerts]);


  // Calcular estadísticas por vehículo (incluyendo SCORE)
  const vehicleStats: VehicleAlertStats[] = React.useMemo(() => {
    const statsMap = new Map<string, VehicleAlertStats>();

    // Initial population from vehicles list
    vehicles.forEach(v => {
      statsMap.set(v.plate, {
        plate: v.plate,
        driver: v.driver,
        contract: v.contract || 'Sin Contrato',
        alertCount: 0,
        criticalCount: 0,
        lastAlert: undefined,
        score: 100 // Start with perfect score
      });
    });

    // Process alerts
    savedAlerts.forEach(alert => {
      if (!statsMap.has(alert.plate)) {
        statsMap.set(alert.plate, {
          plate: alert.plate,
          driver: alert.driver || 'Desconocido',
          contract: alert.contract || 'Sin Contrato',
          alertCount: 0,
          criticalCount: 0,
          lastAlert: undefined,
          score: 100
        });
      }
      const stats = statsMap.get(alert.plate)!;
      stats.alertCount++;
      if (alert.severity === 'critical') stats.criticalCount++;

      // Update score (Simple deduction logic)
      let pen = 0;
      if (alert.severity === 'critical') pen = 5;
      else if (alert.severity === 'high') pen = 3;
      else if (alert.severity === 'medium') pen = 1;
      stats.score = Math.max(0, stats.score - pen);

      if (!stats.lastAlert || new Date(alert.timestamp) > new Date(stats.lastAlert)) {
        stats.lastAlert = alert.timestamp;
      }
    });

    return Array.from(statsMap.values()).sort((a, b) => a.score - b.score); // Sort by lowest score (worst first)
  }, [vehicles, savedAlerts]);

  // Average Fleet Score
  const averageFleetScore = useMemo(() => {
    if (vehicleStats.length === 0) return 100;
    const totalScore = vehicleStats.reduce((sum, v) => sum + v.score, 0);
    return Math.round(totalScore / vehicleStats.length);
  }, [vehicleStats]);


  // Calcular métricas generales
  const overallMetrics = React.useMemo(() => {
    const totalVehicles = vehicles.length;

    // Status distribution
    const moving = vehicles.filter(v => v.speed > 0).length;
    // Idle is speed 0 BUT ignition ON (or Idle/Ralenti status)
    // We use the simpler status check or the explicit realtime detection
    const idleCount = currentIdleVehicles.length;
    // Stopped are the rest, but ensure no double counting.
    // Actually, simpler logic:
    const stopped = totalVehicles - moving - idleCount;

    // Ralentí hours
    const totalIdleMinutes = idleRecords.reduce((sum, record) => sum + (record.duration_minutes || 0), 0);
    const totalIdleHours = Math.round((totalIdleMinutes / 60) * 10) / 10;

    return {
      totalVehicles,
      totalIdleHours,
      moving,
      idle: idleCount,
      stopped: Math.max(0, stopped), // Prevent negative
    };
  }, [vehicles, idleRecords, currentIdleVehicles]);


  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <Activity className="w-12 h-12 text-sky-600 animate-spin mx-auto mb-4" />
          <p className="text-slate-600 font-medium">Cargando análisis avanzado...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">

      {/* Analytics Header - NEW */}
      <div className="bg-gradient-to-r from-purple-600 via-blue-600 to-cyan-600 dark:from-purple-800 dark:via-blue-800 dark:to-cyan-800 rounded-2xl p-8 text-white shadow-2xl relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-96 h-96 bg-white rounded-full -translate-y-1/2 translate-x-1/2"></div>
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-white rounded-full translate-y-1/2 -translate-x-1/2"></div>
        </div>

        <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold mb-3">Análisis Avanzado de Flota</h1>
            <p className="text-blue-100 text-base">Métricas, tendencias y puntajes de seguridad en tiempo real</p>
          </div>

          <div className="grid grid-cols-3 gap-6">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center mb-2 border-2 border-white/30">
                <TrendingUp className="w-8 h-8" />
              </div>
              <p className="text-2xl font-bold">{savedAlerts.length}</p>
              <p className="text-xs text-blue-200">Alertas (30d)</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 mx-auto bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center mb-2 border-2 border-white/30">
                <Users className="w-8 h-8" />
              </div>
              <p className="text-2xl font-bold">{vehicleStats.length}</p>
              <p className="text-xs text-blue-200">Vehículos</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 mx-auto bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center mb-2 border-2 border-white/30">
                <Clock className="w-8 h-8" />
              </div>
              <p className="text-2xl font-bold">{overallMetrics.totalIdleHours}h</p>
              <p className="text-xs text-blue-200">Ralentí (30d)</p>
            </div>
          </div>
        </div>
      </div>

      {/* HEADER: Scorecard & Efficiency */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Fleet Score - Enhanced */}
        <div className="bg-gradient-to-br from-white to-blue-50 dark:from-slate-800 dark:to-slate-900 rounded-xl border-2 border-blue-200 dark:border-blue-900 p-6 shadow-lg hover:shadow-xl transition-shadow flex flex-col items-center justify-center relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
            <Shield className="w-32 h-32 text-slate-900 dark:text-white" />
          </div>
          <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-2 z-10">Puntaje de Seguridad</h3>
          <ScoreGauge score={averageFleetScore} label="Índice Global" size={160} />
          <p className="text-sm text-center text-slate-600 dark:text-slate-400 mt-2 z-10 max-w-[200px] font-medium">
            Calidad de conducción basada en infracciones y alertas.
          </p>
          <div className={`mt-3 px-4 py-2 rounded-full text-sm font-bold ${
            averageFleetScore >= 80
              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
              : averageFleetScore >= 60
                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
          }`}>
            {averageFleetScore >= 80 ? '✓ Excelente' : averageFleetScore >= 60 ? '⚠ Mejorable' : '✗ Crítico'}
          </div>
        </div>

        {/* Efficiency & Utilization - Enhanced */}
        <div className="bg-gradient-to-br from-white to-green-50 dark:from-slate-800 dark:to-green-900/10 rounded-xl border-2 border-green-200 dark:border-green-900 p-6 shadow-lg hover:shadow-xl transition-shadow flex flex-col justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-5 flex items-center gap-2">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <Activity className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              Eficiencia Operativa
            </h3>
            <div className="mb-6">
              <EfficiencyBar
                moving={overallMetrics.moving}
                idle={overallMetrics.idle}
                stopped={overallMetrics.stopped}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-900/20 dark:to-red-900/20 p-4 rounded-xl border border-orange-200 dark:border-orange-800 shadow-sm">
              <p className="text-xs text-orange-700 dark:text-orange-400 font-bold uppercase mb-1">Ralentí Total</p>
              <p className="text-3xl font-bold text-orange-900 dark:text-orange-200">{overallMetrics.totalIdleHours}h</p>
              <p className="text-xs text-orange-600 dark:text-orange-500 mt-1">Últimos 30 días</p>
            </div>
            <div className="bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 p-4 rounded-xl border border-blue-200 dark:border-blue-800 shadow-sm">
              <p className="text-xs text-blue-700 dark:text-blue-400 font-bold uppercase mb-1">Flota Activa</p>
              <p className="text-3xl font-bold text-blue-900 dark:text-blue-200">{overallMetrics.moving + overallMetrics.idle}</p>
              <p className="text-xs text-blue-600 dark:text-blue-500 mt-1">{Math.round(((overallMetrics.moving + overallMetrics.idle) / overallMetrics.totalVehicles) * 100)}% del total</p>
            </div>
          </div>
        </div>

        {/* Alert Volume - Enhanced */}
        <div className="bg-gradient-to-br from-white to-amber-50 dark:from-slate-800 dark:to-amber-900/10 rounded-xl border-2 border-amber-200 dark:border-amber-900 p-6 shadow-lg hover:shadow-xl transition-shadow flex flex-col">
          <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-5 flex items-center gap-2">
            <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            Distribución de Alertas
          </h3>
          <div className="flex-1 flex items-center justify-center">
            <DonutChart data={alertDistribution} size={180} thickness={25} />
          </div>
          <div className="mt-4 pt-4 border-t border-amber-100 dark:border-amber-900/30 grid grid-cols-2 gap-2 text-center">
            <div>
              <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">Total Alertas</p>
              <p className="text-lg font-bold text-slate-900 dark:text-white">{savedAlerts.length}</p>
            </div>
            <div>
              <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">Tipos Únicos</p>
              <p className="text-lg font-bold text-slate-900 dark:text-white">{alertDistribution.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* TRENDS & RANKING - Enhanced */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Weekly Trends - Enhanced */}
        <div className="bg-gradient-to-br from-white to-slate-50 dark:from-slate-800 dark:to-slate-900 rounded-xl border-2 border-slate-200 dark:border-slate-700 p-6 shadow-lg hover:shadow-xl transition-shadow">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <div className="p-2 bg-slate-100 dark:bg-slate-700 rounded-lg">
                <TrendingUp className="w-5 h-5 text-slate-600 dark:text-slate-400" />
              </div>
              Tendencia Semanal
            </h3>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-3 py-1 rounded-full">
              Últimos 7 días
            </span>
          </div>
          <TrendChart data={trendData} height={220} />
          <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 grid grid-cols-2 gap-4">
            <div className="text-center">
              <p className="text-xs text-slate-600 dark:text-slate-400 font-medium mb-1">Pico de Alertas</p>
              <p className="text-xl font-bold text-red-600 dark:text-red-400">
                {Math.max(...trendData.map(d => d.total))}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-slate-600 dark:text-slate-400 font-medium mb-1">Promedio Diario</p>
              <p className="text-xl font-bold text-blue-600 dark:text-blue-400">
                {Math.round(trendData.reduce((sum, d) => sum + d.total, 0) / 7)}
              </p>
            </div>
          </div>
        </div>

        {/* Driver Ranking (Worst Scores) - Enhanced */}
        <div className="bg-gradient-to-br from-white to-purple-50 dark:from-slate-800 dark:to-purple-900/10 rounded-xl border-2 border-purple-200 dark:border-purple-900 p-6 shadow-lg hover:shadow-xl transition-shadow flex flex-col">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                <Award className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
              Ranking de Conductores
            </h3>
            <span className="text-xs font-bold text-purple-700 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/30 px-3 py-1 rounded-full">
              Top {Math.min(8, vehicleStats.length)}
            </span>
          </div>
          <div className="overflow-auto max-h-[250px] pr-2 custom-scrollbar space-y-2.5">
            {vehicleStats.slice(0, 8).map((v, i) => (
              <div
                key={i}
                className={`flex items-center justify-between p-3 rounded-xl border transition-all hover:shadow-md ${
                  v.score < 60
                    ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-900/30'
                    : v.score < 80
                      ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-900/30'
                      : 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-900/30'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white text-sm shadow-lg ${
                      v.score < 60
                        ? 'bg-gradient-to-br from-red-500 to-red-600 shadow-red-500/50'
                        : v.score < 80
                          ? 'bg-gradient-to-br from-amber-500 to-amber-600 shadow-amber-500/50'
                          : 'bg-gradient-to-br from-green-500 to-green-600 shadow-green-500/50'
                    }`}
                  >
                    {v.score}
                  </div>
                  <div>
                    <p className="font-bold text-slate-900 dark:text-white text-sm">{v.driver}</p>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      {v.plate} • {v.alertCount} alertas
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-300">{v.contract}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {v.criticalCount > 0 ? `${v.criticalCount} críticas` : 'Sin críticas'}
                  </p>
                </div>
              </div>
            ))}
            {vehicleStats.length === 0 && (
              <div className="text-center py-10">
                <Award className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                <p className="text-sm text-slate-500 dark:text-slate-400">Sin datos suficientes para el ranking</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Current Idle Realtime - Enhanced */}
      {currentIdleVehicles.length > 0 && (
        <div className="bg-gradient-to-br from-orange-50 via-red-50 to-orange-50 dark:from-orange-900/20 dark:via-red-900/20 dark:to-orange-900/20 border-2 border-orange-300 dark:border-orange-800 rounded-2xl p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute inset-0 opacity-5">
            <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500 rounded-full -translate-y-1/2 translate-x-1/2"></div>
          </div>

          <div className="relative flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 bg-gradient-to-br from-orange-500 to-red-500 rounded-2xl flex items-center justify-center shadow-lg shadow-orange-500/50">
                <Clock className="w-7 h-7 text-white animate-pulse" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-orange-900 dark:text-orange-100">
                  Vehículos en Ralentí
                </h3>
                <p className="text-sm text-orange-700 dark:text-orange-300 font-medium">Alertas en Tiempo Real</p>
              </div>
            </div>
            <div className="text-center">
              <div className="bg-white dark:bg-slate-800 border-2 border-orange-300 dark:border-orange-700 px-6 py-3 rounded-2xl shadow-lg">
                <p className="text-4xl font-bold text-orange-600 dark:text-orange-400 animate-pulse">
                  {currentIdleVehicles.length}
                </p>
                <p className="text-xs text-orange-700 dark:text-orange-300 font-bold uppercase mt-1">Activos Ahora</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 relative">
            {currentIdleVehicles.map((v, i) => (
              <div
                key={i}
                className="bg-white dark:bg-slate-800 p-4 rounded-xl border-2 border-orange-200 dark:border-orange-800 shadow-lg hover:shadow-xl transition-all hover:scale-105"
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="font-bold text-lg text-slate-900 dark:text-white">{v.plate}</p>
                    <p className="text-xs text-slate-600 dark:text-slate-400 font-medium mt-0.5">
                      {v.driver || 'Sin conductor'}
                    </p>
                  </div>
                  <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center">
                    <Clock className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-orange-100 dark:border-orange-900/30">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[100px]">
                      {v.location || 'Ubicación desc.'}
                    </span>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                        {Math.round(v.durationMinutes)}
                      </p>
                      <p className="text-xs text-orange-700 dark:text-orange-500 font-medium">minutos</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
};
