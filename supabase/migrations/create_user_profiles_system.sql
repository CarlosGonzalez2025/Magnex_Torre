-- ================================================
-- SISTEMA DE GESTIÓN DE USUARIOS CON RLS
-- ================================================
-- Este sistema permite gestionar usuarios desde el frontend
-- sin necesidad de usar auth.admin (que requiere service_role)

-- 1. Crear tabla de perfiles de usuario
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'operator', 'viewer')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_login TIMESTAMPTZ
);

-- 2. Crear índices para mejor rendimiento
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON public.user_profiles(email);
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON public.user_profiles(role);

-- 3. Habilitar RLS (Row Level Security)
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- 4. Políticas de seguridad RLS

-- Todos los usuarios autenticados pueden VER perfiles
CREATE POLICY "Users can view all profiles"
  ON public.user_profiles
  FOR SELECT
  TO authenticated
  USING (true);

-- Solo ADMINS pueden INSERTAR nuevos usuarios
CREATE POLICY "Only admins can insert profiles"
  ON public.user_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Solo ADMINS pueden ACTUALIZAR perfiles
CREATE POLICY "Only admins can update profiles"
  ON public.user_profiles
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Solo ADMINS pueden ELIMINAR perfiles
CREATE POLICY "Only admins can delete profiles"
  ON public.user_profiles
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 5. Función para sincronizar auth.users -> user_profiles (TRIGGER)
CREATE OR REPLACE FUNCTION public.sync_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Cuando se crea un nuevo usuario en auth.users, crear perfil
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.user_profiles (id, email, name, role, last_login)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'name', NEW.email::text),
      COALESCE(NEW.raw_user_meta_data->>'role', 'operator'),
      NEW.last_sign_in_at
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
  END IF;

  -- Cuando se actualiza un usuario en auth.users, actualizar perfil
  IF TG_OP = 'UPDATE' THEN
    UPDATE public.user_profiles
    SET
      email = NEW.email,
      name = COALESCE(NEW.raw_user_meta_data->>'name', NEW.email::text),
      role = COALESCE(NEW.raw_user_meta_data->>'role', 'operator'),
      last_login = CASE
        WHEN NEW.last_sign_in_at IS NOT NULL AND
             (OLD.last_sign_in_at IS NULL OR NEW.last_sign_in_at > OLD.last_sign_in_at)
        THEN NEW.last_sign_in_at
        ELSE last_login
      END,
      updated_at = NOW()
    WHERE id = NEW.id;
    RETURN NEW;
  END IF;

  -- Cuando se elimina un usuario en auth.users, eliminar perfil
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.user_profiles WHERE id = OLD.id;
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

-- 6. Trigger para sincronización automática
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_user_profile();

DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_user_profile();

DROP TRIGGER IF EXISTS on_auth_user_deleted ON auth.users;
CREATE TRIGGER on_auth_user_deleted
  AFTER DELETE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_user_profile();

-- 7. Función para crear usuarios (desde frontend)
CREATE OR REPLACE FUNCTION public.create_user_account(
  p_email TEXT,
  p_password TEXT,
  p_name TEXT,
  p_role TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_result JSON;
BEGIN
  -- Verificar que el usuario actual es admin
  IF NOT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RETURN json_build_object(
      'success', false,
      'error', 'No tienes permisos de administrador'
    );
  END IF;

  -- Validar rol
  IF p_role NOT IN ('admin', 'operator', 'viewer') THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Rol inválido. Debe ser: admin, operator o viewer'
    );
  END IF;

  -- Nota: La creación real del usuario debe hacerse desde Supabase Auth
  -- Esta función solo valida permisos
  RETURN json_build_object(
    'success', true,
    'message', 'Use Supabase signUp for user creation'
  );
END;
$$;

-- 8. Sincronizar usuarios existentes de auth.users a user_profiles
INSERT INTO public.user_profiles (id, email, name, role, last_login, created_at)
SELECT
  id,
  email,
  COALESCE(raw_user_meta_data->>'name', email::text) as name,
  COALESCE(raw_user_meta_data->>'role', 'operator') as role,
  last_sign_in_at,
  created_at
FROM auth.users
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  name = EXCLUDED.name,
  role = EXCLUDED.role,
  last_login = EXCLUDED.last_login,
  updated_at = NOW();

-- 9. Función para actualizar metadata de auth.users (helper)
CREATE OR REPLACE FUNCTION public.update_user_metadata(
  p_user_id UUID,
  p_name TEXT,
  p_role TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Verificar que el usuario actual es admin
  IF NOT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RETURN json_build_object(
      'success', false,
      'error', 'No tienes permisos de administrador'
    );
  END IF;

  -- Actualizar metadata en auth.users
  UPDATE auth.users
  SET raw_user_meta_data =
    COALESCE(raw_user_meta_data, '{}'::jsonb) ||
    jsonb_build_object(
      'name', p_name,
      'role', p_role
    )
  WHERE id = p_user_id;

  -- Actualizar perfil (el trigger lo hará automáticamente, pero por si acaso)
  UPDATE public.user_profiles
  SET
    name = p_name,
    role = p_role,
    updated_at = NOW()
  WHERE id = p_user_id;

  RETURN json_build_object(
    'success', true,
    'message', 'Usuario actualizado correctamente'
  );
END;
$$;

-- 10. Verificación y grants
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_profiles TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_user_account TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_user_metadata TO authenticated;

-- ================================================
-- RESUMEN:
-- ================================================
-- 1. user_profiles: Tabla pública con perfiles de usuario
-- 2. RLS: Solo admins pueden crear/editar/eliminar
-- 3. Triggers: Sincronizan auth.users ↔ user_profiles
-- 4. Funciones: Helpers para operaciones desde frontend
-- ================================================
