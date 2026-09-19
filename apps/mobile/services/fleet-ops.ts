import { supabase } from '../lib/supabase/client';

export const fleetOpsService = {
  // Helper Management
  async getHelpers(supplierId: string) {
    const { data, error } = await supabase
      .from('helpers')
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

  // Generate helper invitation code
  async generateHelperInvite(supplierId: string) {
    const { data, error } = await supabase.rpc('generate_helper_invite', {
      p_supplier_id: supplierId,
    });
    if (error) throw error;
    return data; // Returns the 6-char code
  },

  // Generate driver invitation code
  async generateDriverInvite(supplierId: string) {
    const { data, error } = await supabase.rpc('generate_driver_invite', {
      p_supplier_id: supplierId,
    });
    if (error) throw error;
    return data;
  },

  // Assign full crew (vehicle + driver + helper) for a date
  async assignCrew(
    supplierId: string,
    vehicleId: string,
    driverId: string,
    helperId: string,
    assignmentDate: string
  ) {
    const { data, error } = await supabase
      .from('vehicle_assignments')
      .insert({
        supplier_id: supplierId,
        vehicle_id: vehicleId,
        driver_id: driverId,
        helper_id: helperId,
        assignment_date: assignmentDate,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // Get fleet live state (all active vehicles for a supplier)
  async getFleetLiveState(supplierId: string) {
    const { data, error } = await supabase
      .from('delivery_runs')
      .select(`
        id,
        vehicle_id,
        driver_id,
        helper_id,
        run_date,
        status,
        started_at,
        vehicles (vehicle_number),
        drivers (profiles (full_name)),
        helpers (profiles (full_name)),
        delivery_run_live_state (
          latitude, longitude, speed, heading, accuracy_m,
          captured_at, current_stop_id, eta_minutes
        ),
        delivery_run_stops (id, status, stop_type)
      `)
      .eq('supplier_id', supplierId)
      .in('status', ['in_progress', 'loading', 'planned'])
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },

  // Get capacity state for a run
  async getCapacityState(runId: string) {
    const { data, error } = await supabase.rpc('get_vehicle_capacity_state', {
      p_run_id: runId,
    });
    if (error) throw error;
    return data;
  },

  // Get offers for supplier's runs
  async getSupplierOffers(supplierId: string) {
    const { data, error } = await supabase
      .from('delivery_offers')
      .select(`
        *,
        vehicles (vehicle_number),
        order_dispatch_requests (
          customer_id,
          product_id,
          quantity,
          profiles:customer_id (full_name),
          products:product_id (name),
          addresses:address_id (street, city, sector)
        )
      `)
      .eq('supplier_id', supplierId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },

  // Accept offer from supplier dashboard
  async acceptOffer(offerId: string) {
    const { data, error } = await supabase.rpc('accept_delivery_offer', {
      p_offer_id: offerId,
    });
    if (error) throw error;
    return data;
  },

  // Decline offer
  async declineOffer(offerId: string) {
    const { error } = await supabase.rpc('decline_delivery_offer', {
      p_offer_id: offerId,
    });
    if (error) throw error;
  },
};
