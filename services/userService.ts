import { supabase } from './supabaseClient';
import { User, UserRole } from '../types';

// ==================== TYPES ====================

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
  is_active?: boolean;
}

interface ServiceResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

// ==================== USER SERVICE ====================

/**
 * Servicio de gestión de usuarios
 * Maneja CRUD de usuarios (solo para administradores)
 */
class UserService {
  /**
   * Obtiene todos los usuarios
   * Solo para administradores
   */
  async getAllUsers(): Promise<ServiceResult<User[]>> {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[UserService] Get all users error:', error);
        return {
          success: false,
          error: 'Error al obtener usuarios'
        };
      }

      // Mapear a tipo User
      const users: User[] = data.map(row => ({
        id: row.id,
        email: row.email,
        full_name: row.full_name,
        role: row.role as UserRole,
        is_active: row.is_active,
        last_login: row.last_login,
        created_at: row.created_at,
        created_by: row.created_by,
        updated_at: row.updated_at,
        updated_by: row.updated_by,
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
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('[UserService] Get user by ID error:', error);
        return {
          success: false,
          error: 'Usuario no encontrado'
        };
      }

      const user: User = {
        id: data.id,
        email: data.email,
        full_name: data.full_name,
        role: data.role as UserRole,
        is_active: data.is_active,
        last_login: data.last_login,
        created_at: data.created_at,
        created_by: data.created_by,
        updated_at: data.updated_at,
        updated_by: data.updated_by,
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

      // Llamar a función SQL para crear usuario con hash de password
      const { data, error } = await supabase.rpc('create_user', {
        p_email: userData.email.toLowerCase().trim(),
        p_full_name: userData.full_name.trim(),
        p_role: userData.role,
        p_password: userData.password,
        p_created_by: createdBy
      });

      if (error) {
        console.error('[UserService] Create user error:', error);

        // Verificar si es error de duplicado
        if (error.message?.includes('duplicate') || error.code === '23505') {
          return {
            success: false,
            error: 'Ya existe un usuario con este email'
          };
        }

        return {
          success: false,
          error: 'Error al crear usuario'
        };
      }

      const result = data?.[0];

      if (!result || !result.success) {
        return {
          success: false,
          error: result?.error_message || 'Error al crear usuario'
        };
      }

      // Obtener el usuario creado
      return await this.getUserById(result.user_id);

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
      // Preparar datos de actualización
      const updateData: any = {
        updated_by: updatedBy,
        updated_at: new Date().toISOString()
      };

      if (userData.email !== undefined) {
        updateData.email = userData.email.toLowerCase().trim();
      }
      if (userData.full_name !== undefined) {
        updateData.full_name = userData.full_name.trim();
      }
      if (userData.role !== undefined) {
        updateData.role = userData.role;
      }
      if (userData.is_active !== undefined) {
        updateData.is_active = userData.is_active;
      }

      const { data, error } = await supabase
        .from('users')
        .update(updateData)
        .eq('id', userId)
        .select()
        .single();

      if (error) {
        console.error('[UserService] Update user error:', error);

        // Verificar si es error de duplicado
        if (error.message?.includes('duplicate') || error.code === '23505') {
          return {
            success: false,
            error: 'Ya existe un usuario con este email'
          };
        }

        return {
          success: false,
          error: 'Error al actualizar usuario'
        };
      }

      const user: User = {
        id: data.id,
        email: data.email,
        full_name: data.full_name,
        role: data.role as UserRole,
        is_active: data.is_active,
        last_login: data.last_login,
        created_at: data.created_at,
        created_by: data.created_by,
        updated_at: data.updated_at,
        updated_by: data.updated_by,
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
   * Desactiva un usuario
   */
  async deactivateUser(userId: string, updatedBy: string): Promise<ServiceResult> {
    return this.updateUser(userId, { is_active: false }, updatedBy);
  }

  /**
   * Activa un usuario
   */
  async activateUser(userId: string, updatedBy: string): Promise<ServiceResult> {
    return this.updateUser(userId, { is_active: true }, updatedBy);
  }

  /**
   * Elimina un usuario (soft delete - desactiva)
   * En lugar de eliminar, desactivamos
   */
  async deleteUser(userId: string, deletedBy: string): Promise<ServiceResult> {
    return this.deactivateUser(userId, deletedBy);
  }

  /**
   * Cambia la contraseña de un usuario
   */
  async changePassword(
    userId: string,
    oldPassword: string,
    newPassword: string
  ): Promise<ServiceResult> {
    try {
      // Validar longitud de contraseña
      if (newPassword.length < 8) {
        return {
          success: false,
          error: 'La contraseña debe tener al menos 8 caracteres'
        };
      }

      // Llamar a función SQL para cambiar password
      const { data, error } = await supabase.rpc('change_password', {
        p_user_id: userId,
        p_old_password: oldPassword,
        p_new_password: newPassword
      });

      if (error) {
        console.error('[UserService] Change password error:', error);
        return {
          success: false,
          error: 'Error al cambiar contraseña'
        };
      }

      const result = data?.[0];

      if (!result || !result.success) {
        return {
          success: false,
          error: result?.error_message || 'Contraseña actual incorrecta'
        };
      }

      return {
        success: true
      };

    } catch (error: any) {
      console.error('[UserService] Change password exception:', error);
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
      if (newPassword.length < 8) {
        return {
          success: false,
          error: 'La contraseña debe tener al menos 8 caracteres'
        };
      }

      // Llamar a función SQL para resetear password
      const { data, error } = await supabase.rpc('reset_password', {
        p_user_id: userId,
        p_new_password: newPassword,
        p_reset_by: resetBy
      });

      if (error) {
        console.error('[UserService] Reset password error:', error);
        return {
          success: false,
          error: 'Error al resetear contraseña'
        };
      }

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
   * Obtiene estadísticas de usuarios
   */
  async getUserStats(): Promise<ServiceResult<any>> {
    try {
      const { data, error } = await supabase
        .from('user_stats')
        .select('*');

      if (error) {
        console.error('[UserService] Get user stats error:', error);
        return {
          success: false,
          error: 'Error al obtener estadísticas'
        };
      }

      return {
        success: true,
        data: data
      };

    } catch (error: any) {
      console.error('[UserService] Get user stats exception:', error);
      return {
        success: false,
        error: error.message || 'Error inesperado'
      };
    }
  }
}

// Exportar instancia única
export const userService = new UserService();
