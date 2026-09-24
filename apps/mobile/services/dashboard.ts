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

export interface SupplierAlert {
  id: string;
  title: string;
  body: string;
  notification_type: string;
  created_at: string;
}

export const DashboardService = {
  getSupplierAlerts: async (): Promise<SupplierAlert[]> => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) return [];

    const { data, error } = await supabase
      .from("delivery_notifications")
      .select("id, title, body, notification_type, created_at")
      .eq("user_id", userData.user.id)
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) {
      console.error("Failed to fetch alerts:", error);
      return [];
    }

    return data || [];
  },
  async getForecast(): Promise<SupplierForecast> {
    const { data, error } = await supabase.rpc('get_supplier_forecast');
    if (error) throw error;
    // Assuming it returns an array of 1 since we query for current supplier
    return data[0] as unknown as SupplierForecast;
  },

  async getTodayStats(): Promise<TodayStats> {
    const { data, error } = await supabase.rpc('get_supplier_today');
    if (error) throw error;
    // RPC returning TABLE returns an array. We just need the first row.
    return (Array.isArray(data) ? data[0] : data) as unknown as TodayStats;
  },
  async getTodayManifest(): Promise<TodayManifestItem[]> {
    const { data, error } = await supabase.rpc('get_today_manifest');
    if (error) throw error;
    const items = (data || []) as unknown as TodayManifestItem[];
    // Sort items so 'placed' (new orders) are at the top, then accepted, then scheduled
    const statusWeight: Record<string, number> = {
      'placed': 0,
      'accepted': 1,
      'preparing': 2,
      'out_for_delivery': 3,
      'scheduled': 4,
    };
    return items.sort((a, b) => {
      const weightA = statusWeight[a.status] ?? 99;
      const weightB = statusWeight[b.status] ?? 99;
      if (weightA !== weightB) {
        return weightA - weightB;
      }
      // If same status, sort by newest first (created_at DESC)
      const dateA = new Date((a as any).created_at || 0).getTime();
      const dateB = new Date((b as any).created_at || 0).getTime();
      return dateB - dateA;
    });
  },

  async getCapacity(): Promise<number> {
    const { data, error } = await supabase.rpc('get_supplier_current_capacity');
    if (error) throw error;
    return data as number;
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

  async rejectOrder(orderId: string, reason: string = 'Rejected by supplier'): Promise<void> {
    const { error } = await supabase.rpc('reject_order', {
      p_order_id: orderId,
      p_reason: reason
    });
    if (error) throw error;
  },

  async notifyArrival(orderId: string): Promise<void> {
    const { error } = await supabase.rpc('notify_customer_arrival_by_order', {
      p_order_id: orderId
    });
    if (error) throw error;
  }
};
