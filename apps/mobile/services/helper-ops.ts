import { supabase } from '../lib/supabase/client';

export const helperOpsService = {
  // Get helper's run for today
  async getHelperRun(helperProfileId: string, runDate: string) {
    const { data: helper, error: helperError } = await supabase
      .from('helpers')
      .select('id')
      .eq('profile_id', helperProfileId)
      .single();

    if (helperError || !helper) throw new Error('Helper not found');

    const { data, error } = await supabase
      .from('delivery_runs')
      .select(`
        *,
        vehicles(vehicle_number, vehicle_type),
        drivers(profiles(name, phone))
      `)
      .eq('helper_id', helper.id)
      .eq('run_date', runDate)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },

  // Get supplier products for load confirmation
  async getSupplierProducts(supplierId: string) {
    const { data, error } = await supabase
      .from('supplier_products')
      .select(`
        id,
        supplier_id,
        product_id,
        price,
        active,
        products (name, size, unit)
      `)
      .eq('supplier_id', supplierId)
      .eq('active', true);
    if (error) throw error;
    return data;
  },

  // Get run stops (both scheduled and opportunistic)
  async getRunStops(runId: string) {
    const { data, error } = await supabase
      .from('delivery_run_stops')
      .select(`
        *,
        profiles:customer_id (name, phone),
        addresses (street, city, zip, latitude, longitude),
        products (name, size, unit)
      `)
      .eq('run_id', runId)
      .order('sequence_number', { ascending: true });
    if (error) throw error;
    return data;
  },

  // Confirm vehicle load
  async confirmLoad(runId: string, productLoads: { supplier_product_id: string; quantity: number }[]) {
    const { error } = await supabase.rpc('confirm_run_load', {
      p_run_id: runId,
      p_product_loads: productLoads,
    });
    if (error) throw error;
  },

  // Get capacity state
  async getCapacityState(runId: string) {
    const { data, error } = await supabase.rpc('get_vehicle_capacity_state', {
      p_run_id: runId,
    });
    if (error) throw error;
    return data;
  },

  // Accept opportunity offer
  async acceptOffer(offerId: string) {
    const { data, error } = await supabase.rpc('accept_delivery_offer', {
      p_offer_id: offerId,
    });
    if (error) throw error;
    return data; // Returns the created order ID
  },

  // Decline opportunity offer
  async declineOffer(offerId: string, reasonCode: string = 'OTHER', reasonNote?: string) {
    const { error } = await supabase.rpc('decline_delivery_offer', {
      p_offer_id: offerId,
      p_reason_code: reasonCode,
      p_reason_note: reasonNote,
    });
    if (error) throw error;
  },

  // Get pending offers for a run
  async getOffers(runId: string) {
    const { data, error } = await supabase
      .from('delivery_offers')
      .select(`
        *,
        order_dispatch_requests (
          customer_id,
          product_id,
          quantity,
          profiles:customer_id (name),
          products:product_id (name),
          addresses:address_id (street, city, sector, latitude, longitude)
        )
      `)
      .eq('run_id', runId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },

  // Complete a stop
  async completeStop(stopId: string, actualQuantity?: number) {
    const { error } = await supabase.rpc('complete_delivery_run_stop', {
      p_stop_id: stopId,
      p_actual_quantity: actualQuantity || null,
    });
    if (error) throw error;
  },

  // Accept helper invitation
  async acceptInvite(inviteCode: string) {
    const { data, error } = await supabase.rpc('accept_helper_invite', {
      p_invite_code: inviteCode,
    });
    if (error) throw error;
    return data; // Returns the helper ID
  },
};
