import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  BookOpen,
  Plus,
  Upload,
  Download,
  Search,
  Filter,
  RefreshCw,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  FileText,
  Trash2,
  Edit2,
  X,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  Calendar,
  Layers,
  Paperclip,
  Image as ImageIcon,
  ExternalLink,
  BarChart3,
  PieChart as PieChartIcon,
  TrendingUp,
  FileCheck,
  Building2,
  Truck,
  Eye,
  Award,
  Zap,
} from 'lucide-react';
import { bitacoraService, BitacoraEntry, VehicleContractInfo, ParseResult } from '../services/bitacoraService';
import { useAuth } from '../contexts/AuthContext';

// ==================== CONSTANTES Y PLATAFORMAS ====================
const PLATAFORMAS = ['FAGOR', 'GEOTAB', 'COLTRACK', 'OTRA'];
const TIPOS_NOVEDAD = [
  'Exceso de velocidad',
  'Ralentí prolongado',
  'Desconexión GPS / Pérdida de señal',
  'Frenada brusca / Aceleración',
  'Salida de geocerca no autorizada',
  'Conducción fuera de horario',
  'Falta de inspección preoperacional',
  'Otra novedad',
];

export const BitacoraGestion: React.FC = () => {
  const { user } = useAuth();

  // Pestaña Interna de Bitácora ('registros' | 'analisis')
  const [internalTab, setInternalTab] = useState<'registros' | 'analisis'>('registros');

  // Estados principales de registros
  const [entries, setEntries] = useState<BitacoraEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Datos dinámicos de Vehículos y Contratos desde Google Sheets
  const [vehicleMap, setVehicleMap] = useState<Record<string, VehicleContractInfo>>({});
  const [availablePlates, setAvailablePlates] = useState<string[]>([]);
  const [availableContracts, setAvailableContracts] = useState<string[]>([]);

  const [customPlate, setCustomPlate] = useState('');
  const [customContract, setCustomContract] = useState('');
  const [autoAssignedContract, setAutoAssignedContract] = useState<string | null>(null);

  // Filtros de búsqueda
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlataforma, setSelectedPlataforma] = useState('ALL');
  const [selectedTipoNovedad, setSelectedTipoNovedad] = useState('ALL');
  const [selectedContratoFilter, setSelectedContratoFilter] = useState('ALL');
  const [selectedEsAlerta, setSelectedEsAlerta] = useState('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

  // Modales
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<BitacoraEntry | null>(null);

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [parsing, setParsing] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Modal Vista Previa de Evidencia
  const [previewEvidence, setPreviewEvidence] = useState<{ url: string; name: string } | null>(null);

  // Formulario Individual
  const [formData, setFormData] = useState({
    fecha: new Date().toISOString().substring(0, 10),
    hora_alerta: '',
    hora_aviso_supervisor: '',
    tipo_novedad: 'Exceso de velocidad',
    placa: '',
    contrato: '',
    plataforma: 'FAGOR',
    conductor: '',
    gestion_realizada: '',
    cierre_alerta: '',
    es_alerta: true,
    observacion: '',
    evidencia_url: '',
    evidencia_nombre: '',
  });

  const [uploadingEvidence, setUploadingEvidence] = useState(false);

  const showNotification = useCallback((type: 'success' | 'error', msg: string) => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 4000);
  }, []);

  // Cargar registros
  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const res = await bitacoraService.getAll();
      if (res.success && res.data) {
        setEntries(res.data);
      } else {
        showNotification('error', res.error || 'Error al cargar la bitácora');
      }
    } catch (err: any) {
      showNotification('error', err.message || 'Error inesperado');
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  // Cargar mapa completo de vehículos y contratos de Google Sheets
  const loadVehicleAndContractData = useCallback(async () => {
    try {
      const data = await bitacoraService.getVehicleMapAndContracts();
      setVehicleMap(data.vehicleMap);
      setAvailablePlates(data.platesList);
      setAvailableContracts(data.contractsList);
    } catch (e) {
      console.warn('[BitacoraGestion] Error loading vehicle data:', e);
    }
  }, []);

  useEffect(() => {
    loadEntries();
    loadVehicleAndContractData();
  }, [loadEntries, loadVehicleAndContractData]);

  // Filtrado de datos
  const filteredEntries = useMemo(() => {
    return entries.filter(e => {
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        (e.placa && e.placa.toLowerCase().includes(q)) ||
        (e.conductor && e.conductor.toLowerCase().includes(q)) ||
        (e.tipo_novedad && e.tipo_novedad.toLowerCase().includes(q)) ||
        (e.contrato && e.contrato.toLowerCase().includes(q)) ||
        (e.gestion_realizada && e.gestion_realizada.toLowerCase().includes(q)) ||
        (e.observacion && e.observacion.toLowerCase().includes(q));

      const matchPlataforma = selectedPlataforma === 'ALL' || e.plataforma === selectedPlataforma;
      const matchTipo = selectedTipoNovedad === 'ALL' || e.tipo_novedad === selectedTipoNovedad;
      const matchContrato = selectedContratoFilter === 'ALL' || e.contrato === selectedContratoFilter;
      const matchEsAlerta =
        selectedEsAlerta === 'ALL' ||
        (selectedEsAlerta === 'SI' && e.es_alerta) ||
        (selectedEsAlerta === 'NO' && !e.es_alerta);

      const matchDateStart = !startDate || e.fecha >= startDate;
      const matchDateEnd = !endDate || e.fecha <= endDate;

      return matchSearch && matchPlataforma && matchTipo && matchContrato && matchEsAlerta && matchDateStart && matchDateEnd;
    });
  }, [entries, searchQuery, selectedPlataforma, selectedTipoNovedad, selectedContratoFilter, selectedEsAlerta, startDate, endDate]);

  // Paginación
  const totalPages = Math.ceil(filteredEntries.length / itemsPerPage) || 1;
  const paginatedEntries = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredEntries.slice(start, start + itemsPerPage);
  }, [filteredEntries, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedPlataforma, selectedTipoNovedad, selectedContratoFilter, selectedEsAlerta, startDate, endDate]);

  // Métricas KPI Generales
  const stats = useMemo(() => {
    const total = entries.length;
    const alertasReales = entries.filter(e => e.es_alerta).length;
    const sinAlerta = total - alertasReales;
    const cerradas = entries.filter(e => e.cierre_alerta && e.cierre_alerta.trim() !== '').length;
    const pctCierre = total > 0 ? Math.round((cerradas / total) * 100) : 0;
    const conEvidencia = entries.filter(e => e.evidencia_url).length;

    return { total, alertasReales, sinAlerta, cerradas, pctCierre, conEvidencia };
  }, [entries]);

  // 📊 Datos para el Submódulo de Análisis
  const analyticsData = useMemo(() => {
    const contractCounts: Record<string, { total: number; alertasReales: number; sinAlerta: number }> = {};
    const platformCounts: Record<string, number> = {};
    const typeCounts: Record<string, number> = {};
    const plateCounts: Record<string, number> = {};

    filteredEntries.forEach(e => {
      const cName = e.contrato || 'SIN CONTRATO';
      if (!contractCounts[cName]) {
        contractCounts[cName] = { total: 0, alertasReales: 0, sinAlerta: 0 };
      }
      contractCounts[cName].total++;
      if (e.es_alerta) contractCounts[cName].alertasReales++;
      else contractCounts[cName].sinAlerta++;

      const pName = e.plataforma || 'OTRA';
      platformCounts[pName] = (platformCounts[pName] || 0) + 1;

      const tName = e.tipo_novedad || 'Sin especificar';
      typeCounts[tName] = (typeCounts[tName] || 0) + 1;

      if (e.placa && e.placa.trim() !== '') {
        const pl = e.placa.toUpperCase().trim();
        plateCounts[pl] = (plateCounts[pl] || 0) + 1;
      }
    });

    const topPlates = Object.entries(plateCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const topContracts = Object.entries(contractCounts)
      .sort((a, b) => b[1].total - a[1].total);

    return { contractCounts: topContracts, platformCounts, typeCounts, topPlates };
  }, [filteredEntries]);

  // 🎯 Manejador de cambio de Placa: Auto-asigna el Contrato correspondiente de Google Sheets
  const handlePlateSelect = (selectedPlate: string) => {
    if (selectedPlate === '__CUSTOM__') {
      setCustomPlate('');
      setAutoAssignedContract(null);
      setFormData(p => ({ ...p, placa: '' }));
      return;
    }

    setCustomPlate('');
    const matched = vehicleMap[selectedPlate];

    if (matched && matched.contrato) {
      setAutoAssignedContract(matched.contrato);
      setFormData(p => ({
        ...p,
        placa: selectedPlate,
        contrato: matched.contrato,
        plataforma: matched.plataforma || p.plataforma,
      }));
    } else {
      setAutoAssignedContract(null);
      setFormData(p => ({
        ...p,
        placa: selectedPlate,
      }));
    }
  };

  // Handlers CRUD Form
  const handleOpenCreateModal = () => {
    setEditingEntry(null);
    setCustomPlate('');
    setCustomContract('');
    setAutoAssignedContract(null);

    const defaultPlateOption = availablePlates.length > 0 ? availablePlates[0] : '';
    const initialMatched = defaultPlateOption ? vehicleMap[defaultPlateOption] : null;
    const initialContract = initialMatched?.contrato || (availableContracts[0] || 'ENEL ZV');

    if (initialMatched?.contrato) {
      setAutoAssignedContract(initialMatched.contrato);
    }

    setFormData({
      fecha: new Date().toISOString().substring(0, 10),
      hora_alerta: '',
      hora_aviso_supervisor: '',
      tipo_novedad: 'Exceso de velocidad',
      placa: defaultPlateOption,
      contrato: initialContract,
      plataforma: initialMatched?.plataforma || 'FAGOR',
      conductor: '',
      gestion_realizada: '',
      cierre_alerta: '',
      es_alerta: true,
      observacion: '',
      evidencia_url: '',
      evidencia_nombre: '',
    });
    setShowFormModal(true);
  };

  const handleOpenEditModal = (entry: BitacoraEntry) => {
    setEditingEntry(entry);
    const isKnownPlate = availablePlates.includes(entry.placa || '');
    if (!isKnownPlate && entry.placa) {
      setCustomPlate(entry.placa);
    } else {
      setCustomPlate('');
    }

    const isKnownContract = availableContracts.includes(entry.contrato || '');
    if (!isKnownContract && entry.contrato) {
      setCustomContract(entry.contrato);
    } else {
      setCustomContract('');
    }

    const matched = entry.placa ? vehicleMap[entry.placa] : null;
    if (matched?.contrato) {
      setAutoAssignedContract(matched.contrato);
    } else {
      setAutoAssignedContract(null);
    }

    setFormData({
      fecha: entry.fecha || new Date().toISOString().substring(0, 10),
      hora_alerta: entry.hora_alerta || '',
      hora_aviso_supervisor: entry.hora_aviso_supervisor || '',
      tipo_novedad: entry.tipo_novedad || 'Exceso de velocidad',
      placa: entry.placa || '',
      contrato: entry.contrato || (availableContracts[0] || 'ENEL ZV'),
      plataforma: entry.plataforma || 'FAGOR',
      conductor: entry.conductor || '',
      gestion_realizada: entry.gestion_realizada || '',
      cierre_alerta: entry.cierre_alerta || '',
      es_alerta: entry.es_alerta,
      observacion: entry.observacion || '',
      evidencia_url: entry.evidencia_url || '',
      evidencia_nombre: entry.evidencia_nombre || '',
    });
    setShowFormModal(true);
  };

  const handleEvidenceFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingEvidence(true);
    try {
      const res = await bitacoraService.uploadEvidenceFile(file);
      if (res.success && res.url) {
        setFormData(p => ({
          ...p,
          evidencia_url: res.url!,
          evidencia_nombre: res.name || file.name,
        }));
        showNotification('success', 'Evidencia adjuntada correctamente');
      } else {
        showNotification('error', res.error || 'Error al cargar evidencia');
      }
    } catch (err: any) {
      showNotification('error', err.message || 'Error al adjuntar archivo');
    } finally {
      setUploadingEvidence(false);
    }
  };

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.tipo_novedad) {
      showNotification('error', 'El tipo de novedad es obligatorio');
      return;
    }

    const finalPlate = formData.placa === '__CUSTOM__' || !formData.placa ? customPlate.toUpperCase().trim() : formData.placa;
    const finalContract = formData.contrato === '__CUSTOM__' ? customContract.toUpperCase().trim() : formData.contrato;

    const payload = {
      ...formData,
      placa: finalPlate,
      contrato: finalContract,
    };

    try {
      if (editingEntry) {
        const res = await bitacoraService.update(editingEntry.id, payload);
        if (res.success) {
          showNotification('success', 'Registro actualizado correctamente');
        } else {
          showNotification('error', res.error || 'Error al actualizar');
        }
      } else {
        const res = await bitacoraService.create(payload, user?.id);
        if (res.success) {
          showNotification('success', 'Novedad registrada exitosamente');
        } else {
          showNotification('error', res.error || 'Error al guardar');
        }
      }
      setShowFormModal(false);
      loadEntries();
      loadVehicleAndContractData();
    } catch (err: any) {
      showNotification('error', err.message || 'Error inesperado');
    }
  };

  const handleDeleteEntry = async (id: string) => {
    if (!window.confirm('¿Está seguro de eliminar este registro de la bitácora?')) return;
    try {
      const res = await bitacoraService.delete(id);
      if (res.success) {
        showNotification('success', 'Registro eliminado correctamente');
        loadEntries();
      } else {
        showNotification('error', res.error || 'Error al eliminar');
      }
    } catch (err: any) {
      showNotification('error', err.message || 'Error al eliminar');
    }
  };

  // Handlers Carga Masiva
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadFile(file);
    setParsing(true);
    setParseResult(null);

    try {
      const res = await bitacoraService.parseExcelFile(file);
      setParseResult(res);
    } catch (err: any) {
      showNotification('error', err.message || 'Error al leer el archivo Excel');
    } finally {
      setParsing(false);
    }
  };

  const handleConfirmUpload = async () => {
    if (!parseResult || parseResult.validRows.length === 0) return;

    setUploading(true);
    try {
      const res = await bitacoraService.bulkInsert(parseResult.validRows, user?.id);
      if (res.success) {
        showNotification('success', `Carga masiva completada: ${res.count} registros insertados.`);
        setShowUploadModal(false);
        setUploadFile(null);
        setParseResult(null);
        loadEntries();
        loadVehicleAndContractData();
      } else {
        showNotification('error', res.error || 'Error al insertar datos masivos');
      }
    } catch (err: any) {
      showNotification('error', err.message || 'Error en carga masiva');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-900 overflow-hidden">

      {/* ─── HEADER BAR ─── */}
      <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-6 py-4 flex-shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                Bitácora de Gestión
              </h1>
              {/* Tab Switcher Interno */}
              <div className="flex items-center bg-slate-100 dark:bg-slate-700/60 p-1 rounded-lg ml-4">
                <button
                  onClick={() => setInternalTab('registros')}
                  className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                    internalTab === 'registros'
                      ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" /> Registros Bitácora
                </button>
                <button
                  onClick={() => setInternalTab('analisis')}
                  className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                    internalTab === 'analisis'
                      ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <BarChart3 className="w-3.5 h-3.5" /> Análisis de Datos
                </button>
              </div>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Control operativo de novedades, asignación automática de contratos desde Google Sheets y registro de evidencias
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => bitacoraService.generateExcelTemplate()}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              title="Descargar plantilla preformateada en Excel"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              Descargar Plantilla
            </button>

            <button
              onClick={() => bitacoraService.exportToExcel(filteredEntries)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              title="Exportar listado actual a Excel"
            >
              <Download className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              Exportar
            </button>

            <button
              onClick={() => setShowUploadModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium transition-colors shadow-sm"
            >
              <Upload className="w-3.5 h-3.5" />
              Carga Masiva Excel
            </button>

            <button
              onClick={handleOpenCreateModal}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium transition-colors shadow-sm shadow-blue-500/20"
            >
              <Plus className="w-4 h-4" />
              Nueva Novedad
            </button>
          </div>
        </div>
      </div>

      {/* ─── TOAST FEEDBACK ─── */}
      {feedback && (
        <div className={`mx-6 mt-3 flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium border flex-shrink-0 ${
          feedback.type === 'success'
            ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
            : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800'
        }`}>
          {feedback.type === 'success'
            ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            : <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          }
          {feedback.msg}
        </div>
      )}

      {/* ─── CONTENIDO TAB 1: REGISTROS BITÁCORA ─── */}
      {internalTab === 'registros' && (
        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* ─── KPI CARDS ─── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Total */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                <Layers className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Total Novedades</p>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mt-0.5">{stats.total}</h3>
                <p className="text-[10px] text-slate-400 dark:text-slate-500">Registros en bitácora</p>
              </div>
            </div>

            {/* Card 2: Alertas Reales */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
                <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Alertas Reales</p>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mt-0.5">{stats.alertasReales}</h3>
                <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                  {stats.total > 0 ? Math.round((stats.alertasReales / stats.total) * 100) : 0}% del total
                </p>
              </div>
            </div>

            {/* Card 3: Con Evidencias */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-purple-50 dark:bg-purple-900/30 flex items-center justify-center flex-shrink-0">
                <Paperclip className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Con Evidencias</p>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mt-0.5">{stats.conEvidencia}</h3>
                <p className="text-[10px] text-purple-600 dark:text-purple-400 font-medium">Archivos / Fotos adjuntos</p>
              </div>
            </div>

            {/* Card 4: % Cierre */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0">
                <Clock className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Con Cierre Registrado</p>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mt-0.5">{stats.cerradas}</h3>
                <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">{stats.pctCierre}% de efectividad</p>
              </div>
            </div>
          </div>

          {/* ─── CONTROLES DE FILTRADO ─── */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-800 dark:text-white flex items-center gap-1.5 uppercase tracking-wider">
                <Filter className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                Filtros de Búsqueda
              </h3>
              {(searchQuery || selectedPlataforma !== 'ALL' || selectedTipoNovedad !== 'ALL' || selectedContratoFilter !== 'ALL' || selectedEsAlerta !== 'ALL' || startDate || endDate) && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedPlataforma('ALL');
                    setSelectedTipoNovedad('ALL');
                    setSelectedContratoFilter('ALL');
                    setSelectedEsAlerta('ALL');
                    setStartDate('');
                    setEndDate('');
                  }}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium"
                >
                  Limpiar filtros
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
              {/* Buscador */}
              <div className="lg:col-span-2 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar placa, conductor, contrato, observación..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
              </div>

              {/* Filtro Contrato */}
              <div>
                <select
                  value={selectedContratoFilter}
                  onChange={e => setSelectedContratoFilter(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                >
                  <option value="ALL">Todos los Contratos</option>
                  {availableContracts.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              {/* Plataforma */}
              <div>
                <select
                  value={selectedPlataforma}
                  onChange={e => setSelectedPlataforma(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                >
                  <option value="ALL">Todas las Plataformas</option>
                  {PLATAFORMAS.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>

              {/* ¿Es Alerta Real? */}
              <div>
                <select
                  value={selectedEsAlerta}
                  onChange={e => setSelectedEsAlerta(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                >
                  <option value="ALL">Tipo de Evento (Todos)</option>
                  <option value="SI">Solo Alertas Reales (SI)</option>
                  <option value="NO">No Alertas / Grúa (NO)</option>
                </select>
              </div>

              {/* Rango de Fechas */}
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="w-full px-2 py-2 text-xs bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none"
                  title="Fecha inicio"
                />
                <span className="text-slate-400 text-xs">-</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="w-full px-2 py-2 text-xs bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none"
                  title="Fecha fin"
                />
              </div>
            </div>
          </div>

          {/* ─── TABLA DE DATOS ─── */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-semibold uppercase tracking-wider">
                    <th className="py-3 px-4">Fecha</th>
                    <th className="py-3 px-3">Hora Alerta</th>
                    <th className="py-3 px-3">Aviso Sup.</th>
                    <th className="py-3 px-4">Tipo Novedad</th>
                    <th className="py-3 px-3">Placa</th>
                    <th className="py-3 px-4">Contrato</th>
                    <th className="py-3 px-3">Plataforma</th>
                    <th className="py-3 px-4">Conductor</th>
                    <th className="py-3 px-4">Gestión Realizada</th>
                    <th className="py-3 px-3 text-center">¿Alerta Real?</th>
                    <th className="py-3 px-3 text-center">Evidencia</th>
                    <th className="py-3 px-4">Observaciones / Cierre</th>
                    <th className="py-3 px-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                  {loading ? (
                    <tr>
                      <td colSpan={13} className="py-12 text-center text-slate-400">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
                        Cargando registros de la bitácora...
                      </td>
                    </tr>
                  ) : paginatedEntries.length === 0 ? (
                    <tr>
                      <td colSpan={13} className="py-12 text-center text-slate-400">
                        <BookOpen className="w-10 h-10 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                        <p className="font-medium text-slate-600 dark:text-slate-300">No se encontraron registros</p>
                        <p className="text-[11px] text-slate-400 mt-1">Ajusta los filtros o realiza una carga masiva desde Excel</p>
                      </td>
                    </tr>
                  ) : (
                    paginatedEntries.map(entry => (
                      <tr key={entry.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-700/30 transition-colors">
                        <td className="py-3 px-4 font-medium text-slate-900 dark:text-white whitespace-nowrap">
                          {entry.fecha}
                        </td>
                        <td className="py-3 px-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                          {entry.hora_alerta || '-'}
                        </td>
                        <td className="py-3 px-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                          {entry.hora_aviso_supervisor || '-'}
                        </td>
                        <td className="py-3 px-4 text-slate-800 dark:text-slate-200 font-medium">
                          {entry.tipo_novedad}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          {entry.placa ? (
                            <span className="font-mono font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-600">
                              {entry.placa}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">-</span>
                          )}
                        </td>
                        <td className="py-3 px-4 max-w-[160px] truncate" title={entry.contrato}>
                          <span className="font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded border border-blue-100 dark:border-blue-800/40">
                            {entry.contrato || 'SIN CONTRATO'}
                          </span>
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                            entry.plataforma === 'FAGOR'
                              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                              : entry.plataforma === 'GEOTAB'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                              : entry.plataforma === 'COLTRACK'
                              ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
                              : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                          }`}>
                            {entry.plataforma || 'OTRA'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-300 max-w-[140px] truncate" title={entry.conductor}>
                          {entry.conductor || 'Sin asignar'}
                        </td>
                        <td className="py-3 px-4 text-slate-700 dark:text-slate-300 max-w-[180px] truncate" title={entry.gestion_realizada}>
                          {entry.gestion_realizada || '-'}
                        </td>
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          {entry.es_alerta ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                              <AlertTriangle className="w-3 h-3" /> SI
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                              NO
                            </span>
                          )}
                        </td>

                        {/* Evidencia Adjunta */}
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          {entry.evidencia_url ? (
                            <button
                              onClick={() => setPreviewEvidence({ url: entry.evidencia_url!, name: entry.evidencia_nombre || 'Evidencia' })}
                              className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 border border-purple-200 dark:border-purple-800 hover:bg-purple-100 transition-colors"
                            >
                              <Paperclip className="w-3 h-3" /> Ver Adjunto
                            </button>
                          ) : (
                            <span className="text-slate-400 text-[10px] italic">Sin evidencia</span>
                          )}
                        </td>

                        <td className="py-3 px-4 max-w-[200px]">
                          <div className="text-slate-600 dark:text-slate-300 line-clamp-2" title={entry.observacion || entry.cierre_alerta}>
                            {entry.observacion || entry.cierre_alerta || '-'}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleOpenEditModal(entry)}
                              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                              title="Editar registro"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteEntry(entry.id)}
                              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                              title="Eliminar registro"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Paginador */}
            <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-slate-800/60">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Mostrando {filteredEntries.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0} -{' '}
                {Math.min(currentPage * itemsPerPage, filteredEntries.length)} de {filteredEntries.length} novedades
              </span>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-40 hover:bg-white dark:hover:bg-slate-700 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 px-2">
                  Página {currentPage} de {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-40 hover:bg-white dark:hover:bg-slate-700 transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

        </div>
      )}

      {/* ─── CONTENIDO TAB 2: SUBMÓDULO DE ANÁLISIS DE DATOS ─── */}
      {internalTab === 'analisis' && (
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Banner resumen */}
          <div className="bg-gradient-to-r from-slate-900 to-blue-900 text-white rounded-2xl p-6 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <span className="text-xs font-bold text-blue-300 uppercase tracking-widest flex items-center gap-1.5 mb-1">
                <BarChart3 className="w-4 h-4" /> Submódulo de Inteligencia Operativa
              </span>
              <h2 className="text-xl font-bold">Análisis de Novedades y Avisos de Bitácora</h2>
              <p className="text-xs text-slate-300 mt-1 max-w-2xl">
                Distribución analítica por contratos de Google Sheets, análisis por proveedor GPS y efectividad de respuesta del supervisor.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="bg-white/10 backdrop-blur-md px-4 py-3 rounded-xl text-center">
                <p className="text-[10px] text-blue-200 uppercase font-semibold">Tasa de Cierre</p>
                <p className="text-2xl font-black text-emerald-400 mt-0.5">{stats.pctCierre}%</p>
              </div>
              <div className="bg-white/10 backdrop-blur-md px-4 py-3 rounded-xl text-center">
                <p className="text-[10px] text-blue-200 uppercase font-semibold">Alertas Reales</p>
                <p className="text-2xl font-black text-amber-400 mt-0.5">{stats.alertasReales}</p>
              </div>
            </div>
          </div>

          {/* Gráficos / Grillas Analíticas */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* 1. Novedades por Contrato / Proyecto */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 space-y-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-blue-600" />
                  Novedades por Contrato / Proyecto
                </h3>
                <span className="text-xs text-slate-400">{analyticsData.contractCounts.length} proyectos</span>
              </div>

              <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
                {analyticsData.contractCounts.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-6">Sin datos de contratos</p>
                ) : (
                  analyticsData.contractCounts.map(([contract, data]) => {
                    const pct = Math.round((data.total / (stats.total || 1)) * 100);
                    return (
                      <div key={contract} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-800 dark:text-slate-200">{contract}</span>
                          <span className="text-slate-500 font-mono">
                            <strong>{data.total}</strong> novedades ({pct}%)
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 dark:bg-slate-700 h-2.5 rounded-full overflow-hidden flex">
                          <div
                            style={{ width: `${(data.alertasReales / data.total) * pct}%` }}
                            className="bg-amber-500 h-full"
                            title={`Alertas Reales: ${data.alertasReales}`}
                          />
                          <div
                            style={{ width: `${(data.sinAlerta / data.total) * pct}%` }}
                            className="bg-blue-500 h-full"
                            title={`Sin Alerta / Grúa: ${data.sinAlerta}`}
                          />
                        </div>
                        <div className="flex justify-between text-[10px] text-slate-400">
                          <span>Alertas Reales: {data.alertasReales}</span>
                          <span>No Alertas / Grúa: {data.sinAlerta}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* 2. Novedades por Plataforma GPS */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 space-y-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <PieChartIcon className="w-4 h-4 text-emerald-600" />
                  Distribución por Plataforma GPS
                </h3>
                <span className="text-xs text-slate-400">FAGOR vs GEOTAB vs COLTRACK</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {Object.entries(analyticsData.platformCounts).map(([platform, count]) => {
                  const pct = Math.round((count / (stats.total || 1)) * 100);
                  return (
                    <div key={platform} className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl border border-slate-100 dark:border-slate-700">
                      <div className="flex items-center justify-between">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          platform === 'FAGOR'
                            ? 'bg-blue-100 text-blue-700'
                            : platform === 'GEOTAB'
                            ? 'bg-emerald-100 text-emerald-700'
                            : platform === 'COLTRACK'
                            ? 'bg-purple-100 text-purple-700'
                            : 'bg-slate-200 text-slate-700'
                        }`}>
                          {platform}
                        </span>
                        <span className="text-xs font-bold text-slate-900 dark:text-white">{pct}%</span>
                      </div>
                      <h4 className="text-xl font-bold text-slate-900 dark:text-white mt-2">{count}</h4>
                      <p className="text-[10px] text-slate-400 mt-0.5">novedades notificadas</p>
                    </div>
                  );
                })}
              </div>

              {/* 3. Top Placas con Más Novedades */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-700">
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-3 flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5 text-purple-600" />
                  Top Placas con Mayor Recurrencia
                </h4>
                <div className="flex flex-wrap gap-2">
                  {analyticsData.topPlates.map(([plate, count], idx) => (
                    <div key={plate} className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 dark:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600 text-xs">
                      <span className="font-mono font-bold text-slate-900 dark:text-white">#{idx + 1} {plate}</span>
                      <span className="bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 text-[10px] font-bold px-1.5 py-0.5 rounded">
                        {count} novs
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>

        </div>
      )}

      {/* ─── MODAL DE CREACIÓN / EDICIÓN INDIVIDUAL ─── */}
      {showFormModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-600" />
                {editingEntry ? 'Editar Novedad en Bitácora' : 'Registrar Nueva Novedad'}
              </h2>
              <button
                onClick={() => setShowFormModal(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveForm} className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Fecha</label>
                  <input
                    required
                    type="date"
                    value={formData.fecha}
                    onChange={e => setFormData(p => ({ ...p, fecha: e.target.value }))}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none"
                  />
                </div>

                {/* 🎯 PLACA VEHÍCULO: DESPLEGABLE DESDE GOOGLE SHEETS */}
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
                    <span>Placa Vehículo</span>
                    <span className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold">Google Sheets</span>
                  </label>
                  <select
                    value={formData.placa}
                    onChange={e => handlePlateSelect(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  >
                    <option value="">-- Seleccionar Placa --</option>
                    {availablePlates.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                    <option value="__CUSTOM__">+ Escribir otra placa...</option>
                  </select>

                  {formData.placa === '__CUSTOM__' && (
                    <input
                      type="text"
                      placeholder="Ej: BFG57H"
                      value={customPlate}
                      onChange={e => {
                        const val = e.target.value.toUpperCase();
                        setCustomPlate(val);
                        handlePlateSelect(val);
                      }}
                      className="w-full mt-2 px-3 py-1.5 text-xs bg-white dark:bg-slate-800 border border-blue-400 rounded-lg font-mono font-bold text-slate-900 dark:text-white focus:outline-none"
                    />
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Hora Alerta</label>
                  <input
                    type="text"
                    placeholder="Ej: 09:00"
                    value={formData.hora_alerta}
                    onChange={e => setFormData(p => ({ ...p, hora_alerta: e.target.value }))}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Hora Aviso Supervisor</label>
                  <input
                    type="text"
                    placeholder="Ej: 09:05"
                    value={formData.hora_aviso_supervisor}
                    onChange={e => setFormData(p => ({ ...p, hora_aviso_supervisor: e.target.value }))}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Tipo de Novedad</label>
                  <select
                    value={formData.tipo_novedad}
                    onChange={e => setFormData(p => ({ ...p, tipo_novedad: e.target.value }))}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none"
                  >
                    {TIPOS_NOVEDAD.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Plataforma</label>
                  <select
                    value={formData.plataforma}
                    onChange={e => setFormData(p => ({ ...p, plataforma: e.target.value }))}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none"
                  >
                    {PLATAFORMAS.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 🎯 CONTRATO AUTO-COMPLETADO DESDE LA PLACA O DESPLEGABLE */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
                    <span>Contrato / Proyecto</span>
                    {autoAssignedContract && (
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                        <Zap className="w-3 h-3 text-emerald-500 fill-emerald-500" /> Auto-completado
                      </span>
                    )}
                  </label>
                  <select
                    value={formData.contrato}
                    onChange={e => {
                      setAutoAssignedContract(null);
                      setFormData(p => ({ ...p, contrato: e.target.value }));
                    }}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  >
                    {availableContracts.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                    <option value="__CUSTOM__">+ Otro contrato no listado...</option>
                  </select>

                  {formData.contrato === '__CUSTOM__' && (
                    <input
                      type="text"
                      placeholder="Escribe el nombre del contrato..."
                      value={customContract}
                      onChange={e => setCustomContract(e.target.value)}
                      className="w-full mt-2 px-3 py-1.5 text-xs bg-white dark:bg-slate-800 border border-blue-400 rounded-lg text-slate-900 dark:text-white focus:outline-none"
                    />
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Conductor</label>
                  <input
                    type="text"
                    placeholder="Ej: Nombre conductor o Sin asignar"
                    value={formData.conductor}
                    onChange={e => setFormData(p => ({ ...p, conductor: e.target.value }))}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Gestión Realizada</label>
                <input
                  type="text"
                  placeholder="Ej: Se informa mediante whatsapp, Se envió correo..."
                  value={formData.gestion_realizada}
                  onChange={e => setFormData(p => ({ ...p, gestion_realizada: e.target.value }))}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none"
                />
              </div>

              {/* 📎 CARGA DE EVIDENCIA ADJUNTA */}
              <div className="p-3 bg-purple-50/60 dark:bg-purple-900/20 rounded-xl border border-purple-200 dark:border-purple-800/50 space-y-2">
                <label className="block text-xs font-bold text-purple-900 dark:text-purple-200 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Paperclip className="w-3.5 h-3.5 text-purple-600" />
                    Cargar Evidencia (Imagen / PDF / Archivo)
                  </span>
                  {uploadingEvidence && <span className="text-[10px] text-purple-600 animate-pulse">Adjuntando...</span>}
                </label>

                {formData.evidencia_url ? (
                  <div className="flex items-center justify-between p-2 bg-white dark:bg-slate-800 rounded-lg border border-purple-200 dark:border-purple-700 text-xs">
                    <span className="truncate max-w-[280px] font-medium text-purple-700 dark:text-purple-300">
                      📎 {formData.evidencia_nombre || 'Evidencia adjunta'}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPreviewEvidence({ url: formData.evidencia_url, name: formData.evidencia_nombre || 'Evidencia' })}
                        className="text-purple-600 hover:underline font-semibold text-[11px]"
                      >
                        Ver
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormData(p => ({ ...p, evidencia_url: '', evidencia_nombre: '' }))}
                        className="text-red-500 hover:text-red-700 text-[11px]"
                      >
                        Quitar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <input
                      type="file"
                      id="evidence-file-input"
                      accept="image/*,.pdf,.doc,.docx"
                      onChange={handleEvidenceFileChange}
                      className="hidden"
                    />
                    <label
                      htmlFor="evidence-file-input"
                      className="flex items-center justify-center gap-2 p-2.5 border-2 border-dashed border-purple-300 dark:border-purple-700 rounded-lg cursor-pointer hover:bg-purple-100/50 dark:hover:bg-purple-900/30 transition-colors text-xs text-purple-700 dark:text-purple-300 font-medium"
                    >
                      <ImageIcon className="w-4 h-4 text-purple-600" />
                      Haz clic para seleccionar o capturar evidencia
                    </label>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl border border-slate-200 dark:border-slate-600">
                <input
                  id="es_alerta_check"
                  type="checkbox"
                  checked={formData.es_alerta}
                  onChange={e => setFormData(p => ({ ...p, es_alerta: e.target.checked }))}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <label htmlFor="es_alerta_check" className="text-xs text-slate-800 dark:text-slate-200 cursor-pointer">
                  <span className="font-bold">¿Fue una alerta real?</span>
                  <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                    Marca esta opción si fue una infracción real o desmarca si fue justificable / grúa.
                  </span>
                </label>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Observación / Cierre</label>
                <textarea
                  rows={3}
                  placeholder="Detalles del cierre de la alerta, respuestas del supervisor o copias de correos..."
                  value={formData.observacion}
                  onChange={e => setFormData(p => ({ ...p, observacion: e.target.value }))}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setShowFormModal(false)}
                  className="px-4 py-2 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors shadow-sm"
                >
                  {editingEntry ? 'Guardar Cambios' : 'Registrar Novedad'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL DE CARGA MASIVA EXCEL ─── */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Upload className="w-4 h-4 text-emerald-600" />
                Carga Masiva de Bitácora (Excel / CSV)
              </h2>
              <button
                onClick={() => {
                  setShowUploadModal(false);
                  setUploadFile(null);
                  setParseResult(null);
                }}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Descarga de Plantilla */}
              <div className="flex items-center justify-between p-3.5 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl">
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="w-6 h-6 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-emerald-900 dark:text-emerald-200">¿No tienes el formato?</p>
                    <p className="text-[11px] text-emerald-700 dark:text-emerald-300">Descarga la plantilla preformateada oficial para llenar tus datos rápidamente.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => bitacoraService.generateExcelTemplate()}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-lg transition-colors shadow-sm flex-shrink-0"
                >
                  <Download className="w-3.5 h-3.5" /> Descargar
                </button>
              </div>

              {/* Selector de Archivo */}
              <div className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl p-6 text-center hover:border-emerald-500 transition-colors bg-slate-50/50 dark:bg-slate-900/40">
                <input
                  type="file"
                  id="excel-file-input"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <label htmlFor="excel-file-input" className="cursor-pointer flex flex-col items-center">
                  <FileSpreadsheet className="w-10 h-10 text-slate-400 mb-2" />
                  <span className="text-xs font-bold text-slate-800 dark:text-white">
                    {uploadFile ? uploadFile.name : 'Haz clic para seleccionar el archivo Excel (.xlsx / .csv)'}
                  </span>
                  <span className="text-[11px] text-slate-400 mt-1">Soporta los encabezados oficiales de la bitácora de gestión</span>
                </label>
              </div>

              {/* Spinner de Lectura */}
              {parsing && (
                <div className="py-6 text-center text-xs text-slate-500">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-emerald-600" />
                  Leyendo y analizando las filas del archivo Excel...
                </div>
              )}

              {/* Resultado de Validación */}
              {parseResult && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800 dark:text-white">Resultado del Análisis:</span>
                    <span className="text-slate-500">
                      Total procesado: <strong className="text-slate-900 dark:text-white">{parseResult.totalRows}</strong> filas
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl">
                      <p className="text-[11px] text-emerald-700 dark:text-emerald-300 font-medium">Filas Válidas para Importar</p>
                      <h4 className="text-lg font-bold text-emerald-800 dark:text-emerald-200 mt-0.5">{parseResult.validRows.length}</h4>
                    </div>

                    <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
                      <p className="text-[11px] text-red-700 dark:text-red-300 font-medium">Filas Omitidas / Inválidas</p>
                      <h4 className="text-lg font-bold text-red-800 dark:text-red-200 mt-0.5">{parseResult.invalidRows.length}</h4>
                    </div>
                  </div>

                  {/* Previsualización de Filas Válidas */}
                  {parseResult.validRows.length > 0 && (
                    <div>
                      <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">Vista previa de datos a importar (primeras 5 filas):</h4>
                      <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-x-auto">
                        <table className="w-full text-left text-[11px]">
                          <thead className="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
                            <tr>
                              <th className="p-2">Fecha</th>
                              <th className="p-2">Placa</th>
                              <th className="p-2">Novedad</th>
                              <th className="p-2">Contrato</th>
                              <th className="p-2">Plataforma</th>
                              <th className="p-2">Alerta Real</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                            {parseResult.validRows.slice(0, 5).map((row, idx) => (
                              <tr key={idx}>
                                <td className="p-2 font-mono">{row.fecha}</td>
                                <td className="p-2 font-bold font-mono">{row.placa || '-'}</td>
                                <td className="p-2">{row.tipo_novedad}</td>
                                <td className="p-2">{row.contrato}</td>
                                <td className="p-2">{row.plataforma}</td>
                                <td className="p-2 font-bold">{row.es_alerta ? 'SI' : 'NO'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50">
              <button
                type="button"
                onClick={() => {
                  setShowUploadModal(false);
                  setUploadFile(null);
                  setParseResult(null);
                }}
                className="px-4 py-2 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmUpload}
                disabled={!parseResult || parseResult.validRows.length === 0 || uploading}
                className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-50 shadow-sm"
              >
                {uploading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Confirmar e Importar {parseResult?.validRows.length || 0} Registros
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL VISUALIZADOR DE EVIDENCIA ADJUNTA ─── */}
      {previewEvidence && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Paperclip className="w-4 h-4 text-purple-600" />
                Evidencia Adjunta: {previewEvidence.name}
              </h3>
              <button
                onClick={() => setPreviewEvidence(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 flex-1 overflow-y-auto flex flex-col items-center justify-center bg-slate-100 dark:bg-slate-900/60">
              {previewEvidence.url.startsWith('data:image') || previewEvidence.url.match(/\.(jpg|jpeg|png|webp|gif)/i) ? (
                <img
                  src={previewEvidence.url}
                  alt={previewEvidence.name}
                  className="max-h-[60vh] max-w-full rounded-xl object-contain shadow-lg"
                />
              ) : (
                <div className="text-center py-8 space-y-4">
                  <FileText className="w-16 h-16 text-purple-500 mx-auto" />
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Documento de evidencia adjunto ({previewEvidence.name})</p>
                  <a
                    href={previewEvidence.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-lg transition-colors shadow-sm"
                  >
                    <ExternalLink className="w-4 h-4" /> Abrir / Descargar Documento
                  </a>
                </div>
              )}
            </div>

            <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-700 flex justify-end">
              <button
                onClick={() => setPreviewEvidence(null)}
                className="px-4 py-1.5 bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-medium rounded-lg hover:bg-slate-300 transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default BitacoraGestion;
