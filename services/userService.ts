import { supabase } from './supabaseClient';
import { User } from '../contexts/AuthContext';

// ==================== TYPES ====================

type UserRole = 'admin' | 'operator' | 'viewer';

interface CreateUserData {
  email: string;
  full_name: string;
  role: UserRole;
  password: string;
}

interface UpdateUserData {
  email?: string;
  full_name?: string;
  role?: UserRole;
}

interface ServiceResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

// ==================== USER SERVICE ====================

/**
 * Servicio de gestión de usuarios usando tabla pública user_profiles
 * Compatible con el sistema de autenticación existente
 *
 * IMPORTANTE: Usa user_profiles (tabla pública con RLS) en lugar de
 * supabase.auth.admin que solo funciona con service_role key desde backend
 */
class UserService {
  /**
   * Obtiene todos los usuarios del sistema
   * Usa la tabla pública user_profiles
   */
  async getAllUsers(): Promise<ServiceResult<User[]>> {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[UserService] Get all users error:', error);
        return {
          success: false,
          error: 'Error al obtener usuarios: ' + error.message
        };
      }

      // Mapear user_profiles a User
      const users: User[] = (data || []).map(profile => ({
        id: profile.id,
        email: profile.email,
        name: profile.name,
        role: profile.role as UserRole,
        createdAt: profile.created_at,
        lastLogin: profile.last_login || undefined,
      }));

