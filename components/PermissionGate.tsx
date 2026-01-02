import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { UserRole, Permission } from '../types';

interface PermissionGateProps {
  children: React.ReactNode;
  requiredRole?: UserRole;
  requiredPermission?: Permission;
  requiredPermissions?: Permission[];
  requireAll?: boolean; // Si requiere TODOS los permisos (true) o ALGUNO (false)
  fallback?: React.ReactNode; // Qué mostrar si no tiene permisos
}

/**
 * Componente para mostrar/ocultar elementos según permisos del usuario
 *
 * @example
 * // Mostrar solo para admins
 * <PermissionGate requiredRole={UserRole.ADMIN}>
 *   <button>Eliminar Usuario</button>
 * </PermissionGate>
 *
 * @example
 * // Mostrar solo si tiene permiso de crear alertas
 * <PermissionGate requiredPermission={Permission.ALERT_CREATE}>
 *   <button>Crear Alerta</button>
 * </PermissionGate>
 *
 * @example
 * // Mostrar si tiene TODOS los permisos especificados
 * <PermissionGate requiredPermissions={[Permission.ALERT_CREATE, Permission.ALERT_EDIT]} requireAll={true}>
 *   <button>Gestionar Alertas</button>
 * </PermissionGate>
 *
 * @example
 * // Mostrar si tiene ALGUNO de los permisos especificados
 * <PermissionGate requiredPermissions={[Permission.ALERT_VIEW, Permission.ALERT_CREATE]} requireAll={false}>
 *   <div>Panel de Alertas</div>
 * </PermissionGate>
 *
 * @example
 * // Mostrar contenido alternativo si no tiene permisos
 * <PermissionGate
 *   requiredRole={UserRole.ADMIN}
 *   fallback={<p>Solo admins pueden ver esto</p>}
 * >
 *   <button>Configuración Avanzada</button>
 * </PermissionGate>
 */
export const PermissionGate: React.FC<PermissionGateProps> = ({
  children,
  requiredRole,
  requiredPermission,
  requiredPermissions,
  requireAll = true,
  fallback = null,
}) => {
  const {
    user,
    isAuthenticated,
    checkPermission,
    checkPermissions,
    checkAnyPermission,
  } = useAuth();

  // Si no está autenticado, no mostrar nada (o fallback)
  if (!isAuthenticated || !user) {
    return <>{fallback}</>;
  }

  // Verificar rol requerido
  if (requiredRole && user.role !== requiredRole) {
    return <>{fallback}</>;
  }

  // Verificar permiso individual
  if (requiredPermission && !checkPermission(requiredPermission)) {
    return <>{fallback}</>;
  }

  // Verificar múltiples permisos
  if (requiredPermissions) {
    if (requireAll) {
      // Requiere TODOS los permisos
      if (!checkPermissions(requiredPermissions)) {
        return <>{fallback}</>;
      }
    } else {
      // Requiere ALGUNO de los permisos
      if (!checkAnyPermission(requiredPermissions)) {
        return <>{fallback}</>;
      }
    }
  }

  // Usuario tiene los permisos necesarios
  return <>{children}</>;
};
