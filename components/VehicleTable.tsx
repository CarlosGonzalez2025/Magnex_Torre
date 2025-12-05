import React, { useState } from 'react';
import { Vehicle, ApiSource, VehicleStatus } from '../types';
import { Battery, Signal, MapPin, FileDown, Search } from 'lucide-react';
import { usePagination } from '../hooks/usePagination';
import { PaginationControls } from './PaginationControls';
import { useExportToExcel } from '../hooks/useExportToExcel';

interface VehicleTableProps {
  vehicles: Vehicle[];
}

export const VehicleTable: React.FC<VehicleTableProps> = ({ vehicles }) => {
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | VehicleStatus>('ALL');
  const [sourceFilter, setSourceFilter] = useState<'ALL' | ApiSource>('ALL');
  const { exportToExcel } = useExportToExcel();

  // Filtrado
  const filteredVehicles = vehicles.filter(vehicle => {
    // Búsqueda de texto
    if (searchText) {
      const search = searchText.toLowerCase();
      const matchesSearch =
        vehicle.plate.toLowerCase().includes(search) ||
        vehicle.driver.toLowerCase().includes(search) ||
        vehicle.id.toLowerCase().includes(search) ||
        (vehicle.contract && vehicle.contract.toLowerCase().includes(search)) ||
        vehicle.location.toLowerCase().includes(search);

      if (!matchesSearch) return false;
    }

    // Filtro de estado
    if (statusFilter !== 'ALL' && vehicle.status !== statusFilter) return false;

    // Filtro de fuente API
    if (sourceFilter !== 'ALL' && vehicle.source !== sourceFilter) return false;

    return true;
  });

  // Hook de paginación
  const pagination = usePagination(filteredVehicles, {
    initialPageSize: 20,
    pageSizeOptions: [10, 20, 50, 100]
  });

  // Función para exportar a Excel
  const handleExport = () => {
    exportToExcel(
      filteredVehicles,
      [
        { header: 'Placa', key: 'plate', width: 12 },
        { header: 'API', key: 'source', width: 12 },
        { header: 'Contrato', key: 'contract', width: 15 },
        { header: 'Estado', key: 'status', width: 12 },
        { header: 'Velocidad', key: 'speed', width: 12 },
        { header: 'Conductor', key: 'driver', width: 25 },
        { header: 'ID', key: 'id', width: 25 },
        { header: 'Ubicación', key: 'location', width: 40 },
        { header: 'Latitud', key: 'latitude', width: 15 },
        { header: 'Longitud', key: 'longitude', width: 15 },
        { header: 'Combustible', key: 'fuelLevel', width: 12 },
        { header: 'Odómetro', key: 'odometer', width: 12 },
        { header: 'Última Actualización', key: 'lastUpdate', width: 20 },
      ],
      `Vehiculos_${new Date().toLocaleDateString('es-CO').replace(/\//g, '-')}`
    );
  };

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
    <div className="space-y-4">
      {/* Filtros y Búsqueda */}
      <div className="flex flex-wrap gap-4 items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        {/* Búsqueda */}
        <div className="flex items-center gap-2 flex-1 min-w-[250px]">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por placa, conductor, contrato, ID..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>

        {/* Filtro Estado */}
        <div className="flex items-center gap-2">
          <label className="text-sm font-semibold text-slate-600">Estado:</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            <option value="ALL">Todos</option>
            <option value={VehicleStatus.MOVING}>En movimiento</option>
            <option value={VehicleStatus.IDLE}>Inactivo</option>
            <option value={VehicleStatus.STOPPED}>Detenido</option>
            <option value={VehicleStatus.OFF}>Apagado</option>
          </select>
        </div>

        {/* Filtro API */}
        <div className="flex items-center gap-2">
          <label className="text-sm font-semibold text-slate-600">API:</label>
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value as any)}
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            <option value="ALL">Todas</option>
            <option value={ApiSource.FAGOR}>Fagor</option>
            <option value={ApiSource.SASCAR}>Sascar</option>
          </select>
        </div>

        {/* Botón Exportar */}
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
          title="Exportar a Excel"
        >
          <FileDown className="w-4 h-4" />
          Excel
        </button>

        {/* Contador */}
        <div className="text-sm font-semibold text-slate-600">
          {filteredVehicles.length} vehículo{filteredVehicles.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white">
        <table className="w-full text-sm">
        <thead className="bg-gradient-to-r from-slate-700 to-slate-600 text-white">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider">Placa</th>
            <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider">API</th>
            <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider">Contrato</th>
            <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider">Estado</th>
            <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider">Velocidad</th>
            <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider">Conductor</th>
            <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider">Ubicación</th>
            <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider">Combustible</th>
            <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider">Odómetro</th>
            <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider">Última Act.</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {pagination.paginatedData.map((vehicle, index) => (
            <tr
              key={vehicle.id}
              className={`${index % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-blue-50 transition-colors`}
            >
              {/* Placa */}
              <td className="px-4 py-3 whitespace-nowrap">
                <span className="font-bold text-slate-900 text-base">{vehicle.plate}</span>
              </td>

              {/* API Source */}
              <td className="px-4 py-3 whitespace-nowrap">
                <span className={`px-2 py-1 rounded text-xs font-semibold ${getSourceBadge(vehicle.source)}`}>
                  {vehicle.source}
                </span>
              </td>

              {/* Contrato */}
              <td className="px-4 py-3 whitespace-nowrap">
                {vehicle.contract && vehicle.contract !== 'No asignado' ? (
                  <span className="text-sm text-sky-700 font-medium">
                    {vehicle.contract}
                  </span>
                ) : (
                  <span className="text-xs text-slate-400">-</span>
                )}
              </td>

              {/* Estado */}
              <td className="px-4 py-3 text-center whitespace-nowrap">
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${getStatusColor(vehicle.status)}`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-current mr-1.5 animate-pulse"></span>
                  {vehicle.status}
                </span>
              </td>

              {/* Velocidad */}
              <td className="px-4 py-3 text-center whitespace-nowrap">
                <span className="font-bold text-slate-900">{vehicle.speed}</span>
                <span className="text-xs text-slate-500 ml-1">km/h</span>
              </td>

              {/* Conductor */}
              <td className="px-4 py-3">
                <div className="text-sm font-medium text-slate-900">{vehicle.driver}</div>
                <div className="text-xs text-slate-500">ID: {vehicle.id}</div>
              </td>

              {/* Ubicación */}
              <td className="px-4 py-3">
                <div className="flex items-start text-slate-700 max-w-xs">
                  <MapPin className="w-3.5 h-3.5 mr-1 mt-0.5 flex-shrink-0 text-blue-600" />
                  <span className="text-sm">{vehicle.location}</span>
                </div>
                <div className="text-xs text-slate-400 mt-0.5 ml-4">
                  {vehicle.latitude.toFixed(4)}, {vehicle.longitude.toFixed(4)}
                </div>
              </td>

              {/* Combustible */}
              <td className="px-4 py-3 text-center whitespace-nowrap">
                <div className="inline-flex items-center gap-1">
                  <Battery className="w-4 h-4 text-slate-600" />
                  <span className="font-semibold text-slate-900">{vehicle.fuelLevel}%</span>
                </div>
              </td>

              {/* Odómetro */}
              <td className="px-4 py-3 text-center whitespace-nowrap">
                <div className="inline-flex items-center gap-1">
                  <Signal className="w-4 h-4 text-slate-600" />
                  <span className="font-semibold text-slate-900">{vehicle.odometer.toLocaleString()}</span>
                  <span className="text-xs text-slate-500">km</span>
                </div>
              </td>

              {/* Última Actualización */}
              <td className="px-4 py-3 text-center whitespace-nowrap">
                <div className="text-sm text-slate-700 font-medium">
                  {new Date(vehicle.lastUpdate).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                </div>
                <div className="text-xs text-slate-500">
                  {new Date(vehicle.lastUpdate).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

        {/* Controles de paginación */}
        <PaginationControls
          currentPage={pagination.currentPage}
          totalPages={pagination.totalPages}
          pageSize={pagination.pageSize}
          pageSizeOptions={pagination.pageSizeOptions}
          recordInfo={pagination.recordInfo}
          visiblePages={pagination.visiblePages}
          canGoNext={pagination.canGoNext}
          canGoPrevious={pagination.canGoPrevious}
          onPageChange={pagination.goToPage}
          onPageSizeChange={pagination.changePageSize}
          onFirstPage={pagination.goToFirstPage}
          onLastPage={pagination.goToLastPage}
          onNextPage={pagination.goToNextPage}
          onPreviousPage={pagination.goToPreviousPage}
        />
      </div>
    </div>
  );
};