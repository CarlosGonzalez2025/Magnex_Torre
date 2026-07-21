import React, { useState, useMemo, useEffect, useRef } from 'react';
import { MapContainer as ReactLeafletMap, TileLayer as ReactLeafletTile, Marker as ReactLeafletMarker, Popup as ReactLeafletPopup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Vehicle, ApiSource, VehicleStatus } from '../types';
import {
  Navigation,
  Clock,
  Fuel,
  User,
  MapPin,
  Gauge,
  Radio,
  Info,
  Search,
  Maximize2,
  Minimize2,
  Compass,
  Layers,
  Activity,
  Zap,
  Truck,
  Building2,
  ExternalLink,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Globe,
  Filter,
} from 'lucide-react';

// ==================== TIPOS DE MAPAS / CAPAS DISPONIBLES ====================
type TileLayerStyle = 'DARK' | 'SATELLITE' | 'STREETS' | 'TOPO';

interface TileOption {
  id: TileLayerStyle;
  name: string;
  url: string;
  attribution: string;
  icon: string;
}

const TILE_LAYERS: Record<TileLayerStyle, TileOption> = {
  STREETS: {
    id: 'STREETS',
    name: 'Callejero HD',
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://openstreetmap.org">OpenStreetMap</a>',
    icon: '🗺️',
  },
  DARK: {
    id: 'DARK',
    name: 'Modo Oscuro',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://openstreetmap.org">OpenStreetMap</a>',
    icon: '🌙',
  },
  SATELLITE: {
    id: 'SATELLITE',
    name: 'Satelital HD',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
    icon: '🛰️',
  },
  TOPO: {
    id: 'TOPO',
    name: 'Topográfico',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
    icon: '🏔️',
  },
};

// ==================== COMPONENTE DE CONTROLADORES DE MAPA ====================
const MapController: React.FC<{
  vehicles: Vehicle[];
  selectedVehicle: Vehicle | null;
  autoCenterTrigger: number;
}> = ({ vehicles, selectedVehicle, autoCenterTrigger }) => {
  const map = useMap();

  useEffect(() => {
    if (selectedVehicle && selectedVehicle.latitude && selectedVehicle.longitude && selectedVehicle.latitude !== 0) {
      map.flyTo([selectedVehicle.latitude, selectedVehicle.longitude], 16, {
        animate: true,
        duration: 1.4,
      });
    }
  }, [selectedVehicle, map]);

  useEffect(() => {
    if (autoCenterTrigger > 0 && vehicles.length > 0) {
      const validVehicles = vehicles.filter(v => v.latitude && v.longitude && v.latitude !== 0 && v.longitude !== 0);
      if (validVehicles.length > 0) {
        const bounds = L.latLngBounds(
          validVehicles.map(v => [v.latitude, v.longitude] as [number, number])
        );
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15, animate: true, duration: 1.2 });
        }
      }
    }
  }, [autoCenterTrigger, vehicles, map]);

  return null;
};

