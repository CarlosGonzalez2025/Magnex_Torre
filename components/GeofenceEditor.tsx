import React, { useState, useEffect, useCallback } from 'react';
import {
    Map,
    Plus,
    Search,
    Edit2,
    Trash2,
    X,
    Save,
    AlertCircle,
    CheckCircle,
    MapPin,
    Circle,
    Square,
    Hexagon,
    Bell,
    BellOff,
    Clock,
    Eye,
    EyeOff,
} from 'lucide-react';
import { supabase } from '../services/supabaseClient';

// =====================================================
// TYPES
// =====================================================

export interface Geofence {
    id: string;
    name: string;
    description?: string;
    geofence_type: 'polygon' | 'circle' | 'rectangle';
    geometry: any; // GeoJSON-like structure
    center_lat?: number;
    center_lng?: number;
    radius_meters?: number;
    alert_on_entry: boolean;
    alert_on_exit: boolean;
    alert_severity: 'critical' | 'high' | 'medium' | 'low';
    time_restrictions?: {
        days: number[];
        start_time: string;
        end_time: string;
    };
    is_restricted_zone: boolean;
    contract?: string;
    applies_to_all: boolean;
    vehicle_plates?: string[];
    is_active: boolean;
    fill_color: string;
    stroke_color: string;
    fill_opacity: number;
    created_at: string;
    updated_at: string;
}

// =====================================================
// SERVICE
// =====================================================

export const geofenceService = {
    async getAll(): Promise<{ success: boolean; data?: Geofence[]; error?: string }> {
        try {
            const { data, error } = await supabase
                .from('geofences')
                .select('*')
                .order('name', { ascending: true });

            if (error) throw error;
            return { success: true, data: data || [] };
        } catch (error: any) {
            console.error('Error fetching geofences:', error);
            return { success: false, error: error.message };
        }
    },

    async create(geofence: Omit<Geofence, 'id' | 'created_at' | 'updated_at'>): Promise<{ success: boolean; data?: Geofence; error?: string }> {
        try {
            const { data, error } = await supabase
                .from('geofences')
                .insert(geofence)
                .select()
                .single();

            if (error) throw error;
            return { success: true, data };
        } catch (error: any) {
            console.error('Error creating geofence:', error);
            return { success: false, error: error.message };
        }
    },

    async update(id: string, updates: Partial<Geofence>): Promise<{ success: boolean; error?: string }> {
        try {
            const { error } = await supabase
                .from('geofences')
                .update({ ...updates, updated_at: new Date().toISOString() })
                .eq('id', id);

            if (error) throw error;
            return { success: true };
        } catch (error: any) {
            console.error('Error updating geofence:', error);
            return { success: false, error: error.message };
        }
    },

    async delete(id: string): Promise<{ success: boolean; error?: string }> {
        try {
            const { error } = await supabase.from('geofences').delete().eq('id', id);
            if (error) throw error;
            return { success: true };
        } catch (error: any) {
            console.error('Error deleting geofence:', error);
            return { success: false, error: error.message };
        }
    },

    async toggleActive(id: string, isActive: boolean): Promise<{ success: boolean; error?: string }> {
        return this.update(id, { is_active: isActive });
    },

    // Check if a point is inside a geofence
    isPointInGeofence(lat: number, lng: number, geofence: Geofence): boolean {
        if (geofence.geofence_type === 'circle') {
            const distance = this.calculateDistance(
                lat,
                lng,
                geofence.center_lat!,
                geofence.center_lng!
            );
            return distance <= (geofence.radius_meters || 0);
        }

        // For polygon, use ray casting algorithm
        if (geofence.geofence_type === 'polygon' && Array.isArray(geofence.geometry)) {
            return this.isPointInPolygon(lat, lng, geofence.geometry);
        }

        return false;
    },

    calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
        const R = 6371000; // Earth's radius in meters
        const dLat = ((lat2 - lat1) * Math.PI) / 180;
        const dLng = ((lng2 - lng1) * Math.PI) / 180;
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos((lat1 * Math.PI) / 180) *
            Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dLng / 2) *
            Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    },

    isPointInPolygon(lat: number, lng: number, polygon: { lat: number; lng: number }[]): boolean {
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i].lat,
                yi = polygon[i].lng;
            const xj = polygon[j].lat,
                yj = polygon[j].lng;

            if (yi > lng !== yj > lng && lat < ((xj - xi) * (lng - yi)) / (yj - yi) + xi) {
                inside = !inside;
            }
        }
        return inside;
    },
};

