-- 019_supplier_os_core.sql

-- 1. Customer Types Enum
CREATE TYPE customer_type_enum AS ENUM ('household', 'office', 'factory', 'shop', 'restaurant', 'hostel', 'hospital', 'event', 'other');

-- 2. Supplier Customers (CRM)
CREATE TABLE public.supplier_customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL, -- Nullable, for when app is downloaded
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    normalized_phone TEXT NOT NULL,
    customer_type customer_type_enum NOT NULL DEFAULT 'household',
    address TEXT,
    sector TEXT,
    landmark TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(supplier_id, normalized_phone)
);

-- 3. Customer-Specific Pricing
CREATE TABLE public.customer_product_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_customer_id UUID NOT NULL REFERENCES public.supplier_customers(id) ON DELETE CASCADE,
    supplier_product_id UUID NOT NULL REFERENCES public.supplier_products(id) ON DELETE CASCADE,
    price NUMERIC(10,2) NOT NULL CHECK (price > 0),
    effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    effective_until TIMESTAMPTZ, -- Nullable, active if null or in the future
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Delivery Schedules (Recurring)
CREATE TABLE public.customer_delivery_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_customer_id UUID NOT NULL REFERENCES public.supplier_customers(id) ON DELETE CASCADE,
    supplier_product_id UUID NOT NULL REFERENCES public.supplier_products(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    interval_days INTEGER NOT NULL CHECK (interval_days > 0),
    next_delivery_date DATE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Deliveries (Operational Execution)
-- Distinct from marketplace `orders` table. These represent supplier's actual delivery runs.
CREATE TABLE public.deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
    supplier_customer_id UUID NOT NULL REFERENCES public.supplier_customers(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('pending', 'delivered', 'skipped', 'cancelled')),
    delivery_date DATE NOT NULL,
    total_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Delivery Items
CREATE TABLE public.delivery_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_id UUID NOT NULL REFERENCES public.deliveries(id) ON DELETE CASCADE,
    supplier_product_id UUID NOT NULL REFERENCES public.supplier_products(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(10,2) NOT NULL CHECK (unit_price >= 0),
    total_price NUMERIC(10,2) NOT NULL CHECK (total_price >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Jar Management
-- Current State
CREATE TABLE public.customer_jar_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_customer_id UUID NOT NULL UNIQUE REFERENCES public.supplier_customers(id) ON DELETE CASCADE,
    jars_with_customer INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Transaction History
CREATE TABLE public.jar_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_customer_id UUID NOT NULL REFERENCES public.supplier_customers(id) ON DELETE CASCADE,
    delivery_id UUID REFERENCES public.deliveries(id) ON DELETE SET NULL,
    jars_delivered INTEGER NOT NULL DEFAULT 0,
    jars_returned INTEGER NOT NULL DEFAULT 0,
    transaction_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Financials (Payments/Collections)
CREATE TABLE public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
    supplier_customer_id UUID NOT NULL REFERENCES public.supplier_customers(id) ON DELETE CASCADE,
    delivery_id UUID REFERENCES public.deliveries(id) ON DELETE SET NULL,
    amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
    payment_method TEXT NOT NULL DEFAULT 'cash',
    payment_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Indexes for Performance
CREATE INDEX idx_supplier_customers_supplier_id ON public.supplier_customers(supplier_id);
CREATE INDEX idx_customer_product_prices_customer_id ON public.customer_product_prices(supplier_customer_id);
CREATE INDEX idx_customer_delivery_schedules_customer_id ON public.customer_delivery_schedules(supplier_customer_id);
CREATE INDEX idx_deliveries_supplier_id_date ON public.deliveries(supplier_id, delivery_date);
CREATE INDEX idx_jar_transactions_customer_id ON public.jar_transactions(supplier_customer_id);
CREATE INDEX idx_payments_supplier_id ON public.payments(supplier_id);
CREATE INDEX idx_payments_customer_id ON public.payments(supplier_customer_id);

-- 9. Row Level Security (RLS)
ALTER TABLE public.supplier_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_product_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_delivery_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_jar_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jar_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Helper function to check if user owns the supplier record
-- (We already have is_supplier() and get_supplier_id() from 011_functions.sql, we will use get_supplier_id())

-- RLS: supplier_customers
CREATE POLICY "Suppliers can view their own customers" 
    ON public.supplier_customers FOR SELECT 
    TO authenticated 
    USING (supplier_id = public.get_supplier_id());

CREATE POLICY "Suppliers can manage their own customers" 
    ON public.supplier_customers FOR ALL 
    TO authenticated 
    USING (supplier_id = public.get_supplier_id()) 
    WITH CHECK (supplier_id = public.get_supplier_id());

-- RLS: customer_product_prices
CREATE POLICY "Suppliers can view their customer prices" 
    ON public.customer_product_prices FOR SELECT 
    TO authenticated 
    USING (supplier_customer_id IN (SELECT id FROM public.supplier_customers WHERE supplier_id = public.get_supplier_id()));

CREATE POLICY "Suppliers can manage their customer prices" 
    ON public.customer_product_prices FOR ALL 
    TO authenticated 
    USING (supplier_customer_id IN (SELECT id FROM public.supplier_customers WHERE supplier_id = public.get_supplier_id())) 
    WITH CHECK (supplier_customer_id IN (SELECT id FROM public.supplier_customers WHERE supplier_id = public.get_supplier_id()));

-- RLS: customer_delivery_schedules
CREATE POLICY "Suppliers can view their customer schedules" 
    ON public.customer_delivery_schedules FOR SELECT 
    TO authenticated 
    USING (supplier_customer_id IN (SELECT id FROM public.supplier_customers WHERE supplier_id = public.get_supplier_id()));

CREATE POLICY "Suppliers can manage their customer schedules" 
    ON public.customer_delivery_schedules FOR ALL 
    TO authenticated 
    USING (supplier_customer_id IN (SELECT id FROM public.supplier_customers WHERE supplier_id = public.get_supplier_id())) 
    WITH CHECK (supplier_customer_id IN (SELECT id FROM public.supplier_customers WHERE supplier_id = public.get_supplier_id()));

-- RLS: deliveries
CREATE POLICY "Suppliers can view their deliveries" 
    ON public.deliveries FOR SELECT 
    TO authenticated 
    USING (supplier_id = public.get_supplier_id());

CREATE POLICY "Suppliers can manage their deliveries" 
    ON public.deliveries FOR ALL 
    TO authenticated 
    USING (supplier_id = public.get_supplier_id()) 
    WITH CHECK (supplier_id = public.get_supplier_id());

-- RLS: delivery_items
CREATE POLICY "Suppliers can view their delivery items" 
    ON public.delivery_items FOR SELECT 
    TO authenticated 
    USING (delivery_id IN (SELECT id FROM public.deliveries WHERE supplier_id = public.get_supplier_id()));

CREATE POLICY "Suppliers can manage their delivery items" 
    ON public.delivery_items FOR ALL 
    TO authenticated 
    USING (delivery_id IN (SELECT id FROM public.deliveries WHERE supplier_id = public.get_supplier_id())) 
    WITH CHECK (delivery_id IN (SELECT id FROM public.deliveries WHERE supplier_id = public.get_supplier_id()));

-- RLS: customer_jar_balances
CREATE POLICY "Suppliers can view their customer jar balances" 
    ON public.customer_jar_balances FOR SELECT 
    TO authenticated 
    USING (supplier_customer_id IN (SELECT id FROM public.supplier_customers WHERE supplier_id = public.get_supplier_id()));

CREATE POLICY "Suppliers can manage their customer jar balances" 
    ON public.customer_jar_balances FOR ALL 
    TO authenticated 
    USING (supplier_customer_id IN (SELECT id FROM public.supplier_customers WHERE supplier_id = public.get_supplier_id())) 
    WITH CHECK (supplier_customer_id IN (SELECT id FROM public.supplier_customers WHERE supplier_id = public.get_supplier_id()));

-- RLS: jar_transactions
CREATE POLICY "Suppliers can view their jar transactions" 
    ON public.jar_transactions FOR SELECT 
    TO authenticated 
    USING (supplier_customer_id IN (SELECT id FROM public.supplier_customers WHERE supplier_id = public.get_supplier_id()));

CREATE POLICY "Suppliers can manage their jar transactions" 
    ON public.jar_transactions FOR ALL 
    TO authenticated 
    USING (supplier_customer_id IN (SELECT id FROM public.supplier_customers WHERE supplier_id = public.get_supplier_id())) 
    WITH CHECK (supplier_customer_id IN (SELECT id FROM public.supplier_customers WHERE supplier_id = public.get_supplier_id()));

-- RLS: payments
CREATE POLICY "Suppliers can view their payments" 
    ON public.payments FOR SELECT 
    TO authenticated 
    USING (supplier_id = public.get_supplier_id());

CREATE POLICY "Suppliers can manage their payments" 
    ON public.payments FOR ALL 
    TO authenticated 
    USING (supplier_id = public.get_supplier_id()) 
    WITH CHECK (supplier_id = public.get_supplier_id());

-- 10. Triggers for updated_at
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.supplier_customers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.customer_product_prices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.customer_delivery_schedules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.deliveries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.customer_jar_balances FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
