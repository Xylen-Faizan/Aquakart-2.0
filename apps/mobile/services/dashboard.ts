import { supabase } from '../lib/supabase/client';
import * as Crypto from 'expo-crypto';

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
  order_id: string;
  status: string;
}

export interface SupplierForecast {
  supplier_id: string;
  business_name: string;
  scheduled_demand: number;
  avg_marketplace_demand: number;
  total_forecast: number;
  current_inventory: number;
  shortfall: number;
  is_at_risk: boolean;
}

export const DashboardService = {
  async getForecast(): Promise<SupplierForecast> {
    const { data, error } = await supabase.rpc('get_supplier_forecast');
    if (error) throw error;
    // Assuming it returns an array of 1 since we query for current supplier
    return data[0] as unknown as SupplierForecast;
  },

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
    const idempotencyKey = Crypto.randomUUID();
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
  },

  async acceptOrder(orderId: string): Promise<void> {
    const { error } = await supabase.rpc('accept_order', {
      p_order_id: orderId
    });
    if (error) throw error;
  },

  async rejectOrder(orderId: string): Promise<void> {
    const { error } = await supabase.from('orders')
      .update({ status: 'cancelled' })
      .eq('id', orderId);
    if (error) throw error;
  }
};
