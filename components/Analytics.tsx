import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  TrendingUp,
  Activity,
  AlertTriangle,
  Shield,
  Clock,
  Award,
  Users,
  Filter,
  X,
  Calendar,
  Truck,
  UserCheck
} from 'lucide-react';
import { Vehicle, Alert } from '../types';
import {
  getAllAutoSavedAlerts,
  getAlertStatistics,
  SavedAlert
} from '../services/databaseService';
import {
  getIdleTimeByContract,
  type IdleTimeRecord
} from '../services/towerControlService';
import { getCurrentIdleStats } from '../services/alertService';
import { TrendChart, DonutChart, ScoreGauge, EfficiencyBar, TrendInsights } from './AnalyticsCharts';

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

type DateRange = '7d' | '30d' | '90d' | 'custom';
type ChartView = 'daily' | 'weekly' | 'monthly';

export const Analytics: React.FC<AnalyticsProps> = ({ vehicles, alerts: realtimeAlerts = [] }) => {
  const [savedAlerts, setSavedAlerts] = useState<SavedAlert[]>([]);
  const [alertStats, setAlertStats] = useState<any>(null);
  const [idleRecords, setIdleRecords] = useState<IdleTimeRecord[]>([]);
  const [currentIdleVehicles, setCurrentIdleVehicles] = useState<
    Array<{ plate: string; durationMinutes: number; driver?: string; location?: string }>
  >([]);
  const [loading, setLoading] = useState(true);

  // Filtros avanzados
  const [showFilters, setShowFilters] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange>('30d');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [selectedContract, setSelectedContract] = useState<string>('ALL');
  const [selectedPlate, setSelectedPlate] = useState<string>('ALL');
  const [selectedDriver, setSelectedDriver] = useState<string>('ALL');
  const [chartView, setChartView] = useState<ChartView>('daily');

  // Opciones únicas para filtros
  const uniqueContracts = useMemo(() => {
    return Array.from(new Set(vehicles.map(v => v.contract).filter(Boolean)));
  }, [vehicles]);

  const uniquePlates = useMemo(() => {
    return Array.from(new Set(vehicles.map(v => v.plate).filter(Boolean)));
  }, [vehicles]);

  const uniqueDrivers = useMemo(() => {
    return Array.from(new Set(vehicles.map(v => v.driver).filter(d => d && d !== 'Sin Asignar')));
  }, [vehicles]);

  // Helpers
  const parseDateSafe = (s: string) => {
    if (!s) return null;
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  };

  const getDateRangeValues = useCallback(() => {
    const now = new Date();
    let start = new Date();
    let end = new Date();

    if (dateRange === 'custom' && customStartDate && customEndDate) {
      const s = parseDateSafe(customStartDate);
      const e = parseDateSafe(customEndDate);
      if (s && e) {
        // normalize to midnight start and end 23:59:59
        s.setHours(0, 0, 0, 0);
        e.setHours(23, 59, 59, 999);
        // ensure start <= end
        if (s > e) {
          return { start: e, end: s };
        }
        return { start: s, end: e };
      }
    }

    switch (dateRange) {
      case '7d':
        start = new Date(now);
        start.setDate(now.getDate() - 6); // include today => 7 points
        start.setHours(0, 0, 0, 0);
        end = new Date(now);
        end.setHours(23, 59, 59, 999);
        break;
      case '90d':
        start = new Date(now);
        start.setDate(now.getDate() - 89);
        start.setHours(0, 0, 0, 0);
        end = new Date(now);
        end.setHours(23, 59, 59, 999);
        break;
      case '30d':
      default:
        start = new Date(now);
        start.setDate(now.getDate() - 29);
        start.setHours(0, 0, 0, 0);
        end = new Date(now);
        end.setHours(23, 59, 59, 999);
        break;
    }

    return { start, end };
  }, [dateRange, customStartDate, customEndDate]);

  // Safe max helper
  const safeMax = (arr: number[]) => (arr.length ? Math.max(...arr) : 0);

  const formatMinutes = (mins: number) => {
    if (!mins) return '0';
    if (mins < 60) return `${Math.round(mins)} m`;
    const hrs = Math.floor(mins / 60);
    const rem = Math.round(mins % 60);
    return `${hrs}h ${rem}m`;
  };

  // Load analytics with cancellation token (prevents race conditions)
  const loadAnalytics = useCallback(async (signalToken?: number) => {
    setLoading(true);
    const token = typeof signalToken === 'number' ? signalToken : Date.now();

    try {
      // 1) saved alerts from saved_alerts table (auto-saved)
      const alertsResult = await getAllAutoSavedAlerts();
      if (alertsResult?.success && alertsResult?.data) {
        // If a newer request started, ignore
        if (token !== latestRequestRef.current) return;
        setSavedAlerts(alertsResult.data);
      } else {
        setSavedAlerts([]);
      }

      // 2) alert statistics (optional)
      try {
        const statsResult = await getAlertStatistics();
        if (statsResult?.success) {
          setAlertStats(statsResult.data || null);
        }
      } catch (err) {
        // keep going on partial failure
        setAlertStats(null);
        // eslint-disable-next-line no-console
        console.warn('getAlertStatistics failed', err);
      }

      // 3) idle records per contract with current filters
      const { start, end } = getDateRangeValues();
      const contractsToLoad =
        selectedContract === 'ALL' ? uniqueContracts : [selectedContract];

      const allIdleRecords: IdleTimeRecord[] = [];
      for (const contract of contractsToLoad) {
        try {
          const idleResult = await getIdleTimeByContract(
            contract,
            start.toISOString(),
            end.toISOString()
          );
          if (token !== latestRequestRef.current) return; // another request happened
          if (idleResult?.success && idleResult?.data?.records) {
            allIdleRecords.push(...idleResult.data.records);
          }
        } catch (err) {
          // ignore contract errors but log
          // eslint-disable-next-line no-console
          console.warn('getIdleTimeByContract failed for', contract, err);
        }
      }
      if (token !== latestRequestRef.current) return;
      setIdleRecords(allIdleRecords);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('loadAnalytics error', err);
    } finally {
      if (token === latestRequestRef.current) setLoading(false);
    }
  }, [selectedContract, uniqueContracts, getDateRangeValues]);

  // Keep ref of latest request token
  const latestRequestRef = React.useRef<number>(Date.now());

  // Trigger load when filters change
  useEffect(() => {
    const token = Date.now();
    latestRequestRef.current = token;
    void loadAnalytics(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange, customStartDate, customEndDate, selectedContract]);

  // Update 'current idle' periodically (supports async)
  useEffect(() => {
    let mounted = true;
    const update = () => {
      try {
        const res = getCurrentIdleStats();
        if (!mounted) return;
        setCurrentIdleVehicles(res || []);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('getCurrentIdleStats failed', err);
        if (mounted) setCurrentIdleVehicles([]);
      }
    };

    // initial
    void update();
    const interval = setInterval(update, 30000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  // Filtrar alertas según filtros activos
  const filteredAlerts = useMemo(() => {
    const { start, end } = getDateRangeValues();

    return savedAlerts.filter(alert => {
      const alertDate = new Date(alert.timestamp);
      if (isNaN(alertDate.getTime())) return false;

      // Fecha
      if (alertDate < start || alertDate > end) return false;

      // Contrato
      if (selectedContract !== 'ALL' && alert.contract !== selectedContract) return false;

      // Placa
      if (selectedPlate !== 'ALL' && alert.plate !== selectedPlate) return false;

      // Conductor
      if (selectedDriver !== 'ALL' && alert.driver !== selectedDriver) return false;

      return true;
    });
  }, [savedAlerts, dateRange, customStartDate, customEndDate, selectedContract, selectedPlate, selectedDriver, getDateRangeValues]);

  // Trend data (daily/weekly/monthly) with idle time included
  const trendData = useMemo(() => {
    const { start, end } = getDateRangeValues();

    // utility to generate date buckets
    type Point = { date: Date; label: string; total: number; critical: number; idle: number };

    const daysNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

    let points: Point[] = [];

    if (chartView === 'daily') {
      const msPerDay = 1000 * 60 * 60 * 24;
      const daysDiff = Math.ceil((end.getTime() - start.getTime() + 1) / msPerDay);
      const numDays = Math.min(Math.max(daysDiff, 1), 90); // cap to 90 for performance
      for (let i = 0; i < numDays; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        d.setHours(0, 0, 0, 0);
        points.push({
          date: d,
          label: `${daysNames[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`,
          total: 0,
          critical: 0,
          idle: 0
        });
      }
    } else if (chartView === 'weekly') {
      // create weekly buckets starting from the start date (week ending)
      const msPerWeek = 1000 * 60 * 60 * 24 * 7;
      const weeksDiff = Math.ceil((end.getTime() - start.getTime() + 1) / msPerWeek);
      const numWeeks = Math.min(Math.max(weeksDiff, 1), 52);
      for (let i = 0; i < numWeeks; i++) {
        const weekStart = new Date(start);
        weekStart.setDate(start.getDate() + i * 7);
        weekStart.setHours(0, 0, 0, 0);
        const label = `Semana ${weekStart.getDate()}/${weekStart.getMonth() + 1}`;
        points.push({
          date: new Date(weekStart.getTime() + (1000 * 60 * 60 * 24 * 6)), // week end
          label,
          total: 0,
          critical: 0,
          idle: 0
        });
      }
    } else {
      // monthly
      const startMonth = start.getMonth();
      const startYear = start.getFullYear();
      let monthsDiff =
        (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
      monthsDiff = Math.min(Math.max(monthsDiff, 1), 24); // cap to 24 months
      for (let i = 0; i < monthsDiff; i++) {
        const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
        points.push({
          date: d,
          label: `${months[d.getMonth()]} ${d.getFullYear()}`,
          total: 0,
          critical: 0,
          idle: 0
        });
      }
    }

    // Populate alerts
    filteredAlerts.forEach(alert => {
      const aDate = new Date(alert.timestamp);
      if (isNaN(aDate.getTime())) return;

      let point: Point | undefined;
      if (chartView === 'daily') {
        point = points.find(p =>
          p.date.getFullYear() === aDate.getFullYear() &&
          p.date.getMonth() === aDate.getMonth() &&
          p.date.getDate() === aDate.getDate()
        );
      } else if (chartView === 'weekly') {
        point = points.find(p => {
          const weekEnd = p.date;
          const weekStart = new Date(weekEnd);
          weekStart.setDate(weekEnd.getDate() - 6);
          return aDate >= weekStart && aDate <= weekEnd;
        });
      } else {
        point = points.find(p =>
          p.date.getFullYear() === aDate.getFullYear() &&
          p.date.getMonth() === aDate.getMonth()
        );
      }

      if (point) {
        point.total += 1;
        if (alert.severity === 'critical') point.critical += 1;
      }
    });

    idleRecords.forEach(record => {
      const rDate = new Date(record.start_datetime || record.created_at || '');
      if (isNaN(rDate.getTime())) return;

      let point: Point | undefined;
      if (chartView === 'daily') {
        point = points.find(p =>
          p.date.getFullYear() === rDate.getFullYear() &&
          p.date.getMonth() === rDate.getMonth() &&
          p.date.getDate() === rDate.getDate()
        );
      } else if (chartView === 'weekly') {
        point = points.find(p => {
          const weekEnd = p.date;
          const weekStart = new Date(weekEnd);
          weekStart.setDate(weekEnd.getDate() - 6);
          return rDate >= weekStart && rDate <= weekEnd;
        });
      } else {
        point = points.find(p =>
          p.date.getFullYear() === rDate.getFullYear() &&
          p.date.getMonth() === rDate.getMonth()
        );
      }

      if (point) {
        point.idle += (record.duration_minutes || 0) / 60;
      }
    });

    return points;
  }, [filteredAlerts, idleRecords, chartView, getDateRangeValues]);

  // Alert distribution (top types)
  const alertDistribution = useMemo(() => {
    const dist = new Map<string, number>();
    filteredAlerts.forEach(a => {
      const t = a.type || 'Otros';
      dist.set(t, (dist.get(t) || 0) + 1);
    });

    const sorted = Array.from(dist.entries()).sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 4);
    const others = sorted.slice(4).reduce((s, it) => s + it[1], 0);

    const colors = ['#3b82f6', '#ef4444', '#f59e0b', '#10b981', '#64748b'];

    const data = top.map((item, i) => ({
      name: item[0],
      value: item[1],
      color: colors[i] ?? colors[4]
    }));

    if (others > 0) {
      data.push({ name: 'Otros', value: others, color: colors[4] });
    }

    return data;
  }, [filteredAlerts]);

  // Vehicle stats (with filters) - ranked worst first (lowest score)
  const vehicleStats: VehicleAlertStats[] = useMemo(() => {
    const map = new Map<string, VehicleAlertStats>();

    // seed from vehicles (apply vehicle filters)
    vehicles.forEach(v => {
      if (selectedContract !== 'ALL' && v.contract !== selectedContract) return;
      if (selectedPlate !== 'ALL' && v.plate !== selectedPlate) return;
      if (selectedDriver !== 'ALL' && v.driver !== selectedDriver) return;

      map.set(v.plate, {
        plate: v.plate,
        driver: v.driver || 'Sin asignar',
        contract: v.contract || 'Sin Contrato',
        alertCount: 0,
        criticalCount: 0,
        lastAlert: undefined,
        score: 100
      });
    });

    // also include any alert plates not in seeded list (so alerts are not lost)
    filteredAlerts.forEach(alert => {
      if (!map.has(alert.plate)) {
        map.set(alert.plate, {
          plate: alert.plate,
          driver: alert.driver || 'Desconocido',
          contract: alert.contract || 'Sin Contrato',
          alertCount: 0,
          criticalCount: 0,
          lastAlert: undefined,
          score: 100
        });
      }

      const s = map.get(alert.plate)!;
      s.alertCount++;
      if (alert.severity === 'critical') s.criticalCount++;

      // score deduction rules (configurable later)
      let penalty = 0;
      if (alert.severity === 'critical') penalty = 5;
      else if (alert.severity === 'high') penalty = 3;
      else if (alert.severity === 'medium') penalty = 1;

      s.score = Math.max(0, s.score - penalty);

      if (!s.lastAlert || new Date(alert.timestamp) > new Date(s.lastAlert)) {
        s.lastAlert = alert.timestamp;
      }
    });

    const arr = Array.from(map.values());
    // sort ascending by score (lowest => worst)
    arr.sort((a, b) => a.score - b.score || b.alertCount - a.alertCount);
    return arr;
  }, [vehicles, filteredAlerts, selectedContract, selectedPlate, selectedDriver]);

  // Average fleet score
  const averageFleetScore = useMemo(() => {
    if (vehicleStats.length === 0) return 100;
    const total = vehicleStats.reduce((s, v) => s + v.score, 0);
    return Math.round(total / vehicleStats.length);
  }, [vehicleStats]);

  // Overall metrics
  const overallMetrics = useMemo(() => {
    const totalVehicles = vehicles.length;
    const moving = vehicles.filter(v => (v.speed ?? 0) > 0).length;
    const idleCount = currentIdleVehicles.length;
    const stopped = Math.max(0, totalVehicles - moving - idleCount);

    const totalIdleMinutes = idleRecords.reduce((s, r) => s + (r.duration_minutes || 0), 0);
    const totalIdleHours = Math.round((totalIdleMinutes / 60) * 10) / 10;

    return { totalVehicles, totalIdleHours, moving, idle: idleCount, stopped };
  }, [vehicles, idleRecords, currentIdleVehicles]);

  // Trend insights calculation (comparing first half vs second half of data)
  // IMPORTANT: This useMemo must be BEFORE any conditional returns to comply with React hooks rules
  const trendInsightsData = useMemo(() => {
    if (trendData.length < 2) return [];

    const midPoint = Math.floor(trendData.length / 2);
    const firstHalf = trendData.slice(0, midPoint);
    const secondHalf = trendData.slice(midPoint);

    // Totals for each period
    const firstTotalAlerts = firstHalf.reduce((s, d) => s + d.total, 0);
    const secondTotalAlerts = secondHalf.reduce((s, d) => s + d.total, 0);
    const firstCritical = firstHalf.reduce((s, d) => s + d.critical, 0);
    const secondCritical = secondHalf.reduce((s, d) => s + d.critical, 0);
    const firstIdle = firstHalf.reduce((s, d) => s + (d.idle || 0), 0);
    const secondIdle = secondHalf.reduce((s, d) => s + (d.idle || 0), 0);

    // Calculate percentage changes
    const alertChange = firstTotalAlerts > 0
      ? ((secondTotalAlerts - firstTotalAlerts) / firstTotalAlerts) * 100
      : secondTotalAlerts > 0 ? 100 : 0;

    const criticalChange = firstCritical > 0
      ? ((secondCritical - firstCritical) / firstCritical) * 100
      : secondCritical > 0 ? 100 : 0;

    const idleChange = firstIdle > 0
      ? ((secondIdle - firstIdle) / firstIdle) * 100
      : secondIdle > 0 ? 100 : 0;

    // Find worst day (highest alerts)
    const worstDay = trendData.reduce((max, d) => d.total > (max?.total || 0) ? d : max, trendData[0]);

    // Find day with most idle
    const worstIdleDay = trendData.reduce((max, d) => (d.idle || 0) > (max?.idle || 0) ? d : max, trendData[0]);

    return [
      {
        label: 'Alertas Totales',
        value: secondTotalAlerts,
        change: alertChange,
        changeLabel: 'vs período ant.',
        icon: alertChange > 0 ? 'up' : alertChange < 0 ? 'down' : 'neutral',
        color: alertChange > 5 ? 'red' : alertChange < -5 ? 'green' : 'slate'
      },
      {
        label: 'Alertas Críticas',
        value: secondCritical,
        change: criticalChange,
        changeLabel: 'vs período ant.',
        icon: criticalChange > 0 ? 'up' : criticalChange < 0 ? 'down' : 'neutral',
        color: criticalChange > 5 ? 'red' : criticalChange < -5 ? 'green' : 'amber'
      },
      {
        label: 'Ralentí (horas)',
        value: `${Math.round(secondIdle * 10) / 10}h`,
        change: idleChange,
        changeLabel: 'vs período ant.',
        icon: idleChange > 0 ? 'up' : idleChange < 0 ? 'down' : 'neutral',
        color: idleChange > 5 ? 'red' : idleChange < -5 ? 'green' : 'amber'
      },
      {
        label: 'Día Crítico',
        value: worstDay?.label || 'N/A',
        color: 'blue'
      }
    ] as Array<{
      label: string;
      value: string | number;
      change?: number;
      changeLabel?: string;
      icon?: 'up' | 'down' | 'neutral';
      color?: 'green' | 'red' | 'amber' | 'blue' | 'slate';
    }>;
  }, [trendData]);

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

  // convenience values for display
  const trendTotals = trendData.map(d => d.total);
  const trendPeak = safeMax(trendTotals);
  const trendAvg = Math.round((trendTotals.reduce((s, n) => s + n, 0) / (trendTotals.length || 1)) * 10) / 10;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">

      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 via-blue-600 to-cyan-600 dark:from-purple-800 dark:via-blue-800 dark:to-cyan-800 rounded-2xl p-8 text-white shadow-2xl relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <div className="absolute top-0 right-0 w-96 h-96 bg-white rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-white rounded-full translate-y-1/2 -translate-x-1/2" />
        </div>

        <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold mb-3">Análisis Avanzado de Flota</h1>
            <p className="text-blue-100 text-base">Métricas, tendencias y puntajes de seguridad para la gestión operativa</p>
          </div>

          <div className="grid grid-cols-3 gap-6">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center mb-2 border-2 border-white/30">
                <TrendingUp className="w-8 h-8" />
              </div>
              <p className="text-2xl font-bold">{filteredAlerts.length}</p>
              <p className="text-xs text-blue-200">Alertas filtradas</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 mx-auto bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center mb-2 border-2 border-white/30">
                <Users className="w-8 h-8" />
              </div>
              <p className="text-2xl font-bold">{vehicleStats.length}</p>
              <p className="text-xs text-blue-200">Vehículos en análisis</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 mx-auto bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center mb-2 border-2 border-white/30">
                <Clock className="w-8 h-8" />
              </div>
              <p className="text-2xl font-bold">{overallMetrics.totalIdleHours}h</p>
              <p className="text-xs text-blue-200">Ralentí ({dateRange === '7d' ? '7d' : dateRange === '90d' ? '90d' : dateRange === 'custom' ? 'Custom' : '30d'})</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border-2 border-slate-200 dark:border-slate-700 shadow-lg overflow-hidden">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Filter className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="text-left">
              <h3 className="font-bold text-slate-900 dark:text-white">Filtros Avanzados</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {filteredAlerts.length} de {savedAlerts.length} alertas • {dateRange === '7d' ? '7 días' : dateRange === '30d' ? '30 días' : dateRange === '90d' ? '90 días' : 'Personalizado'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(selectedContract !== 'ALL' || selectedPlate !== 'ALL' || selectedDriver !== 'ALL' || dateRange === 'custom') && (
              <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs font-bold rounded-full">Filtros activos</span>
            )}
            <span className={`transform transition-transform ${showFilters ? 'rotate-180' : ''}`}>▼</span>
          </div>
        </button>

        {showFilters && (
          <div className="px-6 pb-6 pt-2 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/30">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              {/* Date Range */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  Rango de Fecha
                </label>
                <select
                  value={dateRange}
                  onChange={(e) => setDateRange(e.target.value as DateRange)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-50"
                >
                  <option value="7d">Últimos 7 días</option>
                  <option value="30d">Últimos 30 días</option>
                  <option value="90d">Últimos 90 días</option>
                  <option value="custom">Personalizado</option>
                </select>
              </div>

              {/* Contract */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">Contrato</label>
                <select
                  value={selectedContract}
                  onChange={(e) => setSelectedContract(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-50"
                >
                  <option value="ALL">Todos los contratos</option>
                  {uniqueContracts.map(contract => (
                    <option key={contract} value={contract}>{contract}</option>
                  ))}
                </select>
              </div>

              {/* Plate */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-1">
                  <Truck className="w-4 h-4" />
                  Placa
                </label>
                <select
                  value={selectedPlate}
                  onChange={(e) => setSelectedPlate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-50"
                >
                  <option value="ALL">Todas las placas</option>
                  {uniquePlates.slice(0, 200).map(plate => (
                    <option key={plate} value={plate}>{plate}</option>
                  ))}
                </select>
              </div>

              {/* Driver */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-1">
                  <UserCheck className="w-4 h-4" />
                  Conductor
                </label>
                <select
                  value={selectedDriver}
                  onChange={(e) => setSelectedDriver(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-50"
                >
                  <option value="ALL">Todos los conductores</option>
                  {uniqueDrivers.slice(0, 200).map(driver => (
                    <option key={driver} value={driver}>{driver}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Custom dates */}
            {dateRange === 'custom' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <div>
                  <label className="block text-xs font-bold text-blue-900 dark:text-blue-300 mb-2">Fecha Inicio</label>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="w-full px-3 py-2 border border-blue-300 dark:border-blue-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-blue-900 dark:text-blue-300 mb-2">Fecha Fin</label>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="w-full px-3 py-2 border border-blue-300 dark:border-blue-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    onClick={() => {
                      const token = Date.now();
                      latestRequestRef.current = token;
                      void loadAnalytics(token);
                    }}
                    className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                  >
                    Aplicar Fechas
                  </button>
                </div>
              </div>
            )}

            {/* Chart view */}
            <div className="mt-4 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
              <label className="block text-xs font-bold text-purple-900 dark:text-purple-300 mb-3">Vista de Tendencias</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setChartView('daily')}
                  className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${chartView === 'daily' ? 'bg-purple-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-purple-100 dark:hover:bg-purple-900/30'}`}
                >
                  Diaria
                </button>
                <button
                  onClick={() => setChartView('weekly')}
                  className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${chartView === 'weekly' ? 'bg-purple-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-purple-100 dark:hover:bg-purple-900/30'}`}
                >
                  Semanal
                </button>
                <button
                  onClick={() => setChartView('monthly')}
                  className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${chartView === 'monthly' ? 'bg-purple-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-purple-100 dark:hover:bg-purple-900/30'}`}
                >
                  Mensual
                </button>
              </div>
            </div>

            {/* Clear filters */}
            {(selectedContract !== 'ALL' || selectedPlate !== 'ALL' || selectedDriver !== 'ALL' || dateRange !== '30d') && (
              <div className="mt-4 flex justify-end">
                <button
                  onClick={() => {
                    setSelectedContract('ALL');
                    setSelectedPlate('ALL');
                    setSelectedDriver('ALL');
                    setDateRange('30d');
                    setCustomStartDate('');
                    setCustomEndDate('');
                    const token = Date.now();
                    latestRequestRef.current = token;
                    void loadAnalytics(token);
                  }}
                  className="px-4 py-2 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg font-medium hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors flex items-center gap-2"
                >
                  <X className="w-4 h-4" />
                  Limpiar Filtros
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Scorecard & Efficiency */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Fleet Score */}
        <div className="relative bg-gradient-to-br from-white to-blue-50 dark:from-slate-800 dark:to-slate-900 rounded-xl border-2 border-blue-200 dark:border-blue-900 p-6 shadow-lg hover:shadow-xl transition-shadow">
          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
            <Shield className="w-32 h-32 text-slate-900 dark:text-white" />
          </div>
          <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-2 z-10">Puntaje de Seguridad</h3>
          <div className="flex flex-col items-center">
            <ScoreGauge score={averageFleetScore} label="Índice Global" size={160} />
            <p className="text-sm text-center text-slate-600 dark:text-slate-400 mt-2 z-10 max-w-[240px] font-medium">Calidad de conducción basada en infracciones y alertas</p>
            <div className={`mt-3 px-4 py-2 rounded-full text-sm font-bold ${averageFleetScore >= 80 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : averageFleetScore >= 60 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
              {averageFleetScore >= 80 ? '✓ Excelente' : averageFleetScore >= 60 ? '⚠ Mejorable' : '✗ Crítico'}
            </div>
          </div>
        </div>

        {/* Efficiency */}
        <div className="bg-gradient-to-br from-white to-green-50 dark:from-slate-800 dark:to-green-900/10 rounded-xl border-2 border-green-200 dark:border-green-900 p-6 shadow-lg hover:shadow-xl transition-shadow">
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
              <p className="text-3xl font-bold text-orange-900 dark:text-orange-200">{formatMinutes(overallMetrics.totalIdleHours * 60)}</p>
              <p className="text-xs text-orange-600 dark:text-orange-500 mt-1">Periodo seleccionado</p>
            </div>
            <div className="bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 p-4 rounded-xl border border-blue-200 dark:border-blue-800 shadow-sm">
              <p className="text-xs text-blue-700 dark:text-blue-400 font-bold uppercase mb-1">Flota Activa</p>
              <p className="text-3xl font-bold text-blue-900 dark:text-blue-200">{overallMetrics.moving + overallMetrics.idle}</p>
              <p className="text-xs text-blue-600 dark:text-blue-500 mt-1">{Math.round(((overallMetrics.moving + overallMetrics.idle) / Math.max(overallMetrics.totalVehicles, 1)) * 100)}% del total</p>
            </div>
          </div>
        </div>

        {/* Alert Volume */}
        <div className="bg-gradient-to-br from-white to-amber-50 dark:from-slate-800 dark:to-amber-900/10 rounded-xl border-2 border-amber-200 dark:border-amber-900 p-6 shadow-lg hover:shadow-xl transition-shadow">
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
              <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">Alertas Filtradas</p>
              <p className="text-lg font-bold text-slate-900 dark:text-white">{filteredAlerts.length}</p>
            </div>
            <div>
              <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">Tipos Únicos</p>
              <p className="text-lg font-bold text-slate-900 dark:text-white">{alertDistribution.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Trends & Ranking */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Trends */}
        <div className="bg-gradient-to-br from-white to-slate-50 dark:from-slate-800 dark:to-slate-900 rounded-xl border-2 border-slate-200 dark:border-slate-700 p-6 shadow-lg hover:shadow-xl transition-shadow">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <div className="p-2 bg-slate-100 dark:bg-slate-700 rounded-lg">
                <TrendingUp className="w-5 h-5 text-slate-600 dark:text-slate-400" />
              </div>
              Tendencia {chartView === 'daily' ? 'Diaria' : chartView === 'weekly' ? 'Semanal' : 'Mensual'}
            </h3>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-3 py-1 rounded-full">
              {chartView === 'daily' ? 'Por día' : chartView === 'weekly' ? 'Por semana' : 'Por mes'}
            </span>
          </div>
          <TrendChart data={trendData} height={220} showIdle={true} />
          <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 grid grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-xs text-slate-600 dark:text-slate-400 font-medium mb-1">Pico de Alertas</p>
              <p className="text-xl font-bold text-red-600 dark:text-red-400">{trendPeak}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-slate-600 dark:text-slate-400 font-medium mb-1">Promedio</p>
              <p className="text-xl font-bold text-blue-600 dark:text-blue-400">{trendAvg}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-slate-600 dark:text-slate-400 font-medium mb-1">Total Ralentí</p>
              <p className="text-xl font-bold text-orange-600 dark:text-orange-400">{Math.round(trendData.reduce((sum, p) => sum + (p.idle || 0), 0) * 10) / 10}h</p>
            </div>
          </div>
        </div>

        {/* Driver ranking */}
        <div className="bg-gradient-to-br from-white to-purple-50 dark:from-slate-800 dark:to-purple-900/10 rounded-xl border-2 border-purple-200 dark:border-purple-900 p-6 shadow-lg hover:shadow-xl transition-shadow">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                <Award className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
              Ranking de Conductores
            </h3>
            <span className="text-xs font-bold text-purple-700 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/30 px-3 py-1 rounded-full">Top {Math.min(8, vehicleStats.length)}</span>
          </div>

          <div className="overflow-auto max-h-[250px] pr-2 custom-scrollbar space-y-2.5">
            {vehicleStats.length === 0 && (
              <div className="text-center py-10">
                <Award className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                <p className="text-sm text-slate-500 dark:text-slate-400">Sin datos suficientes para el ranking</p>
              </div>
            )}

            {vehicleStats.slice(0, 8).map((v) => (
              <div
                key={v.plate}
                className={`flex items-center justify-between p-3 rounded-xl border transition-all hover:shadow-md ${v.score < 60
                  ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-900/30'
                  : v.score < 80
                    ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-900/30'
                    : 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-900/30'
                  }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white text-sm shadow-lg ${v.score < 60
                    ? 'bg-gradient-to-br from-red-500 to-red-600 shadow-red-500/50'
                    : v.score < 80
                      ? 'bg-gradient-to-br from-amber-500 to-amber-600 shadow-amber-500/50'
                      : 'bg-gradient-to-br from-green-500 to-green-600 shadow-green-500/50'
                    }`}>
                    {v.score}
                  </div>
                  <div>
                    <p className="font-bold text-slate-900 dark:text-white text-sm">{v.driver}</p>
                    <p className="text-xs text-slate-600 dark:text-slate-400">{v.plate} • {v.alertCount} alertas</p>
                  </div>
                </div>

                <div className="text-right">
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-300">{v.contract}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{v.criticalCount > 0 ? `${v.criticalCount} críticas` : 'Sin críticas'}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Trend Insights */}
      {trendInsightsData.length > 0 && (
        <div className="bg-gradient-to-br from-white to-indigo-50 dark:from-slate-800 dark:to-indigo-900/10 rounded-xl border-2 border-indigo-200 dark:border-indigo-900 p-6 shadow-lg hover:shadow-xl transition-shadow">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
                <TrendingUp className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              Insights de Tendencia
            </h3>
            <span className="text-xs font-medium text-indigo-700 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-900/30 px-3 py-1 rounded-full">
              Comparación de períodos
            </span>
          </div>
          <TrendInsights insights={trendInsightsData} />
        </div>
      )}

      {/* Current idle vehicles */}
      {currentIdleVehicles.length > 0 && (
        <div className="bg-gradient-to-br from-orange-50 via-red-50 to-orange-50 dark:from-orange-900/20 dark:via-red-900/20 dark:to-orange-900/20 border-2 border-orange-300 dark:border-orange-800 rounded-xl p-6 relative overflow-hidden">
          <div className="absolute inset-0 opacity-5 pointer-events-none">
            <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500 rounded-full -translate-y-1/2 translate-x-1/2" />
          </div>

          <div className="relative flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 bg-gradient-to-br from-orange-500 to-red-500 rounded-2xl flex items-center justify-center shadow-lg shadow-orange-500/50">
                <Clock className="w-7 h-7 text-white animate-pulse" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-orange-900 dark:text-orange-100">Vehículos en Ralentí</h3>
                <p className="text-sm text-orange-700 dark:text-orange-300 font-medium">Estado en tiempo real</p>
              </div>
            </div>

            <div className="text-center">
              <div className="bg-white dark:bg-slate-800 border-2 border-orange-300 dark:border-orange-700 px-6 py-3 rounded-2xl shadow-lg">
                <p className="text-4xl font-bold text-orange-600 dark:text-orange-400 animate-pulse">{currentIdleVehicles.length}</p>
                <p className="text-xs text-orange-700 dark:text-orange-300 font-bold uppercase mt-1">Activos Ahora</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 relative">
            {currentIdleVehicles.map((v) => (
              <div
                key={v.plate}
                className="bg-white dark:bg-slate-800 p-4 rounded-xl border-2 border-orange-200 dark:border-orange-800 shadow-lg hover:shadow-xl transition-all hover:scale-105"
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="font-bold text-lg text-slate-900 dark:text-white">{v.plate}</p>
                    <p className="text-xs text-slate-600 dark:text-slate-400 font-medium mt-0.5">{v.driver || 'Sin conductor'}</p>
                  </div>
                  <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center">
                    <Clock className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-orange-100 dark:border-orange-900/30">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[120px]">{v.location || 'Ubicación desc.'}</span>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{Math.round(v.durationMinutes)}</p>
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
