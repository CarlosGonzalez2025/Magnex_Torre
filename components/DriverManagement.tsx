import React, { useState, useEffect } from 'react';
import {
    Users,
    Plus,
    Search,
    Edit2,
    Trash2,
    X,
    Save,
    AlertCircle,
    CheckCircle,
    User,
    Phone,
    Mail,
    CreditCard,
    Truck,
    Calendar,
    Star,
    FileText,
} from 'lucide-react';
import { supabase } from '../services/supabaseClient';

// =====================================================
// TYPES
// =====================================================

export interface Driver {
    id: string;
    document_number: string;
    document_type: 'CC' | 'CE' | 'TI' | 'PAS';
    first_name: string;
    last_name: string;
    email?: string;
    phone?: string;
    license_number?: string;
    license_category?: string;
    license_expiry?: string;
    photo_url?: string;
    status: 'active' | 'inactive' | 'on_leave';
    assigned_vehicle?: string;
    hire_date?: string;
    notes?: string;
    created_at: string;
    updated_at: string;
}

interface DriverStats {
    totalAlerts: number;
    criticalAlerts: number;
    lastAlert?: string;
    inspectionsCompleted: number;
    safetyScore: number;
}

// =====================================================
// SERVICE
// =====================================================

export const driverService = {
    async getAll(): Promise<{ success: boolean; data?: Driver[]; error?: string }> {
        try {
            const { data, error } = await supabase
                .from('drivers')
                .select('*')
                .order('first_name', { ascending: true });

            if (error) throw error;
            return { success: true, data: data || [] };
        } catch (error: any) {
            console.error('Error fetching drivers:', error);
            return { success: false, error: error.message };
        }
    },

    async create(driver: Omit<Driver, 'id' | 'created_at' | 'updated_at'>): Promise<{ success: boolean; data?: Driver; error?: string }> {
        try {
            const { data, error } = await supabase
                .from('drivers')
                .insert(driver)
                .select()
                .single();

            if (error) throw error;
            return { success: true, data };
        } catch (error: any) {
            console.error('Error creating driver:', error);
            return { success: false, error: error.message };
        }
    },

    async update(id: string, updates: Partial<Driver>): Promise<{ success: boolean; error?: string }> {
        try {
            const { error } = await supabase
                .from('drivers')
                .update({ ...updates, updated_at: new Date().toISOString() })
                .eq('id', id);

            if (error) throw error;
            return { success: true };
        } catch (error: any) {
            console.error('Error updating driver:', error);
            return { success: false, error: error.message };
        }
    },

    async delete(id: string): Promise<{ success: boolean; error?: string }> {
        try {
            const { error } = await supabase.from('drivers').delete().eq('id', id);
            if (error) throw error;
            return { success: true };
        } catch (error: any) {
            console.error('Error deleting driver:', error);
            return { success: false, error: error.message };
        }
    },

    async getStats(driverId: string): Promise<{ success: boolean; data?: DriverStats; error?: string }> {
        // TODO: Implement actual stats from alert_history
        return {
            success: true,
            data: {
                totalAlerts: Math.floor(Math.random() * 20),
                criticalAlerts: Math.floor(Math.random() * 5),
                inspectionsCompleted: Math.floor(Math.random() * 30) + 10,
                safetyScore: Math.floor(Math.random() * 30) + 70,
            },
        };
    },
};

// =====================================================
// COMPONENT
// =====================================================

