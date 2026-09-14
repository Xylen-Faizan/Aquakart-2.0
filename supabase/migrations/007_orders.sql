-- 007_orders.sql
-- Create orders table

CREATE SEQUENCE order_display_seq;

CREATE TABLE public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    display_id TEXT UNIQUE NOT NULL,
    customer_id UUID NOT NULL REFERENCES public.profiles(id),
    supplier_id UUID NOT NULL REFERENCES public.suppliers(id),
    address_id UUID NOT NULL REFERENCES public.addresses(id),
    status TEXT NOT NULL CHECK (status IN ('placed', 'accepted', 'rejected', 'preparing', 'out_for_delivery', 'delivered', 'cancelled')),
    rejection_reason TEXT,
    subtotal NUMERIC(10,2) NOT NULL,
    delivery_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
    total NUMERIC(10,2) NOT NULL,
    payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'upi')),
    payment_status TEXT NOT NULL CHECK (payment_status IN ('pending', 'paid')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('Asia/Kolkata', now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('Asia/Kolkata', now()) NOT NULL
);

CREATE OR REPLACE FUNCTION public.generate_order_display_id()
RETURNS TRIGGER AS $$
BEGIN
    NEW.display_id = 'AK-' || to_char(timezone('Asia/Kolkata', now()), 'YYYY') || '-' || lpad(nextval('order_display_seq')::text, 6, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER orders_generate_display_id
BEFORE INSERT ON public.orders
FOR EACH ROW
WHEN (NEW.display_id IS NULL)
EXECUTE FUNCTION public.generate_order_display_id();

CREATE INDEX idx_orders_customer_id ON public.orders(customer_id);
CREATE INDEX idx_orders_supplier_id ON public.orders(supplier_id);
CREATE INDEX idx_orders_status ON public.orders(status);

CREATE TRIGGER orders_updated_at
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
