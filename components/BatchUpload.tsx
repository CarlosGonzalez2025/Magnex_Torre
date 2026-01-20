import React, { useState, useRef, useEffect } from 'react';
import { Upload, AlertTriangle, CheckCircle, FileText, Trash2, Download, Database, Search, Filter, Copy, Save, X, ChevronDown, ChevronUp } from 'lucide-react';
import { processFile, validateFile, BatchAlert } from '../services/fileProcessingService';
import {
  createFileUploadRecord,
  saveBatchAlerts,
  queryBatchAlerts,
  deleteBatchAlert,
  deleteUpload,
  deleteAllBatchAlerts,
  AlertFilters,
  BatchAlertRecord
} from '../services/auditService';
import { saveAlertToDatabase } from '../services/databaseService';
import { fetchFleetData } from '../services/fleetService';
import { Alert } from '../types';
import { useExportToExcel } from '../hooks/useExportToExcel';

export const BatchUpload: React.FC = () => {
  // ==================== STATE ====================

  // Upload Section
  const [selectedSource, setSelectedSource] = useState<'FAGOR' | 'COLTRACK'>('FAGOR');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [processedAlerts, setProcessedAlerts] = useState<BatchAlert[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploadCollapsed, setUploadCollapsed] = useState(false);

  // Analysis Section
  const [savedAlerts, setSavedAlerts] = useState<BatchAlertRecord[]>([]);
  const [isQuerying, setIsQuerying] = useState(false);
  const [vehicleContracts, setVehicleContracts] = useState<Map<string, string>>(new Map());

  // Filters
  const [filters, setFilters] = useState<AlertFilters>({});
  const [plateSearch, setPlateSearch] = useState('');
  const [alertTypeSearch, setAlertTypeSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'ALL' | 'FAGOR' | 'COLTRACK'>('ALL');
  const [graveFilter, setGraveFilter] = useState<'ALL' | 'true' | 'false'>('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { exportToExcel } = useExportToExcel();

  // ==================== FETCH VEHICLE CONTRACTS ====================

  useEffect(() => {
    // Cargar contratos primero, luego cargar alertas
    const initializeData = async () => {
      await loadVehicleContracts(); // Esperar a que termine
      await loadSavedAlerts(); // Luego cargar alertas
    };

    initializeData();
  }, []);

  const loadVehicleContracts = async () => {
    try {
      console.log('⏳ Cargando contratos desde Google Sheets...');
      const result = await fetchFleetData();
      const contractsMap = new Map<string, string>();

      result.vehicles.forEach(vehicle => {
        if (vehicle.contract) {
          // Normalizar placa: mayúsculas y sin espacios
          const normalizedPlate = vehicle.plate.toUpperCase().replace(/\s+/g, '');
          contractsMap.set(normalizedPlate, vehicle.contract);
        }
      });

      setVehicleContracts(contractsMap);
      console.log(`✅ Contratos cargados: ${contractsMap.size} vehículos`);
      console.log('📋 Muestra de contratos:', Array.from(contractsMap.entries()).slice(0, 5));

      // Pequeño delay para asegurar que el estado se actualice
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.error('❌ Error cargando contratos:', error);
    }
  };

  // Helper function to get contract by plate
  const getContractByPlate = (plate: string): string => {
    // Normalizar placa de búsqueda: mayúsculas y sin espacios
    const normalizedPlate = plate.toUpperCase().replace(/\s+/g, '');
    const contract = vehicleContracts.get(normalizedPlate);

    if (!contract) {
      console.warn(`⚠️ No se encontró contrato para placa: ${plate} (normalizada: ${normalizedPlate})`);
    }

    return contract || 'Sin contrato';
  };

  const loadSavedAlerts = async () => {
    setIsQuerying(true);
    console.log('⏳ Consultando alertas de batch_alerts...');
    const result = await queryBatchAlerts(filters);
    if (result.success && result.data) {
      setSavedAlerts(result.data);

      // Debug: Mostrar primeras 3 placas para verificar matching
      if (result.data.length > 0) {
        console.log('🔍 Debug - Primeras 3 placas en alertas:', result.data.slice(0, 3).map(a => ({
          placa_original: a.plate,
          placa_normalizada: a.plate.toUpperCase().replace(/\s+/g, ''),
          contrato_encontrado: getContractByPlate(a.plate),
          vehicleContracts_size: vehicleContracts.size
        })));
      }
    }
    setIsQuerying(false);
  };

  // ==================== FILE HANDLING ====================

  const handleFileSelect = (file: File) => {
    setError(null);
    const validation = validateFile(file, selectedSource);
    if (!validation.valid) {
      setError(validation.error || 'Archivo no válido');
      return;
    }
    setSelectedFile(file);
    setProcessedAlerts([]);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  };

  // ==================== PROCESSING ====================

  const handleProcessFile = async () => {
    if (!selectedFile) {
      setError('Por favor selecciona un archivo');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setProcessedAlerts([]);

    try {
      const result = await processFile(selectedFile, selectedSource);

      if (!result.success) {
        setError(result.error || 'Error procesando archivo');
        setIsProcessing(false);
        return;
      }

      setProcessedAlerts(result.data || []);
      setIsProcessing(false);

      // Auto-collapse upload section after processing
      setUploadCollapsed(true);

    } catch (error: any) {
      setError(error.message || 'Error desconocido');
      setIsProcessing(false);
    }
  };

  // ==================== SAVE TO DATABASE ====================

  const handleSaveToDatabase = async () => {
    if (processedAlerts.length === 0) {
      setError('No hay alertas procesadas para guardar');
      return;
    }

    if (!selectedFile) {
      setError('No se encontró el archivo');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      // 1. Crear registro de carga
      const uploadResult = await createFileUploadRecord(
        selectedFile.name,
        selectedSource,
        processedAlerts.length
      );

      if (!uploadResult.success || !uploadResult.uploadId) {
        setError(uploadResult.error || 'Error creando registro de carga');
        setIsSaving(false);
        return;
      }

      // 2. Guardar alertas
      const saveResult = await saveBatchAlerts(
        uploadResult.uploadId,
        processedAlerts
      );

      if (!saveResult.success) {
        setError(saveResult.error || 'Error guardando alertas');
        setIsSaving(false);
        return;
      }

      window.alert(`✅ ${saveResult.insertedCount} alertas guardadas exitosamente`);

      // Limpiar y recargar
      setProcessedAlerts([]);
      setSelectedFile(null);
      loadSavedAlerts();
      setIsSaving(false);

    } catch (error: any) {
      setError(error.message || 'Error desconocido');
      setIsSaving(false);
    }
  };

  // ==================== QUERY & FILTER ====================

  const handleApplyFilters = async () => {
    const newFilters: AlertFilters = {};

    if (plateSearch.trim()) newFilters.plate = plateSearch.trim();
    if (alertTypeSearch.trim()) newFilters.alertType = alertTypeSearch.trim();
    if (sourceFilter !== 'ALL') newFilters.source = sourceFilter as 'FAGOR' | 'COLTRACK';
    if (graveFilter !== 'ALL') newFilters.isGrave = graveFilter === 'true';
    if (startDate) newFilters.startDate = new Date(startDate).toISOString();
    if (endDate) newFilters.endDate = new Date(endDate).toISOString();

    setFilters(newFilters);
    setIsQuerying(true);

    console.log('🔍 Aplicando filtros...', newFilters);
    console.log(`📋 Contratos disponibles para matching: ${vehicleContracts.size}`);

    const result = await queryBatchAlerts(newFilters);
    if (result.success && result.data) {
      setSavedAlerts(result.data);

      // Debug: Verificar matching después de filtrar
      if (result.data.length > 0 && result.data.length <= 5) {
        console.log('🔍 Matching de todas las alertas filtradas:', result.data.map(a => ({
          placa: a.plate,
          contrato: getContractByPlate(a.plate)
        })));
      }
    }

    setIsQuerying(false);
  };

  const handleClearFilters = () => {
    setPlateSearch('');
    setAlertTypeSearch('');
    setSourceFilter('ALL');
    setGraveFilter('ALL');
    setStartDate('');
    setEndDate('');
    setFilters({});
    loadSavedAlerts();
  };

  // ==================== COPY MESSAGE ====================

  const handleCopyMessage = (alert: BatchAlertRecord) => {
    const contract = getContractByPlate(alert.plate);
    const source = (alert as any).file_uploads?.source || 'BATCH';

    // Determinar si es exceso de velocidad
    const isSpeedingAlert = alert.alert_type.toLowerCase().includes('velocidad') ||
      alert.alert_type.toLowerCase().includes('exceso');

    // Generar URL de Google Maps si hay coordenadas
    let googleMapsUrl = '';
    if (alert.latitude && alert.longitude) {
      googleMapsUrl = `https://www.google.com/maps?q=${alert.latitude},${alert.longitude}`;
    }

    let message = `🚨 *ALERTA DE FLOTA (AUDITORÍA)*\n\n` +
      `*Tipo:* ${alert.alert_type}\n` +
      `*Vehículo:* ${alert.plate}\n` +
      (alert.driver ? `*Conductor:* ${alert.driver}\n` : '') +
      (alert.speed ? (isSpeedingAlert ? `*Velocidad:* ${alert.speed} km/h ⚠️\n` : `Velocidad: ${alert.speed} km/h\n`) : '') +
      `Hora: ${new Date(alert.timestamp).toLocaleString()}\n`;

    // Agregar ubicación
    if (alert.location) {
      message += `📍 *Ubicación:* ${alert.location}\n`;
    }

    // Agregar URL de Google Maps si hay coordenadas
    if (googleMapsUrl) {
      message += `🗺️ *Ver en mapa:* ${googleMapsUrl}\n`;
    }

    message += `Contrato: ${contract}\n` +
      `Fuente: ${source}` +
      (alert.is_grave ? `\n\n⚠️ *FALTA GRAVE*` : '');

    navigator.clipboard.writeText(message);
    window.alert('📋 Mensaje copiado al portapapeles');
  };

  // ==================== SAVE TO MAIN ALERTS ====================

  const handleSaveToMainAlerts = async (batchAlert: BatchAlertRecord) => {
    const contract = getContractByPlate(batchAlert.plate);

    // Generar vehicleId desde la placa normalizada
    const normalizedPlate = batchAlert.plate.toUpperCase().replace(/\s+/g, '');
    const vehicleId = `vehicle-${normalizedPlate}`;

    // Convertir BatchAlert a Alert
    const alert: Alert = {
      id: `batch-${batchAlert.id}`,
      vehicleId: vehicleId,
      type: batchAlert.alert_type,
      plate: batchAlert.plate,
      driver: batchAlert.driver || 'Sin asignar',
      timestamp: batchAlert.timestamp,
      latitude: batchAlert.latitude || 0,
      longitude: batchAlert.longitude || 0,
      speed: batchAlert.speed || 0,
      location: batchAlert.location || 'Ver en historial de auditoría',
      details: `Alerta importada desde ${(batchAlert as any).file_uploads?.source || 'BATCH'}`,
      contract: contract,
      source: (batchAlert as any).file_uploads?.source || 'BATCH',
      severity: batchAlert.severity
    };

    try {
      const result = await saveAlertToDatabase(alert, 'Auditoría');

      if (result.success) {
        window.alert('✅ Alerta guardada en el Historial principal\n\nAhora puedes agregar planes de acción desde el módulo "Historial"');
      } else {
        window.alert('❌ Error: ' + result.error);
      }
    } catch (error: any) {
      window.alert('❌ Error: ' + error.message);
    }
  };

  // ==================== DELETE ====================

  const handleDeleteAlert = async (alertId: string) => {
    if (!window.confirm('¿Estás seguro de eliminar esta alerta?')) return;

    const result = await deleteBatchAlert(alertId);
    if (result.success) {
      window.alert('✅ Alerta eliminada');
      loadSavedAlerts();
    } else {
      window.alert('❌ Error: ' + result.error);
    }
  };

  const handleDeleteAll = async () => {
    // Confirmación con prompt de texto para evitar eliminaciones accidentales
    const confirmText = window.prompt(
      '⚠️ ADVERTENCIA: Esta acción eliminará TODAS las alertas de auditoría.\n\n' +
      `Se eliminarán ${savedAlerts.length} registros de la base de datos.\n\n` +
      'Esta acción NO se puede deshacer.\n\n' +
      'Para confirmar, escribe: ELIMINAR TODO'
    );

    if (confirmText !== 'ELIMINAR TODO') {
      if (confirmText !== null) {
        window.alert('Operación cancelada. El texto no coincide.');
      }
      return;
    }

    const result = await deleteAllBatchAlerts();

    if (result.success) {
      window.alert(`✅ ${result.deletedCount} alertas eliminadas exitosamente`);
      loadSavedAlerts();
    } else {
      window.alert('❌ Error: ' + result.error);
    }
  };

  // ==================== EXPORT ====================

  const handleExport = () => {
    const dataToExport = savedAlerts.map(alert => ({
      fecha: new Date(alert.timestamp).toLocaleDateString(),
      hora: new Date(alert.timestamp).toLocaleTimeString(),
      placa: alert.plate,
      conductor: alert.driver || 'N/A',
      tipo_alerta: alert.alert_type,
      velocidad: alert.speed || 'N/A',
      severidad: alert.severity,
      falta_grave: alert.is_grave ? 'SÍ' : 'NO',
      contrato: getContractByPlate(alert.plate),
      fuente: (alert as any).file_uploads?.source || 'N/A',
      archivo: (alert as any).file_uploads?.filename || 'N/A'
    }));

    exportToExcel(dataToExport, `auditoria_flota_${new Date().toISOString().split('T')[0]}`);
  };

  // ==================== RENDER ====================

  const gravesCount = savedAlerts.filter(a => a.is_grave).length;
  const processedGravesCount = processedAlerts.filter(a => a.is_grave).length;

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-6 rounded-xl shadow-lg">
        <h1 className="text-2xl font-bold flex items-center gap-3">
          <Database className="w-8 h-8" />
          Auditoría de Flota
        </h1>
        <p className="text-purple-100 mt-2">Carga masiva de reportes GPS (FAGOR y COLTRACK)</p>
      </div>

      {/* ==================== UPLOAD SECTION ==================== */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <button
          onClick={() => setUploadCollapsed(!uploadCollapsed)}
          className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Upload className="w-5 h-5 text-purple-600" />
            <span className="font-semibold text-lg">Cargar Archivo</span>
            {processedAlerts.length > 0 && (
              <span className="text-sm bg-green-100 text-green-700 px-3 py-1 rounded-full">
                {processedAlerts.length} alertas procesadas
              </span>
            )}
          </div>
          {uploadCollapsed ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
        </button>

        {!uploadCollapsed && (
          <div className="p-6 border-t border-slate-200">
            {/* Source Selection */}
            <div className="flex gap-4 mb-4">
              <button
                onClick={() => setSelectedSource('FAGOR')}
                className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
                  selectedSource === 'FAGOR'
                    ? 'bg-purple-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                📊 FAGOR (.xlsx)
              </button>
              <button
                onClick={() => setSelectedSource('COLTRACK')}
                className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
                  selectedSource === 'COLTRACK'
                    ? 'bg-purple-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                📄 COLTRACK (.csv)
              </button>
            </div>

            {/* Drag & Drop Area */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                isDragging
                  ? 'border-purple-500 bg-purple-50'
                  : 'border-slate-300 hover:border-purple-400 hover:bg-slate-50'
              }`}
            >
              <Upload className="w-12 h-12 mx-auto text-slate-400 mb-3" />
              <p className="text-slate-600 font-medium mb-1">
                {selectedFile ? selectedFile.name : 'Arrastra y suelta el archivo'}
              </p>
              <p className="text-sm text-slate-500">
                o haz clic para seleccionar ({selectedSource === 'FAGOR' ? '.xlsx, .xls' : '.csv'} - máximo 10 MB)
              </p>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept={selectedSource === 'FAGOR' ? '.xlsx,.xls' : '.csv'}
              onChange={handleFileInputChange}
              className="hidden"
            />

            {error && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="text-red-700 text-sm">{error}</div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="mt-4 flex gap-3">
              <button
                onClick={handleProcessFile}
                disabled={!selectedFile || isProcessing}
                className={`flex-1 py-3 px-6 rounded-lg font-bold transition-all flex items-center justify-center gap-2 ${
                  !selectedFile || isProcessing
                    ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {isProcessing ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Procesando...
                  </>
                ) : (
                  <>
                    <FileText className="w-5 h-5" />
                    Procesar Archivo
                  </>
                )}
              </button>

              {processedAlerts.length > 0 && (
                <button
                  onClick={handleSaveToDatabase}
                  disabled={isSaving}
                  className={`flex-1 py-3 px-6 rounded-lg font-bold transition-all flex items-center justify-center gap-2 ${
                    isSaving
                      ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                      : 'bg-green-600 text-white hover:bg-green-700'
                  }`}
                >
                  {isSaving ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    <>
                      <Database className="w-5 h-5" />
                      Guardar en Base de Datos ({processedAlerts.length})
                    </>
                  )}
                </button>
              )}
            </div>

            {processedAlerts.length > 0 && (
              <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-green-800">
                      ✅ {processedAlerts.length} alertas procesadas
                    </p>
                    {processedGravesCount > 0 && (
                      <p className="text-sm text-green-700 mt-1">
                        ⚠️ {processedGravesCount} Faltas Graves detectadas
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ==================== ANALYSIS SECTION ==================== */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Search className="w-6 h-6 text-purple-600" />
            Análisis de Datos ({savedAlerts.length} registros)
          </h2>
          <div className="flex gap-2">
            <button
              onClick={handleDeleteAll}
              disabled={savedAlerts.length === 0}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-slate-300 disabled:cursor-not-allowed flex items-center gap-2"
              title="Eliminar todos los registros de auditoría"
            >
              <Trash2 className="w-4 h-4" />
              Limpiar Todo
            </button>
            <button
              onClick={handleExport}
              disabled={savedAlerts.length === 0}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-slate-300 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Exportar Excel
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 p-4 bg-slate-50 rounded-lg">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Placa</label>
            <input
              type="text"
              value={plateSearch}
              onChange={(e) => setPlateSearch(e.target.value)}
              placeholder="Ej: ABC123"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de Alerta</label>
            <input
              type="text"
              value={alertTypeSearch}
              onChange={(e) => setAlertTypeSearch(e.target.value)}
              placeholder="Ej: velocidad"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Fuente</label>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value as any)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="ALL">Todas</option>
              <option value="FAGOR">FAGOR</option>
              <option value="COLTRACK">COLTRACK</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Faltas Graves</label>
            <select
              value={graveFilter}
              onChange={(e) => setGraveFilter(e.target.value as any)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="ALL">Todas</option>
              <option value="true">Solo Graves</option>
              <option value="false">Solo No Graves</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Fecha Desde</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Fecha Hasta</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>

          <div className="flex items-end gap-2 md:col-span-2">
            <button
              onClick={handleApplyFilters}
              disabled={isQuerying}
              className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-slate-300 flex items-center justify-center gap-2"
            >
              <Filter className="w-4 h-4" />
              Aplicar Filtros
            </button>
            <button
              onClick={handleClearFilters}
              className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 flex items-center gap-2"
            >
              <X className="w-4 h-4" />
              Limpiar
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-700 font-medium">Total Alertas</p>
            <p className="text-3xl font-bold text-blue-900">{savedAlerts.length}</p>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-700 font-medium">Faltas Graves</p>
            <p className="text-3xl font-bold text-red-900">{gravesCount}</p>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-sm text-green-700 font-medium">Vehículos Únicos</p>
            <p className="text-3xl font-bold text-green-900">
              {new Set(savedAlerts.map(a => a.plate)).size}
            </p>
          </div>
        </div>

        {/* Alerts Table */}
        {isQuerying ? (
          <div className="text-center py-12">
            <div className="w-12 h-12 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-slate-600">Consultando base de datos...</p>
          </div>
        ) : savedAlerts.length === 0 ? (
          <div className="text-center py-12 bg-slate-50 rounded-lg">
            <Database className="w-16 h-16 text-slate-400 mx-auto mb-4" />
            <p className="text-slate-600 font-medium">No hay alertas guardadas</p>
            <p className="text-sm text-slate-500 mt-1">Carga un archivo para comenzar</p>
          </div>
        ) : (
          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full">
              <thead className="bg-slate-100">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Fecha/Hora</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Placa</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Conductor</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Tipo de Alerta</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Vel.</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Contrato</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Grave</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {savedAlerts.map((alert) => (
                  <tr key={alert.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {new Date(alert.timestamp).toLocaleString('es-CO', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-slate-900">{alert.plate}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{alert.driver || 'N/A'}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{alert.alert_type}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {alert.speed ? `${alert.speed} km/h` : 'N/A'}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {getContractByPlate(alert.plate)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {alert.is_grave ? (
                        <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium">
                          SÍ
                        </span>
                      ) : (
                        <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-medium">
                          NO
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleCopyMessage(alert)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Copiar mensaje"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleSaveToMainAlerts(alert)}
                          className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                          title="Guardar en Historial"
                        >
                          <Save className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteAlert(alert.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
