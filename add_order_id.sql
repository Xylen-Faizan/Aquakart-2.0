ALTER TABLE public.deliveries ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES public.orders(id);
