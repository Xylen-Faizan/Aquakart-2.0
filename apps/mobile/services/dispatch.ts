import { supabase } from '../lib/supabase/client';

export const dispatchService = {
  // Create a dispatch request (customer on-demand order)
  async createDispatchRequest(addressId: string, productId: string, quantity: number) {
    const { data, error } = await supabase.rpc('create_dispatch_request', {
      p_address_id: addressId,
      p_product_id: productId,
      p_quantity: quantity,
    });
    if (error) throw error;
    return data; // Returns dispatch request ID
  },

  // Trigger vehicle search (can later move to Edge Function)
  async searchVehicles(requestId: string) {
    const { data, error } = await supabase.rpc('find_eligible_vehicles', {
      p_request_id: requestId,
    });
    if (error) throw error;
    return data; // Returns number of offers created
  },

  // Get dispatch request status
  async getDispatchRequest(requestId: string) {
    const { data, error } = await supabase
      .from('order_dispatch_requests')
      .select('*')
      .eq('id', requestId)
      .single();
    if (error) throw error;
    return data;
  },

  // Get order tracking state (customer-facing)
  async getTrackingState(orderId: string) {
    const { data, error } = await supabase.rpc('get_order_tracking_state', {
      p_order_id: orderId,
    });
    if (error) throw error;
    return data;
  },

  // Subscribe to dispatch request changes (realtime)
  subscribeToDispatchRequest(requestId: string, callback: (payload: any) => void) {
    return supabase
      .channel(`dispatch-${requestId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'order_dispatch_requests',
          filter: `id=eq.${requestId}`,
        },
        callback
      )
      .subscribe();
  },

  // Subscribe to live run state (for customer tracking)
  subscribeToLiveState(runId: string, callback: (payload: any) => void) {
    return supabase
      .channel(`live-state-${runId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'delivery_run_live_state',
          filter: `run_id=eq.${runId}`,
        },
        callback
      )
      .subscribe();
  },

  // Cancel dispatch request
  async cancelDispatchRequest(requestId: string) {
    const { error } = await supabase
      .from('order_dispatch_requests')
      .update({ status: 'cancelled' })
      .eq('id', requestId)
      .eq('customer_id', (await supabase.auth.getUser()).data.user?.id);
    if (error) throw error;
  },
};
