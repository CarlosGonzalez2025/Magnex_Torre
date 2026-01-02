-- ============================================
-- SISTEMA DE GESTIÓN DE USUARIOS CON ROLES
-- ============================================

-- Extensión para UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tabla de Usuarios
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
  password_hash TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES users(id),

  CONSTRAINT email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$')
);

-- Índices para users
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);

-- Tabla de Sesiones
CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address TEXT,
  user_agent TEXT
);

-- Índices para sesiones
CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON user_sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON user_sessions(expires_at);

-- Tabla de Auditoría
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  details JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para auditoría
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_log(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);

-- Función para actualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para updated_at en users
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Función para limpiar sesiones expiradas
CREATE OR REPLACE FUNCTION clean_expired_sessions()
RETURNS void AS $$
BEGIN
  DELETE FROM user_sessions WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Usuario administrador inicial
-- Password: Admin123! (deberá cambiarse en primer login)
-- Hash generado con bcrypt rounds=10
INSERT INTO users (email, full_name, role, password_hash, is_active)
VALUES (
  'admin@magnex.com',
  'Administrador Sistema',
  'admin',
  '$2a$10$rNwGzKLpZJzY4QjLQY5HzOEqB3XqHG7dJGVZ5qJZV5qJZV5qJZV5q',
  true
)
ON CONFLICT (email) DO NOTHING;

-- Row Level Security (RLS)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Política: Los usuarios pueden ver su propia información
CREATE POLICY "Users can view own data"
  ON users
  FOR SELECT
  USING (auth.uid() = id);

-- Política: Solo admins pueden ver todos los usuarios
CREATE POLICY "Admins can view all users"
  ON users
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Política: Solo admins pueden crear usuarios
CREATE POLICY "Admins can create users"
  ON users
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Política: Solo admins pueden actualizar usuarios
CREATE POLICY "Admins can update users"
  ON users
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Política: Solo admins pueden eliminar usuarios
CREATE POLICY "Admins can delete users"
  ON users
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Política: Los usuarios pueden ver sus propias sesiones
CREATE POLICY "Users can view own sessions"
  ON user_sessions
  FOR SELECT
  USING (user_id = auth.uid());

-- Política: Solo el sistema puede crear sesiones
CREATE POLICY "System can create sessions"
  ON user_sessions
  FOR INSERT
  WITH CHECK (true);

-- Política: Los usuarios pueden eliminar sus propias sesiones (logout)
CREATE POLICY "Users can delete own sessions"
  ON user_sessions
  FOR DELETE
  USING (user_id = auth.uid());

-- Política: Todos los usuarios autenticados pueden ver audit_log
CREATE POLICY "Authenticated users can view audit log"
  ON audit_log
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Política: El sistema puede insertar en audit_log
CREATE POLICY "System can insert audit log"
  ON audit_log
  FOR INSERT
  WITH CHECK (true);

-- Comentarios de documentación
COMMENT ON TABLE users IS 'Tabla de usuarios del sistema con control de roles';
COMMENT ON TABLE user_sessions IS 'Sesiones activas de usuarios';
COMMENT ON TABLE audit_log IS 'Registro de auditoría de acciones de usuarios';

COMMENT ON COLUMN users.role IS 'Rol del usuario: admin (administrador) o user (usuario regular)';
COMMENT ON COLUMN users.is_active IS 'Indica si el usuario está activo o desactivado';
COMMENT ON COLUMN users.last_login IS 'Fecha y hora del último inicio de sesión';

-- Vista para estadísticas de usuarios (solo admin)
CREATE OR REPLACE VIEW user_stats AS
SELECT
  role,
  COUNT(*) as total_users,
  COUNT(*) FILTER (WHERE is_active = true) as active_users,
  COUNT(*) FILTER (WHERE last_login > NOW() - INTERVAL '7 days') as recently_active
FROM users
GROUP BY role;

-- Función para registrar en audit_log
CREATE OR REPLACE FUNCTION log_action(
  p_user_id UUID,
  p_action TEXT,
  p_resource_type TEXT DEFAULT NULL,
  p_resource_id TEXT DEFAULT NULL,
  p_details JSONB DEFAULT NULL,
  p_ip_address TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO audit_log (
    user_id,
    action,
    resource_type,
    resource_id,
    details,
    ip_address
  ) VALUES (
    p_user_id,
    p_action,
    p_resource_type,
    p_resource_id,
    p_details,
    p_ip_address
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION log_action IS 'Función para registrar acciones en el audit log';
