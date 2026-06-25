import React from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { Icon } from 'leaflet';
import { Vehicle, ApiSource } from '../types';
import { Navigation, Clock, Fuel, User, MapPin, Gauge, Calendar, Radio, Info } from 'lucide-react';

// Custom icons based on API source
// Note: We use the URLs directly. Leaflet CSS is loaded in index.html
const fagorIcon = new Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const coltrackIcon = new Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const geotabIcon = new Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-orange.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

// Selecciona el ícono del marcador según la plataforma de origen.
const iconForSource = (source: ApiSource): Icon => {
  if (source === ApiSource.FAGOR) return fagorIcon;
  if (source === ApiSource.GEOTAB) return geotabIcon;
  return coltrackIcon;
};

interface FleetMapProps {
  vehicles: Vehicle[];
}

const FleetMap: React.FC<FleetMapProps> = ({ vehicles }) => {
  const centerPosition: [number, number] = [4.5709, -74.2973]; // Colombia Center

  return (
    <div className="h-[600px] w-full rounded-xl overflow-hidden border border-slate-200 shadow-sm z-0 relative">
      <MapContainer center={centerPosition} zoom={6} scrollWheelZoom={true} className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {vehicles.map((vehicle) => (
          <Marker
            key={vehicle.id}
            position={[vehicle.latitude, vehicle.longitude]}
            icon={iconForSource(vehicle.source)}
          >
            <Popup maxWidth={350} className="vehicle-popup">
              <div className="p-2 min-w-[300px]">
                {/* Header con placa y fuente */}
                <div className="border-b-2 border-slate-200 pb-3 mb-3">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="font-bold text-xl text-slate-900">{vehicle.plate}</h3>
                      {vehicle.contract && vehicle.contract !== 'No asignado' && (
                        <div className="text-xs text-sky-600 font-semibold mt-1 flex items-center gap-1">
                          <Info className="w-3 h-3" />
                          {vehicle.contract}
                        </div>
                      )}
                    </div>
                    <span className={`text-xs px-3 py-1 rounded-full text-white font-semibold ${vehicle.source === ApiSource.FAGOR ? 'bg-blue-500' : vehicle.source === ApiSource.GEOTAB ? 'bg-orange-500' : 'bg-green-500'}`}>
                      <Radio className="w-3 h-3 inline mr-1" />
                      {vehicle.source}
                    </span>
                  </div>

                  {/* Estado del vehículo */}
                  <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold ${
                    vehicle.status === 'En Movimiento' ? 'bg-green-100 text-green-800' :
                    vehicle.status === 'Detenido' ? 'bg-yellow-100 text-yellow-800' :
                    vehicle.status === 'Apagado' ? 'bg-red-100 text-red-800' :
                    'bg-slate-100 text-slate-800'
                  }`}>
                    <Navigation className="w-4 h-4" />
                    {vehicle.status}
                  </div>
                </div>

                {/* Información detallada */}
                <div className="space-y-2.5">
                  {/* Conductor */}
                  <div className="flex items-start gap-2 p-2 bg-slate-50 rounded-lg">
                    <User className="w-4 h-4 text-slate-600 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-slate-500 font-medium">Conductor</p>
                      <p className="text-sm text-slate-900 font-semibold truncate">{vehicle.driver}</p>
                    </div>
                  </div>

                  {/* Velocidad */}
                  <div className="flex items-start gap-2 p-2 bg-slate-50 rounded-lg">
                    <Gauge className="w-4 h-4 text-slate-600 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-xs text-slate-500 font-medium">Velocidad Actual</p>
                      <p className="text-sm text-slate-900 font-semibold">{vehicle.speed} km/h</p>
                    </div>
                  </div>

                  {/* Combustible */}
                  <div className="flex items-start gap-2 p-2 bg-slate-50 rounded-lg">
                    <Fuel className="w-4 h-4 text-slate-600 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-xs text-slate-500 font-medium">Nivel de Combustible</p>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              vehicle.fuelLevel > 50 ? 'bg-green-500' :
                              vehicle.fuelLevel > 20 ? 'bg-yellow-500' :
                              'bg-red-500'
                            }`}
                            style={{ width: `${vehicle.fuelLevel}%` }}
                          />
                        </div>
                        <span className="text-sm font-bold text-slate-900">{vehicle.fuelLevel}%</span>
                      </div>
                    </div>
                  </div>

                  {/* Ubicación */}
                  <div className="flex items-start gap-2 p-2 bg-slate-50 rounded-lg">
                    <MapPin className="w-4 h-4 text-slate-600 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-slate-500 font-medium">Coordenadas</p>
                      <p className="text-xs text-slate-900 font-mono">
                        {vehicle.latitude.toFixed(6)}, {vehicle.longitude.toFixed(6)}
                      </p>
                    </div>
                  </div>

                  {/* Última actualización */}
                  <div className="flex items-start gap-2 p-2 bg-blue-50 rounded-lg border border-blue-200">
                    <Clock className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-xs text-blue-700 font-medium">Última Actualización</p>
                      <p className="text-sm text-blue-900 font-semibold">
                        {new Date(vehicle.lastUpdate).toLocaleString('es-CO', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit'
                        })}
                      </p>
                    </div>
                  </div>

                  {/* ID del vehículo */}
                  <div className="text-xs text-slate-400 text-center pt-2 border-t border-slate-200">
                    ID: {vehicle.id}
                  </div>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
};

export default FleetMap;