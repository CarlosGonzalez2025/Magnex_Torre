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

      {/* HEADER: Scorecard & Efficiency */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Fleet Score */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm flex flex-col items-center justify-center relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
            <Shield className="w-32 h-32 text-slate-900 dark:text-white" />
          </div>
          <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-2 z-10">Puntaje de Seguridad</h3>
          <ScoreGauge score={averageFleetScore} label="Índice Global" size={160} />
          <p className="text-sm text-center text-slate-500 dark:text-slate-400 mt-2 z-10 max-w-[200px]">
            Calidad de conducción basada en infracciones y alertas.
          </p>
        </div>

        {/* Efficiency & Utilization */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-500" />
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

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-orange-50 dark:bg-orange-900/20 p-3 rounded-lg border border-orange-100 dark:border-orange-800">
              <p className="text-xs text-orange-600 dark:text-orange-400 font-semibold uppercase">Ralentí (30d)</p>
              <p className="text-2xl font-bold text-orange-800 dark:text-orange-200">{overallMetrics.totalIdleHours}h</p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-100 dark:border-blue-800">
              <p className="text-xs text-blue-600 dark:text-blue-400 font-semibold uppercase">Flota Activa</p>
              <p className="text-2xl font-bold text-blue-800 dark:text-blue-200">{overallMetrics.moving + overallMetrics.idle}</p>
            </div>
          </div>
        </div>

        {/* Alert Volume */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm flex flex-col">
          <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Distribución de Alertas
          </h3>
          <div className="flex-1 flex items-center justify-center">
            <DonutChart data={alertDistribution} size={180} thickness={25} />
          </div>
        </div>
      </div>

      {/* TRENDS & RANKING */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Weekly Trends */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-6 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-slate-500 dark:text-slate-400" />
            Tendencia Semanal (Últimos 7 días)
          </h3>
          <TrendChart data={trendData} height={220} />
        </div>

        {/* Driver Ranking (Worst Scores) */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm flex flex-col">
          <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
            <Award className="w-5 h-5 text-slate-500 dark:text-slate-400" />
            Ranking de Conductores (Requieren Atención)
          </h3>
          <div className="overflow-auto max-h-[250px] pr-2 custom-scrollbar">
            {vehicleStats.slice(0, 8).map((v, i) => (
              <div key={i} className="flex items-center justify-between p-3 mb-2 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-100 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-white text-sm ${v.score < 60 ? 'bg-red-500' : v.score < 80 ? 'bg-amber-400' : 'bg-green-500'}`}>
                    {v.score}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800 dark:text-white text-sm">{v.driver}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{v.plate} • {v.alertCount} alertas</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xs font-medium text-slate-400">Contrato</span>
                  <p className="text-xs text-slate-600 dark:text-slate-300">{v.contract}</p>
                </div>
              </div>
            ))}
            {vehicleStats.length === 0 && (
              <p className="text-center text-slate-400 py-10">Sin datos suficientes para el ranking</p>
            )}
          </div>
        </div>
      </div>

      {/* Current Idle Realtime */}
      {currentIdleVehicles.length > 0 && (
        <div className="bg-gradient-to-r from-orange-50 to-white dark:from-orange-900/20 dark:to-slate-800 border border-orange-200 dark:border-orange-800 rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-orange-900 dark:text-orange-200 flex items-center gap-2">
              <Clock className="w-5 h-5 text-orange-600 dark:text-orange-400 animate-pulse" />
              Vehículos en Ralentí (Tiempo Real)
            </h3>
            <span className="bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 px-3 py-1 rounded-full text-xs font-bold animate-pulse">
              {currentIdleVehicles.length} Activos
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {currentIdleVehicles.map((v, i) => (
              <div key={i} className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-orange-100 dark:border-orange-800 shadow-sm flex justify-between items-center">
                <div>
                  <p className="font-bold text-slate-800 dark:text-white">{v.plate}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[120px]">{v.location || 'Ubicación desc.'}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-orange-600 dark:text-orange-400">{Math.round(v.durationMinutes)}m</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
};