// ==================== GENERADOR DE ÍCONOS SVG DINÁMICOS POR FUENTE GPS ====================
const createVehicleDivIcon = (vehicle: Vehicle, isSelected: boolean) => {
  const isMoving = vehicle.status === VehicleStatus.MOVING || vehicle.speed > 0;
  const isIdle = vehicle.status === VehicleStatus.IDLE;

  const statusColor = isMoving ? '#10b981' : isIdle ? '#f59e0b' : '#ef4444';
  const statusGlow = isMoving
    ? '0 0 15px rgba(16, 185, 129, 0.8), 0 0 30px rgba(16, 185, 129, 0.4)'
    : isIdle
    ? '0 0 12px rgba(245, 158, 11, 0.8)'
    : '0 0 8px rgba(239, 68, 68, 0.5)';

  // Color e inicial distintiva según proveedor de API GPS
  const sourceBadgeBg =
    vehicle.source === ApiSource.FAGOR
      ? '#2563eb'
      : vehicle.source === ApiSource.GEOTAB
      ? '#ea580c'
      : '#16a34a';

  const sourceLabel =
    vehicle.source === ApiSource.FAGOR
      ? 'F'
      : vehicle.source === ApiSource.GEOTAB
      ? 'G'
      : 'C';

  const html = `
    <div style="position: relative; display: flex; flex-direction: column; align-items: center; transform: translate(-50%, -100%);">
      <!-- Badge de Placa + Velocidad -->
      <div style="
        background: rgba(15, 23, 42, 0.92);
        backdrop-filter: blur(8px);
        color: #ffffff;
        padding: 3px 8px;
        border-radius: 8px;
        font-size: 11px;
        font-weight: 800;
        font-family: monospace;
        letter-spacing: 0.5px;
        border: 1px solid ${statusColor};
        box-shadow: ${statusGlow};
        white-space: nowrap;
        display: flex;
        align-items: center;
        gap: 5px;
        margin-bottom: 3px;
      ">
        <span style="color: ${statusColor}; font-weight: 900;">${vehicle.plate}</span>
        ${isMoving ? `<span style="background: ${statusColor}; color: #000; padding: 1px 4px; border-radius: 4px; font-size: 9px; font-weight: 900;">${Math.round(vehicle.speed)} km/h</span>` : ''}
      </div>

      <!-- Anillo del Marcador -->
      <div style="
        position: relative;
        width: 38px;
        height: 38px;
        background: #0f172a;
        border: 3px solid ${statusColor};
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: ${statusGlow};
        transition: transform 0.2s ease;
        ${isSelected ? 'transform: scale(1.25); border-width: 4px;' : ''}
      ">
        <!-- Insignia del Proveedor GPS (F=Fagor, C=Coltrack, G=Geotab) -->
        <span style="
          position: absolute;
          top: -4px;
          right: -4px;
          width: 15px;
          height: 15px;
          background: ${sourceBadgeBg};
          border: 2px solid #ffffff;
          border-radius: 50%;
          font-size: 8px;
          font-weight: 900;
          color: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 2px 4px rgba(0,0,0,0.5);
        " title="Proveedor GPS: ${vehicle.source}">
          ${sourceLabel}
        </span>

        <!-- SVG Icon Vehículo -->
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${statusColor}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="1" y="3" width="15" height="13" rx="2"></rect>
          <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon>
          <circle cx="5.5" cy="18.5" r="2.5"></circle>
          <circle cx="18.5" cy="18.5" r="2.5"></circle>
        </svg>
      </div>

      <!-- Punta Inferior del Marcador -->
      <div style="
        width: 0;
        height: 0;
        border-left: 6px solid transparent;
        border-right: 6px solid transparent;
        border-top: 8px solid ${statusColor};
        margin-top: -2px;
      "></div>
    </div>
  `;

  return L.divIcon({
    html,
    className: 'custom-vehicle-marker',
    iconSize: [40, 60],
    iconAnchor: [20, 60],
    popupAnchor: [0, -55],
  });
};

interface FleetMapProps {
  vehicles: Vehicle[];
}