export const DriverManagement: React.FC = () => {
    const [drivers, setDrivers] = useState<Driver[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'on_leave'>('all');

    // Modal state
    const [showModal, setShowModal] = useState(false);
    const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
    const [formData, setFormData] = useState<Partial<Driver>>({});
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    useEffect(() => {
        loadDrivers();
    }, []);

    const loadDrivers = async () => {
        setLoading(true);
        const result = await driverService.getAll();
        if (result.success && result.data) {
            setDrivers(result.data);
        }
        setLoading(false);
    };

    const filteredDrivers = drivers.filter((driver) => {
        const matchesSearch =
            driver.first_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            driver.last_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            driver.document_number.includes(searchQuery) ||
            driver.assigned_vehicle?.toLowerCase().includes(searchQuery.toLowerCase());

        const matchesStatus = statusFilter === 'all' || driver.status === statusFilter;

        return matchesSearch && matchesStatus;
    });

    const handleOpenModal = (driver?: Driver) => {
        if (driver) {
            setEditingDriver(driver);
            setFormData(driver);
        } else {
            setEditingDriver(null);
            setFormData({
                document_type: 'CC',
                status: 'active',
            });
        }
        setError('');
        setSuccess('');
        setShowModal(true);
    };

    const handleCloseModal = () => {
        setShowModal(false);
        setEditingDriver(null);
        setFormData({});
        setError('');
        setSuccess('');
    };

    const handleSave = async () => {
        if (!formData.first_name || !formData.last_name || !formData.document_number) {
            setError('Nombre, apellido y documento son requeridos');
            return;
        }

        setSaving(true);
        setError('');

        try {
            if (editingDriver) {
                const result = await driverService.update(editingDriver.id, formData);
                if (result.success) {
                    setSuccess('Conductor actualizado exitosamente');
                    loadDrivers();
                    setTimeout(handleCloseModal, 1500);
                } else {
                    setError(result.error || 'Error al actualizar');
                }
            } else {
                const result = await driverService.create(formData as any);
                if (result.success) {
                    setSuccess('Conductor creado exitosamente');
                    loadDrivers();
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

    const handleDelete = async (driver: Driver) => {
        if (!confirm(`¿Estás seguro de eliminar a ${driver.first_name} ${driver.last_name}?`)) {
            return;
        }

        const result = await driverService.delete(driver.id);
        if (result.success) {
            loadDrivers();
        } else {
            alert('Error al eliminar: ' + result.error);
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'active':
                return (
                    <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs rounded-full">
                        Activo
                    </span>
                );
            case 'inactive':
                return (
                    <span className="px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-xs rounded-full">
                        Inactivo
                    </span>
                );
            case 'on_leave':
                return (
                    <span className="px-2 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs rounded-full">
                        En Licencia
                    </span>
                );
            default:
                return null;
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <Users className="w-7 h-7 text-blue-600" />
                        Gestión de Conductores
                    </h2>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">
                        {drivers.length} conductores registrados
                    </p>
                </div>
                <button
                    onClick={() => handleOpenModal()}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                    <Plus className="w-5 h-5" />
                    Nuevo Conductor
                </button>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Buscar por nombre, documento o placa..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent text-slate-900 dark:text-white placeholder-slate-400"
                    />
                </div>
                <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as any)}
                    className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white"
                >
                    <option value="all">Todos los estados</option>
                    <option value="active">Activos</option>
                    <option value="inactive">Inactivos</option>
                    <option value="on_leave">En Licencia</option>
                </select>
            </div>

            {/* Drivers Grid */}
            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
                </div>
            ) : filteredDrivers.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredDrivers.map((driver) => (
                        <div
                            key={driver.id}
                            className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 hover:shadow-md transition-all"
                        >
                            <div className="flex items-start justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center text-white font-bold text-lg">
                                        {driver.first_name[0]}
                                        {driver.last_name[0]}
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-slate-900 dark:text-white">
                                            {driver.first_name} {driver.last_name}
                                        </h3>
                                        <p className="text-sm text-slate-500 dark:text-slate-400">
                                            {driver.document_type} {driver.document_number}
                                        </p>
                                    </div>
                                </div>
                                {getStatusBadge(driver.status)}
                            </div>

                            <div className="space-y-2 mb-4">
                                {driver.assigned_vehicle && (
                                    <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                                        <Truck className="w-4 h-4" />
                                        <span>{driver.assigned_vehicle}</span>
                                    </div>
                                )}
                                {driver.phone && (
                                    <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                                        <Phone className="w-4 h-4" />
                                        <span>{driver.phone}</span>
                                    </div>
                                )}
                                {driver.license_category && (
                                    <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                                        <CreditCard className="w-4 h-4" />
                                        <span>Licencia {driver.license_category}</span>
                                        {driver.license_expiry && (
                                            <span className="text-xs text-slate-400">
                                                (Vence: {new Date(driver.license_expiry).toLocaleDateString()})
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-700">
                                <button
                                    onClick={() => handleOpenModal(driver)}
                                    className="p-2 text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                                    title="Editar"
                                >
                                    <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => handleDelete(driver)}
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
                    <Users className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">
                        No se encontraron conductores
                    </h3>
                    <p className="text-slate-500 dark:text-slate-400">
                        {searchQuery ? 'Intenta con otros términos de búsqueda' : 'Agrega tu primer conductor'}
                    </p>
                </div>
            )}

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
                            <h3 className="text-xl font-semibold text-slate-900 dark:text-white">
                                {editingDriver ? 'Editar Conductor' : 'Nuevo Conductor'}
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

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                        Nombre *
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.first_name || ''}
                                        onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                                        className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                        Apellido *
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.last_name || ''}
                                        onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                                        className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                        Tipo Doc.
                                    </label>
                                    <select
                                        value={formData.document_type || 'CC'}
                                        onChange={(e) => setFormData({ ...formData, document_type: e.target.value as any })}
                                        className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white"
                                    >
                                        <option value="CC">CC</option>
                                        <option value="CE">CE</option>
                                        <option value="TI">TI</option>
                                        <option value="PAS">Pasaporte</option>
                                    </select>
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                        Número Documento *
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.document_number || ''}
                                        onChange={(e) => setFormData({ ...formData, document_number: e.target.value })}
                                        className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                        Teléfono
                                    </label>
                                    <input
                                        type="tel"
                                        value={formData.phone || ''}
                                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                        className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                        Email
                                    </label>
                                    <input
                                        type="email"
                                        value={formData.email || ''}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                        Categoría Lic.
                                    </label>
                                    <select
                                        value={formData.license_category || ''}
                                        onChange={(e) => setFormData({ ...formData, license_category: e.target.value })}
                                        className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white"
                                    >
                                        <option value="">Seleccionar</option>
                                        <option value="A1">A1</option>
                                        <option value="A2">A2</option>
                                        <option value="B1">B1</option>
                                        <option value="B2">B2</option>
                                        <option value="B3">B3</option>
                                        <option value="C1">C1</option>
                                        <option value="C2">C2</option>
                                        <option value="C3">C3</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                        Nº Licencia
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.license_number || ''}
                                        onChange={(e) => setFormData({ ...formData, license_number: e.target.value })}
                                        className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                        Vencimiento
                                    </label>
                                    <input
                                        type="date"
                                        value={formData.license_expiry || ''}
                                        onChange={(e) => setFormData({ ...formData, license_expiry: e.target.value })}
                                        className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                        Vehículo Asignado
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.assigned_vehicle || ''}
                                        onChange={(e) => setFormData({ ...formData, assigned_vehicle: e.target.value })}
                                        placeholder="Ej: ABC123"
                                        className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                        Estado
                                    </label>
                                    <select
                                        value={formData.status || 'active'}
                                        onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                                        className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white"
                                    >
                                        <option value="active">Activo</option>
                                        <option value="inactive">Inactivo</option>
                                        <option value="on_leave">En Licencia</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                    Notas
                                </label>
                                <textarea
                                    value={formData.notes || ''}
                                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                    rows={3}
                                    className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white resize-none"
                                ></textarea>
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
                                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
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

export default DriverManagement;
