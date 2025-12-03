import { supabase } from './databaseService';

// =====================================================
// TYPES
// =====================================================

export interface RouteSchedule {
  id?: string;
  plate: string;
  contract?: string;
  driver?: string;
  route_name: string;
  scheduled_date: string; // YYYY-MM-DD
  scheduled_start_time: string; // HH:MM:SS
  scheduled_end_time?: string;
  departure_location?: string;
  arrival_location?: string;
  estimated_distance?: number;
  notes?: string;
  status?: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  actual_start_time?: string;
  actual_end_time?: string;
  created_at?: string;
  updated_at?: string;
  created_by?: string;
}

export interface PreoperationalInspection {
  id?: string;
  inspection_key?: string;
  plate: string;
  inspection_date: string; // YYYY-MM-DD
  inspection_datetime?: string;
  day_of_week?: string;
  start_time?: string;
  start_location?: string;
  end_time?: string;
  driver?: string;
  findings_count?: number;
  status: string; // OK, Sin inspección, Fuera de tiempo
  contract?: string;
  vehicle_type?: string;
  raw_data?: any;
  imported_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface VehicleIgnitionEvent {
  id?: string;
  plate: string;
  driver?: string;
  event_type: 'ignition_on' | 'ignition_off';
  event_datetime: string;
  location?: string;
  latitude?: number;
  longitude?: number;
  source?: string;
  created_at?: string;
}

export interface IdleTimeRecord {
  id?: string;
  plate: string;
  driver?: string;
  contract?: string;
  start_datetime: string;
  end_datetime?: string;
  duration_minutes?: number;
  location?: string;
  latitude?: number;
  longitude?: number;
  source?: string;
  created_at?: string;
}

export interface InspectionSummary {
  inspection_date: string;
  contract: string;
  total_vehicles: number;
  ok_count: number;
  no_inspection_count: number;
  late_inspection_count: number;
  ok_percentage: number;
  no_inspection_percentage: number;
  late_percentage: number;
}

export interface InspectionCrossCheck {
  plate: string;
  ignition_time: string;
  inspection_time?: string;
  status: 'OK' | 'Sin inspección' | 'Fuera de tiempo';
  driver?: string;
  contract?: string;
}

// =====================================================
// ROUTE SCHEDULES
// =====================================================

/**
 * Save a single route schedule
 */
export async function saveRouteSchedule(schedule: RouteSchedule): Promise<{ success: boolean; data?: RouteSchedule; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('route_schedules')
      .insert(schedule)
      .select()
      .single();

    if (error) {
      console.error('[TowerControl] Error saving route schedule:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (error: any) {
    console.error('[TowerControl] Exception saving route schedule:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}

/**
 * Import multiple route schedules from CSV
 */
export async function importRouteSchedulesFromCSV(schedules: RouteSchedule[]): Promise<{ success: boolean; imported: number; errors: string[] }> {
  const errors: string[] = [];
  let imported = 0;

  for (const schedule of schedules) {
    const result = await saveRouteSchedule(schedule);
    if (result.success) {
      imported++;
    } else {
      errors.push(`Placa ${schedule.plate}: ${result.error}`);
    }
  }

  return {
    success: errors.length === 0,
    imported,
    errors
  };
}

/**
 * Get route schedules with optional filters
 */
export async function getRouteSchedules(filters?: {
  plate?: string;
  contract?: string;
  date?: string;
  status?: string;
}): Promise<{ success: boolean; data?: RouteSchedule[]; error?: string }> {
  try {
    let query = supabase
      .from('route_schedules')
      .select('*')
      .order('scheduled_date', { ascending: false })
      .order('scheduled_start_time', { ascending: true });

    if (filters?.plate) {
      query = query.eq('plate', filters.plate);
    }
    if (filters?.contract) {
      query = query.eq('contract', filters.contract);
    }
    if (filters?.date) {
      query = query.eq('scheduled_date', filters.date);
    }
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[TowerControl] Error fetching route schedules:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data: data || [] };
  } catch (error: any) {
    console.error('[TowerControl] Exception fetching route schedules:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}

/**
 * Update route schedule status and actual times
 */
export async function updateRouteSchedule(
  id: string,
  updates: Partial<RouteSchedule>
): Promise<{ success: boolean; data?: RouteSchedule; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('route_schedules')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[TowerControl] Error updating route schedule:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (error: any) {
    console.error('[TowerControl] Exception updating route schedule:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}

// =====================================================
// PREOPERATIONAL INSPECTIONS
// =====================================================

/**
 * Import inspections to database from API response
 */
export async function importInspectionsToDatabase(inspections: any[]): Promise<{ success: boolean; imported: number; errors: string[] }> {
  const errors: string[] = [];
  let imported = 0;

  try {
    // Convert inspections to database format
    const dbInspections: PreoperationalInspection[] = inspections.map(inspection => ({
      inspection_key: inspection.llave,
      plate: inspection.matricula,
      inspection_date: parseInspectionDate(inspection.fecha),
      inspection_datetime: parseInspectionDateTime(inspection.fechaHoraInspeccion),
      day_of_week: inspection.dia,
      start_time: parseTime(inspection.horaInicio),
      start_location: inspection.lugarInicio,
      end_time: parseTime(inspection.horaFin),
      driver: inspection.conductor,
      findings_count: inspection.numHallazgos || 0,
      status: inspection.estado,
      contract: inspection.contrato,
      vehicle_type: inspection.tipoVehiculo,
      raw_data: inspection
    }));

    // Batch insert (upsert based on plate + inspection_date)
    for (const inspection of dbInspections) {
      try {
        // Check if already exists
        const { data: existing } = await supabase
          .from('preoperational_inspections')
          .select('id')
          .eq('plate', inspection.plate)
          .eq('inspection_date', inspection.inspection_date)
          .single();

        if (existing) {
          // Update existing
          const { error } = await supabase
            .from('preoperational_inspections')
            .update(inspection)
            .eq('id', existing.id);

          if (error) {
            errors.push(`Error actualizando ${inspection.plate}: ${error.message}`);
          } else {
            imported++;
          }
        } else {
          // Insert new
          const { error } = await supabase
            .from('preoperational_inspections')
            .insert(inspection);

          if (error) {
            errors.push(`Error insertando ${inspection.plate}: ${error.message}`);
          } else {
            imported++;
          }
        }
      } catch (err: any) {
        errors.push(`Excepción ${inspection.plate}: ${err.message}`);
      }
    }

    return {
      success: errors.length === 0,
      imported,
      errors
    };
  } catch (error: any) {
    console.error('[TowerControl] Exception importing inspections:', error);
    return {
      success: false,
      imported: 0,
      errors: [error.message || 'Error desconocido']
    };
  }
}

/**
 * Get inspections by date
 */
export async function getInspectionsByDate(date: string): Promise<{ success: boolean; data?: PreoperationalInspection[]; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('preoperational_inspections')
      .select('*')
      .eq('inspection_date', date)
      .order('plate', { ascending: true });

    if (error) {
      console.error('[TowerControl] Error fetching inspections:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data: data || [] };
  } catch (error: any) {
    console.error('[TowerControl] Exception fetching inspections:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}

/**
 * Get inspections by contract
 */
export async function getInspectionsByContract(contract: string, startDate?: string, endDate?: string): Promise<{ success: boolean; data?: PreoperationalInspection[]; error?: string }> {
  try {
    let query = supabase
      .from('preoperational_inspections')
      .select('*')
      .eq('contract', contract)
      .order('inspection_date', { ascending: false });

    if (startDate) {
      query = query.gte('inspection_date', startDate);
    }
    if (endDate) {
      query = query.lte('inspection_date', endDate);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[TowerControl] Error fetching inspections by contract:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data: data || [] };
  } catch (error: any) {
    console.error('[TowerControl] Exception fetching inspections by contract:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}

/**
 * Get inspection summary (uses database view)
 */
export async function getInspectionSummary(filters?: {
  startDate?: string;
  endDate?: string;
  contract?: string;
}): Promise<{ success: boolean; data?: InspectionSummary[]; error?: string }> {
  try {
    let query = supabase
      .from('inspection_summary')
      .select('*');

    if (filters?.startDate) {
      query = query.gte('inspection_date', filters.startDate);
    }
    if (filters?.endDate) {
      query = query.lte('inspection_date', filters.endDate);
    }
    if (filters?.contract) {
      query = query.eq('contract', filters.contract);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[TowerControl] Error fetching inspection summary:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data: data || [] };
  } catch (error: any) {
    console.error('[TowerControl] Exception fetching inspection summary:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}

/**
 * Cross-check inspections with ignition events
 * Returns vehicles that turned on ignition but didn't have inspection
 */
export async function crossInspectionsWithIgnition(date: string): Promise<{ success: boolean; data?: InspectionCrossCheck[]; error?: string }> {
  try {
    // Get all ignition_on events for the date
    const { data: ignitionEvents, error: ignitionError } = await supabase
      .from('vehicle_ignition_events')
      .select('*')
      .eq('event_type', 'ignition_on')
      .gte('event_datetime', `${date}T00:00:00`)
      .lte('event_datetime', `${date}T23:59:59`)
      .order('event_datetime', { ascending: true });

    if (ignitionError) {
      return { success: false, error: ignitionError.message };
    }

    // Get all inspections for the date
    const { data: inspections, error: inspectionError } = await supabase
      .from('preoperational_inspections')
      .select('*')
      .eq('inspection_date', date);

    if (inspectionError) {
      return { success: false, error: inspectionError.message };
    }

    // Create lookup map for inspections
    const inspectionMap = new Map<string, PreoperationalInspection>();
    (inspections || []).forEach(inspection => {
      inspectionMap.set(inspection.plate, inspection);
    });

    // Cross-check
    const results: InspectionCrossCheck[] = [];

    for (const ignition of (ignitionEvents || [])) {
      const inspection = inspectionMap.get(ignition.plate);

      let status: 'OK' | 'Sin inspección' | 'Fuera de tiempo' = 'Sin inspección';

      if (inspection) {
        // Check if inspection was done before ignition
        if (inspection.inspection_datetime && new Date(inspection.inspection_datetime) < new Date(ignition.event_datetime)) {
          status = 'OK';
        } else {
          status = 'Fuera de tiempo';
        }
      }

      results.push({
        plate: ignition.plate,
        ignition_time: ignition.event_datetime,
        inspection_time: inspection?.inspection_datetime,
        status,
        driver: ignition.driver || inspection?.driver,
        contract: inspection?.contract
      });
    }

    return { success: true, data: results };
  } catch (error: any) {
    console.error('[TowerControl] Exception cross-checking inspections:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}

// =====================================================
// VEHICLE IGNITION EVENTS
// =====================================================

/**
 * Save ignition event
 */
export async function saveIgnitionEvent(event: VehicleIgnitionEvent): Promise<{ success: boolean; data?: VehicleIgnitionEvent; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('vehicle_ignition_events')
      .insert(event)
      .select()
      .single();

    if (error) {
      console.error('[TowerControl] Error saving ignition event:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (error: any) {
    console.error('[TowerControl] Exception saving ignition event:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}

/**
 * Get ignition events for a vehicle on a specific date
 */
export async function getIgnitionEvents(plate: string, date: string): Promise<{ success: boolean; data?: VehicleIgnitionEvent[]; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('vehicle_ignition_events')
      .select('*')
      .eq('plate', plate)
      .gte('event_datetime', `${date}T00:00:00`)
      .lte('event_datetime', `${date}T23:59:59`)
      .order('event_datetime', { ascending: true });

    if (error) {
      console.error('[TowerControl] Error fetching ignition events:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data: data || [] };
  } catch (error: any) {
    console.error('[TowerControl] Exception fetching ignition events:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}

// =====================================================
// IDLE TIME RECORDS
// =====================================================

/**
 * Save idle time record
 */
export async function saveIdleTimeRecord(record: IdleTimeRecord): Promise<{ success: boolean; data?: IdleTimeRecord; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('idle_time_records')
      .insert(record)
      .select()
      .single();

    if (error) {
      console.error('[TowerControl] Error saving idle time record:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (error: any) {
    console.error('[TowerControl] Exception saving idle time record:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}

/**
 * Get idle time records for a vehicle
 */
export async function getIdleTimeByVehicle(plate: string, startDate?: string, endDate?: string): Promise<{ success: boolean; data?: IdleTimeRecord[]; error?: string }> {
  try {
    let query = supabase
      .from('idle_time_records')
      .select('*')
      .eq('plate', plate)
      .order('start_datetime', { ascending: false });

    if (startDate) {
      query = query.gte('start_datetime', startDate);
    }
    if (endDate) {
      query = query.lte('start_datetime', endDate);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[TowerControl] Error fetching idle time records:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data: data || [] };
  } catch (error: any) {
    console.error('[TowerControl] Exception fetching idle time records:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}

/**
 * Get idle time statistics by contract
 */
export async function getIdleTimeByContract(contract: string, startDate?: string, endDate?: string): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    let query = supabase
      .from('idle_time_records')
      .select('*')
      .eq('contract', contract)
      .order('duration_minutes', { ascending: false });

    if (startDate) {
      query = query.gte('start_datetime', startDate);
    }
    if (endDate) {
      query = query.lte('start_datetime', endDate);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[TowerControl] Error fetching idle time by contract:', error);
      return { success: false, error: error.message };
    }

    // Calculate statistics
    const records = data || [];
    const totalMinutes = records.reduce((sum, r) => sum + (r.duration_minutes || 0), 0);
    const totalHours = totalMinutes / 60;
    const vehicleSet = new Set(records.map(r => r.plate));

    return {
      success: true,
      data: {
        totalRecords: records.length,
        totalMinutes,
        totalHours: Math.round(totalHours * 100) / 100,
        vehicleCount: vehicleSet.size,
        records
      }
    };
  } catch (error: any) {
    console.error('[TowerControl] Exception fetching idle time by contract:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

/**
 * Parse date from Excel format (DD/MM/YYYY) to YYYY-MM-DD
 */
function parseInspectionDate(dateStr: string): string {
  if (!dateStr) return new Date().toISOString().split('T')[0];

  try {
    // Try DD/MM/YYYY format
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      const day = parts[0].padStart(2, '0');
      const month = parts[1].padStart(2, '0');
      const year = parts[2];
      return `${year}-${month}-${day}`;
    }

    // Fallback to current date
    return new Date().toISOString().split('T')[0];
  } catch (error) {
    console.error('[TowerControl] Error parsing date:', dateStr, error);
    return new Date().toISOString().split('T')[0];
  }
}

/**
 * Parse datetime from Excel format to ISO format
 */
function parseInspectionDateTime(dateTimeStr: string): string | undefined {
  if (!dateTimeStr) return undefined;

  try {
    // Assuming format: DD/MM/YYYY HH:MM
    const [datePart, timePart] = dateTimeStr.split(' ');
    if (!datePart || !timePart) return undefined;

    const date = parseInspectionDate(datePart);
    return `${date}T${timePart}:00`;
  } catch (error) {
    console.error('[TowerControl] Error parsing datetime:', dateTimeStr, error);
    return undefined;
  }
}

/**
 * Parse time from various formats to HH:MM:SS
 */
function parseTime(timeStr: string): string | undefined {
  if (!timeStr) return undefined;

  try {
    // If already in HH:MM or HH:MM:SS format
    if (timeStr.match(/^\d{1,2}:\d{2}(:\d{2})?$/)) {
      const parts = timeStr.split(':');
      const hours = parts[0].padStart(2, '0');
      const minutes = parts[1].padStart(2, '0');
      const seconds = parts[2] ? parts[2].padStart(2, '0') : '00';
      return `${hours}:${minutes}:${seconds}`;
    }

    return undefined;
  } catch (error) {
    console.error('[TowerControl] Error parsing time:', timeStr, error);
    return undefined;
  }
}