// =====================================================
// COMPONENT
// =====================================================

export const GeofenceEditor: React.FC = () => {
    const [geofences, setGeofences] = useState<Geofence[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [showActiveOnly, setShowActiveOnly] = useState(false);

    // Modal state
    const [showModal, setShowModal] = useState(false);
    const [editingGeofence, setEditingGeofence] = useState<Geofence | null>(null);
    const [formData, setFormData] = useState<Partial<Geofence>>({});
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    useEffect(() => {
        loadGeofences();
    }, []);

    const loadGeofences = async () => {
        setLoading(true);
        const result = await geofenceService.getAll();
        if (result.success && result.data) {
            setGeofences(result.data);
        }
        setLoading(false);
    };

    const filteredGeofences = geofences.filter((geofence) => {
        const matchesSearch =
            geofence.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            geofence.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            geofence.contract?.toLowerCase().includes(searchQuery.toLowerCase());

        const matchesActive = !showActiveOnly || geofence.is_active;

        return matchesSearch && matchesActive;
    });

    const handleOpenModal = (geofence?: Geofence) => {
        if (geofence) {
            setEditingGeofence(geofence);
            setFormData(geofence);
        } else {
            setEditingGeofence(null);
            setFormData({
                geofence_type: 'circle',
                alert_on_entry: true,
                alert_on_exit: true,
                alert_severity: 'medium',
                is_restricted_zone: false,
                applies_to_all: true,
                is_active: true,
                fill_color: '#3B82F6',
                stroke_color: '#1D4ED8',
                fill_opacity: 0.2,
                center_lat: 4.711,
                center_lng: -74.0721,
                radius_meters: 500,
                geometry: { center: { lat: 4.711, lng: -74.0721 }, radius: 500 },
            });
        }
        setError('');
        setSuccess('');
        setShowModal(true);
    };

    const handleCloseModal = () => {
        setShowModal(false);
        setEditingGeofence(null);
        setFormData({});
        setError('');
        setSuccess('');
    };

    const handleSave = async () => {
        if (!formData.name) {
            setError('El nombre es requerido');
            return;
        }

        setSaving(true);
        setError('');

        try {
            if (editingGeofence) {
                const result = await geofenceService.update(editingGeofence.id, formData);
                if (result.success) {
                    setSuccess('Geocerca actualizada exitosamente');
                    loadGeofences();
                    setTimeout(handleCloseModal, 1500);
                } else {
                    setError(result.error || 'Error al actualizar');
                }
            } else {
                const result = await geofenceService.create(formData as any);
                if (result.success) {
                    setSuccess('Geocerca creada exitosamente');
                    loadGeofences();
                    setTimeout(handleCloseModal, 1500);
                } else {
                    setError(result.error || 'Error al crear');
                }
            }
        } catch (err: any) {
            setError(err.message || 'Error inesperado');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (geofence: Geofence) => {
        if (!confirm(`¿Estás seguro de eliminar la geocerca "${geofence.name}"?`)) {
            return;
        }

        const result = await geofenceService.delete(geofence.id);
        if (result.success) {
            loadGeofences();
        } else {
            alert('Error al eliminar: ' + result.error);
        }
    };

    const handleToggleActive = async (geofence: Geofence) => {
        const result = await geofenceService.toggleActive(geofence.id, !geofence.is_active);
        if (result.success) {
            loadGeofences();
        }
    };

    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'circle':
                return <Circle className="w-4 h-4" />;
            case 'rectangle':
                return <Square className="w-4 h-4" />;
            case 'polygon':
                return <Hexagon className="w-4 h-4" />;
            default:
                return <MapPin className="w-4 h-4" />;
        }
    };

    const getSeverityBadge = (severity: string) => {
        const colors = {
            critical: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
            high: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400',
            medium: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
            low: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
        };

        const labels = { critical: 'Crítica', high: 'Alta', medium: 'Media', low: 'Baja' };

        return (
            <span className={`px-2 py-0.5 rounded-full text-xs ${colors[severity as keyof typeof colors]}`}>
                {labels[severity as keyof typeof labels]}
            </span>
        );
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <Map className="w-7 h-7 text-green-600" />
                        Geocercas
                    </h2>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">
                        {geofences.filter((g) => g.is_active).length} geocercas activas de {geofences.length} total
                    </p>
                </div>
                <button
                    onClick={() => handleOpenModal()}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                >
                    <Plus className="w-5 h-5" />
                    Nueva Geocerca
                </button>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Buscar por nombre, descripción o contrato..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-green-500 dark:focus:ring-green-400 focus:border-transparent text-slate-900 dark:text-white placeholder-slate-400"
                    />
                </div>
                <label className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer">
                    <input
                        type="checkbox"
                        checked={showActiveOnly}
                        onChange={(e) => setShowActiveOnly(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-green-600 focus:ring-green-500"
                    />
                    <span className="text-sm text-slate-700 dark:text-slate-300">Solo activas</span>
                </label>
            </div>

            {/* Info Banner */}
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
                <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                    <div>
                        <h4 className="font-medium text-blue-900 dark:text-blue-300">
                            Próximamente: Editor Visual de Geocercas
                        </h4>
                        <p className="text-sm text-blue-700 dark:text-blue-400 mt-1">
                            Estamos trabajando en una herramienta visual para dibujar geocercas directamente en el mapa.
                            Por ahora, puedes crear geocercas circulares especificando coordenadas y radio.
                        </p>
                    </div>
                </div>
            </div>

            {/* Geofences Grid */}
            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-600"></div>
                </div>
            ) : filteredGeofences.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredGeofences.map((geofence) => (
                        <div
                            key={geofence.id}
                            className={`bg-white dark:bg-slate-800 rounded-xl border ${geofence.is_active
                                    ? 'border-slate-200 dark:border-slate-700'
                                    : 'border-slate-200 dark:border-slate-700 opacity-60'
                                } p-5 hover:shadow-md transition-all`}
                        >
                            <div className="flex items-start justify-between mb-3">
                                <div className="flex items-center gap-3">
                                    <div
                                        className="w-10 h-10 rounded-lg flex items-center justify-center"
                                        style={{ backgroundColor: geofence.fill_color + '30' }}
                                    >
                                        <div style={{ color: geofence.stroke_color }}>{getTypeIcon(geofence.geofence_type)}</div>
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-slate-900 dark:text-white">{geofence.name}</h3>
                                        <p className="text-xs text-slate-500 dark:text-slate-400 capitalize">
                                            {geofence.geofence_type === 'circle' && geofence.radius_meters
                                                ? `Radio: ${geofence.radius_meters}m`
                                                : geofence.geofence_type}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleToggleActive(geofence)}
                                    className={`p-2 rounded-lg transition-colors ${geofence.is_active
                                            ? 'text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20'
                                            : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                                        }`}
                                    title={geofence.is_active ? 'Desactivar' : 'Activar'}
                                >
                                    {geofence.is_active ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
                                </button>
                            </div>

                            {geofence.description && (
                                <p className="text-sm text-slate-600 dark:text-slate-400 mb-3 line-clamp-2">
                                    {geofence.description}
                                </p>
                            )}

                            <div className="flex flex-wrap items-center gap-2 mb-4">
                                {getSeverityBadge(geofence.alert_severity)}
                                {geofence.alert_on_entry && (
                                    <span className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                                        <Bell className="w-3 h-3" /> Entrada
                                    </span>
                                )}
                                {geofence.alert_on_exit && (
                                    <span className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                                        <BellOff className="w-3 h-3" /> Salida
                                    </span>
                                )}
                                {geofence.is_restricted_zone && (
                                    <span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-xs rounded-full">
                                        Zona Restringida
                                    </span>
                                )}
                            </div>

                            {geofence.contract && (
                                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                                    Contrato: {geofence.contract}
                                </p>
                            )}

                            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-700">
                                <button
                                    onClick={() => handleOpenModal(geofence)}
                                    className="p-2 text-slate-600 dark:text-slate-400 hover:text-green-600 dark:hover:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors"
                                    title="Editar"
                                >
                                    <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => handleDelete(geofence)}
                                    className="p-2 text-slate-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                    title="Eliminar"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="text-center py-12 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                    <Map className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">
                        No se encontraron geocercas
                    </h3>
                    <p className="text-slate-500 dark:text-slate-400">
                        {searchQuery ? 'Intenta con otros términos de búsqueda' : 'Crea tu primera geocerca'}
                    </p>
                </div>
            )}

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
                            <h3 className="text-xl font-semibold text-slate-900 dark:text-white">
                                {editingGeofence ? 'Editar Geocerca' : 'Nueva Geocerca'}
                            </h3>
                            <button
                                onClick={handleCloseModal}
                                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            {error && (
                                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2 text-red-700 dark:text-red-400">
                                    <AlertCircle className="w-5 h-5" />
                                    <span className="text-sm">{error}</span>
                                </div>
                            )}

                            {success && (
                                <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg flex items-center gap-2 text-green-700 dark:text-green-400">
                                    <CheckCircle className="w-5 h-5" />
                                    <span className="text-sm">{success}</span>
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                    Nombre *
                                </label>
                                <input
                                    type="text"
                                    value={formData.name || ''}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="Ej: Zona Centro de Distribución"
                                    className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-green-500 text-slate-900 dark:text-white"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                    Descripción
                                </label>
                                <textarea
                                    value={formData.description || ''}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    rows={2}
                                    className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-green-500 text-slate-900 dark:text-white resize-none"
                                ></textarea>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                        Latitud Centro
                                    </label>
                                    <input
                                        type="number"
                                        step="any"
                                        value={formData.center_lat || ''}
                                        onChange={(e) => setFormData({ ...formData, center_lat: parseFloat(e.target.value) })}
                                        className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-green-500 text-slate-900 dark:text-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                        Longitud Centro
                                    </label>
                                    <input
                                        type="number"
                                        step="any"
                                        value={formData.center_lng || ''}
                                        onChange={(e) => setFormData({ ...formData, center_lng: parseFloat(e.target.value) })}
                                        className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-green-500 text-slate-900 dark:text-white"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                        Radio (metros)
                                    </label>
                                    <input
                                        type="number"
                                        value={formData.radius_meters || ''}
                                        onChange={(e) => setFormData({ ...formData, radius_meters: parseFloat(e.target.value) })}
                                        className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-green-500 text-slate-900 dark:text-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                        Severidad Alerta
                                    </label>
                                    <select
                                        value={formData.alert_severity || 'medium'}
                                        onChange={(e) => setFormData({ ...formData, alert_severity: e.target.value as any })}
                                        className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-green-500 text-slate-900 dark:text-white"
                                    >
                                        <option value="low">Baja</option>
                                        <option value="medium">Media</option>
                                        <option value="high">Alta</option>
                                        <option value="critical">Crítica</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                    Contrato
                                </label>
                                <input
                                    type="text"
                                    value={formData.contract || ''}
                                    onChange={(e) => setFormData({ ...formData, contract: e.target.value })}
                                    placeholder="Ej: ENEL ZX"
                                    className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-green-500 text-slate-900 dark:text-white"
                                />
                            </div>

                            <div className="space-y-3">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={formData.alert_on_entry ?? true}
                                        onChange={(e) => setFormData({ ...formData, alert_on_entry: e.target.checked })}
                                        className="w-4 h-4 rounded border-slate-300 text-green-600 focus:ring-green-500"
                                    />
                                    <span className="text-sm text-slate-700 dark:text-slate-300">Alertar al entrar</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={formData.alert_on_exit ?? true}
                                        onChange={(e) => setFormData({ ...formData, alert_on_exit: e.target.checked })}
                                        className="w-4 h-4 rounded border-slate-300 text-green-600 focus:ring-green-500"
                                    />
                                    <span className="text-sm text-slate-700 dark:text-slate-300">Alertar al salir</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={formData.is_restricted_zone ?? false}
                                        onChange={(e) => setFormData({ ...formData, is_restricted_zone: e.target.checked })}
                                        className="w-4 h-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
                                    />
                                    <span className="text-sm text-slate-700 dark:text-slate-300">Zona restringida (prohibida)</span>
                                </label>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                        Color Relleno
                                    </label>
                                    <input
                                        type="color"
                                        value={formData.fill_color || '#3B82F6'}
                                        onChange={(e) => setFormData({ ...formData, fill_color: e.target.value })}
                                        className="w-full h-10 rounded-lg cursor-pointer"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                        Color Borde
                                    </label>
                                    <input
                                        type="color"
                                        value={formData.stroke_color || '#1D4ED8'}
                                        onChange={(e) => setFormData({ ...formData, stroke_color: e.target.value })}
                                        className="w-full h-10 rounded-lg cursor-pointer"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-200 dark:border-slate-700">
                            <button
                                onClick={handleCloseModal}
                                className="px-4 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50"
                            >
                                {saving ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                        Guardando...
                                    </>
                                ) : (
                                    <>
                                        <Save className="w-4 h-4" />
                                        Guardar
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default GeofenceEditor;
