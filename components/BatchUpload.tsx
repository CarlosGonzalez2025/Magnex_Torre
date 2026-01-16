import React, { useState, useRef } from 'react';
import { Upload, AlertTriangle, CheckCircle, FileText, Trash2, Download, Database } from 'lucide-react';
import { processFile, validateFile, BatchAlert } from '../services/fileProcessingService';
import {
  createFileUploadRecord,
  saveBatchAlerts,
  getAllFileUploads,
  FileUploadRecord
} from '../services/auditService';
import { useExportToExcel } from '../hooks/useExportToExcel';

export const BatchUpload: React.FC = () => {
  // State
  const [selectedSource, setSelectedSource] = useState<'FAGOR' | 'COLTRACK'>('FAGOR');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [processedAlerts, setProcessedAlerts] = useState<BatchAlert[]>([]);
  const [graveAlerts, setGraveAlerts] = useState<BatchAlert[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [uploadHistory, setUploadHistory] = useState<FileUploadRecord[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { exportToExcel } = useExportToExcel();

  // ==================== FILE HANDLING ====================

  const handleFileSelect = (file: File) => {
    setError(null);

    // Validar archivo
    const validation = validateFile(file, selectedSource);
    if (!validation.valid) {
      setError(validation.error || 'Archivo no válido');
      return;
    }

    setSelectedFile(file);
    setProcessedAlerts([]);
    setGraveAlerts([]);
    setTotalRows(0);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
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
    setGraveAlerts([]);

    try {
      const result = await processFile(selectedFile, selectedSource);

      if (!result.success) {
        setError(result.error || 'Error procesando archivo');
        setIsProcessing(false);
        return;
      }

      // Filtrar faltas graves
      const graves = result.data?.filter(alert => alert.is_grave) || [];

      setProcessedAlerts(result.data || []);
      setGraveAlerts(graves);
      setTotalRows(result.totalRows);

      alert(`✅ Archivo procesado exitosamente\n\n` +
            `Total de registros: ${result.totalRows}\n` +
            `Faltas Graves detectadas: ${result.gravesDetected}`);

    } catch (error: any) {
      setError(`Error procesando archivo: ${error.message}`);
    } finally {
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

      alert(`✅ Datos guardados exitosamente en la base de datos\n\n` +
            `Total guardado: ${saveResult.insertedCount} alertas\n` +
            `Faltas Graves: ${graveAlerts.length}`);

      // Limpiar formulario
      setSelectedFile(null);
      setProcessedAlerts([]);
      setGraveAlerts([]);
      setTotalRows(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      // Recargar historial
      loadUploadHistory();

    } catch (error: any) {
      setError(`Error guardando en base de datos: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // ==================== EXPORT ====================

  const handleExportGraves = () => {
    if (graveAlerts.length === 0) {
      alert('No hay Faltas Graves para exportar');
      return;
    }

    const exportData = graveAlerts.map(alert => ({
      placa: alert.plate,
      tipo_alerta: alert.alert_type,
      velocidad: alert.speed ? `${alert.speed} km/h` : 'N/A',
      conductor: alert.driver || 'N/A',
      fecha_hora: alert.timestamp,
      severidad: alert.severity === 'critical' ? 'CRÍTICA' : alert.severity.toUpperCase(),
      falta_grave: alert.is_grave ? 'SÍ' : 'NO'
    }));

    exportToExcel(
      exportData,
      [
        { header: 'Placa', key: 'placa', width: 12 },
        { header: 'Tipo de Alerta', key: 'tipo_alerta', width: 40 },
        { header: 'Velocidad', key: 'velocidad', width: 15 },
        { header: 'Conductor', key: 'conductor', width: 25 },
        { header: 'Fecha y Hora', key: 'fecha_hora', width: 20 },
        { header: 'Severidad', key: 'severidad', width: 12 },
        { header: 'Falta Grave', key: 'falta_grave', width: 12 }
      ],
      `Faltas_Graves_${selectedSource}_${new Date().toISOString().split('T')[0]}`
    );
  };

  // ==================== HISTORY ====================

  const loadUploadHistory = async () => {
    const result = await getAllFileUploads();
    if (result.success && result.data) {
      setUploadHistory(result.data);
    }
  };

  React.useEffect(() => {
    loadUploadHistory();
  }, []);

  // ==================== RENDER ====================

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Auditoría de Flota - Carga por Lotes</h1>
          <p className="text-sm text-slate-600 mt-1">
            Carga archivos históricos de proveedores GPS para análisis de Faltas Graves
          </p>
        </div>
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors flex items-center gap-2"
        >
          <Database className="w-4 h-4" />
          {showHistory ? 'Ocultar' : 'Ver'} Historial
        </button>
      </div>

      {/* Historial de Cargas */}
      {showHistory && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h3 className="font-bold text-lg text-slate-800 mb-4">Historial de Cargas</h3>
          {uploadHistory.length === 0 ? (
            <p className="text-slate-500 text-center py-4">No hay cargas previas</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="px-4 py-2 text-left">Archivo</th>
                    <th className="px-4 py-2 text-center">Proveedor</th>
                    <th className="px-4 py-2 text-center">Registros</th>
                    <th className="px-4 py-2 text-center">Fecha de Carga</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {uploadHistory.map(upload => (
                    <tr key={upload.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-slate-600" />
                          <span className="font-medium text-slate-800">{upload.filename}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${
                          upload.source === 'FAGOR' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                        }`}>
                          {upload.source}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center font-semibold">{upload.processed_rows}</td>
                      <td className="px-4 py-3 text-center text-slate-600">
                        {new Date(upload.upload_date).toLocaleString('es-CO')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Selector de Proveedor */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <label className="block text-sm font-semibold text-slate-700 mb-3">
          1. Seleccionar Proveedor GPS
        </label>
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => {
              setSelectedSource('FAGOR');
              setSelectedFile(null);
              setProcessedAlerts([]);
              setGraveAlerts([]);
            }}
            className={`p-4 rounded-lg border-2 transition-all ${
              selectedSource === 'FAGOR'
                ? 'border-blue-600 bg-blue-50'
                : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="text-center">
              <div className="text-2xl font-bold text-slate-800">FAGOR</div>
              <div className="text-xs text-slate-600 mt-1">Excel/CSV con múltiples headers</div>
              <div className="text-xs text-blue-600 mt-2 font-semibold">
                Detecta: "Alrm. de excesos de velocidad"
              </div>
            </div>
          </button>

          <button
            onClick={() => {
              setSelectedSource('COLTRACK');
              setSelectedFile(null);
              setProcessedAlerts([]);
              setGraveAlerts([]);
            }}
            className={`p-4 rounded-lg border-2 transition-all ${
              selectedSource === 'COLTRACK'
                ? 'border-purple-600 bg-purple-50'
                : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="text-center">
              <div className="text-2xl font-bold text-slate-800">COLTRACK</div>
              <div className="text-xs text-slate-600 mt-1">CSV delimitado por "|"</div>
              <div className="text-xs text-purple-600 mt-2 font-semibold">
                Detecta: "infraccion"
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* Upload Area */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <label className="block text-sm font-semibold text-slate-700 mb-3">
          2. Cargar Archivo ({selectedSource})
        </label>

        {/* Drag & Drop Area */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-all ${
            isDragging
              ? 'border-blue-600 bg-blue-50'
              : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50'
          }`}
        >
          <Upload className={`w-12 h-12 mx-auto mb-4 ${isDragging ? 'text-blue-600' : 'text-slate-400'}`} />
          <p className="text-lg font-semibold text-slate-700 mb-2">
            {isDragging ? 'Suelta el archivo aquí' : 'Arrastra y suelta el archivo'}
          </p>
          <p className="text-sm text-slate-500 mb-4">
            o haz clic para seleccionar
          </p>
          <p className="text-xs text-slate-400">
            Formatos: .xlsx, .xls, .csv (máximo 10 MB)
          </p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={handleFileInputChange}
          className="hidden"
        />

        {/* Selected File */}
        {selectedFile && (
          <div className="mt-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="w-8 h-8 text-blue-600" />
                <div>
                  <p className="font-semibold text-slate-800">{selectedFile.name}</p>
                  <p className="text-xs text-slate-500">
                    {(selectedFile.size / 1024).toFixed(2)} KB
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setSelectedFile(null);
                  setProcessedAlerts([]);
                  setGraveAlerts([]);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                className="p-2 hover:bg-red-100 rounded text-red-600"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-800">Error</p>
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        )}

        {/* Process Button */}
        <div className="mt-6">
          <button
            onClick={handleProcessFile}
            disabled={!selectedFile || isProcessing}
            className={`w-full py-3 px-6 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 ${
              !selectedFile || isProcessing
                ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {isProcessing ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Procesando archivo...
              </>
            ) : (
              <>
                <FileText className="w-5 h-5" />
                3. Procesar Archivo
              </>
            )}
          </button>
        </div>
      </div>

      {/* Preview - Faltas Graves */}
      {graveAlerts.length > 0 && (
        <div className="bg-white rounded-xl border border-red-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-6 h-6 text-red-600" />
              <div>
                <h3 className="font-bold text-lg text-slate-800">
                  Faltas Graves Detectadas
                </h3>
                <p className="text-sm text-slate-600">
                  {graveAlerts.length} de {totalRows} registros
                </p>
              </div>
            </div>
            <button
              onClick={handleExportGraves}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Exportar a Excel
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-red-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-bold text-red-800">Placa</th>
                  <th className="px-4 py-2 text-left text-xs font-bold text-red-800">Tipo de Alerta</th>
                  <th className="px-4 py-2 text-center text-xs font-bold text-red-800">Velocidad</th>
                  <th className="px-4 py-2 text-left text-xs font-bold text-red-800">Conductor</th>
                  <th className="px-4 py-2 text-center text-xs font-bold text-red-800">Fecha/Hora</th>
                  <th className="px-4 py-2 text-center text-xs font-bold text-red-800">Severidad</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {graveAlerts.slice(0, 50).map((alert, index) => (
                  <tr key={index} className="hover:bg-red-50">
                    <td className="px-4 py-3 font-semibold text-slate-800">{alert.plate}</td>
                    <td className="px-4 py-3 text-slate-700">{alert.alert_type}</td>
                    <td className="px-4 py-3 text-center">
                      {alert.speed ? (
                        <span className="font-semibold text-red-700">{alert.speed} km/h</span>
                      ) : (
                        <span className="text-slate-400">N/A</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{alert.driver || 'N/A'}</td>
                    <td className="px-4 py-3 text-center text-slate-600 text-xs">
                      {alert.timestamp}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-semibold">
                        {alert.severity.toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {graveAlerts.length > 50 && (
              <p className="text-center text-sm text-slate-500 mt-4">
                Mostrando primeras 50 de {graveAlerts.length} faltas graves
              </p>
            )}
          </div>
        </div>
      )}

      {/* Save Button */}
      {processedAlerts.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <button
            onClick={handleSaveToDatabase}
            disabled={isSaving}
            className={`w-full py-4 px-6 rounded-lg font-bold text-lg transition-all flex items-center justify-center gap-3 ${
              isSaving
                ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                : 'bg-green-600 text-white hover:bg-green-700'
            }`}
          >
            {isSaving ? (
              <>
                <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin" />
                Guardando en Base de Datos...
              </>
            ) : (
              <>
                <CheckCircle className="w-6 h-6" />
                4. Guardar en Base de Datos ({processedAlerts.length} alertas)
              </>
            )}
          </button>
          <p className="text-center text-sm text-slate-500 mt-3">
            Se guardarán {totalRows} registros, incluyendo {graveAlerts.length} Faltas Graves
          </p>
        </div>
      )}
    </div>
  );
};
