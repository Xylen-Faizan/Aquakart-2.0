export type {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  UserRole,
  AddressLabel
} from '@aquakart/config';

import { OrderStatus, PaymentMethod, PaymentStatus, UserRole, AddressLabel } from '@aquakart/config';

export interface Profile {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface Supplier {
  id: string;
  profile_id: string;
  business_name: string | null;
  description: string | null;
  phone: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  is_accepting_orders: boolean;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SupplierProduct {
  id: string;
  supplier_id: string;
  product_id: string;
  price: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SupplierCapacity {
  id: string;
  supplier_id: string;
  date: string;
  max_capacity: number;
  reserved_capacity: number;
  fulfilled_capacity: number;
  created_at: string;
  updated_at: string;
}

export interface SupplierCapacityView extends SupplierCapacity {
  available_quantity: number;
}

export interface Address {
  id: string;
  user_id: string;
  label: AddressLabel;
  address: string;
  lat: number | null;
  lng: number | null;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  user_id: string;
  supplier_id: string;
  address_id: string;
  status: OrderStatus;
  total_amount: number;
  delivery_fee: number;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  rejection_reason: string | null;
  display_id: string;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface OrderStatusHistory {
  id: string;
  order_id: string;
  status: OrderStatus;
  notes: string | null;
  created_at: string;
}

export interface AvailableSupplier {
  id: string;
  profile_id: string;
  business_name: string | null;
  description: string | null;
  phone: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  is_accepting_orders: boolean;
  distance_km: number | null;
  price: number | null;
  available_quantity: number | null;
}

export interface AddressInput {
  label: AddressLabel;
  address: string;
  lat?: number | null;
  lng?: number | null;
}

export interface PlaceOrderParams {
  supplier_id: string;
  address_id: string;
  product_id: string;
  quantity: number;
  payment_method: PaymentMethod;
}

export interface OrderWithItems extends Order {
  order_items: OrderItem[];
  supplier?: Supplier;
  address?: Address;
}
