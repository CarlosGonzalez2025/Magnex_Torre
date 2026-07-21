import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Users, UserPlus, Search, Shield, Edit2, Check, X,
  AlertCircle, CheckCircle2, Save, Crown, Mail, Key,
  Ban, RefreshCw, Eye, EyeOff, ChevronDown, ChevronRight,
  User as UserIcon,
} from 'lucide-react';
import { useAuth, User, SUPERADMIN_EMAIL } from '../contexts/AuthContext';
import { userService } from '../services/userService';
import { supabase } from '../services/supabaseClient';

// ========================
// MODULE DEFINITIONS
// ========================

const MODULE_GROUPS = [
  {
    id: 'monitoring',
    label: 'Monitoreo',
    modules: [
      { id: 'dashboard', label: 'Dashboard' },
      { id: 'table', label: 'Tabla de Flota' },
      { id: 'map', label: 'Mapa en Vivo' },
      { id: 'fleet', label: 'Gestión de Flota' },
    ],
  },
  {
    id: 'alerts',
    label: 'Alertas',
    modules: [
      { id: 'alerts', label: 'Centro de Alertas' },
      { id: 'history', label: 'Historial' },
      { id: 'saved', label: 'Auto-Guardadas' },
      { id: 'history-analytics', label: 'Análisis de Gestión' },
      { id: 'route-investigation', label: 'Investigación de Rutas' },
      { id: 'batch-upload', label: 'Auditoría de Flota' },
    ],
  },
  {
    id: 'management',
    label: 'Gestión',
    modules: [
      { id: 'bitacora-gestion', label: 'Bitácora de Gestión' },
      { id: 'drivers', label: 'Conductores' },
      { id: 'hoja-vida', label: 'Hoja de Vida' },
      { id: 'vencimientos', label: 'Vencimientos' },
      { id: 'carnet_campo', label: 'Registro en campo (QR)' },
      { id: 'geofences', label: 'Geocercas' },
      { id: 'inspections', label: 'Inspecciones' },
      { id: 'schedules', label: 'Cronogramas' },
      { id: 'maintenance', label: 'Mantenimiento' },
    ],
  },
  {
    id: 'reports',
    label: 'Informes',
    modules: [
      { id: 'daily-reports', label: 'Informes Diarios' },
      { id: 'monthly-reports', label: 'Informes Mensuales' },
      { id: 'contract-analysis', label: 'Análisis por Contrato' },
      { id: 'telemetry-processor', label: 'Procesador Satelital' },
      { id: 'ralenti-reports', label: 'Informe de Ralentí' },
    ],
  },
] as const;

const ALL_MODULE_IDS = MODULE_GROUPS.flatMap(g => g.modules.map(m => m.id));

// ========================
// TYPES
// ========================

interface UserProfile extends User {
  isActive: boolean;
}

interface CreateFormData {
  email: string;
  name: string;
  password: string;
  role: 'admin' | 'operator' | 'viewer';
  modules: string[];
}

// ========================
// HELPERS
// ========================

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin',
  operator: 'Operador',
  viewer: 'Visitante',
};

const ROLE_BADGE: Record<string, string> = {
  admin: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  operator: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  viewer: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
};

function getInitial(name: string) {
  return name.charAt(0).toUpperCase();
}

// ========================
// MODULE TOGGLE PANEL
// ========================

interface ModulePanelProps {
  modules: string[];
  onChange: (modules: string[]) => void;
  disabled?: boolean;
}

