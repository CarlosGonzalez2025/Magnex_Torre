import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, UserRole, Permission, hasPermission } from '../types';
import { authService } from '../services/authService';

// ==================== TYPES ====================

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  checkPermission: (permission: Permission) => boolean;
  checkPermissions: (permissions: Permission[]) => boolean;
  checkAnyPermission: (permissions: Permission[]) => boolean;
  isAdmin: () => boolean;
  refreshUser: () => Promise<void>;
}

interface AuthProviderProps {
  children: ReactNode;
}

// ==================== CONTEXT ====================

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ==================== PROVIDER ====================

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Verificar sesión al cargar la aplicación
  useEffect(() => {
    checkSession();
  }, []);

  /**
   * Verifica si existe una sesión válida en localStorage
   */
  const checkSession = async () => {
    try {
      setIsLoading(true);
      const token = localStorage.getItem('auth_token');

      if (!token) {
        setUser(null);
        setIsLoading(false);
        return;
      }

      // Verificar si el token es válido y obtener usuario
      const result = await authService.verifySession(token);

      if (result.success && result.user) {
        setUser(result.user);
      } else {
        // Token inválido o expirado
        localStorage.removeItem('auth_token');
        setUser(null);
      }
    } catch (error) {
      console.error('[Auth] Error checking session:', error);
      localStorage.removeItem('auth_token');
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Inicia sesión con email y password
   */
  const login = async (
    email: string,
    password: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const result = await authService.login(email, password);

      if (result.success && result.token && result.user) {
        // Guardar token en localStorage
        localStorage.setItem('auth_token', result.token);
        setUser(result.user);

        return { success: true };
      } else {
        return {
          success: false,
          error: result.error || 'Error al iniciar sesión'
        };
      }
    } catch (error: any) {
      console.error('[Auth] Login error:', error);
      return {
        success: false,
        error: error.message || 'Error de conexión'
      };
    }
  };

  /**
   * Cierra sesión
   */
  const logout = async () => {
    try {
      const token = localStorage.getItem('auth_token');

      if (token) {
        // Eliminar sesión en el backend
        await authService.logout(token);
      }

      // Limpiar estado local
      localStorage.removeItem('auth_token');
      setUser(null);
    } catch (error) {
      console.error('[Auth] Logout error:', error);
      // Aunque falle, limpiar estado local
      localStorage.removeItem('auth_token');
      setUser(null);
    }
  };

  /**
   * Verifica si el usuario tiene un permiso específico
   */
  const checkPermission = (permission: Permission): boolean => {
    if (!user) return false;
    return hasPermission(user.role, permission);
  };

  /**
   * Verifica si el usuario tiene TODOS los permisos especificados
   */
  const checkPermissions = (permissions: Permission[]): boolean => {
    if (!user) return false;
    return permissions.every(permission => hasPermission(user.role, permission));
  };

  /**
   * Verifica si el usuario tiene ALGUNO de los permisos especificados
   */
  const checkAnyPermission = (permissions: Permission[]): boolean => {
    if (!user) return false;
    return permissions.some(permission => hasPermission(user.role, permission));
  };

  /**
   * Verifica si el usuario actual es admin
   */
  const isAdmin = (): boolean => {
    return user?.role === UserRole.ADMIN;
  };

  /**
   * Refresca los datos del usuario actual
   */
  const refreshUser = async () => {
    await checkSession();
  };

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    logout,
    checkPermission,
    checkPermissions,
    checkAnyPermission,
    isAdmin,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// ==================== HOOK ====================

/**
 * Hook para usar el contexto de autenticación
 * @throws Error si se usa fuera del AuthProvider
 */
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
};
