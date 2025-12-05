import React from 'react';
import { Vehicle } from '../types';
import { X, MapPin, Battery, Signal, Clock, Gauge, User, Briefcase, Radio } from 'lucide-react';

interface VehicleDetailModalProps {
  vehicle: Vehicle | null;
  isOpen: boolean;
  onClose: () => void;
}

export const VehicleDetailModal: React.FC<VehicleDetailModalProps> = ({ vehicle, isOpen, onClose }) => {
  if (!isOpen || !vehicle) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="p-6 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Detalle del Vehículo</h2>
            <p className="text-lg text-sky-600 font-semibold mt-1">{vehicle.plate}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            title="Cerrar"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Estado y API */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-50 p-4 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Radio className="w-5 h-5 text-slate-600" />
                <h3 className="font-semibold text-slate-900">Estado</h3>
              </div>
              <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-semibold ${
                vehicle.status === 'MOVING' ? 'bg-green-100 text-green-800' :
                vehicle.status === 'IDLE' ? 'bg-orange-100 text-orange-800' :
                'bg-red-100 text-red-800'
              }`}>
                <span className="w-2 h-2 rounded-full bg-current mr-2 animate-pulse"></span>
                {vehicle.status}
              </span>
            </div>

            <div className="bg-slate-50 p-4 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Signal className="w-5 h-5 text-slate-600" />
                <h3 className="font-semibold text-slate-900">Fuente API</h3>
              </div>
              <span className={`px-3 py-1.5 rounded text-sm font-semibold ${
                vehicle.source === 'FAGOR' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
              }`}>
                {vehicle.source}
              </span>
            </div>
          </div>

          {/* Información del Conductor */}
          <div className="bg-blue-50 p-4 rounded-lg">
            <div className="flex items-center gap-2 mb-3">
              <User className="w-5 h-5 text-blue-600" />
              <h3 className="font-semibold text-slate-900">Conductor</h3>
            </div>
            <div className="space-y-2">
              <div>
                <span className="text-sm text-slate-600">Nombre:</span>
                <p className="text-lg font-medium text-slate-900">{vehicle.driver}</p>
              </div>
              <div>
                <span className="text-sm text-slate-600">ID:</span>
                <p className="font-mono text-sm text-slate-700">{vehicle.id}</p>
              </div>
            </div>
          </div>

          {/* Contrato */}
          {vehicle.contract && vehicle.contract !== 'No asignado' && (
            <div className="bg-purple-50 p-4 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Briefcase className="w-5 h-5 text-purple-600" />
                <h3 className="font-semibold text-slate-900">Contrato</h3>
              </div>
              <p className="text-lg font-medium text-slate-900">{vehicle.contract}</p>
            </div>
          )}

          {/* Ubicación */}
          <div className="bg-green-50 p-4 rounded-lg">
            <div className="flex items-center gap-2 mb-3">
              <MapPin className="w-5 h-5 text-green-600" />
              <h3 className="font-semibold text-slate-900">Ubicación Actual</h3>
            </div>
            <div className="space-y-2">
              <p className="text-slate-900">{vehicle.location}</p>
              <div className="flex gap-4 text-sm">
                <div>
                  <span className="text-slate-600">Latitud:</span>
                  <span className="ml-2 font-mono text-slate-900">{vehicle.latitude.toFixed(6)}</span>
                </div>
                <div>
                  <span className="text-slate-600">Longitud:</span>
                  <span className="ml-2 font-mono text-slate-900">{vehicle.longitude.toFixed(6)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Métricas del Vehículo */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Velocidad */}
            <div className="bg-slate-50 p-4 rounded-lg text-center">
              <Gauge className="w-6 h-6 text-slate-600 mx-auto mb-2" />
              <p className="text-sm text-slate-600 mb-1">Velocidad</p>
              <p className="text-2xl font-bold text-slate-900">{vehicle.speed}</p>
              <p className="text-xs text-slate-500">km/h</p>
            </div>

            {/* Combustible */}
            <div className="bg-slate-50 p-4 rounded-lg text-center">
              <Battery className="w-6 h-6 text-slate-600 mx-auto mb-2" />
              <p className="text-sm text-slate-600 mb-1">Combustible</p>
              <p className="text-2xl font-bold text-slate-900">{vehicle.fuelLevel}</p>
              <p className="text-xs text-slate-500">%</p>
            </div>

            {/* Odómetro */}
            <div className="bg-slate-50 p-4 rounded-lg text-center col-span-2">
              <Signal className="w-6 h-6 text-slate-600 mx-auto mb-2" />
              <p className="text-sm text-slate-600 mb-1">Odómetro</p>
              <p className="text-2xl font-bold text-slate-900">{vehicle.odometer.toLocaleString()}</p>
              <p className="text-xs text-slate-500">kilómetros</p>
            </div>
          </div>

          {/* Última Actualización */}
          <div className="bg-amber-50 p-4 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-5 h-5 text-amber-600" />
              <h3 className="font-semibold text-slate-900">Última Actualización</h3>
            </div>
            <p className="text-lg text-slate-900">
              {new Date(vehicle.lastUpdate).toLocaleString('es-CO', {
                day: '2-digit',
                month: 'long',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
              })}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-200 bg-slate-50">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-800 transition-colors font-medium"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