const ModulePanel: React.FC<ModulePanelProps> = ({ modules, onChange, disabled }) => {
  const [openGroups, setOpenGroups] = useState<string[]>(MODULE_GROUPS.map(g => g.id));

  const toggle = (id: string) => {
    if (disabled) return;
    onChange(modules.includes(id) ? modules.filter(m => m !== id) : [...modules, id]);
  };

  const toggleGroup = (groupIds: string[]) => {
    if (disabled) return;
    const allOn = groupIds.every(id => modules.includes(id));
    onChange(
      allOn
        ? modules.filter(m => !groupIds.includes(m))
        : [...new Set([...modules, ...groupIds])]
    );
  };

  const toggleGroupOpen = (groupId: string) => {
    setOpenGroups(prev =>
      prev.includes(groupId) ? prev.filter(id => id !== groupId) : [...prev, groupId]
    );
  };

  return (
    <div className="space-y-1">
      {/* Global controls */}
      <div className="flex items-center justify-between px-1 pb-2">
        <span className="text-xs text-slate-500 dark:text-slate-400">{modules.length} / {ALL_MODULE_IDS.length} módulos</span>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => !disabled && onChange([...ALL_MODULE_IDS])}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-40"
            disabled={disabled}
          >
            Todos
          </button>
          <button
            type="button"
            onClick={() => !disabled && onChange([])}
            className="text-xs text-slate-500 dark:text-slate-400 hover:underline disabled:opacity-40"
            disabled={disabled}
          >
            Ninguno
          </button>
        </div>
      </div>

      {MODULE_GROUPS.map(group => {
        const groupIds = group.modules.map(m => m.id);
        const allGranted = groupIds.every(id => modules.includes(id));
        const someGranted = groupIds.some(id => modules.includes(id));
        const isOpen = openGroups.includes(group.id);

        return (
          <div key={group.id} className="rounded-lg border border-slate-100 dark:border-slate-700 overflow-hidden">
            {/* Group header */}
            <div className="flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-700/50">
              <button
                type="button"
                onClick={() => toggleGroupOpen(group.id)}
                className="flex items-center gap-2 flex-1 text-left"
              >
                {isOpen
                  ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                  : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                }
                <span className={`text-xs font-semibold ${
                  allGranted
                    ? 'text-blue-600 dark:text-blue-400'
                    : someGranted
                    ? 'text-slate-700 dark:text-slate-200'
                    : 'text-slate-500 dark:text-slate-400'
                }`}>
                  {group.label}
                </span>
              </button>
              <button
                type="button"
                onClick={() => toggleGroup(groupIds)}
                disabled={disabled}
                className="text-[10px] font-medium text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors disabled:opacity-40"
              >
                {allGranted ? 'Quitar' : 'Todos'}
              </button>
            </div>

            {/* Module toggles */}
            {isOpen && (
              <div className="grid grid-cols-2 gap-1 p-2 bg-white dark:bg-slate-800">
                {group.modules.map(mod => {
                  const on = modules.includes(mod.id);
                  return (
                    <button
                      key={mod.id}
                      type="button"
                      onClick={() => toggle(mod.id)}
                      disabled={disabled}
                      className={`flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs transition-all border disabled:opacity-40 ${
                        on
                          ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300'
                          : 'bg-slate-50 dark:bg-slate-700/60 border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-500'
                      }`}
                    >
                      <span className="truncate">{mod.label}</span>
                      <div className={`w-3.5 h-3.5 rounded flex-shrink-0 ml-1 flex items-center justify-center ${
                        on ? 'bg-blue-600 dark:bg-blue-500' : 'bg-slate-200 dark:bg-slate-600'
                      }`}>
                        {on && <Check className="w-2 h-2 text-white" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ========================
// CREATE USER MODAL
// ========================

interface CreateUserModalProps {
  onClose: () => void;
  onCreated: (user: UserProfile) => void;
  currentUserId: string;
}

const CreateUserModal: React.FC<CreateUserModalProps> = ({ onClose, onCreated, currentUserId }) => {
  const [form, setForm] = useState<CreateFormData>({
    email: '',
    name: '',
    password: '',
    role: 'operator',
    modules: [],
  });
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsModules = form.role !== 'admin';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (form.email.toLowerCase() === SUPERADMIN_EMAIL) {
      setError('Este email está reservado como superadmin del sistema.');
      return;
    }

    setLoading(true);
    try {
      const result = await userService.createUser(
        { email: form.email, full_name: form.name, role: form.role, password: form.password },
        currentUserId
      );

      if (!result.success || !result.data) {
        setError(result.error || 'Error al crear usuario');
        return;
      }

      const newUser = result.data;

      if (needsModules && form.modules.length > 0) {
        const permResult = await userService.setModulePermissions(newUser.id, form.modules, currentUserId);
        if (!permResult.success) {
          setError('Usuario creado, pero ocurrió un error al asignar los permisos de módulos: ' + permResult.error);
          return;
        }
      }

      onCreated({
        ...newUser,
        isActive: true,
        allowedModules: needsModules ? form.modules : null,
      });
    } catch (err: any) {
      setError(err.message || 'Error inesperado');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
          <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-blue-600" />
            Nuevo Usuario
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="px-6 py-4 space-y-4">
            {error && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Nombre completo</label>
              <input
                required
                type="text"
                value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder="Ej: Juan Pérez"
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                <Mail className="inline w-3.5 h-3.5 mr-1" />Correo electrónico
              </label>
              <input
                required
                type="email"
                value={form.email}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                placeholder="usuario@empresa.com"
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                <Key className="inline w-3.5 h-3.5 mr-1" />Contraseña
              </label>
              <div className="relative">
                <input
                  required
                  type={showPwd ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                  placeholder="Mínimo 8 caracteres"
                  minLength={8}
                  className="w-full px-3 py-2 pr-10 text-sm bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Rol</label>
              <div className="grid grid-cols-3 gap-2">
                {(['admin', 'operator', 'viewer'] as const).map(r => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setForm(p => ({ ...p, role: r, modules: r === 'admin' ? [] : p.modules }))}
                    className={`py-2 rounded-lg text-xs font-medium border transition-all ${
                      form.role === r
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-blue-400 dark:hover:border-blue-500'
                    }`}
                  >
                    {ROLE_LABEL[r]}
                  </button>
                ))}
              </div>
            </div>

            {needsModules ? (
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">Módulos accesibles</label>
                <ModulePanel modules={form.modules} onChange={m => setForm(p => ({ ...p, modules: m }))} />
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-xs">
                <Shield className="w-3.5 h-3.5 flex-shrink-0" />
                Los administradores tienen acceso completo a todos los módulos.
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
              Crear usuario
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ========================
// EDIT USER MODAL
// ========================

interface EditUserModalProps {
  user: UserProfile;
  onClose: () => void;
  onUpdated: (user: UserProfile) => void;
  currentUserId: string;
}

const EditUserModal: React.FC<EditUserModalProps> = ({ user, onClose, onUpdated, currentUserId }) => {
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState<'admin' | 'operator' | 'viewer'>(user.role);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await userService.updateUser(user.id, { full_name: name, role }, currentUserId);
      if (!result.success) {
        setError(result.error || 'Error al actualizar');
        return;
      }

      let allowedModules = user.allowedModules;
      if (role === 'admin') {
        await userService.setModulePermissions(user.id, [], currentUserId);
        allowedModules = null;
      } else if (user.role === 'admin' && role !== 'admin') {
        // Al pasar de admin a operador/visitante, inicializar array de módulos si era null
        allowedModules = user.allowedModules || [];
      }

      onUpdated({ ...user, name, role, allowedModules });
    } catch (err: any) {
      setError(err.message || 'Error inesperado');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Edit2 className="w-4 h-4 text-blue-600" />
            Editar Usuario
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          {error && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Nombre completo</label>
            <input
              required
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Rol</label>
            <div className="grid grid-cols-3 gap-2">
              {(['admin', 'operator', 'viewer'] as const).map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`py-2 rounded-lg text-xs font-medium border transition-all ${
                    role === r
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-blue-400'
                  }`}
                >
                  {ROLE_LABEL[r]}
                </button>
              ))}
            </div>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400">
            Email: <span className="text-slate-700 dark:text-slate-300">{user.email}</span>
            <span className="ml-2 italic">(no editable)</span>
          </p>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Guardar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ========================
// MAIN COMPONENT
// ========================

const UserManagement: React.FC = () => {
  const { user: currentUser } = useAuth();

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [pendingModules, setPendingModules] = useState<string[]>([]);
  const [modulesDirty, setModulesDirty] = useState(false);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editTarget, setEditTarget] = useState<UserProfile | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [savingModules, setSavingModules] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const showFeedback = useCallback((type: 'success' | 'error', msg: string) => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 4000);
  }, []);

  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data: profiles, error: profilesErr } = await supabase
        .from('user_profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profilesErr) throw profilesErr;

      const { data: permsRows } = await supabase
        .from('user_module_permissions')
        .select('user_id, module_id');

      const permsByUser: Record<string, string[]> = {};
      (permsRows || []).forEach((row: any) => {
        if (!permsByUser[row.user_id]) permsByUser[row.user_id] = [];
        permsByUser[row.user_id].push(row.module_id);
      });

      const mapped: UserProfile[] = (profiles || []).map((p: any) => ({
        id: p.id,
        email: p.email,
        name: p.name,
        role: p.role as User['role'],
        isActive: p.is_active !== false,
        createdAt: p.created_at,
        lastLogin: p.last_login || undefined,
        allowedModules:
          p.role === 'admin' || p.email === SUPERADMIN_EMAIL
            ? null
            : (permsByUser[p.id] ?? []),
      }));

      setUsers(mapped);
    } catch (err: any) {
      showFeedback('error', 'Error al cargar usuarios: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  }, [showFeedback]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const handleSelectUser = (u: UserProfile) => {
    setSelectedUser(u);
    setPendingModules(u.allowedModules ?? []);
    setModulesDirty(false);
  };

  const handleModuleChange = (mods: string[]) => {
    setPendingModules(mods);
    setModulesDirty(true);
  };

  const savePermissions = async () => {
    if (!selectedUser || !currentUser) return;
    setSavingModules(true);
    try {
      const result = await userService.setModulePermissions(selectedUser.id, pendingModules, currentUser.id);
      if (!result.success) throw new Error(result.error);

      setUsers(prev => prev.map(u =>
        u.id === selectedUser.id ? { ...u, allowedModules: pendingModules } : u
      ));
      setSelectedUser(prev => prev ? { ...prev, allowedModules: pendingModules } : null);
      setModulesDirty(false);
      showFeedback('success', 'Permisos de módulo actualizados');
    } catch (err: any) {
      showFeedback('error', 'Error al guardar: ' + err.message);
    } finally {
      setSavingModules(false);
    }
  };

  const handleToggleActive = async (u: UserProfile) => {
    if (u.email === SUPERADMIN_EMAIL || !currentUser) return;
    const result = u.isActive
      ? await userService.deactivateUser(u.id, currentUser.id)
      : await userService.activateUser(u.id, currentUser.id);

    if (result.success) {
      const updated = { ...u, isActive: !u.isActive };
      setUsers(prev => prev.map(p => p.id === u.id ? updated : p));
      if (selectedUser?.id === u.id) setSelectedUser(updated);
      showFeedback('success', `Usuario ${u.isActive ? 'desactivado' : 'activado'}`);
    } else {
      showFeedback('error', result.error || 'Error al cambiar estado');
    }
  };

  const filteredUsers = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return users.filter(u => {
      const matchSearch = !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
      const matchRole = roleFilter === 'all' || u.role === roleFilter;
      return matchSearch && matchRole;
    });
  }, [users, searchQuery, roleFilter]);

  const stats = useMemo(() => ({
    total: users.length,
    active: users.filter(u => u.isActive).length,
    admins: users.filter(u => u.role === 'admin').length,
  }), [users]);

  const canManage = currentUser?.email === SUPERADMIN_EMAIL || currentUser?.role === 'admin';

  if (!canManage) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Shield className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <p className="text-slate-500 dark:text-slate-400 text-sm">Sin acceso a este módulo</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-900 overflow-hidden">

      {/* ─── HEADER ─── */}
      <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600" />
              Gestión de Usuarios
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              <span className="font-medium text-slate-700 dark:text-slate-300">{stats.total}</span> usuarios ·{' '}
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">{stats.active}</span> activos ·{' '}
              <span className="text-blue-600 dark:text-blue-400 font-medium">{stats.admins}</span> admins
            </p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm shadow-blue-500/20"
          >
            <UserPlus className="w-4 h-4" />
            <span className="hidden sm:inline">Nuevo Usuario</span>
          </button>
        </div>
      </div>

      {/* ─── FEEDBACK TOAST ─── */}
      {feedback && (
        <div className={`mx-6 mt-3 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border flex-shrink-0 ${
          feedback.type === 'success'
            ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
            : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800'
        }`}>
          {feedback.type === 'success'
            ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            : <AlertCircle className="w-4 h-4 flex-shrink-0" />
          }
          {feedback.msg}
        </div>
      )}

      {/* ─── BODY ─── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ─── LEFT: USER LIST ─── */}
        <div className="w-80 xl:w-96 flex-shrink-0 flex flex-col border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
          <div className="p-3 border-b border-slate-100 dark:border-slate-700/60 space-y-2 flex-shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              />
            </div>
            <select
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            >
              <option value="all">Todos los roles</option>
              <option value="admin">Administradores</option>
              <option value="operator">Operadores</option>
              <option value="viewer">Visitantes</option>
            </select>
          </div>

          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <RefreshCw className="w-6 h-6 text-slate-300 dark:text-slate-600 animate-spin" />
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <Users className="w-10 h-10 text-slate-200 dark:text-slate-700 mb-2" />
                <p className="text-sm text-slate-400 dark:text-slate-500">
                  {searchQuery ? 'Sin resultados' : 'No hay usuarios'}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {filteredUsers.map(u => {
                  const isSelected = selectedUser?.id === u.id;
                  const isSA = u.email === SUPERADMIN_EMAIL;

                  return (
                    <li key={u.id}>
                      <button
                        onClick={() => handleSelectUser(u)}
                        className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors border-l-2 ${
                          isSelected
                            ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-500'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-700/40 border-transparent'
                        }`}
                      >
                        <div className={`relative w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                          isSA
                            ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400'
                            : u.role === 'admin'
                            ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'
                            : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                        }`}>
                          {getInitial(u.name)}
                          <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-slate-800 ${
                            u.isActive ? 'bg-emerald-500' : 'bg-red-400'
                          }`} />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-sm font-medium truncate ${
                              isSelected ? 'text-blue-700 dark:text-blue-300' : 'text-slate-900 dark:text-white'
                            }`}>
                              {u.name}
                            </span>
                            {isSA && <Crown className="w-3 h-3 text-amber-500 flex-shrink-0" />}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${ROLE_BADGE[u.role]}`}>
                              {ROLE_LABEL[u.role]}
                            </span>
                            <span className="text-xs text-slate-400 dark:text-slate-500 truncate">{u.email}</span>
                          </div>
                        </div>

                        <div className="text-right flex-shrink-0 hidden xl:block">
                          {u.allowedModules === null ? (
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 leading-tight">
                              Acceso<br />completo
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400 dark:text-slate-500">
                              {u.allowedModules.length} mód.
                            </span>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* ─── RIGHT: DETAIL PANEL ─── */}
        <div className="flex-1 overflow-y-auto">
          {!selectedUser ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-8">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-700/60 flex items-center justify-center mb-4">
                <UserIcon className="w-8 h-8 text-slate-300 dark:text-slate-500" />
              </div>
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                Selecciona un usuario para ver sus detalles
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                Podrás editar su perfil y gestionar los módulos a los que tiene acceso
              </p>
            </div>
          ) : (
            <div className="p-6 space-y-5 max-w-2xl">

              {/* User Card */}
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
                <div className="flex items-start gap-4">
                  <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-xl font-bold flex-shrink-0 ${
                    selectedUser.email === SUPERADMIN_EMAIL
                      ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400'
                      : selectedUser.role === 'admin'
                      ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                  }`}>
                    {getInitial(selectedUser.name)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-lg font-bold text-slate-900 dark:text-white">{selectedUser.name}</h2>
                      {selectedUser.email === SUPERADMIN_EMAIL && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-700">
                          <Crown className="w-3 h-3" />Superadmin
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{selectedUser.email}</p>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded ${ROLE_BADGE[selectedUser.role]}`}>
                        {ROLE_LABEL[selectedUser.role]}
                      </span>
                      <span className={`text-xs font-medium ${
                        selectedUser.isActive
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-red-500 dark:text-red-400'
                      }`}>
                        · {selectedUser.isActive ? 'Activo' : 'Inactivo'}
                      </span>
                      {selectedUser.lastLogin && (
                        <span className="text-xs text-slate-400 dark:text-slate-500">
                          · Último acceso:{' '}
                          {new Date(selectedUser.lastLogin).toLocaleDateString('es', {
                            day: '2-digit', month: 'short', year: 'numeric',
                          })}
                        </span>
                      )}
                    </div>
                  </div>

                  {selectedUser.email !== SUPERADMIN_EMAIL && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => setEditTarget(selectedUser)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5" />Editar
                      </button>
                      <button
                        onClick={() => handleToggleActive(selectedUser)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors border ${
                          selectedUser.isActive
                            ? 'border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
                            : 'border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
                        }`}
                      >
                        {selectedUser.isActive
                          ? <><Ban className="w-3.5 h-3.5" />Desactivar</>
                          : <><CheckCircle2 className="w-3.5 h-3.5" />Activar</>
                        }
                      </button>
                    </div>
                  )}
                </div>

                {selectedUser.email === SUPERADMIN_EMAIL && (
                  <p className="mt-3 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                    Esta cuenta es el superadmin del sistema. No puede ser editada ni desactivada.
                  </p>
                )}
              </div>

              {/* Module Permissions */}
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-slate-700/60">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-slate-400" />
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-white">Permisos de módulos</h3>
                  </div>
                  {modulesDirty && selectedUser.allowedModules !== null && selectedUser.email !== SUPERADMIN_EMAIL && (
                    <button
                      onClick={savePermissions}
                      disabled={savingModules}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-60"
                    >
                      {savingModules
                        ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        : <Save className="w-3.5 h-3.5" />
                      }
                      Guardar cambios
                    </button>
                  )}
                </div>

                <div className="px-5 py-4">
                  {selectedUser.email === SUPERADMIN_EMAIL || selectedUser.allowedModules === null ? (
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        selectedUser.email === SUPERADMIN_EMAIL
                          ? 'bg-amber-100 dark:bg-amber-900/30'
                          : 'bg-blue-100 dark:bg-blue-900/30'
                      }`}>
                        {selectedUser.email === SUPERADMIN_EMAIL
                          ? <Crown className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                          : <Shield className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        }
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-800 dark:text-white">Acceso total</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {selectedUser.email === SUPERADMIN_EMAIL
                            ? 'Superadmin — acceso sin restricciones a todos los módulos del sistema'
                            : 'Administrador — acceso completo a todos los módulos'
                          }
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <ModulePanel
                        modules={pendingModules}
                        onChange={handleModuleChange}
                      />
                      {modulesDirty && (
                        <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-700">
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {pendingModules.length} módulos seleccionados
                          </span>
                          <button
                            onClick={savePermissions}
                            disabled={savingModules}
                            className="flex items-center gap-2 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60"
                          >
                            {savingModules
                              ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              : <Save className="w-3.5 h-3.5" />
                            }
                            Guardar permisos
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

            </div>
          )}
        </div>
      </div>

      {/* ─── MODALS ─── */}
      {showCreateModal && (
        <CreateUserModal
          onClose={() => setShowCreateModal(false)}
          onCreated={newUser => {
            setUsers(prev => [newUser, ...prev]);
            setShowCreateModal(false);
            showFeedback('success', `Usuario "${newUser.name}" creado`);
          }}
          currentUserId={currentUser!.id}
        />
      )}

      {editTarget && (
        <EditUserModal
          user={editTarget}
          onClose={() => setEditTarget(null)}
          onUpdated={updated => {
            setUsers(prev => prev.map(u => u.id === updated.id ? updated : u));
            if (selectedUser?.id === updated.id) setSelectedUser(updated);
            setEditTarget(null);
            showFeedback('success', 'Usuario actualizado');
          }}
          currentUserId={currentUser!.id}
        />
      )}
    </div>
  );
};

export { UserManagement };
export default UserManagement;
