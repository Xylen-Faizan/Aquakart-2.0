import { supabase } from '../lib/supabase/client';
import { SupplierService } from './supplier';

export const SupplierOrderService = {
  async getAssignedOrders() {
    const supplier = await SupplierService.getCurrentSupplier();

    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        customer:profiles(name, phone),
        address:addresses(label, address),
        order_items (*)
      `)
      .eq('supplier_id', supplier.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async getOrderDetails(orderId: string) {
    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        customer:profiles(name, phone),
        address:addresses(*),
        order_items (*),
        history:order_status_history (*)
      `)
      .eq('id', orderId)
      .single();

    if (error) throw error;
    if (data) {
      if (Array.isArray(data.customer)) data.customer = data.customer[0];
      if (Array.isArray(data.address)) data.address = data.address[0];
    }
    return data;
  },

  async acceptOrder(orderId: string) {
    const { error } = await supabase.rpc('accept_order', { p_order_id: orderId });
    if (error) throw error;
  },

  async rejectOrder(orderId: string, reason: string) {
    const { error } = await supabase.rpc('reject_order', { p_order_id: orderId, p_reason: reason });
    if (error) throw error;
  },

  async updateOrderStatus(orderId: string, newStatus: string) {
    const { error } = await supabase.rpc('update_order_status', { p_order_id: orderId, p_new_status: newStatus });
    if (error) throw error;
  }
};
