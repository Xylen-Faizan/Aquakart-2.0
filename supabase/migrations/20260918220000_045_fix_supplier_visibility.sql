-- 045_fix_supplier_visibility.sql
-- For demo purposes, auto-verify suppliers and set them to accepting orders

-- 1. Alter defaults so new suppliers are automatically visible
ALTER TABLE public.suppliers
ALTER COLUMN is_verified SET DEFAULT true,
ALTER COLUMN is_accepting_orders SET DEFAULT true;

-- 2. Update all existing suppliers (like Pure Jal) so they instantly show up
UPDATE public.suppliers
SET is_verified = true,
    is_accepting_orders = true;
