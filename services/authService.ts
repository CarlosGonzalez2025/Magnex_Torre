import { supabase } from './supabaseClient';
import { User, UserRole } from '../types';

// ==================== TYPES ====================

interface LoginResult {
  success: boolean;
  token?: string;
  user?: User;
  error?: string;
}

interface VerifySessionResult {
  success: boolean;
  user?: User;
  error?: string;
}

// ==================== AUTH SERVICE ====================

/**
 * Servicio de autenticación
 * Maneja login, logout y verificación de sesiones
 */
class AuthService {
  /**
   * Obtiene la dirección IP del cliente (simulada en cliente)
   */
  private getClientIP(): string {
    // En producción, esto debería obtenerse del backend
    return 'unknown';
  }

  /**
   * Obtiene el User Agent del navegador
   */
  private getUserAgent(): string {
    return navigator.userAgent || 'unknown';
  }

  /**
   * Inicia sesión con email y password
   * @param email Email del usuario
   * @param password Contraseña
   * @returns Resultado con token y usuario si es exitoso
   */
  async login(email: string, password: string): Promise<LoginResult> {
    try {
      // Validar inputs
      if (!email || !password) {
        return {
          success: false,
          error: 'Email y contraseña son requeridos'
        };
      }

      // Llamar a la función SQL authenticate_user
      const { data, error } = await supabase.rpc('authenticate_user', {
        p_email: email.toLowerCase().trim(),
        p_password: password,
        p_ip_address: this.getClientIP(),
        p_user_agent: this.getUserAgent()
      });

      if (error) {
        console.error('[AuthService] Login error:', error);
        return {
          success: false,
          error: 'Error al conectar con el servidor'
        };
      }

      // La función retorna un array con un objeto
      const result = data?.[0];

      if (!result || !result.success) {
        return {
          success: false,
          error: result?.error_message || 'Credenciales inválidas'
        };
      }

      // Construir objeto User
      const user: User = {
        id: result.user_id,
        email: result.user_email,
        full_name: result.user_name,
        role: result.user_role as UserRole,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      return {
        success: true,
        token: result.token,
        user
      };

    } catch (error: any) {
      console.error('[AuthService] Login exception:', error);
      return {
        success: false,
        error: error.message || 'Error inesperado'
      };
    }
  }

  /**
   * Verifica si un token de sesión es válido
   * @param token Token de sesión
   * @returns Usuario si el token es válido
   */
  async verifySession(token: string): Promise<VerifySessionResult> {
    try {
      if (!token) {
        return {
          success: false,
          error: 'Token no proporcionado'
        };
      }

      // Llamar a la función SQL verify_session
      const { data, error } = await supabase.rpc('verify_session', {
        p_token: token
      });

      if (error) {
        console.error('[AuthService] Verify session error:', error);
        return {
          success: false,
          error: 'Error al verificar sesión'
        };
      }

      const result = data?.[0];

      if (!result || !result.valid) {
        return {
          success: false,
          error: 'Sesión inválida o expirada'
        };
      }

      // Construir objeto User
      const user: User = {
        id: result.user_id,
        email: result.user_email,
        full_name: result.user_name,
        role: result.user_role as UserRole,
        is_active: result.is_active,
        last_login: result.last_login,
        created_at: result.created_at,
        updated_at: result.updated_at,
      };

      return {
        success: true,
        user
      };

    } catch (error: any) {
      console.error('[AuthService] Verify session exception:', error);
      return {
        success: false,
        error: error.message || 'Error inesperado'
      };
    }
  }

  /**
   * Cierra la sesión actual
   * @param token Token de sesión a cerrar
   */
  async logout(token: string): Promise<{ success: boolean }> {
    try {
      if (!token) {
        return { success: true }; // Ya está deslogueado
      }

      // Llamar a la función SQL logout_session
      const { data, error } = await supabase.rpc('logout_session', {
        p_token: token,
        p_ip_address: this.getClientIP()
      });

      if (error) {
        console.error('[AuthService] Logout error:', error);
        // Aunque falle, retornar success para limpiar el cliente
        return { success: true };
      }

      return { success: true };

    } catch (error: any) {
      console.error('[AuthService] Logout exception:', error);
      // Aunque falle, retornar success para limpiar el cliente
      return { success: true };
    }
  }

  /**
   * Limpia sesiones expiradas (puede ser llamado periódicamente)
   */
  async cleanExpiredSessions(): Promise<void> {
    try {
      await supabase.rpc('clean_expired_sessions');
    } catch (error) {
      console.error('[AuthService] Clean expired sessions error:', error);
    }
  }
}

// Exportar instancia única
export const authService = new AuthService();
