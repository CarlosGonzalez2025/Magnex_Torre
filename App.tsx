import React, { useState, useEffect, useMemo, useRef } from 'react';
import { LayoutDashboard, Map as MapIcon, RefreshCw, Search, Server, Wifi, Radio, AlertTriangle, XCircle, CloudOff, CheckCircle, Database, Bell, History, BarChart3, ClipboardCheck, Calendar, Settings, Users, MapPin, Home, Menu } from 'lucide-react';
import { Vehicle, ApiSource, VehicleStatus, FilterType, StatusFilterType, Alert } from './types';
import { AuthProvider, useAuth, ProtectedRoute } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { KpiCards } from './components/KpiCards';
import { VehicleTable } from './components/VehicleTable';
import FleetMap from './components/FleetMap';
import { AlertPanel } from './components/AlertPanel';
import { AlertHistory } from './components/AlertHistory';
import { SavedAlertsPanel } from './components/SavedAlertsPanel';
import { Analytics } from './components/Analytics';
import { Inspections } from './components/Inspections';
import { RouteSchedules } from './components/RouteSchedules';
import { MaintenancePanel } from './components/MaintenancePanel';
import { AlertSoundToggle } from './components/AlertSoundSettings';
import { Dashboard } from './components/Dashboard';
import { DriverManagement } from './components/DriverManagement';
import { GeofenceEditor } from './components/GeofenceEditor';
import { ThemeToggle } from './components/ThemeToggle';
import { Login } from './components/Login';
import { Sidebar, TabType } from './components/Sidebar';
import { fetchFleetData, FleetResponse } from './services/fleetService';
import { detectAlerts, saveAlertsToStorage, getAlertsFromStorage, getUnsavedAlerts, markAlertAsSent, markAlertAsSaved, cleanOldAlerts, processVehiclesForIdleDetection } from './services/alertService';
import { saveAlertToDatabase, autoSaveAlert } from './services/databaseService';
import { useAutoCleanup } from './hooks/useAutoCleanup';
import audioEngine from './services/alertSoundService';

// Constants
const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

// Alert sound function using Web Audio API
function playAlertSound() {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

    // Create oscillator for beep sound
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // Configure beep sound (800Hz for 200ms, then 600Hz for 200ms)
    oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
    oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.2);

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.4);
  } catch (error) {
    console.error('Error playing alert sound:', error);
  }
}

