-- Fix: "infinite recursion detected in policy for relation user_profiles"
-- Causa: una política RLS de user_profiles consultaba a user_profiles dentro de sí misma
-- (patrón "¿es admin?"), lo que re-disparaba la política → recursión infinita.
-- Solución: función SECURITY DEFINER is_admin() que lee la tabla SIN reactivar RLS,
-- y políticas no recursivas (self-select + admin-all).
-- Ejecutar en el SQL Editor de Supabase como rol postgres.

-- 1) Función sin recursión (definer ignora RLS al leer la tabla)
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
           (select role = 'admin' from public.user_profiles where id = auth.uid()),
           false
         )
         or coalesce(auth.jwt() ->> 'email', '') = 'info@datenova.io';
$$;

grant execute on function public.is_admin() to authenticated, anon;

-- 2) Eliminar todas las políticas actuales de user_profiles (incluidas las recursivas)
do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'user_profiles'
  loop
    execute format('drop policy if exists %I on public.user_profiles', pol.policyname);
  end loop;
end $$;

alter table public.user_profiles enable row level security;

-- 3) Políticas limpias
create policy "user_profiles_self_select" on public.user_profiles
  for select using (auth.uid() = id);

create policy "user_profiles_admin_all" on public.user_profiles
  for all using (public.is_admin()) with check (public.is_admin());

-- 4) Misma corrección para user_module_permissions (permisos por módulo)
alter table public.user_module_permissions enable row level security;

do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'user_module_permissions'
  loop
    execute format('drop policy if exists %I on public.user_module_permissions', pol.policyname);
  end loop;
end $$;

create policy "ump_self_select" on public.user_module_permissions
  for select using (auth.uid() = user_id);

create policy "ump_admin_all" on public.user_module_permissions
  for all using (public.is_admin()) with check (public.is_admin());
