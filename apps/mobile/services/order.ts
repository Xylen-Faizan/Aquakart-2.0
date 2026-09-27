import { supabase } from '../lib/supabase/client';
import type { OrderWithItems, PlaceOrderParams } from '@aquakart/types';
import * as Crypto from 'expo-crypto';

export const OrderService = {


  async placeOrder(params: PlaceOrderParams & { payment_method?: string }) {
    const idempotencyKey = Crypto.randomUUID();
    const { data: orderId, error } = await supabase
      .rpc('place_order', {
        p_supplier_id: params.supplier_id,
        p_address_id: params.delivery_address_id,
        p_product_id: params.items[0].product_id,
        p_quantity: params.items[0].quantity,
        p_payment_method: params.payment_method || 'cash',
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
        order_items (*, product:product_id(name, category))
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
        order_items (*, product:product_id(name, category)),
        history:order_status_history (*)
      `)
      .eq('id', orderId)
      .single();

    if (error) throw error;
    return data as any;
  },

  async getReviewableDeliveries() {
    const { data, error } = await supabase.rpc('get_reviewable_deliveries');
    if (error) throw error;
    return data as {
      delivery_id: string;
      order_id: string;
      supplier_id: string;
      supplier_name: string;
      delivery_date: string;
    }[];
  },

  async submitSupplierReview(deliveryId: string, rating: number, comment?: string) {
    const { data, error } = await supabase.rpc('submit_supplier_review', {
      p_delivery_id: deliveryId,
      p_rating: rating,
      p_comment: comment || null
    });
    if (error) throw error;
    return data;
  }
};
