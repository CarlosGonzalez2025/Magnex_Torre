import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

// =====================================================
// TYPES
// =====================================================

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'operator' | 'viewer';
  avatar?: string;
  createdAt: string;
  lastLogin?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<{ success: boolean; error?: string }>;
  updateProfile: (updates: Partial<User>) => Promise<{ success: boolean; error?: string }>;
}

// =====================================================
// CONTEXT
// =====================================================

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// =====================================================
// PROVIDER
// =====================================================

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check for existing session on mount
  useEffect(() => {
    checkSession();
  }, []);

  const checkSession = async () => {
    try {
      // Check localStorage for existing session
      const savedUser = localStorage.getItem('torre_control_user');
      if (savedUser) {
        const parsedUser = JSON.parse(savedUser);
        setUser(parsedUser);
      }
    } catch (error) {
      console.error('Error checking session:', error);
      localStorage.removeItem('torre_control_user');
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      setIsLoading(true);

      // TODO: Replace with Supabase Auth when credentials are available
      // For now, use demo authentication
      if (email && password.length >= 6) {
        const mockUser: User = {
          id: crypto.randomUUID(),
          email,
          name: email.split('@')[0],
          role: email.includes('admin') ? 'admin' : 'operator',
          createdAt: new Date().toISOString(),
          lastLogin: new Date().toISOString(),
        };

        setUser(mockUser);
        localStorage.setItem('torre_control_user', JSON.stringify(mockUser));

        return { success: true };
      } else {
        return { success: false, error: 'Credenciales inválidas' };
      }

      /* SUPABASE AUTH - Descomentar cuando estén las credenciales
      import { supabase } from '../services/supabaseClient';
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      if (data.user) {
        const user: User = {
          id: data.user.id,
          email: data.user.email!,
          name: data.user.user_metadata?.name || email.split('@')[0],
          role: data.user.user_metadata?.role || 'operator',
          createdAt: data.user.created_at,
          lastLogin: new Date().toISOString(),
        };
        setUser(user);
        localStorage.setItem('torre_control_user', JSON.stringify(user));
        return { success: true };
      }
      */
    } catch (error: any) {
      console.error('Login error:', error);
      return { success: false, error: error.message || 'Error al iniciar sesión' };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    try {
      setIsLoading(true);

      // TODO: Supabase signOut
      // await supabase.auth.signOut();

      setUser(null);
      localStorage.removeItem('torre_control_user');
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (
    email: string,
    password: string,
    name: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      setIsLoading(true);

      // TODO: Replace with Supabase Auth
      if (email && password.length >= 6 && name) {
        const mockUser: User = {
          id: crypto.randomUUID(),
          email,
          name,
          role: 'operator',
          createdAt: new Date().toISOString(),
        };

        setUser(mockUser);
        localStorage.setItem('torre_control_user', JSON.stringify(mockUser));

        return { success: true };
      } else {
        return { success: false, error: 'Datos inválidos' };
      }

      /* SUPABASE AUTH
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name, role: 'operator' },
        },
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
      */
    } catch (error: any) {
      console.error('Register error:', error);
      return { success: false, error: error.message || 'Error al registrar' };
    } finally {
      setIsLoading(false);
    }
  };

  const updateProfile = async (updates: Partial<User>): Promise<{ success: boolean; error?: string }> => {
    try {
      if (!user) {
        return { success: false, error: 'No hay usuario autenticado' };
      }

      const updatedUser = { ...user, ...updates };
      setUser(updatedUser);
      localStorage.setItem('torre_control_user', JSON.stringify(updatedUser));

      return { success: true };
    } catch (error: any) {
      console.error('Update profile error:', error);
      return { success: false, error: error.message || 'Error al actualizar perfil' };
    }
  };

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
    register,
    updateProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// =====================================================
// HOOK
// =====================================================

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// =====================================================
// PROTECTED ROUTE COMPONENT
// =====================================================

interface ProtectedRouteProps {
  children: ReactNode;
  requiredRole?: 'admin' | 'operator' | 'viewer';
  fallback?: ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requiredRole,
  fallback,
}) => {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return fallback || null;
  }

  // Role hierarchy: admin > operator > viewer
  const roleHierarchy = { admin: 3, operator: 2, viewer: 1 };
  if (requiredRole && user) {
    const userLevel = roleHierarchy[user.role] || 0;
    const requiredLevel = roleHierarchy[requiredRole] || 0;
    
    if (userLevel < requiredLevel) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">
              Acceso Denegado
            </h2>
            <p className="text-slate-600 dark:text-slate-400">
              No tienes permisos para acceder a esta sección.
            </p>
          </div>
        </div>
      );
    }
  }

  return <>{children}</>;
};

export default AuthContext;
