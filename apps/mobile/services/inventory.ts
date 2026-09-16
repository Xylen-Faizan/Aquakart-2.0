import { supabase } from '../lib/supabase/client';

export interface InventoryStats {
  owned: number;
  available: number;
  with_customers: number;
  damaged: number;
  missing: number;
}

export interface JarActivity {
  id: string;
  customer_name: string;
  jars_delivered: number;
  jars_returned: number;
  created_at: string;
}

export const InventoryService = {
  async getStats(): Promise<InventoryStats> {
    const { data, error } = await supabase.rpc('get_supplier_inventory_stats');
    if (error) throw error;
    return data as InventoryStats;
  },

  async getActivity(limit = 20): Promise<JarActivity[]> {
    const { data, error } = await supabase.rpc('get_jar_activity', { p_limit: limit });
    if (error) throw error;
    return data as JarActivity[];
  },

  async recordManualAdjustment(params: {
    customerId: string;
    jarsDelivered: number;
    jarsReturned: number;
  }): Promise<void> {
    const { error } = await supabase.rpc('record_manual_jar_adjustment', {
      p_customer_id: params.customerId,
      p_jars_delivered: params.jarsDelivered,
      p_jars_returned: params.jarsReturned,
    });
    if (error) throw error;
  },

  async recordPurchase(quantity: number): Promise<void> {
    const { error } = await supabase.rpc('record_inventory_purchase', {
      p_quantity: quantity,
      p_unit_price: 0,
    });
    if (error) throw error;
  }
};
