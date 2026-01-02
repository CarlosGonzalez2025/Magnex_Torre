import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { UserRole, Permission } from '../types';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: UserRole;
  requiredPermission?: Permission;
  requiredPermissions?: Permission[];
}

/**
 * Componente para proteger rutas que requieren autenticación
 *
 * @example
 * // Proteger una ruta solo para usuarios autenticados
 * <ProtectedRoute>
 *   <Dashboard />
 * </ProtectedRoute>
 *
 * @example
 * // Proteger una ruta solo para admins
 * <ProtectedRoute requiredRole={UserRole.ADMIN}>
 *   <UserManagement />
 * </ProtectedRoute>
 *
 * @example
 * // Proteger una ruta que requiere un permiso específico
 * <ProtectedRoute requiredPermission={Permission.USER_CREATE}>
 *   <CreateUser />
 * </ProtectedRoute>
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requiredRole,
  requiredPermission,
  requiredPermissions,
}) => {
  const { user, isAuthenticated, isLoading, checkPermission, checkPermissions } = useAuth();

  // Mostrar loading mientras verifica sesión
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Verificando sesión...</p>
        </div>
      </div>
    );
  }

  // Si no está autenticado, redirigir a login
  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  // Verificar rol requerido
  if (requiredRole && user.role !== requiredRole) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-gray-800 rounded-lg shadow-xl p-8 max-w-md w-full text-center">
          <div className="text-6xl mb-4">🚫</div>
          <h1 className="text-2xl font-bold text-white mb-2">
            Acceso Denegado
          </h1>
          <p className="text-gray-400 mb-6">
            No tienes permisos para acceder a esta página.
          </p>
          <p className="text-sm text-gray-500 mb-6">
            Se requiere rol: <span className="font-semibold text-blue-400">{requiredRole}</span>
            <br />
            Tu rol actual: <span className="font-semibold text-yellow-400">{user.role}</span>
          </p>
          <button
            onClick={() => window.history.back()}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition"
          >
            Volver
          </button>
        </div>
      </div>
    );
  }

  // Verificar permiso individual requerido
  if (requiredPermission && !checkPermission(requiredPermission)) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-gray-800 rounded-lg shadow-xl p-8 max-w-md w-full text-center">
          <div className="text-6xl mb-4">🚫</div>
          <h1 className="text-2xl font-bold text-white mb-2">
            Acceso Denegado
          </h1>
          <p className="text-gray-400 mb-6">
            No tienes el permiso necesario para acceder a esta página.
          </p>
          <p className="text-sm text-gray-500 mb-6">
            Permiso requerido: <span className="font-semibold text-blue-400">{requiredPermission}</span>
          </p>
          <button
            onClick={() => window.history.back()}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition"
          >
            Volver
          </button>
        </div>
      </div>
    );
  }

  // Verificar múltiples permisos requeridos
  if (requiredPermissions && !checkPermissions(requiredPermissions)) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-gray-800 rounded-lg shadow-xl p-8 max-w-md w-full text-center">
          <div className="text-6xl mb-4">🚫</div>
          <h1 className="text-2xl font-bold text-white mb-2">
            Acceso Denegado
          </h1>
          <p className="text-gray-400 mb-6">
            No tienes todos los permisos necesarios para acceder a esta página.
          </p>
          <button
            onClick={() => window.history.back()}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition"
          >
            Volver
          </button>
        </div>
      </div>
    );
  }

  // Usuario autenticado y con permisos correctos
  return <>{children}</>;
};
