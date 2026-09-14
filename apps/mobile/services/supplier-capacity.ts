import { supabase } from '../lib/supabase/client';

export const SupplierCapacityService = {
  async getTodayCapacity() {
    const today = new Date().toISOString().split('T')[0];
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data: supplier } = await supabase
      .from('suppliers')
      .select('id')
      .eq('profile_id', user.id)
      .single();

    if (!supplier) throw new Error('Supplier profile not found');

    const { data, error } = await supabase
      .from('supplier_capacity_view')
      .select('*')
      .eq('supplier_id', supplier.id)
      .eq('date', today)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // Ignore not found error
    return data;
  },

  async setCapacity(maxCapacity: number) {
    const today = new Date().toISOString().split('T')[0];
    const { error } = await supabase.rpc('set_supplier_capacity', {
      p_date: today,
      p_max_capacity: maxCapacity
    });

    if (error) throw error;
  },
  
  async toggleAcceptingOrders(isAccepting: boolean) {
    const { error } = await supabase.rpc('update_supplier_profile', {
      p_is_accepting_orders: isAccepting
    });
    if (error) throw error;
  }
};
