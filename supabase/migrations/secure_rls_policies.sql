-- =====================================================
-- POLÍTICAS RLS SEGURAS
-- Ejecutar DESPUÉS de tener autenticación configurada
-- =====================================================

-- ⚠️ IMPORTANTE: Este script reemplaza las políticas de desarrollo
-- por políticas de producción que requieren autenticación.
-- NO ejecutar hasta que Supabase Auth esté completamente configurado.

-- =====================================================
-- 1. ELIMINAR POLÍTICAS ABIERTAS EXISTENTES
-- =====================================================

-- Alert History
DROP POLICY IF EXISTS "Enable all access for alert_history" ON alert_history;

-- Action Plans
DROP POLICY IF EXISTS "Enable all access for action_plans" ON action_plans;

-- Saved Alerts
DROP POLICY IF EXISTS "Enable all access for saved_alerts" ON saved_alerts;

-- Route Schedules
DROP POLICY IF EXISTS "Enable all access for route_schedules" ON route_schedules;

-- Preoperational Inspections
DROP POLICY IF EXISTS "Enable all access for preoperational_inspections" ON preoperational_inspections;

-- Vehicle Ignition Events
DROP POLICY IF EXISTS "Enable all access for vehicle_ignition_events" ON vehicle_ignition_events;

-- Idle Time Records
DROP POLICY IF EXISTS "Enable all access for idle_time_records" ON idle_time_records;

-- Drivers
DROP POLICY IF EXISTS "Enable all access for drivers" ON drivers;

-- Geofences
DROP POLICY IF EXISTS "Enable all access for geofences" ON geofences;

-- Geofence Events
DROP POLICY IF EXISTS "Enable all access for geofence_events" ON geofence_events;

-- =====================================================
-- 2. CREAR FUNCIÓN HELPER PARA VERIFICAR ROL
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT AS $$
BEGIN
  RETURN COALESCE(
    current_setting('request.jwt.claims', true)::json->>'role',
    (SELECT raw_user_meta_data->>'role' FROM auth.users WHERE id = auth.uid()),
    'viewer'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 3. POLÍTICAS PARA ALERT_HISTORY
-- =====================================================

-- Lectura: Todos los autenticados pueden ver
CREATE POLICY "Authenticated users can read alert_history" ON alert_history
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Inserción: Operadores y admins
CREATE POLICY "Operators can insert alert_history" ON alert_history
  FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated' AND 
    get_user_role() IN ('admin', 'operator')
  );

-- Actualización: Operadores y admins
CREATE POLICY "Operators can update alert_history" ON alert_history
  FOR UPDATE
  USING (
    auth.role() = 'authenticated' AND 
    get_user_role() IN ('admin', 'operator')
  );

-- Eliminación: Solo admins
CREATE POLICY "Admins can delete alert_history" ON alert_history
  FOR DELETE
  USING (
    auth.role() = 'authenticated' AND 
    get_user_role() = 'admin'
  );

-- =====================================================
-- 4. POLÍTICAS PARA ACTION_PLANS
-- =====================================================

CREATE POLICY "Authenticated users can read action_plans" ON action_plans
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Operators can insert action_plans" ON action_plans
  FOR INSERT WITH CHECK (
    auth.role() = 'authenticated' AND 
    get_user_role() IN ('admin', 'operator')
  );

CREATE POLICY "Operators can update action_plans" ON action_plans
  FOR UPDATE USING (
    auth.role() = 'authenticated' AND 
    get_user_role() IN ('admin', 'operator')
  );

CREATE POLICY "Admins can delete action_plans" ON action_plans
  FOR DELETE USING (
    auth.role() = 'authenticated' AND 
    get_user_role() = 'admin'
  );

-- =====================================================
-- 5. POLÍTICAS PARA SAVED_ALERTS
-- =====================================================

-- Saved alerts: Lectura para todos, escritura solo sistema
CREATE POLICY "Authenticated users can read saved_alerts" ON saved_alerts
  FOR SELECT USING (auth.role() = 'authenticated');

-- Inserción: Operadores y admins (o servicio backend)
CREATE POLICY "Operators can insert saved_alerts" ON saved_alerts
  FOR INSERT WITH CHECK (
    auth.role() = 'authenticated' AND 
    get_user_role() IN ('admin', 'operator')
  );

CREATE POLICY "Admins can delete saved_alerts" ON saved_alerts
  FOR DELETE USING (
    auth.role() = 'authenticated' AND 
    get_user_role() = 'admin'
  );

-- =====================================================
-- 6. POLÍTICAS PARA ROUTE_SCHEDULES
-- =====================================================

CREATE POLICY "Authenticated users can read route_schedules" ON route_schedules
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Operators can manage route_schedules" ON route_schedules
  FOR ALL USING (
    auth.role() = 'authenticated' AND 
    get_user_role() IN ('admin', 'operator')
  )
  WITH CHECK (
    auth.role() = 'authenticated' AND 
    get_user_role() IN ('admin', 'operator')
  );

-- =====================================================
-- 7. POLÍTICAS PARA PREOPERATIONAL_INSPECTIONS
-- =====================================================

CREATE POLICY "Authenticated users can read inspections" ON preoperational_inspections
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Operators can manage inspections" ON preoperational_inspections
  FOR ALL USING (
    auth.role() = 'authenticated' AND 
    get_user_role() IN ('admin', 'operator')
  )
  WITH CHECK (
    auth.role() = 'authenticated' AND 
    get_user_role() IN ('admin', 'operator')
  );

-- =====================================================
-- 8. POLÍTICAS PARA VEHICLE_IGNITION_EVENTS
-- =====================================================

CREATE POLICY "Authenticated users can read ignition_events" ON vehicle_ignition_events
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "System can insert ignition_events" ON vehicle_ignition_events
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- =====================================================
-- 9. POLÍTICAS PARA IDLE_TIME_RECORDS
-- =====================================================

CREATE POLICY "Authenticated users can read idle_time_records" ON idle_time_records
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "System can insert idle_time_records" ON idle_time_records
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- =====================================================
-- 10. POLÍTICAS PARA DRIVERS
-- =====================================================

CREATE POLICY "Authenticated users can read drivers" ON drivers
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage drivers" ON drivers
  FOR ALL USING (
    auth.role() = 'authenticated' AND 
    get_user_role() = 'admin'
  )
  WITH CHECK (
    auth.role() = 'authenticated' AND 
    get_user_role() = 'admin'
  );

-- =====================================================
-- 11. POLÍTICAS PARA GEOFENCES
-- =====================================================

CREATE POLICY "Authenticated users can read geofences" ON geofences
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage geofences" ON geofences
  FOR ALL USING (
    auth.role() = 'authenticated' AND 
    get_user_role() = 'admin'
  )
  WITH CHECK (
    auth.role() = 'authenticated' AND 
    get_user_role() = 'admin'
  );

-- =====================================================
-- 12. POLÍTICAS PARA GEOFENCE_EVENTS
-- =====================================================

CREATE POLICY "Authenticated users can read geofence_events" ON geofence_events
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "System can insert geofence_events" ON geofence_events
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- =====================================================
-- VERIFICACIÓN
-- =====================================================

-- Listar todas las políticas creadas
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
