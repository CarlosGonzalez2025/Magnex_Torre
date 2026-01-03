import React, { useState, useEffect } from 'react';
import { useAuth, User as AuthUser } from '../contexts/AuthContext';
import { userService } from '../services/userService';

type UserRole = 'admin' | 'operator' | 'viewer';

// Extend User type for management purposes
interface User extends AuthUser {
  full_name: string; // Alias for name
  is_active: boolean; // Derived from Supabase
  last_login?: string; // Alias for lastLogin
}

export const UserManagement: React.FC = () => {
  const { user: currentUser } = useAuth();

  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  // Form states
  const [formData, setFormData] = useState({
    email: '',
    full_name: '',
    role: 'viewer' as UserRole,
    password: '',
    confirmPassword: ''
  });
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  // Cargar usuarios al montar
  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setIsLoading(true);
      setError('');

      const result = await userService.getAllUsers();

      if (result.success && result.data) {
        // Map AuthUser to User with extended properties
        const extendedUsers: User[] = result.data.map(u => ({
          ...u,
          full_name: u.name,
          is_active: true, // Supabase users are active by default
          last_login: u.lastLogin
        }));
        setUsers(extendedUsers);
      } else {
        setError(result.error || 'Error al cargar usuarios');
      }
    } catch (err: any) {
      setError(err.message || 'Error inesperado');
    } finally {
      setIsLoading(false);
    }
  };

  // Crear usuario
  const handleCreateUser = async () => {
    try {
      setFormError('');

      // Validaciones
      if (!formData.email || !formData.full_name || !formData.password) {
        setFormError('Todos los campos son requeridos');
        return;
      }

      if (formData.password !== formData.confirmPassword) {
        setFormError('Las contraseñas no coinciden');
        return;
      }

      if (formData.password.length < 8) {
        setFormError('La contraseña debe tener al menos 8 caracteres');
        return;
      }

      setFormLoading(true);

      const result = await userService.createUser(
        {
          email: formData.email,
          full_name: formData.full_name,
          role: formData.role,
          password: formData.password
        },
        currentUser!.id
      );

      if (result.success) {
        setShowCreateModal(false);
        resetForm();
        await loadUsers();
      } else {
        setFormError(result.error || 'Error al crear usuario');
      }
    } catch (err: any) {
      setFormError(err.message || 'Error inesperado');
    } finally {
      setFormLoading(false);
    }
  };

  // Editar usuario
  const handleEditUser = async () => {
    if (!selectedUser) return;

    try {
      setFormError('');
      setFormLoading(true);

      const result = await userService.updateUser(
        selectedUser.id,
        {
          email: formData.email,
          full_name: formData.full_name,
          role: formData.role,
        },
        currentUser!.id
      );

      if (result.success) {
        setShowEditModal(false);
        setSelectedUser(null);
        resetForm();
        await loadUsers();
      } else {
        setFormError(result.error || 'Error al actualizar usuario');
      }
    } catch (err: any) {
      setFormError(err.message || 'Error inesperado');
    } finally {
      setFormLoading(false);
    }
  };

  // Resetear contraseña
  const handleResetPassword = async () => {
    if (!selectedUser) return;

    try {
      setFormError('');

      if (formData.password !== formData.confirmPassword) {
        setFormError('Las contraseñas no coinciden');
        return;
      }

      if (formData.password.length < 8) {
        setFormError('La contraseña debe tener al menos 8 caracteres');
        return;
      }

      setFormLoading(true);

      const result = await userService.resetPassword(
        selectedUser.id,
        formData.password,
        currentUser!.id
      );

      if (result.success) {
        setShowResetPasswordModal(false);
        setSelectedUser(null);
        resetForm();
      } else {
        setFormError(result.error || 'Error al resetear contraseña');
      }
    } catch (err: any) {
      setFormError(err.message || 'Error inesperado');
    } finally {
      setFormLoading(false);
    }
  };

  // Activar/Desactivar usuario
  const handleToggleUserStatus = async (user: User) => {
    try {
      const result = user.is_active
        ? await userService.deactivateUser(user.id, currentUser!.id)
        : await userService.activateUser(user.id, currentUser!.id);

      if (result.success) {
        await loadUsers();
      } else {
        alert(result.error || 'Error al cambiar estado del usuario');
      }
    } catch (err: any) {
      alert(err.message || 'Error inesperado');
    }
  };

  // Abrir modal de edición
  const openEditModal = (user: User) => {
    setSelectedUser(user);
    setFormData({
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      password: '',
      confirmPassword: ''
    });
    setShowEditModal(true);
  };

  // Abrir modal de resetear contraseña
  const openResetPasswordModal = (user: User) => {
    setSelectedUser(user);
    setFormData({
      email: '',
      full_name: '',
      role: 'viewer',
      password: '',
      confirmPassword: ''
    });
    setShowResetPasswordModal(true);
  };

  // Resetear formulario
  const resetForm = () => {
    setFormData({
      email: '',
      full_name: '',
      role: 'viewer',
      password: '',
      confirmPassword: ''
    });
    setFormError('');
  };

  // Filtrar usuarios por búsqueda
  const filteredUsers = users.filter(user =>
    user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.role.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Si no es admin, no mostrar nada
  if (currentUser?.role !== 'admin') {
    return (
      <div className="p-8 text-center">
        <p className="text-red-500">No tienes permisos para acceder a esta página</p>
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-white mb-2">
          Gestión de Usuarios
        </h1>
        <p className="text-gray-400">
          Administra usuarios y roles del sistema
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        {/* Búsqueda */}
        <input
          type="text"
          placeholder="Buscar por email, nombre o rol..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        {/* Botón crear usuario */}
        <button
          onClick={() => {
            resetForm();
            setShowCreateModal(true);
          }}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition whitespace-nowrap"
        >
          + Crear Usuario
        </button>
      </div>

      {/* Error general */}
      {error && (
        <div className="mb-6 bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 rounded-lg">
          <p>{error}</p>
        </div>
      )}

      {/* Loading */}
      {isLoading ? (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
      ) : (
        /* Tabla de usuarios */
        <div className="bg-gray-800 rounded-lg shadow-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-700">
              <thead className="bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Nombre
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Rol
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Último Login
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-gray-400">
                      No se encontraron usuarios
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-700/50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                        {user.email}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                        {user.full_name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-1 text-xs font-semibold rounded ${
                            user.role === 'admin'
                              ? 'bg-purple-600 text-white'
                              : user.role === 'operator'
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-600 text-white'
                          }`}
                        >
                          {user.role === 'admin' ? 'ADMIN' : user.role === 'operator' ? 'OPERADOR' : 'VISOR'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-1 text-xs font-semibold rounded ${
                            user.is_active
                              ? 'bg-green-600 text-white'
                              : 'bg-gray-600 text-white'
                          }`}
                        >
                          {user.is_active ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                        {user.last_login
                          ? new Date(user.last_login).toLocaleString('es-CO')
                          : 'Nunca'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                        <button
                          onClick={() => openEditModal(user)}
                          className="text-blue-400 hover:text-blue-300"
                          title="Editar"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => openResetPasswordModal(user)}
                          className="text-yellow-400 hover:text-yellow-300"
                          title="Resetear contraseña"
                        >
                          🔑
                        </button>
                        <button
                          onClick={() => handleToggleUserStatus(user)}
                          className={
                            user.is_active
                              ? 'text-red-400 hover:text-red-300'
                              : 'text-green-400 hover:text-green-300'
                          }
                          title={user.is_active ? 'Desactivar' : 'Activar'}
                        >
                          {user.is_active ? '🚫' : '✅'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Crear Usuario */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
            <h2 className="text-2xl font-bold text-white mb-4">Crear Nuevo Usuario</h2>

            <div className="space-y-4">
              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="usuario@magnex.com"
                />
              </div>

              {/* Nombre */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Nombre Completo
                </label>
                <input
                  type="text"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Juan Pérez"
                />
              </div>

              {/* Rol */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Rol
                </label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="viewer">Visor (Solo lectura)</option>
                  <option value="operator">Operador (Puede editar)</option>
                  <option value="admin">Administrador (Control total)</option>
                </select>
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Contraseña
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Mínimo 8 caracteres"
                />
              </div>

              {/* Confirmar Password */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Confirmar Contraseña
                </label>
                <input
                  type="password"
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Repetir contraseña"
                />
              </div>

              {/* Error */}
              {formError && (
                <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 rounded-lg">
                  <p className="text-sm">{formError}</p>
                </div>
              )}

              {/* Botones */}
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    resetForm();
                  }}
                  className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition"
                  disabled={formLoading}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCreateUser}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded-lg transition"
                  disabled={formLoading}
                >
                  {formLoading ? 'Creando...' : 'Crear Usuario'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Editar Usuario */}
      {showEditModal && selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
            <h2 className="text-2xl font-bold text-white mb-4">Editar Usuario</h2>

            <div className="space-y-4">
              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Nombre */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Nombre Completo
                </label>
                <input
                  type="text"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Rol */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Rol
                </label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="viewer">Visor (Solo lectura)</option>
                  <option value="operator">Operador (Puede editar)</option>
                  <option value="admin">Administrador (Control total)</option>
                </select>
              </div>

              {/* Error */}
              {formError && (
                <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 rounded-lg">
                  <p className="text-sm">{formError}</p>
                </div>
              )}

              {/* Botones */}
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => {
                    setShowEditModal(false);
                    setSelectedUser(null);
                    resetForm();
                  }}
                  className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition"
                  disabled={formLoading}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleEditUser}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded-lg transition"
                  disabled={formLoading}
                >
                  {formLoading ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Resetear Contraseña */}
      {showResetPasswordModal && selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
            <h2 className="text-2xl font-bold text-white mb-4">
              Resetear Contraseña
            </h2>

            <p className="text-gray-300 mb-4">
              Usuario: <span className="font-semibold">{selectedUser.full_name}</span>
            </p>

            <div className="space-y-4">
              {/* Nueva Password */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Nueva Contraseña
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Mínimo 8 caracteres"
                />
              </div>

              {/* Confirmar Password */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Confirmar Contraseña
                </label>
                <input
                  type="password"
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Repetir contraseña"
                />
              </div>

              {/* Error */}
              {formError && (
                <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 rounded-lg">
                  <p className="text-sm">{formError}</p>
                </div>
              )}

              {/* Botones */}
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => {
                    setShowResetPasswordModal(false);
                    setSelectedUser(null);
                    resetForm();
                  }}
                  className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition"
                  disabled={formLoading}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleResetPassword}
                  className="flex-1 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 text-white rounded-lg transition"
                  disabled={formLoading}
                >
                  {formLoading ? 'Reseteando...' : 'Resetear Contraseña'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
