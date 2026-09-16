import { supabase } from '../lib/supabase/client';

export interface DeliveryManifestItem {
  schedule_id: string;
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  address: string | null;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  next_delivery_date: string;
}

export const DeliveryService = {
  async getTodayManifest(): Promise<DeliveryManifestItem[]> {
    const { data, error } = await supabase.rpc('get_today_manifest');
    if (error) throw error;
    return data as DeliveryManifestItem[];
  },

  async completeDelivery(params: {
    customerId: string;
    productId: string;
    quantity: number;
    jarsDelivered: number;
    jarsReturned: number;
    amountCollected: number;
    paymentMethod?: string;
  }): Promise<void> {
    const { error } = await supabase.rpc('complete_delivery', {
      p_customer_id: params.customerId,
      p_supplier_product_id: params.productId,
      p_quantity: params.quantity,
      p_jars_delivered: params.jarsDelivered,
      p_jars_returned: params.jarsReturned,
      p_amount_collected: params.amountCollected,
      p_payment_method: params.paymentMethod || 'cash',
    });

    if (error) throw error;
  }
};
