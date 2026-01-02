-- ============================================
-- FUNCIONES DE AUTENTICACIÓN
-- ============================================

-- Extensión para generar tokens aleatorios
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================
-- FUNCIÓN: authenticate_user
-- ============================================
-- Autentica un usuario y crea una sesión
CREATE OR REPLACE FUNCTION authenticate_user(
  p_email TEXT,
  p_password TEXT,
  p_ip_address TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  token TEXT,
  user_id UUID,
  user_email TEXT,
  user_name TEXT,
  user_role TEXT,
  error_message TEXT
) AS $$
DECLARE
  v_user_id UUID;
  v_user_email TEXT;
  v_user_name TEXT;
  v_user_role TEXT;
  v_password_hash TEXT;
  v_is_active BOOLEAN;
  v_token TEXT;
  v_expires_at TIMESTAMPTZ;
BEGIN
  -- Buscar usuario por email
  SELECT id, email, full_name, role, password_hash, is_active
  INTO v_user_id, v_user_email, v_user_name, v_user_role, v_password_hash, v_is_active
  FROM users
  WHERE email = p_email;

  -- Verificar si el usuario existe
  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT
      FALSE,
      NULL::TEXT,
      NULL::UUID,
      NULL::TEXT,
      NULL::TEXT,
      NULL::TEXT,
      'Usuario o contraseña incorrectos'::TEXT;
    RETURN;
  END IF;

  -- Verificar si el usuario está activo
  IF NOT v_is_active THEN
    RETURN QUERY SELECT
      FALSE,
      NULL::TEXT,
      NULL::UUID,
      NULL::TEXT,
      NULL::TEXT,
      NULL::TEXT,
      'Usuario desactivado. Contacte al administrador'::TEXT;
    RETURN;
  END IF;

  -- Verificar password
  -- NOTA: En producción, usar crypt() para bcrypt
  -- Por ahora, comparación simple para testing
  IF v_password_hash != crypt(p_password, v_password_hash) THEN
    RETURN QUERY SELECT
      FALSE,
      NULL::TEXT,
      NULL::UUID,
      NULL::TEXT,
      NULL::TEXT,
      NULL::TEXT,
      'Usuario o contraseña incorrectos'::TEXT;
    RETURN;
  END IF;

  -- Generar token de sesión (32 caracteres aleatorios)
  v_token := encode(gen_random_bytes(32), 'hex');

  -- Calcular expiración (24 horas)
  v_expires_at := NOW() + INTERVAL '24 hours';

  -- Crear sesión
  INSERT INTO user_sessions (user_id, token, expires_at, ip_address, user_agent)
  VALUES (v_user_id, v_token, v_expires_at, p_ip_address, p_user_agent);

  -- Actualizar last_login
  UPDATE users SET last_login = NOW() WHERE id = v_user_id;

  -- Registrar en audit_log
  INSERT INTO audit_log (user_id, action, details, ip_address)
  VALUES (
    v_user_id,
    'LOGIN',
    jsonb_build_object('email', v_user_email, 'success', true),
    p_ip_address
  );

  -- Retornar éxito
  RETURN QUERY SELECT
    TRUE,
    v_token,
    v_user_id,
    v_user_email,
    v_user_name,
    v_user_role,
    NULL::TEXT;

EXCEPTION
  WHEN OTHERS THEN
    RETURN QUERY SELECT
      FALSE,
      NULL::TEXT,
      NULL::UUID,
      NULL::TEXT,
      NULL::TEXT,
      NULL::TEXT,
      'Error interno del servidor'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION authenticate_user IS 'Autentica un usuario y crea una sesión válida';

-- ============================================
-- FUNCIÓN: verify_session
-- ============================================
-- Verifica si un token de sesión es válido
CREATE OR REPLACE FUNCTION verify_session(
  p_token TEXT
)
RETURNS TABLE (
  valid BOOLEAN,
  user_id UUID,
  user_email TEXT,
  user_name TEXT,
  user_role TEXT,
  is_active BOOLEAN,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
) AS $$
DECLARE
  v_session_user_id UUID;
  v_expires_at TIMESTAMPTZ;