export const FleetMap: React.FC<FleetMapProps> = ({ vehicles }) => {
  const [activeTileStyle, setActiveTileStyle] = useState<TileLayerStyle>('STREETS');
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);

  // Filtros interactivos del mapa
  const [mapSearch, setMapSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | VehicleStatus>('ALL');
  const [sourceFilter, setSourceFilter] = useState<'ALL' | ApiSource>('ALL');

  // Pantalla Completa y Menú Flotante
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showVehicleListSidebar, setShowVehicleListSidebar] = useState(false);
  const [autoCenterTrigger, setAutoCenterTrigger] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);

  // Conteos estadísticos globales y por proveedor de las 3 APIs (Coltrack, Fagor, Geotab)
  const providerCounts = useMemo(() => {
    const total = vehicles.length;
    const coltrack = vehicles.filter(v => v.source === ApiSource.COLTRACK).length;
    const fagor = vehicles.filter(v => v.source === ApiSource.FAGOR).length;
    const geotab = vehicles.filter(v => v.source === ApiSource.GEOTAB).length;

    const moving = vehicles.filter(v => v.status === VehicleStatus.MOVING || v.speed > 0).length;
    const idle = vehicles.filter(v => v.status === VehicleStatus.IDLE).length;
    const stopped = vehicles.filter(v => v.status === VehicleStatus.STOPPED || v.status === VehicleStatus.OFF).length;

    return { total, coltrack, fagor, geotab, moving, idle, stopped };
  }, [vehicles]);

  // Filtrado de vehículos válidos para renderizar en el mapa Leaflet
  const displayVehicles = useMemo(() => {
    return vehicles.filter(v => {
      // Filtrar coordenadas no válidas (0,0)
      if (!v.latitude || !v.longitude || (v.latitude === 0 && v.longitude === 0)) {
        return false;
      }

      const matchSearch =
        !mapSearch ||
        v.plate.toLowerCase().includes(mapSearch.toLowerCase()) ||
        v.driver.toLowerCase().includes(mapSearch.toLowerCase()) ||
        (v.contract && v.contract.toLowerCase().includes(mapSearch.toLowerCase()));

      const matchStatus = statusFilter === 'ALL' || v.status === statusFilter;
      const matchSource = sourceFilter === 'ALL' || v.source === sourceFilter;

      return matchSearch && matchStatus && matchSource;
    });
  }, [vehicles, mapSearch, statusFilter, sourceFilter]);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const defaultCenter: [number, number] = [4.5709, -74.2973]; // Centro Colombia

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full bg-slate-900 overflow-hidden font-sans select-none ${
        isFullscreen ? 'fixed inset-0 z-50 rounded-none' : 'rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xl'
      }`}
    >
      {/* ─── MAPA INTERACTIVO LEAFLET ─── */}
      <ReactLeafletMap
        center={defaultCenter}
        zoom={6}
        scrollWheelZoom={true}
        className="w-full h-full z-0"
        zoomControl={false}
      >
        <ReactLeafletTile
          key={activeTileStyle}
          url={TILE_LAYERS[activeTileStyle].url}
          attribution={TILE_LAYERS[activeTileStyle].attribution}
          maxZoom={19}
        />

        <MapController
          vehicles={displayVehicles}
          selectedVehicle={selectedVehicle}
          autoCenterTrigger={autoCenterTrigger}
        />

        {displayVehicles.map(vehicle => {
          const isSelected = selectedVehicle?.id === vehicle.id;
          return (
            <ReactLeafletMarker
              key={vehicle.id}
              position={[vehicle.latitude, vehicle.longitude]}
              icon={createVehicleDivIcon(vehicle, isSelected)}
              eventHandlers={{
                click: () => setSelectedVehicle(vehicle),
              }}
            >
              {/* POPUP DE DETALLE DEL VEHÍCULO */}
              <ReactLeafletPopup maxWidth={360} className="custom-leaflet-popup">
                <div className="p-3.5 bg-slate-900 text-white rounded-2xl shadow-2xl border border-slate-700 space-y-3 min-w-[290px]">

                  {/* Header: Placa, Badge Proveedor GPS y Estado */}
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-xl text-white tracking-wide">{vehicle.plate}</span>
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider text-white ${
                          vehicle.source === ApiSource.FAGOR
                            ? 'bg-blue-600'
                            : vehicle.source === ApiSource.GEOTAB
                            ? 'bg-orange-600'
                            : 'bg-emerald-600'
                        }`}>
                          {vehicle.source}
                        </span>
                      </div>
                      <p className="text-[11px] text-blue-400 font-semibold mt-0.5 flex items-center gap-1">
                        <Building2 className="w-3 h-3 text-blue-400" />
                        {vehicle.contract || 'SIN CONTRATO'}
                      </p>
                    </div>

                    <div className={`px-2.5 py-1 rounded-lg text-xs font-extrabold flex items-center gap-1.5 ${
                      vehicle.status === VehicleStatus.MOVING || vehicle.speed > 0
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                        : vehicle.status === VehicleStatus.IDLE
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                        : 'bg-red-500/20 text-red-400 border border-red-500/40'
                    }`}>
                      <span className={`w-2 h-2 rounded-full ${
                        vehicle.status === VehicleStatus.MOVING || vehicle.speed > 0
                          ? 'bg-emerald-400 animate-ping'
                          : vehicle.status === VehicleStatus.IDLE
                          ? 'bg-amber-400'
                          : 'bg-red-400'
                      }`} />
                      {vehicle.status}
                    </div>
                  </div>

                  {/* Telemetría: Velocidad & Combustible */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2 bg-slate-800/80 rounded-xl border border-slate-700/60 flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400">
                        <Gauge className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400 font-medium">Velocidad</p>
                        <p className="text-sm font-bold text-white">{Math.round(vehicle.speed)} km/h</p>
                      </div>
                    </div>

                    <div className="p-2 bg-slate-800/80 rounded-xl border border-slate-700/60 flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                        <Fuel className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400 font-medium">Combustible</p>
                        <p className="text-sm font-bold text-white">{vehicle.fuelLevel || 0}%</p>
                      </div>
                    </div>
                  </div>

                  {/* Conductor */}
                  <div className="p-2.5 bg-slate-800/60 rounded-xl border border-slate-700/60 flex items-center gap-2 text-xs">
                    <User className="w-4 h-4 text-purple-400 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] text-slate-400">Conductor Asignado</p>
                      <p className="text-xs font-bold text-white truncate">{vehicle.driver || 'Sin Asignar'}</p>
                    </div>
                  </div>

                  {/* Coordenadas GPS */}
                  <div className="flex items-center justify-between pt-1 border-t border-slate-800 text-[11px]">
                    <span className="font-mono flex items-center gap-1 text-slate-300">
                      <MapPin className="w-3.5 h-3.5 text-red-400" />
                      {vehicle.latitude.toFixed(5)}, {vehicle.longitude.toFixed(5)}
                    </span>
                    <a
                      href={`https://www.google.com/maps?q=${vehicle.latitude},${vehicle.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-400 hover:text-blue-300 flex items-center gap-1 font-bold hover:underline"
                    >
                      Google Maps <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>

                  <div className="text-[10px] text-slate-500 text-center flex items-center justify-center gap-1">
                    <Clock className="w-3 h-3" />
                    Actualizado: {new Date(vehicle.lastUpdate).toLocaleTimeString()}
                  </div>

                </div>
              </ReactLeafletPopup>
            </ReactLeafletMarker>
          );
        })}
      </ReactLeafletMap>

      {/* ─── BARRA SUPERIOR: CONTADORES POR PROVEEDOR GPS & BÚSQUEDA ─── */}
      <div className="absolute top-4 left-4 right-4 z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-3 pointer-events-none">

        {/* Indicadores de las 3 APIs (Coltrack, Fagor, Geotab) */}
        <div className="bg-slate-900/90 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-slate-700/80 shadow-2xl flex items-center gap-3 text-white pointer-events-auto flex-wrap">
          <div className="flex items-center gap-2 pr-2 border-r border-slate-700">
            <Activity className="w-4 h-4 text-blue-400 animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">En Mapa</span>
            <span className="bg-blue-600 text-white font-mono font-black text-xs px-2 py-0.5 rounded-md">
              {displayVehicles.length} / {providerCounts.total}
            </span>
          </div>

          {/* Botones Filtros por Proveedor API */}
          <div className="flex items-center gap-1 text-xs">
            <button
              onClick={() => setSourceFilter('ALL')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                sourceFilter === 'ALL'
                  ? 'bg-slate-700 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Todos ({providerCounts.total})
            </button>

            <button
              onClick={() => setSourceFilter(ApiSource.FAGOR)}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all flex items-center gap-1 ${
                sourceFilter === ApiSource.FAGOR
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-blue-900/30 text-blue-300 hover:bg-blue-900/60'
              }`}
            >
              Fagor ({providerCounts.fagor})
            </button>

            <button
              onClick={() => setSourceFilter(ApiSource.GEOTAB)}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all flex items-center gap-1 ${
                sourceFilter === ApiSource.GEOTAB
                  ? 'bg-orange-600 text-white shadow-sm'
                  : 'bg-orange-900/30 text-orange-300 hover:bg-orange-900/60'
              }`}
            >
              Geotab ({providerCounts.geotab})
            </button>

            <button
              onClick={() => setSourceFilter(ApiSource.COLTRACK)}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all flex items-center gap-1 ${
                sourceFilter === ApiSource.COLTRACK
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-emerald-900/30 text-emerald-300 hover:bg-emerald-900/60'
              }`}
            >
              Coltrack ({providerCounts.coltrack})
            </button>
          </div>
        </div>

        {/* Controles de Búsqueda y Herramientas */}
        <div className="flex items-center gap-2 pointer-events-auto">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar placa, conductor o contrato..."
              value={mapSearch}
              onChange={e => setMapSearch(e.target.value)}
              className="pl-9 pr-3 py-2 text-xs bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xl w-60"
            />
          </div>

          <button
            onClick={() => setAutoCenterTrigger(p => p + 1)}
            className="p-2.5 bg-slate-900/90 backdrop-blur-md hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white rounded-xl shadow-xl transition-all"
            title="Auto-centrar mapa en toda la flota"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            onClick={() => setShowVehicleListSidebar(p => !p)}
            className={`px-3 py-2 text-xs font-bold rounded-xl border backdrop-blur-md transition-all shadow-xl flex items-center gap-1.5 ${
              showVehicleListSidebar
                ? 'bg-blue-600 border-blue-500 text-white'
                : 'bg-slate-900/90 border-slate-700 text-slate-300 hover:text-white'
            }`}
          >
            <Truck className="w-3.5 h-3.5" /> Lista ({displayVehicles.length})
          </button>

          <button
            onClick={toggleFullscreen}
            className="p-2.5 bg-slate-900/90 backdrop-blur-md hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white rounded-xl shadow-xl transition-all"
            title={isFullscreen ? 'Salir de Pantalla Completa' : 'Pantalla Completa'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>

      </div>

      {/* ─── CONTROLES DE CAPAS DE MAPA (INFERIOR IZQUIERDO) ─── */}
      <div className="absolute bottom-4 left-4 z-10 bg-slate-900/90 backdrop-blur-md p-1.5 rounded-2xl border border-slate-700/80 shadow-2xl flex items-center gap-1">
        {Object.values(TILE_LAYERS).map(tile => (
          <button
            key={tile.id}
            onClick={() => setActiveTileStyle(tile.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeTileStyle === tile.id
                ? 'bg-blue-600 text-white shadow-lg'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
            }`}
          >
            <span>{tile.icon}</span>
            <span className="hidden sm:inline">{tile.name}</span>
          </button>
        ))}
      </div>

      {/* ─── LISTA FLOTANTE LATERAL ─── */}
      {showVehicleListSidebar && (
        <div className="absolute top-20 right-4 bottom-16 z-20 w-80 bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-right-4 duration-200">
          <div className="p-3 border-b border-slate-800 flex items-center justify-between">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Truck className="w-4 h-4 text-blue-400" />
              Vehículos en Mapa ({displayVehicles.length})
            </h3>
            <button
              onClick={() => setShowVehicleListSidebar(false)}
              className="text-slate-400 hover:text-white text-xs font-bold p-1"
            >
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1.5 divide-y divide-slate-800/50">
            {displayVehicles.map(v => (
              <div
                key={v.id}
                onClick={() => setSelectedVehicle(v)}
                className={`p-2.5 rounded-xl cursor-pointer transition-all border ${
                  selectedVehicle?.id === v.id
                    ? 'bg-blue-900/40 border-blue-500/80 text-white shadow-md'
                    : 'bg-slate-800/40 border-transparent text-slate-300 hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-sm text-white">{v.plate}</span>
                  <span className={`text-[10px] font-black px-1.5 py-0.5 rounded text-white ${
                    v.source === ApiSource.FAGOR
                      ? 'bg-blue-600'
                      : v.source === ApiSource.GEOTAB
                      ? 'bg-orange-600'
                      : 'bg-emerald-600'
                  }`}>
                    {v.source}
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1">
                  <span className="truncate max-w-[160px]">{v.contract || 'Sin Contrato'}</span>
                  <span className="font-mono font-bold text-blue-400">{Math.round(v.speed)} km/h</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
};

export default FleetMap;