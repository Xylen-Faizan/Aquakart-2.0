import { supabase } from '../lib/supabase/client';
import type { OrderWithItems, PlaceOrderParams } from '@aquakart/types';
import * as Crypto from 'expo-crypto';

export const OrderService = {
  async notifySupplier(supplierId: string, quantity: number) {
    try {
      // 1. Get the supplier's user profile ID
      const { data: supplier } = await supabase
        .from('suppliers')
        .select('profile_id')
        .eq('id', supplierId)
        .single();
      
      if (!supplier?.profile_id) return;

      // 2. Get their push token
      const { data: profile } = await supabase
        .from('profiles')
        .select('expo_push_token')
        .eq('id', supplier.profile_id)
        .single();
      
      const token = profile?.expo_push_token;
      if (!token) return;

      // 3. Get customer info for the message
      const { data: { user } } = await supabase.auth.getUser();
      const { data: customerProfile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user?.id)
        .single();
      
      const customerName = customerProfile?.full_name || 'A customer';

      // 4. Send Expo Push Notification
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: token,
          sound: 'default',
          title: 'New Order Received! 💧',
          body: `${customerName} just ordered ${quantity} jar(s).`,
          data: { route: '/(supplier)/today' },
        }),
      });
    } catch (error) {
      console.error("Failed to notify supplier:", error);
    }
  },

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

    // Fire and forget notification
    this.notifySupplier(params.supplier_id, params.items[0].quantity).catch(console.error);

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