BEGIN
  -- Buscar sesión por token
  SELECT user_sessions.user_id, user_sessions.expires_at
  INTO v_session_user_id, v_expires_at
  FROM user_sessions
  WHERE token = p_token;

  -- Si no existe la sesión
  IF v_session_user_id IS NULL THEN
    RETURN QUERY SELECT
      FALSE,
      NULL::UUID,
      NULL::TEXT,
      NULL::TEXT,
      NULL::TEXT,
      NULL::BOOLEAN,
      NULL::TIMESTAMPTZ,
      NULL::TIMESTAMPTZ,
      NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  -- Verificar si expiró
  IF v_expires_at < NOW() THEN
    -- Eliminar sesión expirada
    DELETE FROM user_sessions WHERE token = p_token;

    RETURN QUERY SELECT
      FALSE,
      NULL::UUID,
      NULL::TEXT,
      NULL::TEXT,
      NULL::TEXT,
      NULL::BOOLEAN,
      NULL::TIMESTAMPTZ,
      NULL::TIMESTAMPTZ,
      NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  -- Retornar datos del usuario
  RETURN QUERY
  SELECT
    TRUE,
    users.id,
    users.email,
    users.full_name,
    users.role,
    users.is_active,
    users.last_login,
    users.created_at,
    users.updated_at
  FROM users
  WHERE users.id = v_session_user_id;

EXCEPTION
  WHEN OTHERS THEN
    RETURN QUERY SELECT
      FALSE,
      NULL::UUID,
      NULL::TEXT,
      NULL::TEXT,
      NULL::TEXT,
      NULL::BOOLEAN,
      NULL::TIMESTAMPTZ,
      NULL::TIMESTAMPTZ,
      NULL::TIMESTAMPTZ;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION verify_session IS 'Verifica si un token de sesión es válido y retorna datos del usuario';

