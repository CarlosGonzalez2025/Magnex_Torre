import React, { useState, useRef, useEffect } from 'react';
import { Upload, AlertTriangle, CheckCircle, FileText, Trash2, Download, Database, Search, Filter, Copy, Save, X, ChevronDown, ChevronUp, TrendingUp, BarChart3, PieChart } from 'lucide-react';
import { processFile, validateFile, BatchAlert } from '../services/fileProcessingService';
import {
  createFileUploadRecord,
  saveBatchAlerts,
  queryBatchAlerts,
  deleteBatchAlert,
  deleteUpload,
  deleteAllBatchAlerts,
  AlertFilters,
  BatchAlertRecord,
  // 🆕 NUEVAS FUNCIONES DE ANÁLISIS
  getDetailedAuditAnalysis,
  getVehicleDetailedStats,
  getDriverDetailedStats,
  DetailedAuditAnalysis,
  VehicleDetailedStats,
  DriverDetailedStats,
  exportAnalysisToCSV
} from '../services/auditService';
import { saveAlertToDatabase } from '../services/databaseService';
import { supabase } from '../services/supabaseClient';
import { fetchAllRows } from '../services/reportService';
import { Alert, AlertType, ApiSource, AlertSeverity } from '../types';
import { useExportToExcel } from '../hooks/useExportToExcel';

const normalizeText = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();

// La Auditor\u00eda de Flota solo muestra excesos de velocidad >= 80 km/h (faltas graves).
// El parser marca is_grave = exceso >= 80. Se fuerza en todas las consultas; la carga
// y el guardado de datos siguen igual (se conserva toda la informaci\u00f3n en la BD).
const FILTRO_BASE = { isGrave: true } as const;

