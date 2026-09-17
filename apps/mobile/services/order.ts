import { supabase } from '../lib/supabase/client';
import type { OrderWithItems, PlaceOrderParams } from '@aquakart/types';
import * as Crypto from 'expo-crypto';

export const OrderService = {
  async placeOrder(params: PlaceOrderParams) {
    const idempotencyKey = Crypto.randomUUID();
    const { data: orderId, error } = await supabase
      .rpc('place_order', {
        p_supplier_id: params.supplier_id,
        p_address_id: params.delivery_address_id,
        p_product_id: params.items[0].product_id,
        p_quantity: params.items[0].quantity,
        p_payment_method: 'cash', // Hardcoded for MVP since checkout sets it
        p_idempotency_key: idempotencyKey
      });

    if (error) throw error;
    return orderId as string;
  },

  async getMyOrders() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        supplier:supplier_id (business_name, phone),
        order_items (*)
      `)
      .eq('customer_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data as any[];
  },

  async getOrderDetails(orderId: string) {
    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        supplier:supplier_id (business_name, phone, address),
        address:address_id (*),
        order_items (*),
        history:order_status_history (*)
      `)
      .eq('id', orderId)
      .single();

    if (error) throw error;
    return data as any;
  }
};
