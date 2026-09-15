import { supabase } from '../lib/supabase/client';
import type { AvailableSupplier, Supplier, SupplierProduct } from '@aquakart/types';

export const SupplierService = {
  async getAvailableSuppliers(lat?: number, lng?: number) {
    const { data, error } = await supabase
      .rpc('get_available_suppliers', {
        p_lat: lat || null,
        p_lng: lng || null,
      });

    if (error) throw error;
    return data as AvailableSupplier[];
  },

  async getSupplierDetails(supplierId: string) {
    const { data: supplier, error: supplierError } = await supabase
      .from('suppliers')
      .select('*')
      .eq('id', supplierId)
      .single();

    if (supplierError) throw supplierError;

    const { data: products, error: productsError } = await supabase
      .from('supplier_products')
      .select(`
        *,
        products:product_id (*)
      `)
      .eq('supplier_id', supplierId)
      .eq('available', true);

    if (productsError) throw productsError;

    return {
      supplier: supplier as Supplier,
      products: products as any[], // Typing simplified for now
    };
  },

  async getOwnProfile() {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;

    if (!userId) return null;

    const { data: supplier, error: supplierError } = await supabase
      .from('suppliers')
      .select('*')
      .eq('profile_id', userId)
      .single();

    if (supplierError && supplierError.code !== 'PGRST116') {
      throw supplierError;
    }

    if (!supplier) return null;

    const { data: products, error: productsError } = await supabase
      .from('supplier_products')
      .select('*')
      .eq('supplier_id', supplier.id);

    if (productsError) throw productsError;

    return { supplier: supplier as Supplier, products };
  },

  async updateProfile(updates: {
    business_name?: string;
    description?: string;
    phone?: string;
    address?: string;
    latitude?: number;
    longitude?: number;
    is_accepting_orders?: boolean;
  }) {
    const { error } = await supabase.rpc('update_supplier_profile', {
      p_business_name: updates.business_name,
      p_description: updates.description,
      p_phone: updates.phone,
      p_address: updates.address,
      p_lat: updates.latitude,
      p_lng: updates.longitude,
      p_is_accepting_orders: updates.is_accepting_orders,
    });
    if (error) throw error;
  },

  async setProduct(productId: string, price: number, available: boolean) {
    const { error } = await supabase.rpc('set_supplier_product', {
      p_product_id: productId,
      p_price: price,
      p_available: available,
    });
    if (error) throw error;
  },

  async getProducts() {
    const { data, error } = await supabase.from('products').select('*');
    if (error) throw error;
    return data;
  }
};
