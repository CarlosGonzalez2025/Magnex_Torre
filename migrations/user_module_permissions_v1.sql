-- =====================================================
-- User Module Permissions
-- Run this in the Supabase SQL editor
-- =====================================================

-- Table: module-level access control per user
CREATE TABLE IF NOT EXISTS user_module_permissions (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module_id  TEXT        NOT NULL,
  granted_by UUID        REFERENCES auth.users(id),
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, module_id)
);

-- RLS
ALTER TABLE user_module_permissions ENABLE ROW LEVEL SECURITY;

-- Admins can read/write all permissions
CREATE POLICY "admin_all_module_permissions"
  ON user_module_permissions FOR ALL
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Users can read their own permissions
CREATE POLICY "user_read_own_permissions"
  ON user_module_permissions FOR SELECT
  USING (user_id = auth.uid());

-- =====================================================
-- Function: replace all permissions for a user atomically
-- =====================================================
CREATE OR REPLACE FUNCTION set_user_module_permissions(
  p_user_id    UUID,
  p_modules    TEXT[],
  p_granted_by UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM user_module_permissions WHERE user_id = p_user_id;

  IF p_modules IS NOT NULL AND array_length(p_modules, 1) > 0 THEN
    INSERT INTO user_module_permissions (user_id, module_id, granted_by)
    SELECT p_user_id, unnest(p_modules), p_granted_by;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION set_user_module_permissions TO authenticated;