export default function App() {
  const { user } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [activeTab, setActiveTab] = useState<'dashboard' | 'table' | 'map' | 'alerts' | 'history' | 'saved' | 'analytics' | 'inspections' | 'schedules' | 'drivers' | 'geofences' | 'maintenance'>('dashboard');
  const [dataSource, setDataSource] = useState<'REAL' | 'DIRECT_API' | 'PARTIAL_DIRECT' | 'ERROR' | 'MOCK'>('REAL');
  const [apiStatus, setApiStatus] = useState<FleetResponse['apiStatus']>();
  const [vehicleCounts, setVehicleCounts] = useState<FleetResponse['vehicleCounts']>();
  const [showApiDetails, setShowApiDetails] = useState(false);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [apiFilter, setApiFilter] = useState<FilterType>('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilterType>('ALL');

  // Track previous critical alerts count for sound notification
  const prevCriticalAlertsRef = useRef<number>(0);

  // Auto-cleanup hook for data retention disabled by user request (manual only)
  // const { isCleaningUp, lastCleanup, runCleanup } = useAutoCleanup();

  // Load Data
  const fetchData = React.useCallback(async () => {
    setLoading(true);
    const result = await fetchFleetData();
    setDataSource(result.source);
    setApiStatus(result.apiStatus);
    setVehicleCounts(result.vehicleCounts);

    // Always set data, even if it is fallback data
    setVehicles(result.data);

    // Process vehicles for idle detection (tracks ignition and idle time)
    await processVehiclesForIdleDetection(result.data);

    // Detect and process alerts
    const newAlerts: Alert[] = [];
    result.data.forEach(vehicle => {
      const vehicleAlerts = detectAlerts(vehicle);
      newAlerts.push(...vehicleAlerts);
    });

    // Combine with existing alerts from storage
    const existingAlerts = getAlertsFromStorage();
    const allAlerts = [...newAlerts, ...existingAlerts];

    // Remove duplicates (same vehicle + same type within last 5 minutes)
    const uniqueAlerts = allAlerts.filter((alert, index, self) => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      return index === self.findIndex(a =>
        a.vehicleId === alert.vehicleId &&
        a.type === alert.type &&
        new Date(a.timestamp) >= fiveMinutesAgo
      );
    });

    setAlerts(uniqueAlerts);
    saveAlertsToStorage(uniqueAlerts);
    cleanOldAlerts();

    // 🆕 GUARDADO AUTOMÁTICO: Guardar TODAS las alertas nuevas en saved_alerts
    // Esto se hace en segundo plano sin bloquear la UI
    if (newAlerts.length > 0) {
      // 🔍 LOG DE DIAGNÓSTICO: Contar alertas críticas detectadas
      const criticalAlerts = newAlerts.filter(a => a.severity === 'critical');
      if (criticalAlerts.length > 0) {
        console.log(`🚨 [DIAGNÓSTICO] Detectadas ${criticalAlerts.length} alertas CRÍTICAS de ${newAlerts.length} totales:`,
          criticalAlerts.map(a => ({ plate: a.plate, type: a.type, severity: a.severity }))
        );
      }

      Promise.all(
        newAlerts.map(alert => autoSaveAlert(alert))
      ).catch(error => {
        console.error('Error auto-guardando alertas en saved_alerts:', error);
      });

      // 🔊 SONIDOS: Reproducir sonido para cada alerta nueva
      newAlerts.forEach(alert => {
        audioEngine.playAlert(alert).catch(error => {
          console.error('Error reproduciendo sonido de alerta:', error);
        });
      });
    }

    setLastUpdate(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Derived State (Filtering)
  const filteredVehicles = useMemo(() => {
    return vehicles.filter(v => {
      const matchesSearch =
        v.plate.toLowerCase().includes(searchQuery.toLowerCase()) ||
        v.driver.toLowerCase().includes(searchQuery.toLowerCase()) ||
        v.location.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesApi = apiFilter === 'ALL' || v.source === apiFilter;
      const matchesStatus = statusFilter === 'ALL' || v.status === statusFilter;

      return matchesSearch && matchesApi && matchesStatus;
    });
  }, [vehicles, searchQuery, apiFilter, statusFilter]);

  // Derived Stats
  const stats = useMemo(() => {
    const totalVehicles = vehicles.length;
    const activeVehicles = vehicles.filter(v => v.speed > 0 || v.status === VehicleStatus.IDLE).length;
    const stoppedVehicles = totalVehicles - activeVehicles;
    const totalSpeed = vehicles.reduce((acc, curr) => acc + curr.speed, 0);
    const avgSpeed = totalVehicles > 0 ? Math.floor(totalSpeed / totalVehicles) : 0;

    return { totalVehicles, activeVehicles, stoppedVehicles, avgSpeed };
  }, [vehicles]);

  const getStatusBadge = () => {
    switch (dataSource) {
      case 'REAL':
        return (
          <span className="flex items-center text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded-md border border-green-100 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800">
            <Wifi className="w-3 h-3 mr-1" /> Backend Conectado
          </span>
        );
      case 'DIRECT_API':
        return (
          <span className="flex items-center text-xs font-medium text-purple-600 bg-purple-50 px-2 py-1 rounded-md border border-purple-100 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800">
            <Radio className="w-3 h-3 mr-1" /> APIs Directas
            {vehicleCounts && ` (${vehicleCounts.coltrack + vehicleCounts.fagor} vehículos)`}
          </span>
        );
      case 'PARTIAL_DIRECT':
        return (
          <span className="flex items-center text-xs font-medium text-orange-600 bg-orange-50 px-2 py-1 rounded-md border border-orange-100 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800">
            <AlertTriangle className="w-3 h-3 mr-1" /> Conexión Parcial
            {apiStatus && vehicleCounts && (
              <span className="ml-1">
                ({apiStatus.coltrack === 'connected' ? `Coltrack: ${vehicleCounts.coltrack}` : ''}
                {apiStatus.coltrack === 'connected' && apiStatus.fagor === 'connected' ? ', ' : ''}
                {apiStatus.fagor === 'connected' ? `Fagor: ${vehicleCounts.fagor}` : ''})
              </span>
            )}
          </span>
        );
      case 'MOCK':
        return (
          <span className="flex items-center text-xs font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded-md border border-amber-100 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800">
            <CloudOff className="w-3 h-3 mr-1" /> Modo Demo
          </span>
        );
      case 'ERROR':
        return (
          <span className="flex items-center text-xs font-medium text-red-600 bg-red-50 px-2 py-1 rounded-md border border-red-100 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800">
            <XCircle className="w-3 h-3 mr-1" /> Sin Conexión
          </span>
        );
      default:
        return null;
    }
  };

  const getStatusColor = () => {
    if (dataSource === 'REAL') return 'bg-green-600';
    if (dataSource === 'DIRECT_API') return 'bg-purple-600';
    if (dataSource === 'PARTIAL_DIRECT') return 'bg-orange-500';
    if (dataSource === 'MOCK') return 'bg-amber-500';
    if (dataSource === 'ERROR') return 'bg-red-600';
    return 'bg-slate-500';
  };

  const getStatusText = () => {
    if (dataSource === 'REAL') return 'Online';
    if (dataSource === 'DIRECT_API') return 'Directo';
    if (dataSource === 'PARTIAL_DIRECT') return 'Parcial';
    if (dataSource === 'MOCK') return 'Simulado';
    if (dataSource === 'ERROR') return 'Offline';
    return '...';
  };

  // Handle alert copy to clipboard
  const handleCopyAlert = async (alert: Alert) => {
    // Determinar si es exceso de velocidad
    const isSpeedingAlert = alert.type.toLowerCase().includes('velocidad') ||
      alert.type.toLowerCase().includes('speeding');

    // Formato con markdown para WhatsApp
    const message = `🚨 *ALERTA DE FLOTA*\n\n` +
      `*Tipo:* ${alert.type}\n` +
      `*Vehículo:* ${alert.plate}\n` +
      `*Conductor:* ${alert.driver}\n` +
      `Detalles: ${alert.details}\n` +
      (isSpeedingAlert ? `*Velocidad:* ${alert.speed} km/h ⚠️\n` : `Velocidad: ${alert.speed} km/h\n`) +
      `Ubicación: ${alert.location}\n` +
      `Hora: ${new Date(alert.timestamp).toLocaleString()}\n` +
      (alert.contract ? `Contrato: ${alert.contract}\n` : '') +
      `Fuente: ${alert.source}`;

    try {
      await navigator.clipboard.writeText(message);

      // Mark as sent (copied)
      markAlertAsSent(alert.id, 'Usuario');

      // Reload alerts to show updated state
      setAlerts(getAlertsFromStorage());

      // Show user feedback
      window.alert('✅ Alerta copiada al portapapeles\n\nYa puedes pegarla en WhatsApp o cualquier otra aplicación.');
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      window.alert('❌ Error al copiar la alerta. Por favor, intenta nuevamente.');
    }
  };

  // Handle save alert to database
  const handleSaveAlert = async (alertToSave: Alert) => {
    try {
      const result = await saveAlertToDatabase(alertToSave, 'Usuario');

      if (result.success) {
        // Marcar alerta como guardada en el caché local
        markAlertAsSaved(alertToSave.id);

        // Limpiar alertas guardadas del caché (se eliminan inmediatamente)
        cleanOldAlerts(24);

        // Actualizar la lista de alertas (solo mostrar no guardadas)
        const unsavedAlerts = getUnsavedAlerts();
        setAlerts(unsavedAlerts);

        window.alert('✅ Alerta guardada en la base de datos\n\nSe ha movido al "Historial" donde puedes agregar planes de acción.');
      } else {
        window.alert('❌ Error al guardar la alerta: ' + result.error);
      }
    } catch (error: any) {
      console.error('Error saving alert:', error);
      alert('❌ Error al guardar la alerta: ' + error.message);
    }
  };

  const criticalAlertsCount = useMemo(() =>
    alerts.filter(a => a.severity === 'critical' && !a.sent).length,
    [alerts]
  );

  // Play sound when new critical alerts are detected
  useEffect(() => {
    // Only play sound if critical alerts increased (not on initial load)
    if (prevCriticalAlertsRef.current > 0 && criticalAlertsCount > prevCriticalAlertsRef.current) {
      playAlertSound();
    }
    prevCriticalAlertsRef.current = criticalAlertsCount;
  }, [criticalAlertsCount]);

  if (!user) {
    return <Login />;
  }

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden">
      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab as TabType}
        setActiveTab={setActiveTab}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        criticalAlertsCount={criticalAlertsCount}
      />

      {/* Main Layout */}
      <div className="flex-1 flex flex-col overflow-hidden w-full">

        {/* Header */}
        <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-30 shadow-sm h-16 shrink-0 transition-colors">
          <div className="h-full px-4 sm:px-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="p-2 -ml-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg lg:hidden transition-colors"
                onClick={() => setIsSidebarOpen(true)}
              >
                <Menu className="h-6 w-6" />
              </button>

              <div className="flex items-center gap-3 lg:hidden">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shadow-md transition-colors ${getStatusColor()}`}>
                  <Server className="text-white w-5 h-5" />
                </div>
                <h1 className="text-lg font-bold text-slate-800 dark:text-white leading-none">Magnex</h1>
              </div>

              {/* Desktop Title */}
              <div className="hidden lg:flex items-center gap-2">
                <h2 className="text-xl font-bold text-slate-800 dark:text-white">
                  {activeTab === 'dashboard' ? 'Panel de Control' :
                    activeTab === 'table' ? 'Tabla de Flota' :
                      activeTab === 'map' ? 'Mapa en Vivo' :
                        activeTab === 'alerts' ? 'Centro de Alertas' :
                          activeTab === 'history' ? 'Historial de Eventos' :
                            activeTab === 'saved' ? 'Alertas Guardadas' :
                              activeTab === 'analytics' ? 'Análisis y Métricas' :
                                activeTab === 'inspections' ? 'Inspecciones' :
                                  activeTab === 'schedules' ? 'Cronogramas' :
                                    activeTab === 'drivers' ? 'Gestión de Conductores' :
                                      activeTab === 'geofences' ? 'Editor de Geocercas' :
                                        activeTab === 'maintenance' ? 'Mantenimiento' : 'Magnex'}
                </h2>
                <div className="ml-4 opacity-80 scale-90 origin-left">
                  {getStatusBadge()}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-4">
              <div className="hidden xl:flex flex-col items-end mr-2">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Actualizado</span>
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{lastUpdate.toLocaleTimeString()}</span>
              </div>
              <button
                onClick={fetchData}
                disabled={loading}
                className={`p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-all ${loading ? 'animate-spin text-blue-600' : 'text-slate-600 dark:text-slate-400'}`}
                title="Actualizar datos"
              >
                <RefreshCw className="w-5 h-5" />
              </button>
              <AlertSoundToggle />
              <ThemeToggle />
              <div className="hidden sm:flex items-center gap-2 ml-2">
                <span className="relative flex h-3 w-3">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${getStatusColor().replace('bg-', 'bg-').replace('600', '400').replace('500', '300')}`}></span>
                  <span className={`relative inline-flex rounded-full h-3 w-3 ${getStatusColor()}`}></span>
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6 scroll-smooth bg-slate-50 dark:bg-slate-900 transition-colors">
          <div className="max-w-[1920px] mx-auto space-y-6 pb-10">

            {/* ERROR Banner - Only Critical */}
            {dataSource === 'ERROR' && !loading && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 flex items-center gap-3 text-red-800 dark:text-red-200 shadow-sm animate-pulse">
                <XCircle className="w-6 h-6 shrink-0" />
                <div>
                  <h3 className="font-bold">Error de Conexión Crítico</h3>
                  <p className="text-sm">No se pudo contactar con los servidores. Revisa tu conexión a internet.</p>
                </div>
              </div>
            )}

            {/* Content Switch */}
            {activeTab === 'dashboard' && <KpiCards stats={stats} />}

            {/* API Status Panel (Replaces old banners with collapsible modern UI) */}
            {apiStatus && (
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden transition-all duration-300">
                <button
                  onClick={() => setShowApiDetails(!showApiDetails)}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Database className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                    <h3 className="font-semibold text-slate-800 dark:text-white">Estado del Sistema y APIs</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium transition-colors ${dataSource === 'MOCK' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'}`}>
                      {getStatusText()}
                    </span>
                  </div>
                  <span className="text-slate-400 transform transition-transform duration-200" style={{ transform: showApiDetails ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
                </button>

                {showApiDetails && (
                  <div className="px-4 pb-4 pt-2 border-t border-slate-100 dark:border-slate-700 animate-in slide-in-from-top-2 fade-in duration-200">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Backend */}
                      <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-100 dark:border-slate-800">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${apiStatus.backend === 'connected' ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'}`}>
                          {apiStatus.backend === 'connected' ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Backend Python</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{apiStatus.backend === 'connected' ? 'Operativo' : 'Desconectado'}</p>
                        </div>
                      </div>
                      {/* Coltrack */}
                      <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-100 dark:border-slate-800">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${apiStatus.coltrack === 'connected' ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400' : 'bg-slate-100 text-slate-400 dark:bg-slate-800'}`}>
                          <Radio className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Coltrack</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {apiStatus.coltrack === 'connected' ? 'Conectado' : 'Sin conexión'}
                          </p>
                        </div>
                      </div>
                      {/* Fagor */}
                      <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-100 dark:border-slate-800">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${apiStatus.fagor === 'connected' ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-slate-100 text-slate-400 dark:bg-slate-800'}`}>
                          <Radio className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">FlotasNet</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {apiStatus.fagor === 'connected' ? 'Conectado' : 'Sin conexión'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Controls / Filters Bar (Siempre visible) */}
            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between transition-colors">

              {/* Search */}
              <div className="relative w-full md:w-96 group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                </div>
                <input
                  type="text"
                  placeholder="Buscar vehículo, conductor o ubicación..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-4 py-2 w-full border border-slate-200 dark:border-slate-600 rounded-lg text-sm bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all placeholder-slate-400 dark:placeholder-slate-500"
                />
              </div>

              {/* Dropdowns */}
              <div className="flex gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0 no-scrollbar">
                <select
                  value={apiFilter}
                  onChange={(e) => setApiFilter(e.target.value as FilterType)}
                  className="flex-1 md:flex-none pl-3 pr-8 py-2 border border-slate-200 dark:border-slate-600 rounded-lg text-sm bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer transition-colors"
                >
                  <option value="ALL">Todas las Fuentes</option>
                  <option value={ApiSource.FAGOR}>Fagor</option>
                  <option value={ApiSource.COLTRACK}>Coltrack</option>
                </select>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as StatusFilterType)}
                  className="flex-1 md:flex-none pl-3 pr-8 py-2 border border-slate-200 dark:border-slate-600 rounded-lg text-sm bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer transition-colors"
                >
                  <option value="ALL">Todos los Estados</option>
                  <option value={VehicleStatus.MOVING}>En Ruta</option>
                  <option value={VehicleStatus.STOPPED}>Detenido</option>
                  <option value={VehicleStatus.IDLE}>Ralentí</option>
                  <option value={VehicleStatus.OFF}>Apagado</option>
                </select>
              </div>
            </div>

            {/* Content Views */}
            <div className="min-h-[500px] relative transition-all">
              {activeTab === 'dashboard' && (
                <Dashboard
                  vehicles={vehicles}
                  alerts={alerts}
                  onNavigate={(tab) => setActiveTab(tab as any)}
                />
              )}

              {activeTab === 'table' && (
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                  <VehicleTable vehicles={filteredVehicles} />
                </div>
              )}

              {activeTab === 'map' && (
                <div className="h-[calc(100vh-220px)] min-h-[500px] bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden border-2 border-slate-100 dark:border-slate-700">
                  <FleetMap vehicles={filteredVehicles} />
                </div>
              )}

              {activeTab === 'alerts' && (
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                  <AlertPanel
                    alerts={alerts.filter(a => !a.saved)}
                    onSave={handleSaveAlert}
                    onCopy={handleCopyAlert}
                    onViewMap={() => setActiveTab('map')}
                  />
                </div>
              )}

              {activeTab === 'history' && <AlertHistory />}
              {activeTab === 'saved' && <SavedAlertsPanel />}
              {activeTab === 'analytics' && <Analytics vehicles={vehicles} alerts={alerts} />}
              {activeTab === 'inspections' && <Inspections />}
              {activeTab === 'schedules' && <RouteSchedules vehicles={vehicles} />}
              {activeTab === 'drivers' && <DriverManagement />}
              {activeTab === 'geofences' && <GeofenceEditor />}
              {activeTab === 'maintenance' && <MaintenancePanel vehicles={vehicles} />}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}