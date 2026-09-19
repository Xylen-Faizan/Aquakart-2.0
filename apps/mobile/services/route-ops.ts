import { supabase } from '../lib/supabase/client';

export const routeOpsService = {
  // Fleet Management
  async getVehicles(supplierId: string) {
    const { data, error } = await supabase
      .from('vehicles')
      .select('*')
      .eq('supplier_id', supplierId)
      .eq('is_active', true)
      .order('vehicle_number');
    if (error) throw error;
    return data;
  },

  async addVehicle(supplierId: string, vehicleNumber: string, vehicleType: string = 'truck') {
    const { data, error } = await supabase
      .from('vehicles')
      .insert({ supplier_id: supplierId, vehicle_number: vehicleNumber, vehicle_type: vehicleType })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // Driver Management
  async getDrivers(supplierId: string) {
    const { data, error } = await supabase
      .from('drivers')
      .select(`
        id, 
        supplier_id, 
        profile_id, 
        is_active,
        profiles:profile_id (
          full_name,
          phone
        )
      `)
      .eq('supplier_id', supplierId)
      .eq('is_active', true);
    if (error) throw error;
    return data;
  },

  async addDriver(supplierId: string, profileId: string) {
    const { data, error } = await supabase
      .from('drivers')
      .insert({ supplier_id: supplierId, profile_id: profileId })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // Route Planning
  async generateDailyRun(supplierId: string, runDate: string, vehicleId: string, driverId: string, scheduleIds: string[], helperId?: string) {
    const { data, error } = await supabase.rpc('generate_daily_run', {
      p_supplier_id: supplierId,
      p_run_date: runDate,
      p_vehicle_id: vehicleId,
      p_driver_id: driverId,
      p_schedule_ids: scheduleIds,
      p_helper_id: helperId || null,
    });
    if (error) throw error;
    return data; // Returns the generated run_id
  },

  async getRuns(supplierId: string, runDate: string) {
    const { data, error } = await supabase
      .from('delivery_runs')
      .select(`
        *,
        vehicles(vehicle_number),
        drivers(profiles(full_name)),
        delivery_run_stops(id, status)
      `)
      .eq('supplier_id', supplierId)
      .eq('run_date', runDate)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },

  async getDriverRuns(driverProfileId: string, runDate: string) {
    const { data: driver, error: driverError } = await supabase
      .from('drivers')
      .select('id')
      .eq('profile_id', driverProfileId)
      .single();
      
    if (driverError || !driver) throw new Error('Driver not found');

    const { data, error } = await supabase
      .from('delivery_runs')
      .select(`
        *,
        vehicles(vehicle_number)
      `)
      .eq('driver_id', driver.id)
      .eq('run_date', runDate)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },

  async getRunStops(runId: string) {
    const { data, error } = await supabase
      .from('delivery_run_stops')
      .select(`
        *,
        profiles:customer_id (full_name, phone),
        addresses (street, city, zip),
        products (name, size, unit)
      `)
      .eq('run_id', runId)
      .order('sequence_number', { ascending: true });
    if (error) throw error;
    return data;
  },

  // Route Execution
  async startRun(runId: string) {
    const { error } = await supabase
      .from('delivery_runs')
      .update({ status: 'in_progress', started_at: new Date().toISOString() })
      .eq('id', runId);
    if (error) throw error;
  },

  async completeRun(runId: string) {
    const { error } = await supabase
      .from('delivery_runs')
      .update({ status: 'completed', ended_at: new Date().toISOString() })
      .eq('id', runId);
    if (error) throw error;
  },

  async updateStopStatus(stopId: string, status: 'planned' | 'en_route' | 'skipped' | 'delivered', skipReason?: string) {
    const { error } = await supabase.rpc('update_stop_status', {
      p_stop_id: stopId,
      p_status: status,
      p_skip_reason: skipReason || null,
    });
    if (error) throw error;
  },
};
