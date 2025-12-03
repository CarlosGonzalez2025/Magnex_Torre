import React, { useState, useEffect, useMemo, useRef } from 'react';
import { LayoutDashboard, Map as MapIcon, RefreshCw, Search, Server, Wifi, Radio, AlertTriangle, XCircle, CloudOff, CheckCircle, Database, Bell, History, BarChart3, ClipboardCheck, Calendar } from 'lucide-react';
import { Vehicle, ApiSource, VehicleStatus, FilterType, StatusFilterType, Alert } from './types';
import { KpiCards } from './components/KpiCards';
import { VehicleTable } from './components/VehicleTable';
import FleetMap from './components/FleetMap';
import { AlertPanel } from './components/AlertPanel';
import { AlertHistory } from './components/AlertHistory';
import { Analytics } from './components/Analytics';
import { Inspections } from './components/Inspections';
import { RouteSchedules } from './components/RouteSchedules';
import { fetchFleetData, FleetResponse } from './services/fleetService';
import { detectAlerts, saveAlertsToStorage, getAlertsFromStorage, getUnsavedAlerts, markAlertAsSent, markAlertAsSaved, cleanOldAlerts, processVehiclesForIdleDetection } from './services/alertService';
import { saveAlertToDatabase } from './services/databaseService';

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
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [activeTab, setActiveTab] = useState<'table' | 'map' | 'alerts' | 'history' | 'analytics' | 'inspections' | 'schedules'>('table');
  const [dataSource, setDataSource] = useState<'REAL' | 'DIRECT_API' | 'PARTIAL_DIRECT' | 'ERROR' | 'MOCK'>('REAL');
  const [apiStatus, setApiStatus] = useState<FleetResponse['apiStatus']>();
  const [vehicleCounts, setVehicleCounts] = useState<FleetResponse['vehicleCounts']>();
  const [showApiDetails, setShowApiDetails] = useState(false);
  const [alerts, setAlerts] = useState<Alert[]>([]);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [apiFilter, setApiFilter] = useState<FilterType>('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilterType>('ALL');

  // Track previous critical alerts count for sound notification
  const prevCriticalAlertsRef = useRef<number>(0);

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
          <span className="flex items-center text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded-md border border-green-100">
            <Wifi className="w-3 h-3 mr-1" /> Backend Conectado
          </span>
        );
      case 'DIRECT_API':
        return (
          <span className="flex items-center text-xs font-medium text-purple-600 bg-purple-50 px-2 py-1 rounded-md border border-purple-100">
            <Radio className="w-3 h-3 mr-1" /> APIs Directas
            {vehicleCounts && ` (${vehicleCounts.coltrack + vehicleCounts.fagor} vehículos)`}
          </span>
        );
      case 'PARTIAL_DIRECT':
        return (
          <span className="flex items-center text-xs font-medium text-orange-600 bg-orange-50 px-2 py-1 rounded-md border border-orange-100">
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
          <span className="flex items-center text-xs font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded-md border border-amber-100">
            <CloudOff className="w-3 h-3 mr-1" /> Modo Demo
          </span>
        );
      case 'ERROR':
        return (
          <span className="flex items-center text-xs font-medium text-red-600 bg-red-50 px-2 py-1 rounded-md border border-red-100">
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
    const message = `🚨 *ALERTA DE FLOTA*\n\n` +
      `Tipo: ${alert.type}\n` +
      `Vehículo: ${alert.plate}\n` +
      `Conductor: ${alert.driver}\n` +
      `Detalles: ${alert.details}\n` +
      `Velocidad: ${alert.speed} km/h\n` +
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
      alert('✅ Alerta copiada al portapapeles\n\nYa puedes pegarla en WhatsApp o cualquier otra aplicación.');
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      alert('❌ Error al copiar la alerta. Por favor, intenta nuevamente.');
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

        alert('✅ Alerta guardada en la base de datos\n\nSe ha movido al "Historial" donde puedes agregar planes de acción.');
      } else {
        alert('❌ Error al guardar la alerta: ' + result.error);
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
    // Update the ref with current count
    prevCriticalAlertsRef.current = criticalAlertsCount;
  }, [criticalAlertsCount]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shadow-md transition-colors ${getStatusColor()}`}>
              <Server className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800 leading-none">Sistema Central de Flota</h1>
              <div className="flex items-center gap-2 mt-1.5">
                {getStatusBadge()}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="hidden md:flex flex-col items-end mr-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Última Actualización</span>
              <span className="text-sm font-medium text-slate-800">{lastUpdate.toLocaleTimeString()}</span>
            </div>
            <button 
              onClick={fetchData}
              disabled={loading}
              className={`p-2 rounded-full hover:bg-slate-100 transition-all ${loading ? 'animate-spin text-blue-600' : 'text-slate-600'}`}
              title="Actualizar ahora"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
            <div className="h-8 w-px bg-slate-200 mx-2 hidden md:block"></div>
            <div className="flex items-center gap-2">
               <span className="relative flex h-3 w-3">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${getStatusColor().replace('bg-', 'bg-').replace('600', '400').replace('500', '300')}`}></span>
                  <span className={`relative inline-flex rounded-full h-3 w-3 ${getStatusColor()}`}></span>
                </span>
                <span className={`text-sm font-medium ${
                  dataSource === 'REAL' ? 'text-green-700' : 
                  dataSource === 'DIRECT_API' ? 'text-purple-700' : 
                  dataSource === 'PARTIAL_DIRECT' ? 'text-orange-700' : 
                  dataSource === 'MOCK' ? 'text-amber-700' : 
                  'text-red-700'
                }`}>
                  {getStatusText()}
                </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Stats Section */}
        <KpiCards stats={stats} />

        {/* API Status Panel */}
        {apiStatus && (
          <div className="mb-6 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <button
              onClick={() => setShowApiDetails(!showApiDetails)}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Database className="w-5 h-5 text-slate-600" />
                <h3 className="font-semibold text-slate-800">Estado de Conexiones de APIs</h3>
                {vehicleCounts && (
                  <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded-full">
                    {vehicleCounts.total} vehículos activos
                  </span>
                )}
              </div>
              <span className="text-slate-400">{showApiDetails ? '▼' : '▶'}</span>
            </button>

            {showApiDetails && (
              <div className="px-4 pb-4 pt-2 border-t border-slate-100">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Backend Status */}
                  <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      apiStatus.backend === 'connected' ? 'bg-green-100' :
                      apiStatus.backend === 'failed' ? 'bg-red-100' : 'bg-gray-100'
                    }`}>
                      {apiStatus.backend === 'connected' ? (
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-600" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-slate-800 text-sm">Backend Python</div>
                      <div className={`text-xs ${
                        apiStatus.backend === 'connected' ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {apiStatus.backend === 'connected' ? 'Conectado' : 'Desconectado'}
                      </div>
                    </div>
                  </div>

                  {/* Coltrack Status */}
                  <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      apiStatus.coltrack === 'connected' ? 'bg-green-100' :
                      apiStatus.coltrack === 'failed' ? 'bg-red-100' : 'bg-gray-100'
                    }`}>
                      {apiStatus.coltrack === 'connected' ? (
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-600" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-slate-800 text-sm">Coltrack (Magnex)</div>
                      <div className={`text-xs ${
                        apiStatus.coltrack === 'connected' ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {apiStatus.coltrack === 'connected'
                          ? `✓ ${vehicleCounts?.coltrack || 0} vehículos`
                          : apiStatus.coltrack === 'failed' ? 'Desconectado' : 'No probado'
                        }
                      </div>
                    </div>
                  </div>

                  {/* Fagor Status */}
                  <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      apiStatus.fagor === 'connected' ? 'bg-green-100' :
                      apiStatus.fagor === 'failed' ? 'bg-red-100' : 'bg-gray-100'
                    }`}>
                      {apiStatus.fagor === 'connected' ? (
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-600" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-slate-800 text-sm">Fagor (FlotasNet)</div>
                      <div className={`text-xs ${
                        apiStatus.fagor === 'connected' ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {apiStatus.fagor === 'connected'
                          ? `✓ ${vehicleCounts?.fagor || 0} vehículos`
                          : apiStatus.fagor === 'failed' ? 'Desconectado' : 'No probado'
                        }
                      </div>
                    </div>
                  </div>
                </div>

                {/* Additional Info */}
                <div className="mt-3 p-3 bg-blue-50 border border-blue-100 rounded-lg">
                  <p className="text-xs text-blue-800">
                    <strong>Nota:</strong> El sistema intenta conectarse primero al backend Python.
                    Si falla, intenta conexiones directas a las APIs de Coltrack y Fagor.
                    {dataSource === 'MOCK' && ' Actualmente mostrando datos de demostración debido a problemas de CORS o conectividad.'}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Controls Toolbar */}
        <div className="flex flex-col lg:flex-row gap-4 justify-between items-start lg:items-center mb-6 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          
          {/* View Toggles */}
          <div className="flex bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => setActiveTab('table')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'table' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              <LayoutDashboard className="w-4 h-4" />
              Tabla
            </button>
            <button
              onClick={() => setActiveTab('map')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'map' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              <MapIcon className="w-4 h-4" />
              Mapa
            </button>
            <button
              onClick={() => setActiveTab('alerts')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'alerts' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              <Bell className="w-4 h-4" />
              Alertas
              {criticalAlertsCount > 0 && (
                <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full font-bold">
                  {criticalAlertsCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'history' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              <History className="w-4 h-4" />
              Historial
            </button>
            <button
              onClick={() => setActiveTab('analytics')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'analytics' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              <BarChart3 className="w-4 h-4" />
              Análisis
            </button>
            <button
              onClick={() => setActiveTab('inspections')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'inspections' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              <ClipboardCheck className="w-4 h-4" />
              Inspecciones
            </button>
            <button
              onClick={() => setActiveTab('schedules')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'schedules' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              <Calendar className="w-4 h-4" />
              Cronogramas
            </button>
          </div>

          {/* Filters Group */}
          <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
            
            <div className="relative group flex-grow sm:flex-grow-0">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-slate-400" />
              </div>
              <input
                type="text"
                placeholder="Buscar placa, conductor..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2 w-full sm:w-64 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
            </div>

            <div className="flex gap-2">
              <select 
                value={apiFilter}
                onChange={(e) => setApiFilter(e.target.value as FilterType)}
                className="pl-3 pr-8 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                <option value="ALL">Todas las APIs</option>
                <option value={ApiSource.FAGOR}>Fagor (FlotasNet)</option>
                <option value={ApiSource.COLTRACK}>Coltrack (Magnex)</option>
              </select>

              <select 
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilterType)}
                className="pl-3 pr-8 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                <option value="ALL">Todos los Estados</option>
                <option value={VehicleStatus.MOVING}>En Movimiento</option>
                <option value={VehicleStatus.STOPPED}>Detenidos</option>
                <option value={VehicleStatus.IDLE}>Encendidos (Idle)</option>
                <option value={VehicleStatus.OFF}>Apagados</option>
              </select>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="min-h-[500px]">
          {/* Error Banner */}
          {dataSource === 'ERROR' && !loading && (
             <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center mb-6 shadow-sm">
               <div className="flex items-center justify-center gap-3 mb-2">
                 <XCircle className="w-6 h-6 text-red-600" />
                 <h3 className="text-lg font-bold text-red-800">Conexión Fallida</h3>
               </div>
               <p className="text-red-700 mt-1 max-w-2xl mx-auto">
                 No se pudo establecer conexión. Revise su red o contacte al administrador.
               </p>
             </div>
          )}

          {/* Partial Connection Banner */}
          {dataSource === 'PARTIAL_DIRECT' && !loading && apiStatus && (
             <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-6 shadow-sm">
               <div className="flex items-center gap-3 mb-3">
                 <div className="p-2 bg-orange-100 rounded-full">
                   <AlertTriangle className="w-5 h-5 text-orange-600" />
                 </div>
                 <div>
                   <h3 className="text-sm font-bold text-orange-900">Conexión Parcial</h3>
                   <p className="text-xs text-orange-700 mt-0.5">
                     Solo una API está respondiendo correctamente. Algunos vehículos pueden no estar visibles.
                   </p>
                 </div>
               </div>
               <div className="flex gap-2 ml-11">
                 {apiStatus.coltrack === 'connected' && vehicleCounts && (
                   <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">
                     ✓ Coltrack: {vehicleCounts.coltrack} vehículos
                   </span>
                 )}
                 {apiStatus.fagor === 'connected' && vehicleCounts && (
                   <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">
                     ✓ Fagor: {vehicleCounts.fagor} vehículos
                   </span>
                 )}
                 {apiStatus.coltrack === 'failed' && (
                   <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full font-medium">
                     ✗ Coltrack no disponible
                   </span>
                 )}
                 {apiStatus.fagor === 'failed' && (
                   <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full font-medium">
                     ✗ Fagor no disponible
                   </span>
                 )}
               </div>
             </div>
          )}

          {/* Direct API Success Banner */}
          {dataSource === 'DIRECT_API' && !loading && vehicleCounts && (
             <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-6 flex flex-col md:flex-row items-start md:items-center justify-between shadow-sm gap-4">
               <div className="flex items-center gap-3">
                 <div className="p-2 bg-purple-100 rounded-full">
                   <Radio className="w-5 h-5 text-purple-600" />
                 </div>
                 <div>
                   <h3 className="text-sm font-bold text-purple-900">Conexión Directa a APIs</h3>
                   <p className="text-xs text-purple-700 mt-0.5">
                     Conectado directamente a Coltrack ({vehicleCounts.coltrack} veh.) y Fagor ({vehicleCounts.fagor} veh.)
                   </p>
                 </div>
               </div>
             </div>
          )}

          {/* Mock Mode Banner */}
          {dataSource === 'MOCK' && !loading && (
             <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex flex-col md:flex-row items-start md:items-center justify-between shadow-sm gap-4">
               <div className="flex items-center gap-3">
                 <div className="p-2 bg-amber-100 rounded-full">
                   <CloudOff className="w-5 h-5 text-amber-600" />
                 </div>
                 <div>
                   <h3 className="text-sm font-bold text-amber-900">Modo de Simulación Activo</h3>
                   <p className="text-xs text-amber-700 mt-0.5">
                     Las conexiones directas fallaron (posiblemente por bloqueo de seguridad del navegador/CORS).
                     Se muestran datos generados para demostración.
                   </p>
                 </div>
               </div>
               <button
                  onClick={fetchData}
                  className="px-4 py-2 bg-white border border-amber-200 text-amber-700 text-sm font-medium rounded-lg hover:bg-amber-100 transition-colors whitespace-nowrap"
               >
                 Reintentar Conexión
               </button>
             </div>
          )}

          {/* Render content */}
          {(vehicles.length > 0 || loading) ? (
             <>
               {activeTab === 'table' && <VehicleTable vehicles={filteredVehicles} />}
               {activeTab === 'map' && <FleetMap vehicles={filteredVehicles} />}
               {activeTab === 'alerts' && <AlertPanel alerts={alerts} onCopyAlert={handleCopyAlert} onSaveAlert={handleSaveAlert} />}
               {activeTab === 'history' && <AlertHistory onRefresh={fetchData} />}
               {activeTab === 'analytics' && <Analytics vehicles={vehicles} />}
               {activeTab === 'inspections' && <Inspections />}
               {activeTab === 'schedules' && <RouteSchedules />}

                {activeTab !== 'alerts' && activeTab !== 'history' && activeTab !== 'analytics' && activeTab !== 'inspections' && activeTab !== 'schedules' && filteredVehicles.length === 0 && !loading && (
                  <div className="text-center py-20">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 mb-4">
                      <Search className="w-8 h-8 text-slate-400" />
                    </div>
                    <h3 className="text-lg font-medium text-slate-900">No se encontraron vehículos</h3>
                    <p className="text-slate-500 mt-2">Intenta ajustar los filtros o la búsqueda.</p>
                  </div>
                )}
             </>
          ) : (
            // Empty state
            !loading && dataSource !== 'ERROR' && (
              <div className="text-center py-20">
                <p className="text-slate-500">Sin datos disponibles.</p>
              </div>
            )
          )}
        </div>
      </main>
    </div>
  );
}