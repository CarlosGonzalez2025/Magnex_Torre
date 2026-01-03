-- ============================================
-- ACTUALIZAR ROL DEL USUARIO ADMIN EXISTENTE
-- ============================================

-- Actualizar el usuario admin con UID: 0849ef18-2ce7-4304-b285-3eab36544b5d
UPDATE auth.users
SET raw_user_meta_data = jsonb_build_object(
  'role', 'admin',
  'name', 'Administrador'
)
WHERE id = '0849ef18-2ce7-4304-b285-3eab36544b5d';

-- Verificar que se actualizó correctamente
SELECT
  id,
  email,
  raw_user_meta_data->>'role' as role,
  raw_user_meta_data->>'name' as name,
  created_at,
  last_sign_in_at
FROM auth.users
WHERE id = '0849ef18-2ce7-4304-b285-3eab36544b5d';
