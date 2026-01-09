import React, { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle } from 'react-leaflet';
import { Icon, LatLngExpression } from 'leaflet';
import {
  Search,
  Calendar,
  MapPin,
  Navigation,
  Clock,
  AlertTriangle,
  User,
  FileText,
  Download,
  Loader,
  Route as RouteIcon,
  Flag,
  Target,
  Activity,
  Gauge,
  Info,
  Play,
  Square
} from 'lucide-react';
import { getAllAutoSavedAlerts, SavedAlert } from '../services/databaseService';
import { useExportToExcel } from '../hooks/useExportToExcel';

// Iconos personalizados para inicio y fin de ruta
const startIcon = new Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const endIcon = new Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const alertIcon = new Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-orange.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [20, 33],
  iconAnchor: [10, 33],
  popupAnchor: [1, -28],
  shadowSize: [33, 33]
});

interface RoutePoint extends SavedAlert {
  // SavedAlert ya contiene latitude y longitude (aunque pueden no estar definidos)
}

export const RouteInvestigation: React.FC = () => {
  const [allAlerts, setAllAlerts] = useState<SavedAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPlate, setSelectedPlate] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [routePoints, setRoutePoints] = useState<RoutePoint[]>([]);
  const { exportToExcel } = useExportToExcel();

  // Cargar todas las alertas al inicio
  useEffect(() => {
    loadAllAlerts();
  }, []);

  const loadAllAlerts = async () => {
    const result = await getAllAutoSavedAlerts();
    if (result.success && result.data) {
      setAllAlerts(result.data);
    }
  };

  // Obtener lista única de placas
  const availablePlates = useMemo(() => {
    const plates = new Set(allAlerts.map(alert => alert.plate));
    return Array.from(plates).sort();
  }, [allAlerts]);

  // Función para buscar ruta
  const handleSearch = () => {
    if (!selectedPlate || !startDate || !endDate) {
      alert('Por favor completa todos los filtros (Placa, Fecha Inicio y Fecha Fin)');
      return;
    }

    setLoading(true);

    // Filtrar alertas por placa y rango de fechas
    const filterStartDate = new Date(startDate);
    filterStartDate.setHours(0, 0, 0, 0);

    const filterEndDate = new Date(endDate);
    filterEndDate.setHours(23, 59, 59, 999);

    const filtered = allAlerts.filter(alert => {
      const alertDate = new Date(alert.timestamp);
      return (
        alert.plate === selectedPlate &&
        alertDate >= filterStartDate &&
        alertDate <= filterEndDate
      );
    });

    // Ordenar por timestamp
    const sorted = filtered.sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    setRoutePoints(sorted);
    setLoading(false);

    if (sorted.length === 0) {
      alert(`No se encontraron registros para la placa ${selectedPlate} en el rango de fechas seleccionado.`);
    }
  };

  // Preparar coordenadas para la polilínea
  const polylinePositions: LatLngExpression[] = useMemo(() => {
    // Solo incluir puntos que tengan coordenadas válidas
    return routePoints
      .filter(point => point.location && point.location !== 'Ubicación no disponible')
      .map(point => {
        // Intentar extraer coordenadas del campo location si están en formato "lat, lon"
        // O usar campos latitude/longitude si existen
        const coords = point.location.match(/(-?\d+\.?\d*),\s*(-?\d+\.?\d*)/);
        if (coords) {
          return [parseFloat(coords[1]), parseFloat(coords[2])] as LatLngExpression;
        }
        // Coordenadas de respaldo (centro de Colombia) si no se pueden parsear
        return [4.5709, -74.2973] as LatLngExpression;
      });
  }, [routePoints]);

  // Centro del mapa basado en la ruta
  const mapCenter: [number, number] = useMemo(() => {
    if (polylinePositions.length === 0) {
      return [4.5709, -74.2973]; // Colombia center
    }

    const firstPoint = polylinePositions[0] as [number, number];
    return firstPoint;
  }, [polylinePositions]);

  // Calcular estadísticas de la ruta
  const routeStats = useMemo(() => {
    if (routePoints.length === 0) return null;

    const totalAlerts = routePoints.length;
    const criticalAlerts = routePoints.filter(p => p.severity === 'critical').length;
    const highAlerts = routePoints.filter(p => p.severity === 'high').length;

    // Calcular distancia total aproximada (en km)
    let totalDistance = 0;
    for (let i = 1; i < polylinePositions.length; i++) {
      const [lat1, lon1] = polylinePositions[i - 1] as [number, number];
      const [lat2, lon2] = polylinePositions[i] as [number, number];

      // Fórmula de Haversine simplificada
      const R = 6371; // Radio de la Tierra en km
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      totalDistance += R * c;
    }

    const startTime = new Date(routePoints[0].timestamp);
    const endTime = new Date(routePoints[routePoints.length - 1].timestamp);
    const duration = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60); // En horas

    return {
      totalAlerts,
      criticalAlerts,
      highAlerts,
      totalDistance: totalDistance.toFixed(2),
      duration: duration.toFixed(2),
      startTime,
      endTime
    };
  }, [routePoints, polylinePositions]);

  // Exportar informe de ruta
  const handleExportReport = () => {
    if (routePoints.length === 0) {
      alert('No hay datos de ruta para exportar');
      return;
    }

    const reportData = routePoints.map((point, index) => ({
      Secuencia: index + 1,
      Fecha: new Date(point.timestamp).toLocaleDateString('es-CO'),
      Hora: new Date(point.timestamp).toLocaleTimeString('es-CO'),
      Placa: point.plate,
      Conductor: point.driver,
      Contrato: point.contract,
      'Tipo de Alerta': point.type,
      Severidad: point.severity,
      Detalles: point.details,
      Ubicación: point.location,
      Velocidad: point.speed,
      Estado: point.status,
      Fuente: point.source
    }));

    exportToExcel(
      reportData,
      [
        { header: '#', key: 'Secuencia', width: 8 },
        { header: 'Fecha', key: 'Fecha', width: 12 },
        { header: 'Hora', key: 'Hora', width: 12 },
        { header: 'Placa', key: 'Placa', width: 12 },
        { header: 'Conductor', key: 'Conductor', width: 25 },
        { header: 'Contrato', key: 'Contrato', width: 15 },
        { header: 'Tipo Alerta', key: 'Tipo de Alerta', width: 20 },
        { header: 'Severidad', key: 'Severidad', width: 12 },
        { header: 'Detalles', key: 'Detalles', width: 40 },
        { header: 'Ubicación', key: 'Ubicación', width: 40 },
        { header: 'Velocidad', key: 'Velocidad', width: 12 },
        { header: 'Estado', key: 'Estado', width: 12 },
        { header: 'Fuente GPS', key: 'Fuente', width: 12 }
      ],
      `Investigacion_Ruta_${selectedPlate}_${startDate}_${endDate}`.replace(/\s/g, '_')
    );
  };

  return (
    <div className="space-y-4">
      {/* Panel de Filtros */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <Search className="w-6 h-6 text-blue-600" />
          <div>
            <h2 className="text-xl font-bold text-slate-900">Investigación de Rutas</h2>
            <p className="text-sm text-slate-600">Rastrea la ruta histórica de cualquier vehículo</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Selector de Placa */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Placa del Vehículo *
            </label>
            <select
              value={selectedPlate}
              onChange={(e) => setSelectedPlate(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            >
              <option value="">Seleccionar placa...</option>
              {availablePlates.map(plate => (
                <option key={plate} value={plate}>{plate}</option>
              ))}
            </select>
          </div>

          {/* Fecha Inicio */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Fecha Inicio *
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>

          {/* Fecha Fin */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Fecha Fin *
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>

          {/* Botón Buscar */}
          <div className="flex items-end">
            <button
              onClick={handleSearch}
              disabled={loading || !selectedPlate || !startDate || !endDate}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm disabled:bg-slate-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  Buscando...
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  Buscar Ruta
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Estadísticas de la Ruta */}
      {routeStats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <MapPin className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-slate-600 font-medium">Total de Puntos</p>
                <p className="text-2xl font-bold text-slate-900">{routeStats.totalAlerts}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-xs text-slate-600 font-medium">Alertas Críticas</p>
                <p className="text-2xl font-bold text-red-600">{routeStats.criticalAlerts}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <p className="text-xs text-slate-600 font-medium">Alertas Altas</p>
                <p className="text-2xl font-bold text-orange-600">{routeStats.highAlerts}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <RouteIcon className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-slate-600 font-medium">Distancia Aprox.</p>
                <p className="text-2xl font-bold text-green-600">{routeStats.totalDistance} km</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Clock className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-xs text-slate-600 font-medium">Duración</p>
                <p className="text-2xl font-bold text-purple-600">{routeStats.duration} h</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mapa y Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Mapa */}
        <div className="lg:col-span-2">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <MapPin className="w-5 h-5 text-blue-600" />
                Mapa de Ruta
              </h3>
              {routePoints.length > 0 && (
                <button
                  onClick={handleExportReport}
                  className="flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                >
                  <Download className="w-4 h-4" />
                  Exportar
                </button>
              )}
            </div>

            <div className="h-[600px] rounded-lg overflow-hidden border border-slate-200">
              <MapContainer
                center={mapCenter}
                zoom={routePoints.length > 0 ? 13 : 6}
                scrollWheelZoom={true}
                className="h-full w-full"
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {/* Polilínea de la ruta */}
                {polylinePositions.length > 1 && (
                  <Polyline
                    positions={polylinePositions}
                    color="blue"
                    weight={3}
                    opacity={0.7}
                  />
                )}

                {/* Marcador de inicio */}
                {polylinePositions.length > 0 && (
                  <Marker position={polylinePositions[0]} icon={startIcon}>
                    <Popup>
                      <div className="p-2">
                        <div className="flex items-center gap-2 mb-2">
                          <Play className="w-4 h-4 text-green-600" />
                          <h4 className="font-bold text-green-800">Inicio de Ruta</h4>
                        </div>
                        <p className="text-xs text-slate-600">
                          {routeStats?.startTime.toLocaleString('es-CO')}
                        </p>
                        <p className="text-xs text-slate-600 mt-1">
                          {routePoints[0]?.location}
                        </p>
                      </div>
                    </Popup>
                  </Marker>
                )}

                {/* Marcador de fin */}
                {polylinePositions.length > 1 && (
                  <Marker position={polylinePositions[polylinePositions.length - 1]} icon={endIcon}>
                    <Popup>
                      <div className="p-2">
                        <div className="flex items-center gap-2 mb-2">
                          <Square className="w-4 h-4 text-red-600" />
                          <h4 className="font-bold text-red-800">Fin de Ruta</h4>
                        </div>
                        <p className="text-xs text-slate-600">
                          {routeStats?.endTime.toLocaleString('es-CO')}
                        </p>
                        <p className="text-xs text-slate-600 mt-1">
                          {routePoints[routePoints.length - 1]?.location}
                        </p>
                      </div>
                    </Popup>
                  </Marker>
                )}

                {/* Marcadores de alertas críticas */}
                {routePoints
                  .filter(p => p.severity === 'critical' || p.severity === 'high')
                  .map((point, index) => {
                    const coords = point.location.match(/(-?\d+\.?\d*),\s*(-?\d+\.?\d*)/);
                    if (!coords) return null;

                    return (
                      <Marker
                        key={`alert-${index}`}
                        position={[parseFloat(coords[1]), parseFloat(coords[2])]}
                        icon={alertIcon}
                      >
                        <Popup>
                          <div className="p-2 min-w-[200px]">
                            <div className={`flex items-center gap-2 mb-2 ${
                              point.severity === 'critical' ? 'text-red-600' : 'text-orange-600'
                            }`}>
                              <AlertTriangle className="w-4 h-4" />
                              <h4 className="font-bold">{point.type}</h4>
                            </div>
                            <div className="space-y-1 text-xs text-slate-600">
                              <p><strong>Hora:</strong> {new Date(point.timestamp).toLocaleTimeString('es-CO')}</p>
                              <p><strong>Conductor:</strong> {point.driver}</p>
                              <p><strong>Velocidad:</strong> {point.speed}</p>
                              <p><strong>Detalles:</strong> {point.details}</p>
                            </div>
                          </div>
                        </Popup>
                      </Marker>
                    );
                  })}
              </MapContainer>
            </div>
          </div>
        </div>

        {/* Timeline de Eventos */}
        <div className="lg:col-span-1">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm h-[680px] flex flex-col">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-4">
              <Activity className="w-5 h-5 text-purple-600" />
              Timeline de Eventos
            </h3>

            <div className="flex-1 overflow-y-auto space-y-3 pr-2">
              {routePoints.length === 0 ? (
                <div className="text-center py-12">
                  <Info className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-sm text-slate-500">
                    Selecciona una placa y rango de fechas<br />para ver el timeline
                  </p>
                </div>
              ) : (
                routePoints.map((point, index) => (
                  <div
                    key={index}
                    className={`p-3 rounded-lg border-l-4 ${
                      point.severity === 'critical' ? 'bg-red-50 border-red-500' :
                      point.severity === 'high' ? 'bg-orange-50 border-orange-500' :
                      point.severity === 'medium' ? 'bg-yellow-50 border-yellow-500' :
                      'bg-slate-50 border-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-1">
                      <span className="text-xs font-bold text-slate-500">#{index + 1}</span>
                      <span className="text-xs text-slate-600 font-medium">
                        {new Date(point.timestamp).toLocaleTimeString('es-CO', {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 mb-2">
                      {point.severity === 'critical' || point.severity === 'high' ? (
                        <AlertTriangle className={`w-4 h-4 ${
                          point.severity === 'critical' ? 'text-red-600' : 'text-orange-600'
                        }`} />
                      ) : (
                        <Info className="w-4 h-4 text-slate-600" />
                      )}
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        {point.type}
                      </p>
                    </div>

                    <div className="space-y-1 text-xs text-slate-600">
                      <div className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        <span className="truncate">{point.driver}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Gauge className="w-3 h-3" />
                        <span>{point.speed}</span>
                      </div>
                      <div className="flex items-start gap-1">
                        <MapPin className="w-3 h-3 flex-shrink-0 mt-0.5" />
                        <span className="line-clamp-2 text-[10px]">{point.location}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
