import type { Database } from './database';

export type Address = Database['public']['Tables']['addresses']['Row'];
export type AddressInput = Database['public']['Tables']['addresses']['Insert'];

export type OrderStatus = 'placed' | 'pending' | 'accepted' | 'preparing' | 'out_for_delivery' | 'delivered' | 'cancelled' | 'rejected';
export type PaymentMethod = 'cash' | 'upi' | 'card' | 'ledger' | string;

export type Order = Database['public']['Tables']['orders']['Row'];
export type OrderItem = Database['public']['Tables']['order_items']['Row'];
export type OrderWithItems = Order & { items: OrderItem[] };

export type Supplier = Database['public']['Tables']['suppliers']['Row'];
export type SupplierProduct = Database['public']['Tables']['supplier_products']['Row'] & {
  products: Database['public']['Tables']['products']['Row'];
};

export type AvailableSupplier = Supplier & {
  distance?: number;
  capacity?: { available: number };
  products?: SupplierProduct[];
};

export type PlaceOrderParams = {
  supplier_id: string;
  items: { product_id: string; quantity: number }[];
  delivery_address_id: string;
};
