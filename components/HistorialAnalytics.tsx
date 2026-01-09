import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  BarChart3,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Clock,
  FileDown,
  Calendar,
  Users,
  Car,
  AlertCircle,
  Target,
  Activity,
  Award,
  Timer
} from 'lucide-react';
import {
  getAllSavedAlerts,
  SavedAlertWithPlans
} from '../services/databaseService';
import { useExportToExcel } from '../hooks/useExportToExcel';

interface AnalyticsData {
  totalAlerts: number;
  criticalAlerts: number;
  highAlerts: number;
  mediumAlerts: number;
  lowAlerts: number;
  pendingAlerts: number;
  inProgressAlerts: number;
  resolvedAlerts: number;
  averageResolutionTime: number;
  topVehicles: Array<{ plate: string; count: number }>;
  topDrivers: Array<{ driver: string; count: number }>;
  alertsByType: Array<{ type: string; count: number }>;
  dailyStats: Array<{ date: string; count: number; dateObj: Date }>;
}

type DateRangeType = 'today' | 'week' | 'month' | 'custom';

export const HistorialAnalytics: React.FC = () => {
  const [alerts, setAlerts] = useState<SavedAlertWithPlans[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRangeType>('today');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const { exportToExcel } = useExportToExcel();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getAllSavedAlerts();
      if (result.success && result.data) {
        setAlerts(result.data);
      } else {
        setError('No se pudieron cargar las alertas');
      }
    } catch (err) {
      setError('Error al cargar los datos: ' + (err instanceof Error ? err.message : 'Error desconocido'));
      console.error('Error loading alerts:', err);
    } finally {
      setLoading(false);
    }
  };

  // Validar rango de fechas personalizado
  const isValidCustomRange = useMemo(() => {
    if (dateRange !== 'custom') return true;
    if (!startDate || !endDate) return false;
    return new Date(startDate) <= new Date(endDate);
  }, [dateRange, startDate, endDate]);

  // Filtrar alertas según el rango de fecha seleccionado
  const filteredAlerts = useMemo(() => {
    const now = new Date();
    let filterStartDate: Date;
    let filterEndDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    switch (dateRange) {
      case 'today':
        filterStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        break;
      case 'week':
        filterStartDate = new Date(now);
        filterStartDate.setDate(now.getDate() - 7);
        filterStartDate.setHours(0, 0, 0, 0);
        break;
      case 'month':
        filterStartDate = new Date(now);
        filterStartDate.setDate(now.getDate() - 30);
        filterStartDate.setHours(0, 0, 0, 0);
        break;
      case 'custom':
        if (!startDate || !endDate || !isValidCustomRange) return [];
        filterStartDate = new Date(startDate);
        filterStartDate.setHours(0, 0, 0, 0);
        filterEndDate = new Date(endDate);
        filterEndDate.setHours(23, 59, 59, 999);
        break;
      default:
        return alerts;
    }

    return alerts.filter(alert => {
      const alertDate = new Date(alert.timestamp);
      return alertDate >= filterStartDate && alertDate <= filterEndDate;
    });
  }, [alerts, dateRange, startDate, endDate, isValidCustomRange]);

  // Calcular estadísticas
  const analytics: AnalyticsData = useMemo(() => {
    const totalAlerts = filteredAlerts.length;

    // Conteo por severidad
    const criticalAlerts = filteredAlerts.filter(a => a.severity === 'critical').length;
    const highAlerts = filteredAlerts.filter(a => a.severity === 'high').length;
    const mediumAlerts = filteredAlerts.filter(a => a.severity === 'medium').length;
    const lowAlerts = filteredAlerts.filter(a => a.severity === 'low').length;

    // Conteo por estado
    const pendingAlerts = filteredAlerts.filter(a => a.status === 'pending').length;
    const inProgressAlerts = filteredAlerts.filter(a => a.status === 'in_progress').length;
    const resolvedAlerts = filteredAlerts.filter(a => a.status === 'resolved').length;

    // Tiempo promedio de resolución (solo alertas resueltas)
    // NOTA: Esto asume que existe un campo resolved_at. Si no existe, ajustar según tu modelo de datos
    const resolvedAlertsData = filteredAlerts.filter(a => a.status === 'resolved');
    let averageResolutionTime = 0;
    if (resolvedAlertsData.length > 0) {
      const totalTime = resolvedAlertsData.reduce((sum, alert) => {
        // Usar resolved_at si existe, de lo contrario usar timestamp
        const created = new Date(alert.saved_at || alert.timestamp).getTime();
        const resolved = new Date((alert as any).resolved_at || alert.timestamp).getTime();
        const timeDiff = Math.abs(resolved - created);
        return sum + timeDiff;
      }, 0);
      averageResolutionTime = totalTime / resolvedAlertsData.length / (1000 * 60 * 60); // En horas
    }

    // Top 5 vehículos
    const vehicleCounts = new Map<string, number>();
    filteredAlerts.forEach(alert => {
      if (alert.plate) {
        vehicleCounts.set(alert.plate, (vehicleCounts.get(alert.plate) || 0) + 1);
      }
    });
    const topVehicles = Array.from(vehicleCounts.entries())
      .map(([plate, count]) => ({ plate, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Top 5 conductores
    const driverCounts = new Map<string, number>();
    filteredAlerts.forEach(alert => {
      if (alert.driver) {
        driverCounts.set(alert.driver, (driverCounts.get(alert.driver) || 0) + 1);
      }
    });
    const topDrivers = Array.from(driverCounts.entries())
      .map(([driver, count]) => ({ driver, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Alertas por tipo
    const typeCounts = new Map<string, number>();
    filteredAlerts.forEach(alert => {
      if (alert.type) {
        typeCounts.set(alert.type, (typeCounts.get(alert.type) || 0) + 1);
      }
    });
    const alertsByType = Array.from(typeCounts.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);

    // Estadísticas diarias - optimizado
    const dailyStats: Array<{ date: string; count: number; dateObj: Date }> = [];
    const daysToShow = dateRange === 'today' ? 1 : 7;
    
    // Agrupar alertas por fecha primero (más eficiente)
    const alertsByDate = new Map<string, number>();
    filteredAlerts.forEach(alert => {
      const alertDate = new Date(alert.timestamp);
      const dateKey = alertDate.toDateString();
      alertsByDate.set(dateKey, (alertsByDate.get(dateKey) || 0) + 1);
    });

    // Construir estadísticas diarias
    for (let i = daysToShow - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      
      const dateKey = date.toDateString();
      const count = alertsByDate.get(dateKey) || 0;
      const dateStr = date.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
      
      dailyStats.push({ date: dateStr, count, dateObj: date });
    }

    return {
      totalAlerts,
      criticalAlerts,
      highAlerts,
      mediumAlerts,
      lowAlerts,
      pendingAlerts,
      inProgressAlerts,
      resolvedAlerts,
      averageResolutionTime,
      topVehicles,
      topDrivers,
      alertsByType,
      dailyStats
    };
  }, [filteredAlerts, dateRange]);

  // Función auxiliar para calcular porcentajes de forma segura
  const calculatePercentage = useCallback((value: number, total: number): string => {
    if (total === 0) return '0.0';
    return ((value / total) * 100).toFixed(1);
  }, []);

  // Calcular porcentajes con seguridad
  const resolutionRate = calculatePercentage(analytics.resolvedAlerts, analytics.totalAlerts);
  const criticalRate = calculatePercentage(analytics.criticalAlerts, analytics.totalAlerts);

  // Obtener etiqueta del rango de fechas
  const getRangeDateLabel = useCallback((): string => {
    switch (dateRange) {
      case 'today':
        return `Hoy ${new Date().toLocaleDateString('es-CO')}`;
      case 'week':
        return 'Últimos 7 días';
      case 'month':
        return 'Últimos 30 días';
      case 'custom':
        if (startDate && endDate) {
          return `${new Date(startDate).toLocaleDateString('es-CO')} a ${new Date(endDate).toLocaleDateString('es-CO')}`;
        }
        return 'Rango personalizado';
      default:
        return '';
    }
  }, [dateRange, startDate, endDate]);

  // Exportar informe completo a Excel
  const handleExportReport = useCallback(() => {
    const { totalAlerts } = analytics;
    
    const reportData = [
      // Encabezado del informe
      {
        section: '═══════════════════════════════════════════════',
        value1: '',
        value2: '',
        value3: ''
      },
      {
        section: 'INFORME DE GESTIÓN DE ALERTAS',
        value1: '',
        value2: '',
        value3: ''
      },
      {
        section: `Periodo: ${getRangeDateLabel()}`,
        value1: '',
        value2: '',
        value3: ''
      },
      {
        section: `Generado: ${new Date().toLocaleString('es-CO')}`,
        value1: '',
        value2: '',
        value3: ''
      },
      {
        section: '═══════════════════════════════════════════════',
        value1: '',
        value2: '',
        value3: ''
      },
      { section: '', value1: '', value2: '', value3: '' },

      // Resumen ejecutivo
      { section: '📊 RESUMEN EJECUTIVO', value1: '', value2: '', value3: '' },
      { section: 'Total de Alertas', value1: totalAlerts, value2: '', value3: '' },
      { 
        section: 'Alertas Pendientes', 
        value1: analytics.pendingAlerts, 
        value2: `${calculatePercentage(analytics.pendingAlerts, totalAlerts)}%`, 
        value3: '' 
      },
      { 
        section: 'Alertas En Proceso', 
        value1: analytics.inProgressAlerts, 
        value2: `${calculatePercentage(analytics.inProgressAlerts, totalAlerts)}%`, 
        value3: '' 
      },
      { 
        section: 'Alertas Resueltas', 
        value1: analytics.resolvedAlerts, 
        value2: `${resolutionRate}%`, 
        value3: '' 
      },
      { 
        section: 'Tiempo Promedio de Resolución', 
        value1: `${analytics.averageResolutionTime.toFixed(1)} horas`, 
        value2: '', 
        value3: '' 
      },
      { section: '', value1: '', value2: '', value3: '' },

      // Distribución por severidad
      { section: '🚨 DISTRIBUCIÓN POR SEVERIDAD', value1: '', value2: '', value3: '' },
      { 
        section: 'Críticas', 
        value1: analytics.criticalAlerts, 
        value2: `${criticalRate}%`, 
        value3: analytics.criticalAlerts > 0 ? '⚠️ Requieren atención inmediata' : ''
      },
      { 
        section: 'Altas', 
        value1: analytics.highAlerts, 
        value2: `${calculatePercentage(analytics.highAlerts, totalAlerts)}%`, 
        value3: '' 
      },
      { 
        section: 'Medias', 
        value1: analytics.mediumAlerts, 
        value2: `${calculatePercentage(analytics.mediumAlerts, totalAlerts)}%`, 
        value3: '' 
      },
      { 
        section: 'Bajas', 
        value1: analytics.lowAlerts, 
        value2: `${calculatePercentage(analytics.lowAlerts, totalAlerts)}%`, 
        value3: '' 
      },
      { section: '', value1: '', value2: '', value3: '' },

      // Top 5 vehículos
      { section: '🚗 TOP 5 VEHÍCULOS CON MÁS ALERTAS', value1: '', value2: '', value3: '' },
      ...analytics.topVehicles.map((v, i) => ({
        section: `${i + 1}. ${v.plate}`,
        value1: v.count,
        value2: `${calculatePercentage(v.count, totalAlerts)}%`,
        value3: v.count >= 5 ? '⚠️ Requiere revisión' : ''
      })),
      { section: '', value1: '', value2: '', value3: '' },

      // Top 5 conductores
      { section: '👤 TOP 5 CONDUCTORES CON MÁS ALERTAS', value1: '', value2: '', value3: '' },
      ...analytics.topDrivers.map((d, i) => ({
        section: `${i + 1}. ${d.driver}`,
        value1: d.count,
        value2: `${calculatePercentage(d.count, totalAlerts)}%`,
        value3: d.count >= 5 ? '⚠️ Capacitación recomendada' : ''
      })),
      { section: '', value1: '', value2: '', value3: '' },

      // Alertas por tipo
      { section: '📋 DISTRIBUCIÓN POR TIPO DE ALERTA', value1: '', value2: '', value3: '' },
      ...analytics.alertsByType.map(t => ({
        section: t.type,
        value1: t.count,
        value2: `${calculatePercentage(t.count, totalAlerts)}%`,
        value3: ''
      })),
      { section: '', value1: '', value2: '', value3: '' },

      // Tendencia diaria
      { section: '📈 TENDENCIA DIARIA', value1: '', value2: '', value3: '' },
      ...analytics.dailyStats.map(d => ({
        section: d.date,
        value1: d.count,
        value2: d.count > 0 ? `${calculatePercentage(d.count, totalAlerts)}%` : '',
        value3: ''
      }))
    ];

    const fileName = `Informe_Gestion_${getRangeDateLabel().replace(/\s/g, '_').replace(/\//g, '-')}_${new Date().toLocaleDateString('es-CO').replace(/\//g, '-')}`;

    exportToExcel(
      reportData,
      [
        { header: 'Indicador', key: 'section', width: 40 },
        { header: 'Valor', key: 'value1', width: 15 },
        { header: 'Porcentaje', key: 'value2', width: 15 },
        { header: 'Observaciones', key: 'value3', width: 30 }
      ],
      fileName
    );
  }, [analytics, calculatePercentage, resolutionRate, criticalRate, getRangeDateLabel, exportToExcel]);

  // Renderizado de carga
  if (loading) {
    return (
      <div className="text-center py-12" role="status" aria-live="polite">
        <Activity className="w-12 h-12 text-blue-600 mx-auto mb-4 animate-spin" aria-hidden="true" />
        <p className="text-slate-600">Cargando análisis...</p>
      </div>
    );
  }

  // Renderizado de error
  if (error) {
    return (
      <div className="text-center py-12" role="alert">
        <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-4" aria-hidden="true" />
        <p className="text-red-600 font-semibold mb-2">Error al cargar datos</p>
        <p className="text-slate-600 text-sm mb-4">{error}</p>
        <button
          onClick={loadData}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Reintentar
        </button>
      </div>
    );
  }

  // Mensaje de rango de fechas inválido
  if (dateRange === 'custom' && !isValidCustomRange) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center" role="alert">
        <AlertTriangle className="w-10 h-10 text-yellow-600 mx-auto mb-3" aria-hidden="true" />
        <p className="text-yellow-800 font-semibold">Rango de fechas inválido</p>
        <p className="text-yellow-700 text-sm mt-1">
          Por favor, selecciona fechas válidas. La fecha de inicio debe ser anterior o igual a la fecha de fin.
        </p>
      </div>
    );
  }

  // Sin datos
  if (analytics.totalAlerts === 0) {
    return (
      <div className="text-center py-12">
        <BarChart3 className="w-12 h-12 text-slate-400 mx-auto mb-4" aria-hidden="true" />
        <p className="text-slate-600">No hay alertas en el rango de fechas seleccionado</p>
        <p className="text-slate-500 text-sm mt-2">{getRangeDateLabel()}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header con filtros */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <BarChart3 className="w-7 h-7 text-blue-600" aria-hidden="true" />
              Análisis de Gestión de Alertas
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              Informe de gestión - {getRangeDateLabel()}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Selector de rango */}
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value as DateRangeType)}
              className="px-4 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              aria-label="Seleccionar rango de fechas"
            >
              <option value="today">Hoy</option>
              <option value="week">Últimos 7 días</option>
              <option value="month">Últimos 30 días</option>
              <option value="custom">Rango personalizado</option>
            </select>

            {dateRange === 'custom' && (
              <>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  max={endDate || undefined}
                  className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  aria-label="Fecha de inicio"
                />
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  min={startDate || undefined}
                  className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  aria-label="Fecha de fin"
                />
              </>
            )}

            <button
              onClick={handleExportReport}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={analytics.totalAlerts === 0}
              aria-label="Exportar informe a Excel"
            >
              <FileDown className="w-4 h-4" aria-hidden="true" />
              Exportar Informe
            </button>
          </div>
        </div>
      </div>

      {/* KPIs principales */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total de Alertas */}
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white p-6 rounded-xl shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-sm font-medium">Total Alertas</p>
              <p className="text-3xl font-bold mt-2" aria-label={`${analytics.totalAlerts} alertas totales`}>
                {analytics.totalAlerts}
              </p>
            </div>
            <Activity className="w-12 h-12 text-blue-200 opacity-80" aria-hidden="true" />
          </div>
        </div>

        {/* Alertas Críticas */}
        <div className="bg-gradient-to-br from-red-500 to-red-600 text-white p-6 rounded-xl shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-red-100 text-sm font-medium">Críticas</p>
              <p className="text-3xl font-bold mt-2" aria-label={`${analytics.criticalAlerts} alertas críticas`}>
                {analytics.criticalAlerts}
              </p>
              <p className="text-red-100 text-xs mt-1">{criticalRate}% del total</p>
            </div>
            <AlertCircle className="w-12 h-12 text-red-200 opacity-80" aria-hidden="true" />
          </div>
        </div>

        {/* Tasa de Resolución */}
        <div className="bg-gradient-to-br from-green-500 to-green-600 text-white p-6 rounded-xl shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-green-100 text-sm font-medium">Resueltas</p>
              <p className="text-3xl font-bold mt-2" aria-label={`${analytics.resolvedAlerts} alertas resueltas`}>
                {analytics.resolvedAlerts}
              </p>
              <p className="text-green-100 text-xs mt-1">{resolutionRate}% del total</p>
            </div>
            <CheckCircle className="w-12 h-12 text-green-200 opacity-80" aria-hidden="true" />
          </div>
        </div>

        {/* Tiempo Promedio */}
        <div className="bg-gradient-to-br from-orange-500 to-orange-600 text-white p-6 rounded-xl shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-orange-100 text-sm font-medium">Tiempo Promedio</p>
              <p className="text-3xl font-bold mt-2" aria-label={`${analytics.averageResolutionTime.toFixed(1)} horas promedio`}>
                {analytics.averageResolutionTime.toFixed(1)}
              </p>
              <p className="text-orange-100 text-xs mt-1">horas de resolución</p>
            </div>
            <Timer className="w-12 h-12 text-orange-200 opacity-80" aria-hidden="true" />
          </div>
        </div>
      </div>

      {/* Estado de Gestión */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <Clock className="w-5 h-5 text-yellow-600" aria-hidden="true" />
            <h3 className="font-bold text-slate-900">Pendientes</h3>
          </div>
          <p className="text-4xl font-bold text-yellow-600">{analytics.pendingAlerts}</p>
          <div className="mt-3 h-2 bg-slate-100 rounded-full overflow-hidden" role="progressbar" aria-valuenow={analytics.pendingAlerts} aria-valuemin={0} aria-valuemax={analytics.totalAlerts}>
            <div
              className="h-full bg-yellow-500 rounded-full transition-all duration-300"
              style={{ width: `${calculatePercentage(analytics.pendingAlerts, analytics.totalAlerts)}%` }}
            />
          </div>
          <p className="text-xs text-slate-500 mt-2">
            {calculatePercentage(analytics.pendingAlerts, analytics.totalAlerts)}% del total
          </p>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <TrendingUp className="w-5 h-5 text-blue-600" aria-hidden="true" />
            <h3 className="font-bold text-slate-900">En Proceso</h3>
          </div>
          <p className="text-4xl font-bold text-blue-600">{analytics.inProgressAlerts}</p>
          <div className="mt-3 h-2 bg-slate-100 rounded-full overflow-hidden" role="progressbar" aria-valuenow={analytics.inProgressAlerts} aria-valuemin={0} aria-valuemax={analytics.totalAlerts}>
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-300"
              style={{ width: `${calculatePercentage(analytics.inProgressAlerts, analytics.totalAlerts)}%` }}
            />
          </div>
          <p className="text-xs text-slate-500 mt-2">
            {calculatePercentage(analytics.inProgressAlerts, analytics.totalAlerts)}% del total
          </p>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <Award className="w-5 h-5 text-green-600" aria-hidden="true" />
            <h3 className="font-bold text-slate-900">Resueltas</h3>
          </div>
          <p className="text-4xl font-bold text-green-600">{analytics.resolvedAlerts}</p>
          <div className="mt-3 h-2 bg-slate-100 rounded-full overflow-hidden" role="progressbar" aria-valuenow={analytics.resolvedAlerts} aria-valuemin={0} aria-valuemax={analytics.totalAlerts}>
            <div
              className="h-full bg-green-500 rounded-full transition-all duration-300"
              style={{ width: `${resolutionRate}%` }}
            />
          </div>
          <p className="text-xs text-slate-500 mt-2">
            {resolutionRate}% del total
          </p>
        </div>
      </div>

      {/* Distribución por Severidad */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-orange-600" aria-hidden="true" />
          Distribución por Severidad
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm font-semibold text-red-900">Críticas</p>
            <p className="text-3xl font-bold text-red-600 mt-2">{analytics.criticalAlerts}</p>
            <div className="mt-2 h-1.5 bg-red-100 rounded-full overflow-hidden" role="progressbar">
              <div
                className="h-full bg-red-500 rounded-full transition-all duration-300"
                style={{ width: `${calculatePercentage(analytics.criticalAlerts, analytics.totalAlerts)}%` }}
              />
            </div>
          </div>

          <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
            <p className="text-sm font-semibold text-orange-900">Altas</p>
            <p className="text-3xl font-bold text-orange-600 mt-2">{analytics.highAlerts}</p>
            <div className="mt-2 h-1.5 bg-orange-100 rounded-full overflow-hidden" role="progressbar">
              <div
                className="h-full bg-orange-500 rounded-full transition-all duration-300"
                style={{ width: `${calculatePercentage(analytics.highAlerts, analytics.totalAlerts)}%` }}
              />
            </div>
          </div>

          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm font-semibold text-yellow-900">Medias</p>
            <p className="text-3xl font-bold text-yellow-600 mt-2">{analytics.mediumAlerts}</p>
            <div className="mt-2 h-1.5 bg-yellow-100 rounded-full overflow-hidden" role="progressbar">
              <div
                className="h-full bg-yellow-500 rounded-full transition-all duration-300"
                style={{ width: `${calculatePercentage(analytics.mediumAlerts, analytics.totalAlerts)}%` }}
              />
            </div>
          </div>

          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm font-semibold text-blue-900">Bajas</p>
            <p className="text-3xl font-bold text-blue-600 mt-2">{analytics.lowAlerts}</p>
            <div className="mt-2 h-1.5 bg-blue-100 rounded-full overflow-hidden" role="progressbar">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-300"
                style={{ width: `${calculatePercentage(analytics.lowAlerts, analytics.totalAlerts)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Top 5 Vehículos y Conductores */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top 5 Vehículos */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Car className="w-5 h-5 text-blue-600" aria-hidden="true" />
            Top 5 Vehículos con Más Alertas
          </h3>
          <div className="space-y-3">
            {analytics.topVehicles.length > 0 ? (
              analytics.topVehicles.map((vehicle, index) => (
                <div key={vehicle.plate} className="flex items-center gap-3">
                  <div 
                    className={`flex items-center justify-center w-8 h-8 rounded-full font-bold text-white flex-shrink-0 ${
                      index === 0 ? 'bg-yellow-500' :
                      index === 1 ? 'bg-slate-400' :
                      index === 2 ? 'bg-orange-600' :
                      'bg-slate-300'
                    }`}
                    aria-label={`Posición ${index + 1}`}
                  >
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900 truncate">{vehicle.plate}</p>
                    <div className="mt-1 h-2 bg-slate-100 rounded-full overflow-hidden" role="progressbar">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all duration-300"
                        style={{ width: `${calculatePercentage(vehicle.count, analytics.totalAlerts)}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-lg font-bold text-slate-900">{vehicle.count}</p>
                    <p className="text-xs text-slate-500">
                      {calculatePercentage(vehicle.count, analytics.totalAlerts)}%
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-center text-slate-400 py-4">No hay datos suficientes</p>
            )}
          </div>
        </div>

        {/* Top 5 Conductores */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-purple-600" aria-hidden="true" />
            Top 5 Conductores con Más Alertas
          </h3>
          <div className="space-y-3">
            {analytics.topDrivers.length > 0 ? (
              analytics.topDrivers.map((driver, index) => (
                <div key={`${driver.driver}-${index}`} className="flex items-center gap-3">
                  <div 
                    className={`flex items-center justify-center w-8 h-8 rounded-full font-bold text-white flex-shrink-0 ${
                      index === 0 ? 'bg-yellow-500' :
                      index === 1 ? 'bg-slate-400' :
                      index === 2 ? 'bg-orange-600' :
                      'bg-slate-300'
                    }`}
                    aria-label={`Posición ${index + 1}`}
                  >
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900 truncate" title={driver.driver}>
                      {driver.driver}
                    </p>
                    <div className="mt-1 h-2 bg-slate-100 rounded-full overflow-hidden" role="progressbar">
                      <div
                        className="h-full bg-purple-500 rounded-full transition-all duration-300"
                        style={{ width: `${calculatePercentage(driver.count, analytics.totalAlerts)}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-lg font-bold text-slate-900">{driver.count}</p>
                    <p className="text-xs text-slate-500">
                      {calculatePercentage(driver.count, analytics.totalAlerts)}%
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-center text-slate-400 py-4">No hay datos suficientes</p>
            )}
          </div>
        </div>
      </div>

      {/* Distribución por Tipo de Alerta */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
          <Target className="w-5 h-5 text-green-600" aria-hidden="true" />
          Distribución por Tipo de Alerta
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {analytics.alertsByType.length > 0 ? (
            analytics.alertsByType.map((type, index) => (
              <div key={`${type.type}-${index}`} className="p-4 bg-slate-50 border border-slate-200 rounded-lg hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-900 truncate flex-1" title={type.type}>
                    {type.type}
                  </p>
                  <p className="text-lg font-bold text-slate-900 ml-2">{type.count}</p>
                </div>
                <div className="mt-2 h-1.5 bg-slate-200 rounded-full overflow-hidden" role="progressbar">
                  <div
                    className="h-full bg-green-500 rounded-full transition-all duration-300"
                    style={{ width: `${calculatePercentage(type.count, analytics.totalAlerts)}%` }}
                  />
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {calculatePercentage(type.count, analytics.totalAlerts)}% del total
                </p>
              </div>
            ))
          ) : (
            <p className="col-span-full text-center text-slate-400 py-4">No hay datos de tipos de alertas</p>
          )}
        </div>
      </div>

      {/* Tendencia Diaria */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
          <Calendar className="w-5 h-5 text-blue-600" aria-hidden="true" />
          Tendencia Diaria
        </h3>
        <div className="flex items-end justify-between gap-2 h-48" role="img" aria-label="Gráfico de barras de tendencia diaria de alertas">
          {analytics.dailyStats.map((day, index) => {
            const maxCount = Math.max(...analytics.dailyStats.map(d => d.count), 1);
            const height = (day.count / maxCount) * 100;
            return (
              <div key={`${day.date}-${index}`} className="flex-1 flex flex-col items-center gap-2">
                <div className="relative w-full flex items-end justify-center" style={{ height: '160px' }}>
                  <div
                    className="w-full bg-gradient-to-t from-blue-500 to-blue-400 rounded-t-lg transition-all duration-300 hover:from-blue-600 hover:to-blue-500 cursor-pointer shadow-sm"
                    style={{ height: `${height}%`, minHeight: day.count > 0 ? '8px' : '0' }}
                    title={`${day.date}: ${day.count} alerta${day.count !== 1 ? 's' : ''}`}
                    role="presentation"
                  >
                    {day.count > 0 && (
                      <div className="text-center text-white font-bold text-xs pt-1">
                        {day.count}
                      </div>
                    )}
                  </div>
                </div>
                <p className="text-xs text-slate-600 font-medium text-center">{day.date}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
