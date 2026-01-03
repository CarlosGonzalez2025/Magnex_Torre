import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '../services/supabaseClient';

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
  isAdmin: () => boolean;
  isOperator: () => boolean;
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

  // Initialize Supabase Auth
  useEffect(() => {
    // 1. Check active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        mapSupabaseUser(session.user);
      } else {
        setIsLoading(false);
      }
    });

    // 2. Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        mapSupabaseUser(session.user);
      } else {
        setUser(null);
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const mapSupabaseUser = (supabaseUser: any) => {
    const userMap: User = {
      id: supabaseUser.id,
      email: supabaseUser.email!,
      name: supabaseUser.user_metadata?.name || supabaseUser.email!.split('@')[0],
      role: (supabaseUser.user_metadata?.role as any) || 'viewer', // Default safe role
      createdAt: supabaseUser.created_at,
      lastLogin: new Date().toISOString(),
    };
    setUser(userMap);
    setIsLoading(false);
  };

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      setIsLoading(true);

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error('Supabase Login Error:', error);
        return { success: false, error: 'Credenciales inválidas o error de conexión.' };
      }

      return { success: true };
    } catch (error: any) {
      console.error('Login Exception:', error);
      return { success: false, error: error.message || 'Error inesperado' };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    try {
      await supabase.auth.signOut();
      setUser(null);
    } catch (error) {
      console.error('Logout Error:', error);
    }
  };

  const register = async (
    email: string,
    password: string,
    name: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name,
            role: 'viewer', // Default role
          },
        },
      });

      if (error) {
        console.error('Registration Error:', error);
        return { success: false, error: 'Error al registrar usuario.' };
      }

      return { success: true };
    } catch (error: any) {
      console.error('Registration Exception:', error);
      return { success: false, error: error.message || 'Error inesperado' };
    }
  };

  const updateProfile = async (updates: Partial<User>): Promise<{ success: boolean; error?: string }> => {
    try {
      if (!user) {
        return { success: false, error: 'No hay usuario autenticado' };
      }

      const { error } = await supabase.auth.updateUser({
        data: {
          name: updates.name || user.name,
          role: updates.role || user.role,
        },
      });

      if (error) {
        console.error('Update Profile Error:', error);
        return { success: false, error: 'Error al actualizar perfil.' };
      }

      // Actualizar estado local
      setUser({
        ...user,
        ...updates,
      });

      return { success: true };
    } catch (error: any) {
      console.error('Update Profile Exception:', error);
      return { success: false, error: error.message || 'Error inesperado' };
    }
  };

  const isAdmin = (): boolean => {
    return user?.role === 'admin';
  };

  const isOperator = (): boolean => {
    return user?.role === 'operator' || user?.role === 'admin';
  };

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
    register,
    updateProfile,
    isAdmin,
    isOperator,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// =====================================================
// HOOK
// =====================================================

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// =====================================================
// PROTECTED ROUTE COMPONENT (for convenience)
// =====================================================

interface ProtectedRouteProps {
  children: ReactNode;
  requireAdmin?: boolean;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, requireAdmin = false }) => {
  const { user, isLoading, isAdmin } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null; // El App.tsx maneja mostrar Login
  }

  if (requireAdmin && !isAdmin()) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md text-center">
          <div className="text-6xl mb-4">🚫</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Acceso Denegado</h2>
          <p className="text-gray-600 mb-4">
            No tienes permisos de administrador para acceder a esta sección.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
