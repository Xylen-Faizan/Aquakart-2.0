import { supabase } from '../lib/supabase/client';

export interface TodayStats {
  deliveries_due: number;
  jars_required: number;
  expected_revenue: number;
  deliveries_done: number;
  billed_today: number;
  collected_today: number;
  outstanding_total: number;
}

export interface TodayManifestItem {
  customer_id: string;
  customer_name: string;
  customer_type: string;
  phone: string;
  address: string | null;
  sector: string | null;
  supplier_product_id: string;
  quantity: number;
  effective_unit_price: number;
  expected_amount: number;
  jar_balance_before: number;
  next_delivery_date: string;
}

export const DashboardService = {
  async getTodayStats(): Promise<TodayStats> {
    const { data, error } = await supabase.rpc('get_supplier_today');
    if (error) throw error;
    return data as unknown as TodayStats;
  },

  async getTodayManifest(): Promise<TodayManifestItem[]> {
    const { data, error } = await supabase.rpc('get_today_manifest');
    if (error) throw error;
    return (data || []) as unknown as TodayManifestItem[];
  },

  async completeDelivery(params: {
    customerId: string;
    supplierProductId: string;
    quantity: number;
    jarsDelivered: number;
    jarsReturned: number;
    amountCollected: number;
    paymentMethod: string;
  }): Promise<string> {
    const idempotencyKey = crypto.randomUUID();
    const { data, error } = await supabase.rpc('complete_delivery', {
      p_customer_id: params.customerId,
      p_supplier_product_id: params.supplierProductId,
      p_quantity: params.quantity,
      p_jars_delivered: params.jarsDelivered,
      p_jars_returned: params.jarsReturned,
      p_amount_collected: params.amountCollected,
      p_payment_method: params.paymentMethod,
      p_idempotency_key: idempotencyKey
    });

    if (error) throw error;
    return data as unknown as string;
  }
};
