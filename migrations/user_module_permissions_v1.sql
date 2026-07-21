-- =====================================================
-- User Module Permissions
-- Run this in the Supabase SQL editor
-- =====================================================

-- Table: module-level access control per user
CREATE TABLE IF NOT EXISTS public.user_module_permissions (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module_id  TEXT        NOT NULL,
  granted_by UUID        REFERENCES auth.users(id),
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, module_id)
);

-- RLS
ALTER TABLE public.user_module_permissions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "admin_all_module_permissions" ON public.user_module_permissions;
DROP POLICY IF EXISTS "user_read_own_permissions" ON public.user_module_permissions;
DROP POLICY IF EXISTS "ump_admin_all" ON public.user_module_permissions;
DROP POLICY IF EXISTS "ump_self_select" ON public.user_module_permissions;

-- Admins can read/write all permissions
CREATE POLICY "admin_all_module_permissions"
  ON public.user_module_permissions FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'admin')
    OR (SELECT auth.jwt() ->> 'email') = 'info@datenova.io'
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'admin')
    OR (SELECT auth.jwt() ->> 'email') = 'info@datenova.io'
  );

-- Users can read their own permissions
CREATE POLICY "user_read_own_permissions"
  ON public.user_module_permissions FOR SELECT
  USING (user_id = auth.uid());

-- =====================================================
-- Function: replace all permissions for a user atomically
-- =====================================================
CREATE OR REPLACE FUNCTION public.set_user_module_permissions(
  p_user_id    UUID,
  p_modules    TEXT[],
  p_granted_by UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.user_module_permissions WHERE user_id = p_user_id;

  IF p_modules IS NOT NULL AND array_length(p_modules, 1) > 0 THEN
    INSERT INTO public.user_module_permissions (user_id, module_id, granted_by)
    SELECT p_user_id, unnest(p_modules), p_granted_by;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_user_module_permissions TO authenticated;