      return {
        success: true,
        data: users
      };

    } catch (error: any) {
      console.error('[UserService] Get all users exception:', error);
      return {
        success: false,
        error: error.message || 'Error inesperado'
      };
    }
  }

  /**
   * Obtiene un usuario por ID
   */
  async getUserById(userId: string): Promise<ServiceResult<User>> {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error || !data) {
        return {
          success: false,
          error: 'Usuario no encontrado'
        };
      }

      const user: User = {
        id: data.id,
        email: data.email,
        name: data.name,
        role: data.role as UserRole,
        createdAt: data.created_at,
        lastLogin: data.last_login || undefined,
      };

      return {
        success: true,
        data: user
      };

    } catch (error: any) {
      console.error('[UserService] Get user by ID exception:', error);
      return {
        success: false,
        error: error.message || 'Error inesperado'
      };
    }
  }

  /**
   * Crea un nuevo usuario
   * Solo para administradores
   */
  async createUser(
    userData: CreateUserData,
    createdBy: string
  ): Promise<ServiceResult<User>> {
    try {
      // Validar datos
      if (!userData.email || !userData.full_name || !userData.password) {
        return {
          success: false,
          error: 'Email, nombre y contraseña son requeridos'
        };
      }

      // Validar formato de email
      const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$/;
      if (!emailRegex.test(userData.email)) {
        return {
          success: false,
          error: 'Formato de email inválido'
        };
      }

      // Validar longitud de contraseña
      if (userData.password.length < 8) {
        return {
          success: false,
          error: 'La contraseña debe tener al menos 8 caracteres'
        };
      }

      // Crear usuario usando Supabase signUp
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: userData.email.toLowerCase().trim(),
        password: userData.password,
        options: {
          data: {
            name: userData.full_name.trim(),
            role: userData.role
          },
          emailRedirectTo: window.location.origin
        }
      });

      if (authError) {
        console.error('[UserService] Create user error:', authError);

        if (authError.message?.includes('already') || authError.message?.includes('duplicate')) {
          return {
            success: false,
            error: 'Ya existe un usuario con este email'
          };
        }

        return {
          success: false,
          error: 'Error al crear usuario: ' + authError.message
        };
      }

      if (!authData.user) {
        return {
          success: false,
          error: 'Error al crear usuario'
        };
      }

      // El trigger sincronizará automáticamente a user_profiles
      // Esperar un momento para la sincronización
      await new Promise(resolve => setTimeout(resolve, 500));

      // Obtener el usuario creado de user_profiles
      const result = await this.getUserById(authData.user.id);

      if (!result.success || !result.data) {
        return {
          success: false,
          error: 'Usuario creado pero no se pudo sincronizar. Intenta recargar la página.'
        };
      }

      // Registrar en audit log
      await this.logAudit(
        createdBy,
        'USER_CREATED',
        'user',
        authData.user.id,
        { email: userData.email, role: userData.role }
      );

      return {
        success: true,
        data: result.data
      };

    } catch (error: any) {
      console.error('[UserService] Create user exception:', error);
      return {
        success: false,
        error: error.message || 'Error inesperado'
      };
    }
  }

  /**
   * Actualiza un usuario existente
   * Solo para administradores
   */
  async updateUser(
    userId: string,
    userData: UpdateUserData,
    updatedBy: string
  ): Promise<ServiceResult<User>> {
    try {
      // Usar función RPC para actualizar metadata en auth.users
      const { data: rpcData, error: rpcError } = await supabase.rpc(
        'update_user_metadata',
        {
          p_user_id: userId,
          p_name: userData.full_name || '',
          p_role: userData.role || 'viewer'
        }
      );

      if (rpcError) {
        console.error('[UserService] Update user error:', rpcError);
        return {
          success: false,
          error: 'Error al actualizar usuario: ' + rpcError.message
        };
      }

      // El trigger sincronizará automáticamente a user_profiles
      await new Promise(resolve => setTimeout(resolve, 300));

      // Obtener usuario actualizado
      const result = await this.getUserById(userId);

      if (!result.success || !result.data) {
        return {
          success: false,
          error: 'Error al obtener usuario actualizado'
        };
      }

      // Registrar en audit log
      await this.logAudit(
        updatedBy,
        'USER_UPDATED',
        'user',
        userId,
        { updates: userData }
      );

      return {
        success: true,
        data: result.data
      };

    } catch (error: any) {
      console.error('[UserService] Update user exception:', error);
      return {
        success: false,
        error: error.message || 'Error inesperado'
      };
    }
  }

  /**
   * Desactiva un usuario (marcar como inactivo)
   */
  async deactivateUser(userId: string, deactivatedBy: string): Promise<ServiceResult> {
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', userId);

      if (error) {
        console.error('[UserService] Deactivate user error:', error);
        return {
          success: false,
          error: 'Error al desactivar usuario: ' + error.message
        };
      }

      await this.logAudit(
        deactivatedBy,
        'USER_DEACTIVATED',
        'user',
        userId,
        null
      );

      return { success: true };

    } catch (error: any) {
      console.error('[UserService] Deactivate user exception:', error);
      return {
        success: false,
        error: error.message || 'Error inesperado'
      };
    }
  }

  /**
   * Activa un usuario
   */
  async activateUser(userId: string, activatedBy: string): Promise<ServiceResult> {
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({ is_active: true, updated_at: new Date().toISOString() })
        .eq('id', userId);

      if (error) {
        console.error('[UserService] Activate user error:', error);
        return {
          success: false,
          error: 'Error al activar usuario: ' + error.message
        };
      }

      await this.logAudit(
        activatedBy,
        'USER_ACTIVATED',
        'user',
        userId,
        null
      );

      return { success: true };

    } catch (error: any) {
      console.error('[UserService] Activate user exception:', error);
      return {
        success: false,
        error: error.message || 'Error inesperado'
      };
    }
  }

  /**
   * Elimina un usuario permanentemente (requiere SQL directo o backend)
   * Por seguridad, solo desactivamos desde el frontend
   */
  async deleteUser(userId: string, deletedBy: string): Promise<ServiceResult> {
    // Por seguridad, solo desactivar desde frontend
    return this.deactivateUser(userId, deletedBy);
  }

  /**
   * Resetea la contraseña de un usuario (solo admin)
   * NOTA: Desde frontend solo podemos enviar email de recuperación
   */
  async resetPassword(
    userId: string,
    newPassword: string,
    resetBy: string
  ): Promise<ServiceResult> {
    try {
      // Obtener email del usuario
      const userResult = await this.getUserById(userId);
      if (!userResult.success || !userResult.data) {
        return {
          success: false,
          error: 'Usuario no encontrado'
        };
      }

      // Desde frontend, enviar email de recuperación
      const { error } = await supabase.auth.resetPasswordForEmail(
        userResult.data.email,
        {
          redirectTo: `${window.location.origin}/reset-password`
        }
      );

      if (error) {
        console.error('[UserService] Reset password error:', error);
        return {
          success: false,
          error: 'Error al enviar email de recuperación: ' + error.message
        };
      }

      await this.logAudit(
        resetBy,
        'PASSWORD_RESET_EMAIL_SENT',
        'user',
        userId,
        null
      );

      return {
        success: true
      };

    } catch (error: any) {
      console.error('[UserService] Reset password exception:', error);
      return {
        success: false,
        error: error.message || 'Error inesperado'
      };
    }
  }

  /**
   * Función auxiliar para registrar en audit log
   */
  private async logAudit(
    userId: string,
    action: string,
    resourceType: string | null,
    resourceId: string | null,
    details: any
  ): Promise<void> {
    try {
      await supabase.rpc('log_audit', {
        p_user_id: userId,
        p_action: action,
        p_resource_type: resourceType,
        p_resource_id: resourceId,
        p_details: details,
        p_ip_address: null
      });
    } catch (error) {
      console.error('[UserService] Log audit error:', error);
      // No lanzar error, solo loguear
    }
  }
}

// Exportar instancia única
export const userService = new UserService();