export const BatchUpload: React.FC = () => {
  // ==================== STATE ====================

  // Upload Section
  const [selectedSource, setSelectedSource] = useState<'FAGOR' | 'COLTRACK' | 'GEOTAB'>('FAGOR');
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

  // 🆕 ANÁLISIS DETALLADO
  const [detailedAnalysis, setDetailedAnalysis] = useState<DetailedAuditAnalysis | null>(null);
  const [isLoadingAnalysis, setIsLoadingAnalysis] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [selectedVehicleStats, setSelectedVehicleStats] = useState<VehicleDetailedStats | null>(null);
  const [selectedDriverStats, setSelectedDriverStats] = useState<DriverDetailedStats | null>(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  // Filters
  const [filters, setFilters] = useState<AlertFilters>({});
  const [plateSearch, setPlateSearch] = useState('');
  const [alertTypeSearch, setAlertTypeSearch] = useState('');
  const [availableAlertTypes, setAvailableAlertTypes] = useState<string[]>([]);
  const [selectedAlertTypes, setSelectedAlertTypes] = useState<string[]>([]);
  const [showAlertTypeDropdown, setShowAlertTypeDropdown] = useState(false);
  const [availableContracts, setAvailableContracts] = useState<string[]>([]);
  const [selectedContracts, setSelectedContracts] = useState<string[]>([]);
  const [showContractDropdown, setShowContractDropdown] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<'ALL' | 'FAGOR' | 'COLTRACK' | 'GEOTAB'>('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const alertTypeDropdownRef = useRef<HTMLDivElement>(null);
  const contractDropdownRef = useRef<HTMLDivElement>(null);
  const { exportToExcel } = useExportToExcel();

  // ==================== FETCH VEHICLE CONTRACTS ====================

  useEffect(() => {
    const initializeData = async () => {
      await loadVehicleContracts();
      await loadSavedAlerts();
      // 🆕 Cargar análisis inicial
      await loadDetailedAnalysis();
    };

    initializeData();
  }, []);

  useEffect(() => {
    const uniqueTypes = [...new Set(savedAlerts.map(alert => alert.alert_type))].sort();
    setAvailableAlertTypes(uniqueTypes);
    console.log(`✅ Tipos de alerta actualizados: ${uniqueTypes.length} tipos únicos`);
  }, [savedAlerts]);

  // Actualizar contratos disponibles cada vez que cambien las alertas guardadas
  useEffect(() => {
    const contractsSet = new Set<string>();
    savedAlerts.forEach(alert => {
      const contract = getContractByPlate(alert.plate);
      if (contract && contract !== 'Sin contrato') {
        contractsSet.add(contract);
      }
    });
    const uniqueContracts = [...contractsSet].sort();
    setAvailableContracts(uniqueContracts);
    console.log(`✅ Contratos actualizados: ${uniqueContracts.length} contratos únicos`);
  }, [savedAlerts, vehicleContracts]);

  // Cerrar dropdown cuando se hace clic fuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (alertTypeDropdownRef.current && !alertTypeDropdownRef.current.contains(event.target as Node)) {
        setShowAlertTypeDropdown(false);
      }
      if (contractDropdownRef.current && !contractDropdownRef.current.contains(event.target as Node)) {
        setShowContractDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const loadVehicleContracts = async () => {
    try {
      console.log('Cargando contratos desde la base maestra de vehiculos...');
      const contractsMap = new Map<string, string>();

      const data = await fetchAllRows(
        supabase
          .from('vehiculos')
          .select('placa, estado, cliente, contratos(nombre)')
      );

      (data ?? []).forEach((vehicle: any) => {
        if (normalizeText(vehicle.estado) !== 'ACTIVO') return;
        const normalizedPlate = String(vehicle.placa ?? '').toUpperCase().replace(/\s+/g, '');
        if (!normalizedPlate) return;
        const contrato = Array.isArray(vehicle.contratos) ? vehicle.contratos[0] : vehicle.contratos;
        const contractName = String(contrato?.nombre ?? vehicle.cliente ?? '').trim();
        if (contractName) contractsMap.set(normalizedPlate, contractName);
      });

      setVehicleContracts(contractsMap);
      console.log(`Contratos cargados desde Supabase: ${contractsMap.size} vehiculos activos`);
      console.log('📋 Muestra de contratos:', Array.from(contractsMap.entries()).slice(0, 5));

      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.error('❌ Error cargando contratos:', error);
    }
  };

  const getContractByPlate = (plate: string): string => {
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
    console.log('🔍 Cargando solo excesos >= 80 km/h (faltas graves)');

    const result = await queryBatchAlerts({ ...FILTRO_BASE });
    if (result.success && result.data) {
      console.log(`✅ Alertas recibidas: ${result.data.length}`);

      const sourceCounts = result.data.reduce((acc: any, alert: any) => {
        const source = alert.file_uploads?.source || 'SIN_SOURCE';
        acc[source] = (acc[source] || 0) + 1;
        return acc;
      }, {});
      console.log('📊 Distribución por source en UI:', sourceCounts);

      setSavedAlerts(result.data);

      if (result.data.length > 0) {
        console.log('🔍 Debug - Primeras 3 placas en alertas:', result.data.slice(0, 3).map(a => ({
          placa_original: a.plate,
          placa_normalizada: a.plate.toUpperCase().replace(/\s+/g, ''),
          contrato_encontrado: getContractByPlate(a.plate),
          vehicleContracts_size: vehicleContracts.size,
          source: (a as any).file_uploads?.source || 'NO_SOURCE'
        })));
      }
    } else {
      console.error('❌ Error cargando alertas:', result.error);
    }
    setIsQuerying(false);
  };

  // 🆕 CARGAR ANÁLISIS DETALLADO
  const loadDetailedAnalysis = async (customFilters?: AlertFilters) => {
    setIsLoadingAnalysis(true);
    console.log('📊 Generando análisis detallado...');

    const result = await getDetailedAuditAnalysis({ ...(customFilters || filters), ...FILTRO_BASE });
    if (result.success && result.data) {
      setDetailedAnalysis(result.data);
      console.log('✅ Análisis detallado cargado:', result.data);
    } else {
      console.error('❌ Error generando análisis:', result.error);
    }

    setIsLoadingAnalysis(false);
  };

  // 🆕 VER DETALLES DE VEHÍCULO
  const handleViewVehicleStats = async (plate: string) => {
    const result = await getVehicleDetailedStats(plate);
    if (result.success && result.data) {
      setSelectedVehicleStats(result.data);
    } else {
      window.alert('❌ Error: ' + result.error);
    }
  };

  // 🆕 VER DETALLES DE CONDUCTOR
  const handleViewDriverStats = async (driver: string) => {
    const result = await getDriverDetailedStats(driver);
    if (result.success && result.data) {
      setSelectedDriverStats(result.data);
    } else {
      window.alert('❌ Error: ' + result.error);
    }
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

      setPlateSearch('');
      setAlertTypeSearch('');
      setSelectedAlertTypes([]);
      setSelectedContracts([]);
      setSourceFilter('ALL');
      setStartDate('');
      setEndDate('');
      setFilters({});
      setCurrentPage(1);

      setProcessedAlerts([]);
      setSelectedFile(null);
      console.log('🔄 Recargando todos los datos después de guardar...');
      await loadSavedAlerts();
      await loadDetailedAnalysis();
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
    if (selectedAlertTypes.length > 0) newFilters.alertTypes = selectedAlertTypes;
    if (sourceFilter !== 'ALL') newFilters.source = sourceFilter as 'FAGOR' | 'COLTRACK' | 'GEOTAB';
    // Siempre restringido a excesos >= 80 km/h (faltas graves).
    newFilters.isGrave = true;
    if (startDate) newFilters.startDate = new Date(startDate).toISOString();
    if (endDate) newFilters.endDate = new Date(endDate).toISOString();

    console.log('🔍 ========== APLICANDO FILTROS ==========');
    console.log('🔍 Filtros a aplicar:', newFilters);
    console.log('🔍 Source filter actual:', sourceFilter);
    console.log('🔍 Tipos seleccionados:', selectedAlertTypes);
    console.log('🔍 Contratos seleccionados:', selectedContracts);

    setFilters(newFilters);
    setIsQuerying(true);

    console.log(`📋 Contratos disponibles para matching: ${vehicleContracts.size}`);

    const result = await queryBatchAlerts(newFilters);
    if (result.success && result.data) {
      console.log(`✅ Resultado de filtros: ${result.data.length} alertas`);

      // Aplicar filtro de contratos (client-side)
      let filteredData = result.data;
      if (selectedContracts.length > 0) {
        filteredData = result.data.filter(alert => {
          const contract = getContractByPlate(alert.plate);
          return contract && selectedContracts.includes(contract);
        });
        console.log(`🔍 Filtrado por contratos: ${filteredData.length} alertas (${selectedContracts.length} contratos seleccionados)`);
      }

      // Contar por source DESPUÉS de aplicar filtros
      const sourceCounts = filteredData.reduce((acc: any, alert: any) => {
        const source = alert.file_uploads?.source || 'SIN_SOURCE';
        acc[source] = (acc[source] || 0) + 1;
        return acc;
      }, {});
      console.log('📊 Distribución después de filtros:', sourceCounts);

      setSavedAlerts(filteredData);
      setCurrentPage(1); // Volver a página 1 después de filtrar

      if (filteredData.length > 0 && filteredData.length <= 5) {
        console.log('🔍 Matching de todas las alertas filtradas:', filteredData.map(a => ({
          placa: a.plate,
          contrato: getContractByPlate(a.plate)
        })));
      }

      // 🆕 Actualizar análisis con filtros
      await loadDetailedAnalysis(newFilters);
    } else {
      console.error('❌ Error aplicando filtros:', result.error);
    }

    setIsQuerying(false);
  };

  const handleClearFilters = () => {
    console.log('🧹 Limpiando filtros...');
    setPlateSearch('');
    setAlertTypeSearch('');
    setSelectedAlertTypes([]);
    setSelectedContracts([]);
    setSourceFilter('ALL');
    setStartDate('');
    setEndDate('');
    setFilters({});
    setCurrentPage(1);
    loadSavedAlerts();
    loadDetailedAnalysis({});
  };

  // ==================== MULTI-SELECT HANDLERS ====================

  const toggleAlertType = (alertType: string) => {
    setSelectedAlertTypes(prev =>
      prev.includes(alertType)
        ? prev.filter(t => t !== alertType)
        : [...prev, alertType]
    );
  };

  const toggleContract = (contract: string) => {
    setSelectedContracts(prev =>
      prev.includes(contract)
        ? prev.filter(c => c !== contract)
        : [...prev, contract]
    );
  };

  // ==================== COPY MESSAGE ====================

  const handleCopyMessage = (alert: BatchAlertRecord) => {
    const contract = getContractByPlate(alert.plate);
    const source = (alert as any).file_uploads?.source || 'BATCH';

    const isSpeedingAlert = alert.alert_type.toLowerCase().includes('velocidad') ||
      alert.alert_type.toLowerCase().includes('exceso') ||
      alert.alert_type.toLowerCase().includes('infraccion');

    let details = '';
    if (alert.speed) {
      details = `Velocidad: ${alert.speed} km/h`;
      const limitMatch = alert.alert_type.match(/\d+\s*km\/h/i);
      if (limitMatch) {
        const limit = limitMatch[0];
        details = `Velocidad: ${alert.speed} km/h (Límite: ${limit})`;
      }
    } else {
      details = alert.alert_type;
    }

    let googleMapsUrl = 'Desconocido';
    if (alert.latitude && alert.longitude) {
      // Si hay coordenadas, usarlas directamente
      googleMapsUrl = `https://www.google.com/maps?q=${alert.latitude},${alert.longitude}`;
    } else if (alert.location && alert.location !== 'Desconocido') {
      // Si no hay coordenadas pero sí ubicación de texto, usar búsqueda de Google Maps
      googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(alert.location)}`;
    }

    const message = `🚨 *ALERTA DE FLOTA*\n\n` +
      `*Tipo:* ${alert.alert_type}\n` +
      `*Vehículo:* ${alert.plate}\n` +
      `*Conductor:* ${alert.driver || 'Sin asignar'}\n` +
      `Detalles: ${details}\n` +
      (alert.speed ? (isSpeedingAlert ? `*Velocidad:* ${alert.speed} km/h ⚠️\n` : `Velocidad: ${alert.speed} km/h\n`) : '') +
      `📍 *Ubicación:* ${alert.location || 'Desconocido'}\n` +
      `🗺️ *Ver en mapa:* ${googleMapsUrl}\n` +
      `Hora: ${new Date(alert.timestamp).toLocaleString()}\n` +
      (contract && contract !== 'Sin contrato' ? `Contrato: ${contract}\n` : '') +
      `Fuente: ${source}`;

    navigator.clipboard.writeText(message);
    window.alert('📋 Mensaje copiado al portapapeles');
  };

  // ==================== SAVE TO MAIN ALERTS ====================

  const handleSaveToMainAlerts = async (batchAlert: BatchAlertRecord) => {
    const contract = getContractByPlate(batchAlert.plate);

    const normalizedPlate = batchAlert.plate.toUpperCase().replace(/\s+/g, '');
    const vehicleId = `vehicle-${normalizedPlate}`;

    const alert: Alert = {
      id: `batch-${batchAlert.id}`,
      vehicleId: vehicleId,
      type: batchAlert.alert_type as AlertType,
      plate: batchAlert.plate,
      driver: batchAlert.driver || 'Sin asignar',
      timestamp: batchAlert.timestamp,
      latitude: batchAlert.latitude || 0,
      longitude: batchAlert.longitude || 0,
      speed: batchAlert.speed || 0,
      location: batchAlert.location || 'Ver en historial de auditoría',
      details: `Alerta importada desde ${(batchAlert as any).file_uploads?.source || 'BATCH'}`,
      contract: contract,
      source: ((batchAlert as any).file_uploads?.source || 'FAGOR') as ApiSource,
      severity: batchAlert.severity as AlertSeverity
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
      loadDetailedAnalysis();
    } else {
      window.alert('❌ Error: ' + result.error);
    }
  };

  const handleDeleteAll = async () => {
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
      setDetailedAnalysis(null);
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
      ubicacion: alert.location || 'N/A',
      latitud: alert.latitude || 'N/A',
      longitud: alert.longitude || 'N/A',
      severidad: alert.severity,
      falta_grave: alert.is_grave ? 'SÍ' : 'NO',
      contrato: getContractByPlate(alert.plate),
      plataforma: (alert as any).file_uploads?.source || 'N/A',
      archivo: (alert as any).file_uploads?.filename || 'N/A'
    }));

    const columns = [
      { header: 'Fecha', key: 'fecha', width: 12 },
      { header: 'Hora', key: 'hora', width: 12 },
      { header: 'Placa', key: 'placa', width: 10 },
      { header: 'Conductor', key: 'conductor', width: 25 },
      { header: 'Tipo de Alerta', key: 'tipo_alerta', width: 30 },
      { header: 'Velocidad', key: 'velocidad', width: 12 },
      { header: 'Ubicación', key: 'ubicacion', width: 30 },
      { header: 'Latitud', key: 'latitud', width: 12 },
      { header: 'Longitud', key: 'longitud', width: 12 },
      { header: 'Severidad', key: 'severidad', width: 12 },
      { header: 'Falta Grave', key: 'falta_grave', width: 12 },
      { header: 'Contrato', key: 'contrato', width: 30 },
      { header: 'Plataforma', key: 'plataforma', width: 12 },
      { header: 'Archivo', key: 'archivo', width: 30 }
    ];

    exportToExcel(dataToExport, columns, `auditoria_flota_${new Date().toISOString().split('T')[0]}`);
  };

  // 🆕 EXPORTAR ANÁLISIS DETALLADO
  const handleExportAnalysis = () => {
    if (detailedAnalysis) {
      exportAnalysisToCSV(detailedAnalysis, `analisis_detallado_${new Date().toISOString().split('T')[0]}.csv`);
    }
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
        <p className="text-purple-100 mt-2">Carga masiva de reportes GPS (FAGOR, COLTRACK y GEOTAB)</p>
        <p className="text-purple-100 mt-1 text-sm font-medium">Muestra únicamente los excesos de velocidad iguales o superiores a 80 km/h de las 3 plataformas.</p>
      </div>

      {/* 🆕 PANEL DE ANÁLISIS DETALLADO */}
      {detailedAnalysis && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <button
            onClick={() => setShowAnalysis(!showAnalysis)}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <BarChart3 className="w-5 h-5 text-indigo-600" />
              <span className="font-semibold text-lg">Análisis Detallado</span>
              <span className="text-sm bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full">
                Métricas Avanzadas
              </span>
            </div>
            {showAnalysis ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>

          {showAnalysis && (
            <div className="p-6 border-t border-slate-200 space-y-6">
              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
                  <p className="text-sm text-blue-700 font-medium">Promedio Alertas/Carga</p>
                  <p className="text-2xl font-bold text-blue-900">
                    {detailedAnalysis.overview.avg_alerts_per_upload.toFixed(1)}
                  </p>
                </div>

                <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-lg p-4 border border-red-200">
                  <p className="text-sm text-red-700 font-medium">% Faltas Graves</p>
                  <p className="text-2xl font-bold text-red-900">
                    {detailedAnalysis.overview.grave_percentage.toFixed(1)}%
                  </p>
                </div>

                <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4 border border-green-200">
                  <p className="text-sm text-green-700 font-medium">Total Vehículos</p>
                  <p className="text-2xl font-bold text-green-900">
                    {detailedAnalysis.vehicles.total_vehicles}
                  </p>
                </div>

                <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4 border border-purple-200">
                  <p className="text-sm text-purple-700 font-medium">Velocidad Promedio</p>
                  <p className="text-2xl font-bold text-purple-900">
                    {detailedAnalysis.speed_analysis.avg_speed.toFixed(1)} km/h
                  </p>
                </div>
              </div>

              {/* Top Vehicles */}
              <div className="bg-slate-50 rounded-lg p-4">
                <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-orange-600" />
                  Top 5 Vehículos con Más Alertas
                </h3>
                <div className="space-y-2">
                  {detailedAnalysis.vehicles.most_alerts.slice(0, 5).map((vehicle, index) => (
                    <div key={vehicle.plate} className="flex items-center justify-between bg-white p-3 rounded-lg">
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 bg-orange-100 text-orange-700 rounded-full flex items-center justify-center text-sm font-bold">
                          {index + 1}
                        </span>
                        <button
                          onClick={() => handleViewVehicleStats(vehicle.plate)}
                          className="font-semibold text-slate-800 hover:text-indigo-600 transition-colors"
                        >
                          {vehicle.plate}
                        </button>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-sm text-slate-600">{vehicle.count} alertas</span>
                        {vehicle.grave_count > 0 && (
                          <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full font-medium">
                            {vehicle.grave_count} graves
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top Drivers */}
              <div className="bg-slate-50 rounded-lg p-4">
                <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                  <PieChart className="w-5 h-5 text-blue-600" />
                  Top 5 Conductores
                </h3>
                <div className="space-y-2">
                  {detailedAnalysis.drivers.most_incidents.slice(0, 5).map((driver, index) => (
                    <div key={driver.driver} className="flex items-center justify-between bg-white p-3 rounded-lg">
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-sm font-bold">
                          {index + 1}
                        </span>
                        <button
                          onClick={() => handleViewDriverStats(driver.driver)}
                          className="font-semibold text-slate-800 hover:text-indigo-600 transition-colors"
                        >
                          {driver.driver}
                        </button>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-sm text-slate-600">{driver.count} incidentes</span>
                        {driver.grave_count > 0 && (
                          <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full font-medium">
                            {driver.grave_count} graves
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Export Button */}
              <div className="flex justify-end">
                <button
                  onClick={handleExportAnalysis}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Exportar Análisis Completo (CSV)
                </button>
              </div>
            </div>
          )}
        </div>
      )}

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
              <button
                onClick={() => setSelectedSource('GEOTAB')}
                className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
                  selectedSource === 'GEOTAB'
                    ? 'bg-purple-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                📈 GEOTAB (.xlsx)
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
                o haz clic para seleccionar ({(selectedSource === 'FAGOR' || selectedSource === 'GEOTAB') ? '.xlsx, .xls' : '.csv'} - máximo 50 MB)
              </p>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept={(selectedSource === 'FAGOR' || selectedSource === 'GEOTAB') ? '.xlsx,.xls' : '.csv'}
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

          <div className="relative" ref={alertTypeDropdownRef}>
            <label className="block text-sm font-medium text-slate-700 mb-1">Tipos de Alerta (Multi-selección)</label>
            <button
              type="button"
              onClick={() => setShowAlertTypeDropdown(!showAlertTypeDropdown)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white text-left flex items-center justify-between"
            >
              <span className="text-sm text-slate-700">
                {selectedAlertTypes.length === 0
                  ? 'Seleccionar tipos...'
                  : `${selectedAlertTypes.length} tipo${selectedAlertTypes.length > 1 ? 's' : ''} seleccionado${selectedAlertTypes.length > 1 ? 's' : ''}`}
              </span>
              <ChevronDown className="w-4 h-4 text-slate-400" />
            </button>

            {showAlertTypeDropdown && (
              <div className="absolute z-10 mt-1 w-full bg-white border border-slate-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {availableAlertTypes.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-slate-500">No hay tipos de alerta disponibles</div>
                ) : (
                  availableAlertTypes.map((alertType) => (
                    <label
                      key={alertType}
                      className="flex items-center px-3 py-2 hover:bg-slate-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedAlertTypes.includes(alertType)}
                        onChange={() => toggleAlertType(alertType)}
                        className="mr-2 h-4 w-4 text-purple-600 border-slate-300 rounded focus:ring-purple-500"
                      />
                      <span className="text-sm text-slate-700">{alertType}</span>
                    </label>
                  ))
                )}
              </div>
            )}
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
              <option value="GEOTAB">GEOTAB</option>
            </select>
          </div>

          <div className="relative" ref={contractDropdownRef}>
            <label className="block text-sm font-medium text-slate-700 mb-1">Contratos (Multi-selección)</label>
            <button
              type="button"
              onClick={() => setShowContractDropdown(!showContractDropdown)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white text-left flex items-center justify-between"
            >
              <span className="text-sm text-slate-700">
                {selectedContracts.length === 0
                  ? 'Seleccionar contratos...'
                  : `${selectedContracts.length} contrato${selectedContracts.length > 1 ? 's' : ''} seleccionado${selectedContracts.length > 1 ? 's' : ''}`}
              </span>
              <ChevronDown className="w-4 h-4 text-slate-400" />
            </button>

            {showContractDropdown && (
              <div className="absolute z-10 mt-1 w-full bg-white border border-slate-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {availableContracts.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-slate-500">No hay contratos disponibles</div>
                ) : (
                  availableContracts.map((contract) => (
                    <label
                      key={contract}
                      className="flex items-center px-3 py-2 hover:bg-slate-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedContracts.includes(contract)}
                        onChange={() => toggleContract(contract)}
                        className="mr-2 h-4 w-4 text-purple-600 border-slate-300 rounded focus:ring-purple-500"
                      />
                      <span className="text-sm text-slate-700">{contract}</span>
                    </label>
                  ))
                )}
              </div>
            )}
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
          <>
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
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Plataforma</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Grave</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {(() => {
                    const startIndex = (currentPage - 1) * itemsPerPage;
                    const endIndex = startIndex + itemsPerPage;
                    const paginatedAlerts = savedAlerts.slice(startIndex, endIndex);
                    return paginatedAlerts.map((alert) => (
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
                          {(() => {
                            const source = (alert as any).file_uploads?.source || 'N/A';
                            const bgColor = source === 'COLTRACK' ? 'bg-blue-100 text-blue-700' : source === 'FAGOR' ? 'bg-green-100 text-green-700' : source === 'GEOTAB' ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-600';
                            return (
                              <span className={`px-2 py-1 ${bgColor} rounded-full text-xs font-medium`}>
                                {source}
                              </span>
                            );
                          })()}
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
                    ));
                  })()}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="flex items-center justify-between mt-4">
              <div className="flex items-center gap-2">
                <label className="text-sm text-slate-600">Mostrar:</label>
                <select
                  value={itemsPerPage}
                  onChange={(e) => {
                    setItemsPerPage(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="px-3 py-1 border border-slate-300 rounded-lg text-sm"
                >
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={500}>500</option>
                </select>
                <span className="text-sm text-slate-600">
                  Mostrando {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, savedAlerts.length)} de {savedAlerts.length}
                </span>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="px-3 py-1 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  Primera
                </button>
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  Anterior
                </button>
                <span className="px-4 py-1 bg-purple-600 text-white rounded-lg text-sm">
                  {currentPage}
                </span>
                <button
                  onClick={() => setCurrentPage(prev => Math.min(Math.ceil(savedAlerts.length / itemsPerPage), prev + 1))}
                  disabled={currentPage >= Math.ceil(savedAlerts.length / itemsPerPage)}
                  className="px-3 py-1 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  Siguiente
                </button>
                <button
                  onClick={() => setCurrentPage(Math.ceil(savedAlerts.length / itemsPerPage))}
                  disabled={currentPage >= Math.ceil(savedAlerts.length / itemsPerPage)}
                  className="px-3 py-1 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  Última
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* 🆕 MODAL DE ESTADÍSTICAS DE VEHÍCULO */}
      {selectedVehicleStats && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold">Estadísticas - {selectedVehicleStats.plate}</h2>
              <button
                onClick={() => setSelectedVehicleStats(null)}
                className="p-2 hover:bg-slate-100 rounded-lg"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-blue-50 p-4 rounded-lg">
                <p className="text-sm text-blue-700">Total Alertas</p>
                <p className="text-2xl font-bold text-blue-900">{selectedVehicleStats.total_alerts}</p>
              </div>
              <div className="bg-red-50 p-4 rounded-lg">
                <p className="text-sm text-red-700">Faltas Graves</p>
                <p className="text-2xl font-bold text-red-900">{selectedVehicleStats.grave_alerts}</p>
              </div>
              <div className="bg-orange-50 p-4 rounded-lg">
                <p className="text-sm text-orange-700">Risk Score</p>
                <p className="text-2xl font-bold text-orange-900">{selectedVehicleStats.risk_score}/100</p>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <p className="text-sm text-green-700">Tendencia</p>
                <p className="text-2xl font-bold text-green-900 capitalize">{selectedVehicleStats.trend}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">Tipos de Alerta</h3>
                <div className="space-y-1">
                  {selectedVehicleStats.alert_types.map(type => (
                    <div key={type.type} className="flex justify-between text-sm">
                      <span>{type.type}</span>
                      <span className="font-medium">{type.count}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Velocidades</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-slate-600">Promedio</p>
                    <p className="text-lg font-bold">{selectedVehicleStats.avg_speed.toFixed(1)} km/h</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">Máxima</p>
                    <p className="text-lg font-bold text-red-600">{selectedVehicleStats.max_speed.toFixed(1)} km/h</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 🆕 MODAL DE ESTADÍSTICAS DE CONDUCTOR */}
      {selectedDriverStats && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold">Estadísticas - {selectedDriverStats.driver}</h2>
              <button
                onClick={() => setSelectedDriverStats(null)}
                className="p-2 hover:bg-slate-100 rounded-lg"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-blue-50 p-4 rounded-lg">
                <p className="text-sm text-blue-700">Total Alertas</p>
                <p className="text-2xl font-bold text-blue-900">{selectedDriverStats.total_alerts}</p>
              </div>
              <div className="bg-red-50 p-4 rounded-lg">
                <p className="text-sm text-red-700">Faltas Graves</p>
                <p className="text-2xl font-bold text-red-900">{selectedDriverStats.grave_alerts}</p>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <p className="text-sm text-green-700">Safety Score</p>
                <p className="text-2xl font-bold text-green-900">{selectedDriverStats.safety_score}/100</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">Vehículos Conducidos ({selectedDriverStats.vehicles_driven.length})</h3>
                <div className="flex flex-wrap gap-2">
                  {selectedDriverStats.vehicles_driven.map(vehicle => (
                    <span key={vehicle} className="px-3 py-1 bg-slate-100 rounded-full text-sm">
                      {vehicle}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Velocidades</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-slate-600">Promedio</p>
                    <p className="text-lg font-bold">{selectedDriverStats.avg_speed.toFixed(1)} km/h</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">Máxima</p>
                    <p className="text-lg font-bold text-red-600">{selectedDriverStats.max_speed.toFixed(1)} km/h</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
