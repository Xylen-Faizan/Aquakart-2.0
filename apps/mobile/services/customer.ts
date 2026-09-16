import { supabase } from '../lib/supabase/client';

export type CustomerType = 'household' | 'office' | 'factory' | 'shop' | 'restaurant' | 'hostel' | 'hospital' | 'event' | 'other';

export interface SupplierCustomer {
  id: string;
  name: string;
  phone: string;
  customer_type: CustomerType;
  address: string | null;
  sector: string | null;
  is_active: boolean;
  active_price: number | null;
  jar_balance: number;
  next_due_date: string | null;
  outstanding_balance: number;
  last_delivery_at: string | null;
}

export const CustomerService = {
  async getCustomers(options?: {
    search?: string;
    customer_type?: CustomerType;
    limit?: number;
    offset?: number;
  }): Promise<SupplierCustomer[]> {
    const { data, error } = await supabase.rpc('get_supplier_customers', {
      p_search: options?.search || null,
      p_customer_type: options?.customer_type || null,
      p_limit: options?.limit || 50,
      p_offset: options?.offset || 0,
    });

    if (error) throw error;
    
    return data as SupplierCustomer[];
  },

  async addCustomer(params: {
    name: string;
    phone: string;
    customer_type?: CustomerType;
    address?: string;
    sector?: string;
    landmark?: string;
    notes?: string;
  }): Promise<string> {
    const { data, error } = await supabase.rpc('create_supplier_customer', {
      p_name: params.name,
      p_phone: params.phone,
      p_customer_type: params.customer_type || 'household',
      p_address: params.address || null,
      p_sector: params.sector || null,
      p_landmark: params.landmark || null,
      p_notes: params.notes || null,
    });

    if (error) throw error;
    
    return data as string;
  },

  async setCustomerPrice(params: {
    customerId: string;
    productId: string;
    price: number;
  }): Promise<void> {
    const { error } = await supabase.rpc('set_customer_price', {
      p_customer_id: params.customerId,
      p_supplier_product_id: params.productId,
      p_price: params.price,
    });

    if (error) throw error;
  },

  async setCustomerSchedule(params: {
    customerId: string;
    productId: string;
    quantity: number;
    intervalDays: number;
    firstDeliveryDate: string;
  }): Promise<void> {
    const { error } = await supabase.rpc('create_delivery_schedule', {
      p_customer_id: params.customerId,
      p_supplier_product_id: params.productId,
      p_quantity: params.quantity,
      p_interval_days: params.intervalDays,
      p_first_delivery_date: params.firstDeliveryDate,
    });

    if (error) throw error;
  }
};
