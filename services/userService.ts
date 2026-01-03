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
 * Servicio de gestión de usuarios usando Supabase Auth
 * Compatible con el sistema de autenticación existente
 */
class UserService {
  /**
   * Obtiene todos los usuarios del sistema
   * Usa la API Admin de Supabase
   */
  async getAllUsers(): Promise<ServiceResult<User[]>> {
    try {
      const { data, error } = await supabase.auth.admin.listUsers();

      if (error) {
        console.error('[UserService] Get all users error:', error);
        return {
          success: false,
          error: 'Error al obtener usuarios. Verifica permisos de administrador.'
        };
      }

      // Mapear usuarios de Supabase Auth
      const users: User[] = data.users.map(u => ({
        id: u.id,
        email: u.email || '',
        name: u.user_metadata?.name || u.email?.split('@')[0] || 'Usuario',
        role: (u.user_metadata?.role || 'viewer') as UserRole,
        createdAt: u.created_at,
        lastLogin: u.last_sign_in_at || undefined,
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
      const { data, error } = await supabase.auth.admin.getUserById(userId);

      if (error || !data.user) {
        return {
          success: false,
          error: 'Usuario no encontrado'
        };
      }

      const user: User = {
        id: data.user.id,
        email: data.user.email || '',
        name: data.user.user_metadata?.name || data.user.email?.split('@')[0] || 'Usuario',
        role: (data.user.user_metadata?.role || 'viewer') as UserRole,
        createdAt: data.user.created_at,
        lastLogin: data.user.last_sign_in_at || undefined,
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
      if (userData.password.length < 6) {
        return {
          success: false,
          error: 'La contraseña debe tener al menos 6 caracteres'
        };
      }

      // Crear usuario usando Supabase Auth Admin API
      const { data, error } = await supabase.auth.admin.createUser({
        email: userData.email.toLowerCase().trim(),
        password: userData.password,
        email_confirm: true, // Auto-confirmar email
        user_metadata: {
          name: userData.full_name.trim(),
          role: userData.role
        }
      });

      if (error) {
        console.error('[UserService] Create user error:', error);

        if (error.message?.includes('already') || error.message?.includes('duplicate')) {
          return {
            success: false,
            error: 'Ya existe un usuario con este email'
          };
        }

        return {
          success: false,
          error: 'Error al crear usuario: ' + error.message
        };
      }

      if (!data.user) {
        return {
          success: false,
          error: 'Error al crear usuario'
        };
      }

      // Registrar en audit log
      await this.logAudit(
        createdBy,
        'USER_CREATED',
        'user',
        data.user.id,
        { email: userData.email, role: userData.role }
      );

      // Retornar usuario creado
      const user: User = {
        id: data.user.id,
        email: data.user.email || '',
        name: userData.full_name,
        role: userData.role,
        createdAt: data.user.created_at,
      };

      return {
        success: true,
        data: user
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
      // Preparar metadata de actualización
      const updateData: any = {};

      if (userData.email !== undefined) {
        updateData.email = userData.email.toLowerCase().trim();
      }

      const userMetadata: any = {};
      if (userData.full_name !== undefined) {
        userMetadata.name = userData.full_name.trim();
      }
      if (userData.role !== undefined) {
        userMetadata.role = userData.role;
      }

      if (Object.keys(userMetadata).length > 0) {
        updateData.user_metadata = userMetadata;
      }

      // Actualizar usando Admin API
      const { data, error } = await supabase.auth.admin.updateUserById(
        userId,
        updateData
      );

      if (error) {
        console.error('[UserService] Update user error:', error);

        if (error.message?.includes('duplicate') || error.message?.includes('already')) {
          return {
            success: false,
            error: 'Ya existe un usuario con este email'
          };
        }

        return {
          success: false,
          error: 'Error al actualizar usuario: ' + error.message
        };
      }

      if (!data.user) {
        return {
          success: false,
          error: 'Error al actualizar usuario'
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

      // Retornar usuario actualizado
      const user: User = {
        id: data.user.id,
        email: data.user.email || '',
        name: data.user.user_metadata?.name || '',
        role: (data.user.user_metadata?.role || 'viewer') as UserRole,
        createdAt: data.user.created_at,
        lastLogin: data.user.last_sign_in_at,
      };

      return {
        success: true,
        data: user
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
   * Desactiva un usuario (elimina)
   */
  async deleteUser(userId: string, deletedBy: string): Promise<ServiceResult> {
    try {
      const { error } = await supabase.auth.admin.deleteUser(userId);

      if (error) {
        console.error('[UserService] Delete user error:', error);
        return {
          success: false,
          error: 'Error al eliminar usuario: ' + error.message
        };
      }

      // Registrar en audit log
      await this.logAudit(
        deletedBy,
        'USER_DELETED',
        'user',
        userId,
        null
      );

      return {
        success: true
      };

    } catch (error: any) {
      console.error('[UserService] Delete user exception:', error);
      return {
        success: false,
        error: error.message || 'Error inesperado'
      };
    }
  }

  /**
   * Resetea la contraseña de un usuario (solo admin)
   */
  async resetPassword(
    userId: string,
    newPassword: string,
    resetBy: string
  ): Promise<ServiceResult> {
    try {
      // Validar longitud de contraseña
      if (newPassword.length < 6) {
        return {
          success: false,
          error: 'La contraseña debe tener al menos 6 caracteres'
        };
      }

      // Actualizar contraseña usando Admin API
      const { error } = await supabase.auth.admin.updateUserById(
        userId,
        { password: newPassword }
      );

      if (error) {
        console.error('[UserService] Reset password error:', error);
        return {
          success: false,
          error: 'Error al resetear contraseña: ' + error.message
        };
      }

      // Registrar en audit log
      await this.logAudit(
        resetBy,
        'PASSWORD_RESET',
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
        p_details: details ? JSON.stringify(details) : null,
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
