import React, { useState, useEffect, useMemo } from 'react';
import { Truck, Search, FileDown, RefreshCw, Database, AlertCircle, CheckCircle } from 'lucide-react';
import { Vehicle, ApiSource } from '../types';
import { usePagination } from '../hooks/usePagination';
import { PaginationControls } from './PaginationControls';
import { useExportToExcel } from '../hooks/useExportToExcel';

interface GoogleSheetsVehicle {
  placa: string;
  contrato: string;
  cliente: string;
  marca: string;
  linea: string;
  tipo: string;
  clase: string;
  conductor: string;
  estado: string;
}

interface FleetManagementProps {
  vehicles: Vehicle[]; // Current vehicles from GPS platforms
}

export const FleetManagement: React.FC<FleetManagementProps> = ({ vehicles }) => {
  const [sheetsData, setSheetsData] = useState<GoogleSheetsVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [platformFilter, setPlatformFilter] = useState<'ALL' | 'COLTRACK' | 'FAGOR' | 'GEOTAB' | 'NOT_MONITORED'>('ALL');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const { exportToExcel } = useExportToExcel();

  // Create a map of plates to their GPS platform
  const plateToSourceMap = useMemo(() => {
    const map: Record<string, ApiSource | null> = {};
    vehicles.forEach(vehicle => {
      map[vehicle.plate] = vehicle.source;
    });
    return map;
  }, [vehicles]);

  // Enrich Google Sheets data with GPS platform info
  const enrichedFleetData = useMemo(() => {
    return sheetsData.map(vehicle => ({
      ...vehicle,
      platform: plateToSourceMap[vehicle.placa] || null,
      isMonitored: plateToSourceMap[vehicle.placa] !== undefined
    }));
  }, [sheetsData, plateToSourceMap]);

  // Filter data based on search and platform filter
  const filteredData = useMemo(() => {
    return enrichedFleetData.filter(vehicle => {
      // Platform filter
      if (platformFilter === 'COLTRACK' && vehicle.platform !== ApiSource.COLTRACK) return false;
      if (platformFilter === 'FAGOR' && vehicle.platform !== ApiSource.FAGOR) return false;
      if (platformFilter === 'GEOTAB' && vehicle.platform !== ApiSource.GEOTAB) return false;
      if (platformFilter === 'NOT_MONITORED' && vehicle.platform !== null) return false;

      // Text search
      if (searchText) {
        const search = searchText.toLowerCase();
        return (
          vehicle.placa.toLowerCase().includes(search) ||
          vehicle.contrato.toLowerCase().includes(search) ||
          vehicle.cliente.toLowerCase().includes(search) ||
          vehicle.conductor.toLowerCase().includes(search) ||
          vehicle.marca.toLowerCase().includes(search) ||
          vehicle.linea.toLowerCase().includes(search)
        );
      }

      return true;
    });
  }, [enrichedFleetData, searchText, platformFilter]);

  // Statistics
  const stats = useMemo(() => {
    const coltrackCount = enrichedFleetData.filter(v => v.platform === ApiSource.COLTRACK).length;
    const fagorCount = enrichedFleetData.filter(v => v.platform === ApiSource.FAGOR).length;
    const geotabCount = enrichedFleetData.filter(v => v.platform === ApiSource.GEOTAB).length;
    const notMonitoredCount = enrichedFleetData.filter(v => !v.isMonitored).length;

    return {
      total: enrichedFleetData.length,
      coltrack: coltrackCount,
      fagor: fagorCount,
      geotab: geotabCount,
      notMonitored: notMonitoredCount,
      monitoredPercentage: Math.round(((coltrackCount + fagorCount + geotabCount) / enrichedFleetData.length) * 100) || 0
    };
  }, [enrichedFleetData]);

  // Pagination
  const pagination = usePagination(filteredData, {
    initialPageSize: 20,
    pageSizeOptions: [10, 20, 50, 100]
  });

  // Fetch Google Sheets data
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/google-sheets');
      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();

      if (result.success && result.data) {
        const formattedData: GoogleSheetsVehicle[] = result.data.map((record: any) => ({
          placa: record.Placa || record.PLACA || '',
          contrato: record.Contrato || record.CONTRATO || 'No asignado',
          cliente: record.Cliente || record.CLIENTE || '',
          marca: record.Marca || record.MARCA || '',
          linea: record.Linea || record.LINEA || '',
          tipo: record['Tipo de activo'] || record.TIPO_DE_ACTIVO || '',
          clase: record['Clase activo'] || record.CLASE_ACTIVO || '',
          conductor: record.Conductor || record.CONDUCTOR || '',
          estado: record['Estado actual activo'] || record.ESTADO_ACTUAL_ACTIVO || 'ACTIVO'
        }));

        setSheetsData(formattedData);
        setLastUpdate(new Date());
      } else {
        throw new Error(result.error || 'Invalid response format');
      }
    } catch (err: any) {
      console.error('[FleetManagement] Error fetching Google Sheets data:', err);
      setError(err.message || 'Error al cargar datos de Google Sheets');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Export to Excel
  const handleExport = () => {
    const exportData = filteredData.map(v => ({
      Placa: v.placa,
      'Plataforma GPS': v.platform || 'No monitoreado',
      Contrato: v.contrato,
      Cliente: v.cliente,
      Marca: v.marca,
      Línea: v.linea,
      Tipo: v.tipo,
      Clase: v.clase,
      Conductor: v.conductor,
      Estado: v.estado
    }));

    exportToExcel(
      exportData,
      [
        { header: 'Placa', key: 'Placa', width: 12 },
        { header: 'Plataforma GPS', key: 'Plataforma GPS', width: 15 },
        { header: 'Contrato', key: 'Contrato', width: 20 },
        { header: 'Cliente', key: 'Cliente', width: 25 },
        { header: 'Marca', key: 'Marca', width: 15 },
        { header: 'Línea', key: 'Línea', width: 20 },
        { header: 'Tipo', key: 'Tipo', width: 15 },
        { header: 'Clase', key: 'Clase', width: 15 },
        { header: 'Conductor', key: 'Conductor', width: 25 },
        { header: 'Estado', key: 'Estado', width: 15 }
      ],
      `Flota_Vehicular_${new Date().toLocaleDateString('es-CO').replace(/\//g, '-')}`
    );
  };

  const getPlatformBadge = (platform: ApiSource | null) => {
    if (!platform) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-600 border border-gray-300">
          <AlertCircle className="w-3 h-3" />
          Sin GPS
        </span>
      );
    }

    const platformStyles = platform === ApiSource.COLTRACK
      ? 'bg-purple-100 text-purple-800 border border-purple-300'
      : platform === ApiSource.GEOTAB
        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
        : 'bg-teal-100 text-teal-800 border border-teal-300';
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${platformStyles}`}>
        <CheckCircle className="w-3 h-3" />
        {platform}
      </span>
    );
  };

  if (loading && sheetsData.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <RefreshCw className="w-12 h-12 text-sky-500 animate-spin mx-auto mb-4" />
          <p className="text-slate-600 font-medium">Cargando flota vehicular...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6">
        <div className="flex items-center gap-3">
          <AlertCircle className="w-8 h-8 text-red-600" />
          <div>
            <h3 className="font-bold text-red-900 text-lg">Error al cargar datos</h3>
            <p className="text-red-700 mt-1">{error}</p>
            <button
              onClick={fetchData}
              className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Reintentar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-indigo-500 rounded-xl p-6 text-white shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Truck className="w-10 h-10" />
            <div>
              <h2 className="text-2xl font-bold">Gestión de Flota Vehicular</h2>
              <p className="text-indigo-100 text-sm mt-1">
                Datos desde Google Sheets • Plataformas GPS conectadas
              </p>
            </div>
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-white text-indigo-600 rounded-lg hover:bg-indigo-50 transition-colors font-medium disabled:opacity-50"
            title="Actualizar datos"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-600 font-medium">Total Vehículos</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{stats.total}</p>
            </div>
            <Database className="w-8 h-8 text-slate-400" />
          </div>
        </div>

        <div className="bg-purple-50 rounded-xl border border-purple-200 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-purple-700 font-medium">COLTRACK</p>
              <p className="text-2xl font-bold text-purple-900 mt-1">{stats.coltrack}</p>
            </div>
            <CheckCircle className="w-8 h-8 text-purple-500" />
          </div>
        </div>

        <div className="bg-teal-50 rounded-xl border border-teal-200 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-teal-700 font-medium">FAGOR</p>
              <p className="text-2xl font-bold text-teal-900 mt-1">{stats.fagor}</p>
            </div>
            <CheckCircle className="w-8 h-8 text-teal-500" />
          </div>
        </div>

        <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-emerald-700 font-medium">GEOTAB</p>
              <p className="text-2xl font-bold text-emerald-900 mt-1">{stats.geotab}</p>
            </div>
            <CheckCircle className="w-8 h-8 text-emerald-500" />
          </div>
        </div>

        <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-700 font-medium">Sin GPS</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{stats.notMonitored}</p>
            </div>
            <AlertCircle className="w-8 h-8 text-gray-400" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl border border-green-200 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-green-700 font-medium">Monitoreados</p>
              <p className="text-2xl font-bold text-green-900 mt-1">{stats.monitoredPercentage}%</p>
            </div>
            <div className="text-green-500 font-bold text-sm">
              {stats.coltrack + stats.fagor + stats.geotab}/{stats.total}
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        {/* Search */}
        <div className="flex items-center gap-2 flex-1 min-w-[250px]">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por placa, contrato, cliente, conductor..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Platform Filter */}
        <div className="flex items-center gap-2">
          <label className="text-sm font-semibold text-slate-600">Plataforma:</label>
          <select
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value as any)}
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="ALL">Todas</option>
            <option value="COLTRACK">COLTRACK</option>
            <option value="FAGOR">FAGOR</option>
            <option value="GEOTAB">GEOTAB</option>
            <option value="NOT_MONITORED">Sin GPS</option>
          </select>
        </div>

        {/* Export Button */}
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
          title="Exportar a Excel"
        >
          <FileDown className="w-4 h-4" />
          Excel
        </button>

        {/* Counter */}
        <div className="text-sm font-semibold text-slate-600">
          {filteredData.length} vehículo{filteredData.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Last Update Info */}
      {lastUpdate && (
        <div className="text-xs text-slate-500 text-center">
          Última actualización: {lastUpdate.toLocaleString('es-CO')}
        </div>
      )}

      {/* Table */}
      {filteredData.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
          <Database className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-600 font-medium">No se encontraron vehículos</p>
          <p className="text-slate-400 text-sm mt-1">Intenta ajustar los filtros de búsqueda</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gradient-to-r from-indigo-700 to-indigo-600 text-white">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider">Placa</th>
                <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider">Plataforma GPS</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider">Contrato</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider">Cliente</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider">Marca</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider">Línea</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider">Conductor</th>
                <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pagination.paginatedData.map((vehicle, index) => (
                <tr
                  key={vehicle.placa}
                  className={`${index % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-indigo-50 transition-colors`}
                >
                  <td className="px-4 py-3">
                    <div className="font-bold text-slate-900">{vehicle.placa}</div>
                  </td>

                  <td className="px-4 py-3 text-center whitespace-nowrap">
                    {getPlatformBadge(vehicle.platform)}
                  </td>

                  <td className="px-4 py-3">
                    <span className="text-sm text-slate-700">{vehicle.contrato}</span>
                  </td>

                  <td className="px-4 py-3">
                    <span className="text-sm text-slate-700">{vehicle.cliente}</span>
                  </td>

                  <td className="px-4 py-3">
                    <span className="text-sm text-slate-700">{vehicle.marca}</span>
                  </td>

                  <td className="px-4 py-3">
                    <span className="text-sm text-slate-700">{vehicle.linea}</span>
                  </td>

                  <td className="px-4 py-3">
                    <span className="text-sm text-slate-700">{vehicle.conductor || '-'}</span>
                  </td>

                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${
                      vehicle.estado === 'ACTIVO'
                        ? 'bg-green-100 text-green-800 border border-green-300'
                        : 'bg-gray-100 text-gray-800 border border-gray-300'
                    }`}>
                      {vehicle.estado}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
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
      )}
    </div>
  );
};