-- ============================================
-- FUNCIÓN: logout_session
-- ============================================
-- Cierra una sesión (logout)
CREATE OR REPLACE FUNCTION logout_session(
  p_token TEXT,
  p_ip_address TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Obtener user_id antes de eliminar
  SELECT user_id INTO v_user_id
  FROM user_sessions
  WHERE token = p_token;

  -- Eliminar sesión
  DELETE FROM user_sessions WHERE token = p_token;

  -- Registrar en audit_log
  IF v_user_id IS NOT NULL THEN
    INSERT INTO audit_log (user_id, action, details, ip_address)
    VALUES (
      v_user_id,
      'LOGOUT',
      jsonb_build_object('token', LEFT(p_token, 10) || '...'),
      p_ip_address
    );
  END IF;

  RETURN TRUE;

EXCEPTION
  WHEN OTHERS THEN
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION logout_session IS 'Cierra una sesión de usuario (logout)';

-- ============================================
-- FUNCIÓN: create_user
-- ============================================
-- Crea un nuevo usuario con password hasheado
CREATE OR REPLACE FUNCTION create_user(
  p_email TEXT,
  p_full_name TEXT,
  p_role TEXT,
  p_password TEXT,
  p_created_by UUID
)
RETURNS TABLE (
  success BOOLEAN,
  user_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_user_id UUID;
  v_password_hash TEXT;
BEGIN
  -- Validar rol
  IF p_role NOT IN ('admin', 'user') THEN
    RETURN QUERY SELECT
      FALSE,
      NULL::UUID,
      'Rol inválido. Debe ser admin o user'::TEXT;
    RETURN;
  END IF;

  -- Generar hash de password usando bcrypt
  v_password_hash := crypt(p_password, gen_salt('bf', 10));

  -- Insertar usuario
  INSERT INTO users (
    email,
    full_name,
    role,
    password_hash,
    is_active,
    created_by
  )
  VALUES (
    p_email,
    p_full_name,
    p_role,
    v_password_hash,
    true,
    p_created_by
  )
  RETURNING id INTO v_user_id;

  -- Registrar en audit_log
  INSERT INTO audit_log (user_id, action, resource_type, resource_id, details)
  VALUES (
    p_created_by,
    'USER_CREATED',
    'user',
    v_user_id::TEXT,
    jsonb_build_object('email', p_email, 'role', p_role, 'created_user_id', v_user_id)
  );

  RETURN QUERY SELECT
    TRUE,
    v_user_id,
    NULL::TEXT;

EXCEPTION
  WHEN unique_violation THEN
    RETURN QUERY SELECT
      FALSE,
      NULL::UUID,
      'Ya existe un usuario con este email'::TEXT;
  WHEN OTHERS THEN
    RETURN QUERY SELECT
      FALSE,
      NULL::UUID,
      'Error al crear usuario'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION create_user IS 'Crea un nuevo usuario con password hasheado';

-- ============================================
-- FUNCIÓN: change_password
-- ============================================
-- Cambia la contraseña de un usuario verificando la actual
CREATE OR REPLACE FUNCTION change_password(
  p_user_id UUID,
  p_old_password TEXT,
  p_new_password TEXT
)
RETURNS TABLE (
  success BOOLEAN,
  error_message TEXT
) AS $$
DECLARE
  v_current_hash TEXT;
  v_new_hash TEXT;
BEGIN
  -- Obtener hash actual
  SELECT password_hash INTO v_current_hash
  FROM users
  WHERE id = p_user_id;

  -- Verificar si el usuario existe
  IF v_current_hash IS NULL THEN
    RETURN QUERY SELECT
      FALSE,
      'Usuario no encontrado'::TEXT;
    RETURN;
  END IF;

  -- Verificar password actual
  IF v_current_hash != crypt(p_old_password, v_current_hash) THEN
    RETURN QUERY SELECT
      FALSE,
      'Contraseña actual incorrecta'::TEXT;
    RETURN;
  END IF;

  -- Generar nuevo hash
  v_new_hash := crypt(p_new_password, gen_salt('bf', 10));

  -- Actualizar password
  UPDATE users
  SET password_hash = v_new_hash, updated_at = NOW()
  WHERE id = p_user_id;

  -- Registrar en audit_log
  INSERT INTO audit_log (user_id, action, details)
  VALUES (
    p_user_id,
    'PASSWORD_CHANGED',
    jsonb_build_object('user_id', p_user_id)
  );

  RETURN QUERY SELECT
    TRUE,
    NULL::TEXT;

EXCEPTION
  WHEN OTHERS THEN
    RETURN QUERY SELECT
      FALSE,
      'Error al cambiar contraseña'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION change_password IS 'Cambia la contraseña verificando la contraseña actual';

-- ============================================
-- FUNCIÓN: reset_password
-- ============================================
-- Resetea la contraseña de un usuario (solo admin)
CREATE OR REPLACE FUNCTION reset_password(
  p_user_id UUID,
  p_new_password TEXT,
  p_reset_by UUID
)
RETURNS TABLE (
  success BOOLEAN,
  error_message TEXT
) AS $$
DECLARE
  v_new_hash TEXT;
BEGIN
  -- Generar nuevo hash
  v_new_hash := crypt(p_new_password, gen_salt('bf', 10));

  -- Actualizar password
  UPDATE users
  SET password_hash = v_new_hash, updated_at = NOW(), updated_by = p_reset_by
  WHERE id = p_user_id;

  -- Registrar en audit_log
  INSERT INTO audit_log (user_id, action, resource_type, resource_id, details)
  VALUES (
    p_reset_by,
    'PASSWORD_RESET',
    'user',
    p_user_id::TEXT,
    jsonb_build_object('reset_for_user', p_user_id)
  );

  RETURN QUERY SELECT
    TRUE,
    NULL::TEXT;

EXCEPTION
  WHEN OTHERS THEN
    RETURN QUERY SELECT
      FALSE,
      'Error al resetear contraseña'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION reset_password IS 'Resetea la contraseña de un usuario (solo admin)';

-- ============================================
-- PERMISOS
-- ============================================
-- Permitir que usuarios anónimos puedan llamar a authenticate_user
GRANT EXECUTE ON FUNCTION authenticate_user TO anon, authenticated;
GRANT EXECUTE ON FUNCTION verify_session TO anon, authenticated;
GRANT EXECUTE ON FUNCTION logout_session TO anon, authenticated;
GRANT EXECUTE ON FUNCTION create_user TO authenticated;
GRANT EXECUTE ON FUNCTION change_password TO authenticated;
GRANT EXECUTE ON FUNCTION reset_password TO authenticated;
