import { z } from 'zod';
import { ADDRESS_LABELS, PAYMENT_METHODS } from '@aquakart/config';

export const signUpSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email().max(255),
  password: z.string().min(8).max(100)
});

export const signInSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().max(100)
});

export const addressSchema = z.object({
  label: z.nativeEnum(ADDRESS_LABELS),
  address: z.string().min(1).max(500),
  lat: z.number().optional().nullable(),
  lng: z.number().optional().nullable()
});

export const placeOrderSchema = z.object({
  supplier_id: z.string().uuid(),
  address_id: z.string().uuid(),
  product_id: z.string().uuid(),
  quantity: z.number().int().positive(),
  payment_method: z.nativeEnum(PAYMENT_METHODS)
});

export const capacitySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  max_capacity: z.number().int().nonnegative()
});

export const supplierProfileSchema = z.object({
  business_name: z.string().max(100).optional(),
  description: z.string().max(1000).optional(),
  phone: z.string().max(20).optional(),
  address: z.string().max(500).optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  is_accepting_orders: z.boolean().optional()
});

export type SignUpSchema = z.infer<typeof signUpSchema>;
export type SignInSchema = z.infer<typeof signInSchema>;
export type AddressSchema = z.infer<typeof addressSchema>;
export type PlaceOrderSchema = z.infer<typeof placeOrderSchema>;
export type CapacitySchema = z.infer<typeof capacitySchema>;
export type SupplierProfileSchema = z.infer<typeof supplierProfileSchema>;
