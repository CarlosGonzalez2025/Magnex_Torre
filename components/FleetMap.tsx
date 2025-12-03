import React from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { Icon } from 'leaflet';
import { Vehicle, ApiSource } from '../types';
import { Navigation, Clock, Fuel, User } from 'lucide-react';

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
            icon={vehicle.source === ApiSource.FAGOR ? fagorIcon : coltrackIcon}
          >
            <Popup>
              <div className="p-1 min-w-[200px]">
                <div className="border-b pb-2 mb-2">
                  <div className="flex justify-between items-center">
                    <h3 className="font-bold text-lg text-slate-800">{vehicle.plate}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full text-white ${vehicle.source === ApiSource.FAGOR ? 'bg-blue-500' : 'bg-green-500'}`}>
                      {vehicle.source}
                    </span>
                  </div>
                  {vehicle.contract && vehicle.contract !== 'No asignado' && (
                    <div className="text-xs text-sky-600 font-semibold mt-1">
                      {vehicle.contract}
                    </div>
                  )}
                </div>

                <div className="space-y-2 text-sm text-slate-600">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4" />
                    <span>{vehicle.driver}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Navigation className="w-4 h-4" />
                    <span>{vehicle.status} ({vehicle.speed} km/h)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Fuel className="w-4 h-4" />
                    <span>{vehicle.fuelLevel}% Combustible</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    <span>{new Date(vehicle.lastUpdate).toLocaleTimeString()}</span>
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