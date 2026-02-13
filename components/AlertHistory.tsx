import React, { useState, useEffect } from 'react';
import { AlertTriangle, AlertCircle, Bell, BellRing, CheckCircle, Clock, MapPin, User, Gauge, FileText, Plus, Trash2, Edit, X, FileDown, Search, Calendar, History, ShieldAlert, Upload, Paperclip, Eye, Download as DownloadIcon, CheckSquare, Square } from 'lucide-react';
import {
  getAllSavedAlerts,
  getFilteredAlerts,
  updateAlertStatus,
  deleteAlert,
  deleteMultipleAlerts,
  addActionPlan,
  updateActionPlan,
  deleteActionPlan,
  SavedAlertWithPlans,
  ActionPlan,
  FileAttachment
} from '../services/databaseService';
import {
  uploadMultipleFiles,
  formatFileSize,
  getFileIcon
} from '../services/fileStorageService';
import { usePagination } from '../hooks/usePagination';
import { PaginationControls } from './PaginationControls';
import { useExportToExcel } from '../hooks/useExportToExcel';
import { useAuth } from '../contexts/AuthContext';
import { DataCleanupService } from '../services/dataCleanupService';

interface AlertHistoryProps {
  onRefresh?: () => void;
}

export const AlertHistory: React.FC<AlertHistoryProps> = ({ onRefresh }) => {
  const [alerts, setAlerts] = useState<SavedAlertWithPlans[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAlert, setSelectedAlert] = useState<SavedAlertWithPlans | null>(null);
  const [showActionModal, setShowActionModal] = useState(false);

  // Selection state
  const [selectedAlertIds, setSelectedAlertIds] = useState<Set<string>>(new Set());

  // Filters
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'pending' | 'in_progress' | 'resolved' | 'invalid'>('ALL');
  const [severityFilter, setSeverityFilter] = useState<'ALL' | 'critical' | 'high' | 'medium' | 'low'>('ALL');
  const [searchText, setSearchText] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const { exportToExcel } = useExportToExcel();
  const { user } = useAuth();
  const [isCleaning, setIsCleaning] = useState(false);

  // Action Plan Form
  const [newActionPlan, setNewActionPlan] = useState({
    description: '',
    responsible: '',
    status: 'pending' as const,
    observations: ''
  });
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });

  // Filtrado adicional del lado del cliente (búsqueda y fechas)
  const filteredAndSearchedAlerts = alerts.filter(alert => {
    // Búsqueda de texto
    if (searchText) {
      const search = searchText.toLowerCase();
      const matchesSearch =
        alert.plate.toLowerCase().includes(search) ||
        alert.driver.toLowerCase().includes(search) ||
        alert.type.toLowerCase().includes(search) ||
        alert.details.toLowerCase().includes(search) ||
        (alert.contract && alert.contract.toLowerCase().includes(search)) ||
        alert.location.toLowerCase().includes(search);

      if (!matchesSearch) return false;
    }

    // Filtro de fecha inicial
    if (startDate) {
      const alertDate = new Date(alert.timestamp);
      const filterStart = new Date(startDate);
      if (alertDate < filterStart) return false;
    }

    // Filtro de fecha final
    if (endDate) {
      const alertDate = new Date(alert.timestamp);
      const filterEnd = new Date(endDate);
      filterEnd.setHours(23, 59, 59, 999); // Incluir todo el día
      if (alertDate > filterEnd) return false;
    }

    return true;
  });

  // Hook de paginación
  const pagination = usePagination(filteredAndSearchedAlerts, {
    initialPageSize: 20,
    pageSizeOptions: [10, 20, 50, 100]
  });

  // Función para exportar a Excel con TODOS los datos (planes de acción, observaciones, archivos adjuntos)
  const handleExport = () => {
    // 🔍 DIAGNÓSTICO: Ver qué datos tenemos
    console.log('=== DIAGNÓSTICO DE EXPORTACIÓN ===');
    console.log('Total de alertas filtradas:', filteredAndSearchedAlerts.length);

    // Verificar una muestra de alertas
    if (filteredAndSearchedAlerts.length > 0) {
      const sampleAlert = filteredAndSearchedAlerts[0];
      console.log('Muestra de alerta:', {
        id: sampleAlert.id,
        plate: sampleAlert.plate,
        hasActionPlans: !!sampleAlert.action_plans,
        actionPlansCount: sampleAlert.action_plans?.length || 0,
        firstPlan: sampleAlert.action_plans?.[0]
      });
    }

    // Transformar datos para incluir planes de acción y archivos adjuntos
    const exportData: any[] = [];
    let totalPlansProcessed = 0;
    let totalAttachmentsProcessed = 0;

    filteredAndSearchedAlerts.forEach(alert => {
      // Si la alerta tiene planes de acción, crear una fila por cada plan
      if (alert.action_plans && alert.action_plans.length > 0) {
        alert.action_plans.forEach(plan => {
          totalPlansProcessed++;

          // Extraer URLs de archivos adjuntos
          const attachmentUrls = plan.attachments && plan.attachments.length > 0
            ? plan.attachments.map(file => `${file.name}: ${file.url}`).join(' | ')
            : 'Sin archivos';

          // Cantidad de archivos
          const attachmentCount = plan.attachments?.length || 0;
          totalAttachmentsProcessed += attachmentCount;

          exportData.push({
            // Datos de la Alerta
            tipo: alert.type,
            placa: alert.plate,
            contrato: alert.contract || 'N/A',
            estado_alerta: alert.status === 'pending' ? 'Pendiente' :
                          alert.status === 'in_progress' ? 'En Proceso' :
                          alert.status === 'resolved' ? 'Resuelto' : 'Inválida',
            severidad: alert.severity,
            detalles_alerta: alert.details,
            conductor: alert.driver,
            velocidad: alert.speed,
            ubicacion: alert.location,
            fecha_alerta: new Date(alert.timestamp).toLocaleString('es-CO', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit'
            }),
            guardada_el: new Date(alert.saved_at).toLocaleString('es-CO', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit'
            }),

            // Datos del Plan de Acción
            plan_descripcion: plan.description,
            plan_responsable: plan.responsible,
            plan_estado: plan.status === 'pending' ? 'Pendiente' : plan.status === 'in_progress' ? 'En Proceso' : 'Completado',
            plan_observaciones: plan.observations || 'Sin observaciones',
            plan_creado_el: new Date(plan.created_at).toLocaleString('es-CO', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit'
            }),
            plan_actualizado_el: new Date(plan.updated_at).toLocaleString('es-CO', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit'
            }),
            plan_creado_por: plan.created_by,

            // Datos de Archivos Adjuntos
            cantidad_archivos: attachmentCount,
            archivos_adjuntos: attachmentUrls
          });
        });
      } else {
        // Si no tiene planes de acción, exportar solo la alerta
        exportData.push({
          // Datos de la Alerta
          tipo: alert.type,
          placa: alert.plate,
          contrato: alert.contract || 'N/A',
          estado_alerta: alert.status === 'pending' ? 'Pendiente' :
                        alert.status === 'in_progress' ? 'En Proceso' :
                        alert.status === 'resolved' ? 'Resuelto' : 'Inválida',
          severidad: alert.severity,
          detalles_alerta: alert.details,
          conductor: alert.driver,
          velocidad: alert.speed,
          ubicacion: alert.location,
          fecha_alerta: new Date(alert.timestamp).toLocaleString('es-CO', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          }),
          guardada_el: new Date(alert.saved_at).toLocaleString('es-CO', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
          }),

          // Sin Plan de Acción
          plan_descripcion: 'Sin plan de acción',
          plan_responsable: 'N/A',
          plan_estado: 'N/A',
          plan_observaciones: 'N/A',
          plan_creado_el: 'N/A',
          plan_actualizado_el: 'N/A',
          plan_creado_por: 'N/A',
          cantidad_archivos: 0,
          archivos_adjuntos: 'Sin archivos'
        });
      }
    });

    // 🔍 DIAGNÓSTICO: Resumen de datos procesados
    console.log('=== RESUMEN DE PROCESAMIENTO ===');
    console.log('Total de filas para exportar:', exportData.length);
    console.log('Total de planes de acción procesados:', totalPlansProcessed);
    console.log('Total de archivos adjuntos procesados:', totalAttachmentsProcessed);

    // Mostrar muestra de una fila con plan de acción
    const rowWithPlan = exportData.find(row => row.plan_descripcion !== 'Sin plan de acción');
    if (rowWithPlan) {
      console.log('Muestra de fila con plan de acción:', {
        placa: rowWithPlan.placa,
        plan_descripcion: rowWithPlan.plan_descripcion,
        plan_responsable: rowWithPlan.plan_responsable,
        plan_observaciones: rowWithPlan.plan_observaciones,
        cantidad_archivos: rowWithPlan.cantidad_archivos,
        archivos_adjuntos: rowWithPlan.archivos_adjuntos
      });
    } else {
      console.warn('⚠️ NO SE ENCONTRARON FILAS CON PLANES DE ACCIÓN');
    }

    // Validación crítica
    if (exportData.length === 0) {
      alert('⚠️ No hay datos para exportar. Verifique los filtros aplicados.');
      return;
    }

    // Definir columnas con anchos óptimos para legibilidad
    exportToExcel(
      exportData,
      [
        // Información de Alerta
        { header: 'Tipo', key: 'tipo', width: 20 },
        { header: 'Placa', key: 'placa', width: 12 },
        { header: 'Contrato', key: 'contrato', width: 18 },
        { header: 'Estado Alerta', key: 'estado_alerta', width: 15 },
        { header: 'Severidad', key: 'severidad', width: 12 },
        { header: 'Detalles Alerta', key: 'detalles_alerta', width: 45 },
        { header: 'Conductor', key: 'conductor', width: 25 },
        { header: 'Velocidad (km/h)', key: 'velocidad', width: 15 },
        { header: 'Ubicación', key: 'ubicacion', width: 50 },
        { header: 'Fecha y Hora Alerta', key: 'fecha_alerta', width: 22 },
        { header: 'Guardada El', key: 'guardada_el', width: 20 },

        // Información de Plan de Acción
        { header: 'Plan: Descripción', key: 'plan_descripcion', width: 50 },
        { header: 'Plan: Responsable', key: 'plan_responsable', width: 25 },
        { header: 'Plan: Estado', key: 'plan_estado', width: 15 },
        { header: 'Plan: Observaciones', key: 'plan_observaciones', width: 50 },
        { header: 'Plan: Creado El', key: 'plan_creado_el', width: 20 },
        { header: 'Plan: Actualizado El', key: 'plan_actualizado_el', width: 20 },
        { header: 'Plan: Creado Por', key: 'plan_creado_por', width: 25 },

        // Información de Archivos Adjuntos
        { header: 'Cantidad Archivos', key: 'cantidad_archivos', width: 18 },
        { header: 'Archivos Adjuntos (URLs)', key: 'archivos_adjuntos', width: 80 },
      ],
      `Historial_Completo_${new Date().toLocaleDateString('es-CO').replace(/\//g, '-')}`
    );
  };

  useEffect(() => {
    loadAlerts();
  }, [statusFilter, severityFilter]);

  const loadAlerts = async () => {
    setLoading(true);
    const filters: any = {};

    if (statusFilter !== 'ALL') filters.status = statusFilter;
    if (severityFilter !== 'ALL') filters.severity = severityFilter;

    const result = statusFilter === 'ALL' && severityFilter === 'ALL'
      ? await getAllSavedAlerts()
      : await getFilteredAlerts(filters);

    if (result.success && result.data) {
      // 🔍 DIAGNÓSTICO: Verificar datos cargados
      console.log('=== ALERTAS CARGADAS DESDE BD ===');
      console.log('Total de alertas cargadas:', result.data.length);

      if (result.data.length > 0) {
        const alertsWithPlans = result.data.filter(a => a.action_plans && a.action_plans.length > 0);
        console.log('Alertas con planes de acción:', alertsWithPlans.length);

        if (alertsWithPlans.length > 0) {
          const sampleAlert = alertsWithPlans[0];
          console.log('Muestra de alerta con planes:', {
            id: sampleAlert.id,
            plate: sampleAlert.plate,
            plansCount: sampleAlert.action_plans.length,
            firstPlan: sampleAlert.action_plans[0]
          });
        } else {
          console.warn('⚠️ NINGUNA ALERTA TIENE PLANES DE ACCIÓN EN LA BD');
        }
      }

      setAlerts(result.data);
    } else {
      console.error('Error loading alerts:', result.error);
    }
    setLoading(false);
  };

  const handleStatusChange = async (alertId: string, newStatus: 'pending' | 'in_progress' | 'resolved' | 'invalid') => {
    const result = await updateAlertStatus(alertId, newStatus);
    if (result.success) {
      loadAlerts();
      onRefresh?.();
    } else {
      alert('Error al actualizar el estado: ' + result.error);
    }
  };

  const handleDeleteAlert = async (alertId: string) => {
    if (!confirm('¿Estás seguro de eliminar esta alerta del historial?')) return;

    const result = await deleteAlert(alertId);
    if (result.success) {
      loadAlerts();
      onRefresh?.();
    } else {
      alert('Error al eliminar la alerta: ' + result.error);
    }
  };

  // ==================== SELECTION HANDLERS ====================

  const toggleSelectAll = () => {
    const currentPageAlertIds = pagination.paginatedData.map(alert => alert.id);

    if (currentPageAlertIds.every(id => selectedAlertIds.has(id))) {
      // Deseleccionar todos de la página actual
      setSelectedAlertIds(prev => {
        const newSet = new Set(prev);
        currentPageAlertIds.forEach(id => newSet.delete(id));
        return newSet;
      });
    } else {
      // Seleccionar todos de la página actual
      setSelectedAlertIds(prev => {
        const newSet = new Set(prev);
        currentPageAlertIds.forEach(id => newSet.add(id));
        return newSet;
      });
    }
  };

  const toggleSelectAlert = (alertId: string) => {
    setSelectedAlertIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(alertId)) {
        newSet.delete(alertId);
      } else {
        newSet.add(alertId);
      }
      return newSet;
    });
  };

  const handleBulkDelete = async () => {
    if (selectedAlertIds.size === 0) return;

    const confirmText = window.prompt(
      `⚠️ ADVERTENCIA: Esta acción eliminará ${selectedAlertIds.size} alerta${selectedAlertIds.size > 1 ? 's' : ''} del historial.\n\n` +
      'Esto incluirá TODOS los planes de acción asociados.\n\n' +
      'Esta acción NO se puede deshacer.\n\n' +
      'Para confirmar, escribe: ELIMINAR'
    );

    if (confirmText !== 'ELIMINAR') {
      if (confirmText !== null) {
        window.alert('Operación cancelada. El texto no coincide.');
      }
      return;
    }

    const result = await deleteMultipleAlerts(Array.from(selectedAlertIds));

    if (result.success) {
      window.alert(`✅ ${result.deletedCount} alerta${result.deletedCount! > 1 ? 's' : ''} eliminada${result.deletedCount! > 1 ? 's' : ''} del historial`);
      setSelectedAlertIds(new Set());
      loadAlerts();
      onRefresh?.();
    } else {
      window.alert('❌ Error: ' + result.error);
    }
  };

  const handleCleanupHistory = async () => {
    if (!confirm('⚠️ ¿Estás seguro de ejecutar la limpieza del historial?\n\nEsta acción ejecutará manualmente la política de retención:\n- Eliminará alertas resueltas con más de 7 días.\n- Eliminará alertas activas con más de 30 días.\n\nEsta acción NO se puede deshacer.')) {
      return;
    }

    setIsCleaning(true);
    try {
      const result = await DataCleanupService.runFullCleanup(true); // true = force execution
      const total = result.deletedAlerts + result.deletedActionPlans + result.deletedInspections;

      if (total > 0) {
        alert(`✅ Limpieza completada.\nRegistros eliminados: ${total}`);
        loadAlerts();
        onRefresh?.();
      } else {
        alert('ℹ️ No se encontraron registros antiguos para eliminar según la política actual.');
      }
    } catch (error) {
      console.error(error);
      alert('❌ Error al ejecutar la limpieza.');
    } finally {
      setIsCleaning(false);
    }
  };

  const handleOpenActionModal = (alert: SavedAlertWithPlans) => {
    setSelectedAlert(alert);
    setShowActionModal(true);
    setNewActionPlan({
      description: '',
      responsible: '',
      status: 'pending',
      observations: ''
    });
    setSelectedFiles([]);
    setIsUploading(false);
    setUploadProgress({ current: 0, total: 0 });
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    setSelectedFiles(prev => [...prev, ...files]);
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddActionPlan = async () => {
    if (!selectedAlert || !newActionPlan.description || !newActionPlan.responsible) {
      alert('Por favor completa la descripción y el responsable');
      return;
    }

    setIsUploading(true);
    let attachments: FileAttachment[] = [];

    try {
      // Subir archivos si hay alguno seleccionado
      if (selectedFiles.length > 0) {
        const uploadResult = await uploadMultipleFiles(
          selectedFiles,
          selectedAlert.id,
          (current, total) => setUploadProgress({ current, total })
        );

        if (uploadResult.errors && uploadResult.errors.length > 0) {
          alert(`⚠️ Algunos archivos no se pudieron subir:\n${uploadResult.errors.join('\n')}`);
        }

        if (uploadResult.data) {
          attachments = uploadResult.data;
        }
      }

      // Agregar plan de acción con archivos adjuntos
      const planWithAttachments = {
        ...newActionPlan,
        attachments
      };

      const result = await addActionPlan(selectedAlert.id, planWithAttachments, user?.email || 'Usuario');

      if (result.success) {
        setNewActionPlan({
          description: '',
          responsible: '',
          status: 'pending',
          observations: ''
        });
        setSelectedFiles([]);
        loadAlerts();
        alert(`✅ Plan de acción agregado correctamente${attachments.length > 0 ? ` con ${attachments.length} archivo(s)` : ''}`);
      } else {
        alert('❌ Error al agregar plan de acción: ' + result.error);
      }
    } catch (error: any) {
      console.error('Error al agregar plan:', error);
      alert('❌ Error al agregar plan de acción: ' + error.message);
    } finally {
      setIsUploading(false);
      setUploadProgress({ current: 0, total: 0 });
    }
  };

  const handleUpdateActionPlanStatus = async (planId: string, newStatus: 'pending' | 'in_progress' | 'completed') => {
    const result = await updateActionPlan(planId, { status: newStatus });
    if (result.success) {
      loadAlerts();
    } else {
      alert('Error al actualizar el plan: ' + result.error);
    }
  };

  const handleDeleteActionPlan = async (planId: string) => {
    if (!confirm('¿Eliminar este plan de acción?')) return;

    const result = await deleteActionPlan(planId);
    if (result.success) {
      loadAlerts();
    } else {
      alert('Error al eliminar el plan: ' + result.error);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-300';
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'low': return 'bg-blue-100 text-blue-800 border-blue-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return <AlertCircle className="w-5 h-5 text-red-600" />;
      case 'high': return <AlertTriangle className="w-5 h-5 text-orange-600" />;
      case 'medium': return <Bell className="w-5 h-5 text-yellow-600" />;
      case 'low': return <BellRing className="w-5 h-5 text-blue-600" />;
      default: return <Bell className="w-5 h-5 text-gray-600" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      pending: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      in_progress: 'bg-blue-100 text-blue-800 border-blue-300',
      resolved: 'bg-green-100 text-green-800 border-green-300'
    };
    const labels = {
      pending: 'Pendiente',
      in_progress: 'En Proceso',
      resolved: 'Resuelta'
    };
    return (
      <span className={`px-2 py-1 rounded-md text-xs font-semibold border ${styles[status as keyof typeof styles]}`}>
        {labels[status as keyof typeof labels]}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      {/* Filtros y Búsqueda */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">
        {/* Primera fila: Búsqueda */}
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex items-center gap-2 flex-1 min-w-[250px]">
            <Search className="w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por placa, conductor, tipo, contrato..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>
        </div>

        {/* Segunda fila: Filtros */}
        <div className="flex flex-wrap gap-4 items-center">
          {/* Estado */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-semibold text-slate-600">Estado:</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              <option value="ALL">Todos</option>
              <option value="pending">Pendientes</option>
              <option value="in_progress">En Proceso</option>
              <option value="resolved">Resueltas</option>
              <option value="invalid">Inválidas</option>
            </select>
          </div>

          {/* Severidad */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-semibold text-slate-600">Severidad:</label>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value as any)}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              <option value="ALL">Todas</option>
              <option value="critical">Críticas</option>
              <option value="high">Altas</option>
              <option value="medium">Medias</option>
              <option value="low">Bajas</option>
            </select>
          </div>

          {/* Fecha Inicio */}
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-400" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
              placeholder="Desde"
            />
          </div>

          {/* Fecha Fin */}
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-400" />
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
              placeholder="Hasta"
            />
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

          {/* Botón Eliminar Seleccionadas */}
          {selectedAlertIds.size > 0 && (
            <button
              onClick={handleBulkDelete}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
              title={`Eliminar ${selectedAlertIds.size} alertas seleccionadas`}
            >
              <Trash2 className="w-4 h-4" />
              Eliminar ({selectedAlertIds.size})
            </button>
          )}

          {/* Botón Limpiar Historial (Solo Admin) */}
          {user?.role === 'admin' && (
            <button
              onClick={handleCleanupHistory}
              disabled={isCleaning}
              className={`flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-red-50 hover:text-red-700 border border-slate-200 transition-colors text-sm font-medium ${isCleaning ? 'opacity-50 cursor-not-allowed' : ''}`}
              title="Limpiar alertas antiguas (Retención manual)"
            >
              <Trash2 className="w-4 h-4" />
              {isCleaning ? 'Limpiando...' : 'Limpiar Historial'}
            </button>
          )}

          {/* Contador */}
          <div className="ml-auto text-sm font-semibold text-slate-600">
            {filteredAndSearchedAlerts.length} alerta{filteredAndSearchedAlerts.length !== 1 ? 's' : ''}
            {selectedAlertIds.size > 0 && (
              <span className="ml-2 text-red-600">
                ({selectedAlertIds.size} seleccionada{selectedAlertIds.size !== 1 ? 's' : ''})
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tabla de Alertas */}
      {loading ? (
        <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
          <p className="text-slate-600">Cargando alertas...</p>
        </div>
      ) : alerts.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
          <CheckCircle className="w-16 h-16 text-slate-400 mx-auto mb-4" />
          <p className="text-slate-600 font-medium">No hay alertas guardadas</p>
          <p className="text-slate-400 text-sm mt-1">Las alertas guardadas aparecerán aquí</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gradient-to-r from-slate-700 to-slate-600 text-white">
              <tr>
                <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider">
                  <button
                    onClick={toggleSelectAll}
                    className="p-1 rounded hover:bg-slate-800 transition-colors"
                    title="Seleccionar/Deseleccionar todos"
                  >
                    {pagination.paginatedData.length > 0 &&
                     pagination.paginatedData.every(a => selectedAlertIds.has(a.id)) ? (
                      <CheckSquare className="w-5 h-5" />
                    ) : (
                      <Square className="w-5 h-5" />
                    )}
                  </button>
                </th>
                <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider">Acciones</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider">Tipo</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider">Placa/Contrato</th>
                <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider">Estado</th>
                <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider">Severidad</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider">Detalles</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider">Conductor</th>
                <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider">Velocidad</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider">Ubicación</th>
                <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider">Fecha</th>
                <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider">Planes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pagination.paginatedData.map((alert, index) => (
                <tr
                  key={alert.id}
                  onClick={() => handleOpenActionModal(alert)}
                  className={`${index % 2 === 0 ? 'bg-white' : 'bg-slate-50'} ${selectedAlertIds.has(alert.id) ? 'bg-blue-100' : ''} hover:bg-blue-50 transition-colors cursor-pointer`}
                >
                  {/* Checkbox */}
                  <td className="px-4 py-3 text-center whitespace-nowrap">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelectAlert(alert.id);
                      }}
                      className="p-1 rounded hover:bg-slate-200 transition-colors"
                    >
                      {selectedAlertIds.has(alert.id) ? (
                        <CheckSquare className="w-5 h-5 text-blue-600" />
                      ) : (
                        <Square className="w-5 h-5 text-slate-400" />
                      )}
                    </button>
                  </td>

                  {/* Acciones */}
                  <td className="px-4 py-3 text-center whitespace-nowrap">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenActionModal(alert);
                        }}
                        className="p-2 rounded-lg text-white bg-sky-600 hover:bg-sky-700 transition-colors"
                        title="Gestionar Planes de Acción"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteAlert(alert.id);
                        }}
                        className="p-2 rounded-lg text-white bg-red-600 hover:bg-red-700 transition-colors"
                        title="Eliminar Alerta"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      {new Date(alert.saved_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}
                    </div>
                  </td>

                  {/* Tipo */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {getSeverityIcon(alert.severity)}
                      <span className="font-semibold text-slate-900">{alert.type}</span>
                    </div>
                  </td>

                  {/* Placa/Contrato */}
                  <td className="px-4 py-3">
                    <div className="font-bold text-slate-900">{alert.plate}</div>
                    {alert.contract && alert.contract !== 'No asignado' && (
                      <div className="text-xs text-sky-600 font-medium">{alert.contract}</div>
                    )}
                  </td>

                  {/* Estado */}
                  <td className="px-4 py-3 text-center whitespace-nowrap">
                    <select
                      value={alert.status}
                      onChange={(e) => {
                        e.stopPropagation();
                        handleStatusChange(alert.id, e.target.value as any);
                      }}
                      className="px-2 py-1 text-xs font-medium border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                    >
                      <option value="pending">Pendiente</option>
                      <option value="in_progress">En Proceso</option>
                      <option value="resolved">Resuelta</option>
                      <option value="invalid">Inválida</option>
                    </select>
                  </td>

                  {/* Severidad */}
                  <td className="px-4 py-3 text-center whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${getSeverityColor(alert.severity)}`}>
                      {alert.severity}
                    </span>
                  </td>

                  {/* Detalles */}
                  <td className="px-4 py-3">
                    <span className="text-sm text-slate-700">{alert.details}</span>
                  </td>

                  {/* Conductor */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 text-sm text-slate-700">
                      <User className="w-3 h-3" />
                      <span>{alert.driver}</span>
                    </div>
                  </td>

                  {/* Velocidad */}
                  <td className="px-4 py-3 text-center whitespace-nowrap">
                    <div className="flex items-center justify-center gap-1">
                      <Gauge className="w-3 h-3 text-slate-600" />
                      <span className="font-semibold text-slate-900">{alert.speed}</span>
                      <span className="text-xs text-slate-500">km/h</span>
                    </div>
                  </td>

                  {/* Ubicación */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 text-sm text-slate-700 max-w-xs">
                      <MapPin className="w-3 h-3 flex-shrink-0 text-blue-600" />
                      <span className="truncate">{alert.location}</span>
                    </div>
                  </td>

                  {/* Fecha */}
                  <td className="px-4 py-3 text-center whitespace-nowrap">
                    <div className="text-sm text-slate-700">
                      {new Date(alert.timestamp).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}
                    </div>
                    <div className="text-xs text-slate-500">
                      {new Date(alert.timestamp).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </td>

                  {/* Planes de Acción */}
                  <td className="px-4 py-3 text-center whitespace-nowrap">
                    {alert.action_plans && alert.action_plans.length > 0 ? (
                      <div className="text-xs">
                        <span className="font-semibold text-slate-900">{alert.action_plans.length}</span>
                        <span className="text-slate-600"> plan{alert.action_plans.length !== 1 ? 'es' : ''}</span>
                        <div className="text-xs text-slate-500 mt-1">
                          {alert.action_plans.filter(p => p.status === 'completed').length} completado{alert.action_plans.filter(p => p.status === 'completed').length !== 1 ? 's' : ''}
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">-</span>
                    )}
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
      )}

      {/* Modal de Plan de Acción */}
      {showActionModal && selectedAlert && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Agregar Plan de Acción</h3>
                <p className="text-sm text-slate-600 mt-1">Alerta: {selectedAlert.plate} - {selectedAlert.type}</p>
              </div>
              <button
                onClick={() => setShowActionModal(false)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Descripción del Plan de Acción *
                </label>
                <textarea
                  value={newActionPlan.description}
                  onChange={(e) => setNewActionPlan({ ...newActionPlan, description: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                  rows={3}
                  placeholder="Describe las acciones que se tomarán..."
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Responsable *
                </label>
                <input
                  type="text"
                  value={newActionPlan.responsible}
                  onChange={(e) => setNewActionPlan({ ...newActionPlan, responsible: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                  placeholder="Nombre del responsable"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Estado Inicial
                </label>
                <select
                  value={newActionPlan.status}
                  onChange={(e) => setNewActionPlan({ ...newActionPlan, status: e.target.value as any })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="pending">Pendiente</option>
                  <option value="in_progress">En Proceso</option>
                  <option value="completed">Completado</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Observaciones
                </label>
                <textarea
                  value={newActionPlan.observations}
                  onChange={(e) => setNewActionPlan({ ...newActionPlan, observations: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                  rows={2}
                  placeholder="Observaciones adicionales (opcional)"
                />
              </div>

              {/* Campo de Archivos Adjuntos */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  <div className="flex items-center gap-2">
                    <Paperclip className="w-4 h-4" />
                    Archivos de Evidencia
                  </div>
                  <span className="text-xs font-normal text-slate-500">
                    Imágenes, PDFs, Excel, Word, etc. (Máx. 10 MB por archivo)
                  </span>
                </label>

                {/* Input de archivo (oculto) */}
                <input
                  type="file"
                  id="file-upload"
                  multiple
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar"
                  onChange={handleFileSelect}
                  className="hidden"
                  disabled={isUploading}
                />

                {/* Botón de selección */}
                <label
                  htmlFor="file-upload"
                  className={`flex items-center justify-center gap-2 w-full px-4 py-3 border-2 border-dashed rounded-lg cursor-pointer transition-all ${
                    isUploading
                      ? 'border-slate-200 bg-slate-50 cursor-not-allowed'
                      : 'border-slate-300 hover:border-sky-500 hover:bg-sky-50'
                  }`}
                >
                  <Upload className="w-5 h-5 text-slate-600" />
                  <span className="text-sm font-medium text-slate-700">
                    {isUploading ? 'Subiendo archivos...' : 'Seleccionar archivos'}
                  </span>
                </label>

                {/* Progress bar durante subida */}
                {isUploading && uploadProgress.total > 0 && (
                  <div className="mt-2">
                    <div className="flex justify-between text-xs text-slate-600 mb-1">
                      <span>Subiendo archivos...</span>
                      <span>{uploadProgress.current} / {uploadProgress.total}</span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-sky-600 h-full transition-all duration-300"
                        style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Lista de archivos seleccionados */}
                {selectedFiles.length > 0 && !isUploading && (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs font-semibold text-slate-700">
                      {selectedFiles.length} archivo(s) seleccionado(s):
                    </p>
                    {selectedFiles.map((file, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-2 bg-slate-50 border border-slate-200 rounded-lg"
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="text-lg">{getFileIcon(file.type)}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-slate-800 truncate">
                              {file.name}
                            </p>
                            <p className="text-xs text-slate-500">
                              {formatFileSize(file.size)}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleRemoveFile(index)}
                          className="p-1 hover:bg-red-100 rounded text-red-600 transition-colors"
                          title="Eliminar archivo"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleAddActionPlan}
                  disabled={isUploading}
                  className={`flex-1 px-4 py-2 bg-sky-600 text-white rounded-lg font-medium transition-colors ${
                    isUploading
                      ? 'opacity-50 cursor-not-allowed'
                      : 'hover:bg-sky-700'
                  }`}
                >
                  {isUploading ? 'Subiendo...' : 'Guardar Plan de Acción'}
                </button>
                <button
                  onClick={() => setShowActionModal(false)}
                  disabled={isUploading}
                  className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg font-medium hover:bg-slate-300 transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
              </div>
            </div>

            {/* Planes existentes */}
            {selectedAlert.action_plans && selectedAlert.action_plans.length > 0 && (
              <div className="p-6 bg-slate-50 border-t border-slate-200">
                <h4 className="font-bold text-sm text-slate-700 mb-3">Planes de Acción Existentes</h4>
                <div className="space-y-2">
                  {selectedAlert.action_plans.map((plan) => (
                    <div key={plan.id} className="bg-white p-3 rounded-lg border border-slate-200 text-sm">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1">
                          <p className="font-medium text-slate-800">{plan.description}</p>
                          <p className="text-xs text-slate-600 mt-1">Responsable: {plan.responsible}</p>
                          {plan.observations && (
                            <p className="text-xs text-slate-500 mt-1 italic">{plan.observations}</p>
                          )}
                        </div>
                        <span className={`text-xs px-2 py-1 rounded ${plan.status === 'completed' ? 'bg-green-100 text-green-700' :
                            plan.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                              'bg-yellow-100 text-yellow-700'
                          }`}>
                          {plan.status === 'completed' ? 'Completado' :
                            plan.status === 'in_progress' ? 'En Proceso' : 'Pendiente'}
                        </span>
                      </div>

                      {/* Archivos adjuntos */}
                      {plan.attachments && plan.attachments.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-slate-200">
                          <p className="text-xs font-semibold text-slate-700 mb-2 flex items-center gap-1">
                            <Paperclip className="w-3 h-3" />
                            {plan.attachments.length} archivo(s) adjunto(s):
                          </p>
                          <div className="space-y-1.5">
                            {plan.attachments.map((file, fileIndex) => (
                              <a
                                key={fileIndex}
                                href={file.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 p-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded transition-colors group"
                              >
                                <span className="text-base">{getFileIcon(file.type)}</span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium text-slate-800 truncate group-hover:text-sky-600">
                                    {file.name}
                                  </p>
                                  <p className="text-xs text-slate-500">
                                    {formatFileSize(file.size)} • {new Date(file.uploaded_at).toLocaleDateString('es-CO')}
                                  </p>
                                </div>
                                <DownloadIcon className="w-4 h-4 text-slate-400 group-hover:text-sky-600 flex-shrink-0" />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
