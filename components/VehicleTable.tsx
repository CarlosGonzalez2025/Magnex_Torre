import React from 'react';
import { Vehicle, ApiSource, VehicleStatus } from '../types';
import { Battery, Signal, MapPin } from 'lucide-react';

interface VehicleTableProps {
  vehicles: Vehicle[];
}

export const VehicleTable: React.FC<VehicleTableProps> = ({ vehicles }) => {
  const getStatusColor = (status: VehicleStatus) => {
    switch (status) {
      case VehicleStatus.MOVING: return 'text-green-600 bg-green-100';
      case VehicleStatus.IDLE: return 'text-orange-600 bg-orange-100';
      case VehicleStatus.STOPPED:
      case VehicleStatus.OFF: return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getSourceBadge = (source: ApiSource) => {
    return source === ApiSource.FAGOR 
      ? 'bg-blue-100 text-blue-800 border-blue-200' 
      : 'bg-green-100 text-green-800 border-green-200';
  };

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white">
      <table className="w-full text-sm text-left">
        <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="px-6 py-4 font-semibold">Placa / API</th>
            <th className="px-6 py-4 font-semibold">Estado</th>
            <th className="px-6 py-4 font-semibold">Conductor</th>
            <th className="px-6 py-4 font-semibold">Ubicación</th>
            <th className="px-6 py-4 font-semibold text-center">Datos Técnicos</th>
            <th className="px-6 py-4 font-semibold text-right">Actualización</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {vehicles.map((vehicle) => (
            <tr key={vehicle.id} className="hover:bg-slate-50 transition-colors">
              <td className="px-6 py-4">
                <div className="flex flex-col">
                  <span className="font-bold text-slate-800 text-base">{vehicle.plate}</span>
                  <span className={`mt-1 inline-flex items-center w-fit px-2 py-0.5 rounded text-xs font-medium border ${getSourceBadge(vehicle.source)}`}>
                    {vehicle.source}
                  </span>
                </div>
              </td>
              <td className="px-6 py-4">
                <div className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${getStatusColor(vehicle.status)}`}>
                  <span className="w-2 h-2 rounded-full bg-current mr-2 animate-pulse"></span>
                  {vehicle.status}
                </div>
                <div className="mt-1 text-slate-500 text-xs font-medium pl-1">
                  {vehicle.speed} km/h
                </div>
              </td>
              <td className="px-6 py-4">
                <div className="font-medium text-slate-900">{vehicle.driver}</div>
                <div className="text-slate-500 text-xs">ID: {vehicle.id}</div>
              </td>
              <td className="px-6 py-4">
                <div className="flex items-center text-slate-600">
                  <MapPin className="w-3 h-3 mr-1" />
                  {vehicle.location}
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  {vehicle.latitude.toFixed(4)}, {vehicle.longitude.toFixed(4)}
                </div>
              </td>
              <td className="px-6 py-4">
                <div className="flex flex-col gap-1 items-center">
                  <div className="flex items-center text-xs text-slate-600 bg-slate-100 px-2 py-1 rounded w-full justify-between max-w-[140px]">
                    <span className="flex items-center"><Battery className="w-3 h-3 mr-1" /> Fuel</span>
                    <span className="font-semibold">{vehicle.fuelLevel}%</span>
                  </div>
                   <div className="flex items-center text-xs text-slate-600 bg-slate-100 px-2 py-1 rounded w-full justify-between max-w-[140px]">
                    <span className="flex items-center"><Signal className="w-3 h-3 mr-1" /> ODO</span>
                    <span className="font-semibold">{vehicle.odometer.toLocaleString()} km</span>
                  </div>
                </div>
              </td>
              <td className="px-6 py-4 text-right text-slate-600">
                {new Date(vehicle.lastUpdate).toLocaleTimeString()}
                <div className="text-xs text-slate-400">
                  {new Date(vehicle.lastUpdate).toLocaleDateString()}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};