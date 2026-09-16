-- 024_deliveries_transaction.sql

-- 1. Create Ledger Table (Step 6 foundation)
CREATE TABLE public.customer_ledger_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
    supplier_customer_id UUID NOT NULL REFERENCES public.supplier_customers(id) ON DELETE CASCADE,
    reference_type TEXT NOT NULL CHECK (reference_type IN ('delivery', 'payment', 'adjustment', 'reversal')),
    reference_id UUID, -- Optional linkage to delivery_id or payment_id
    entry_type TEXT NOT NULL CHECK (entry_type IN ('debit', 'credit')),
    amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID -- auth.uid()
);

-- RLS for Ledger
ALTER TABLE public.customer_ledger_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Suppliers can view their ledger entries" 
    ON public.customer_ledger_entries FOR SELECT 
    TO authenticated USING (supplier_id = public.get_supplier_id());

-- 2. Create Supplier Inventory Table (Step 7 foundation)
CREATE TABLE public.supplier_inventory (
    supplier_id UUID PRIMARY KEY REFERENCES public.suppliers(id) ON DELETE CASCADE,
    owned INTEGER NOT NULL DEFAULT 0,
    available INTEGER NOT NULL DEFAULT 0,
    with_customers INTEGER NOT NULL DEFAULT 0,
    damaged INTEGER NOT NULL DEFAULT 0,
    missing INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.supplier_inventory_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
    reference_type TEXT NOT NULL CHECK (reference_type IN ('delivery', 'return', 'damage', 'loss', 'adjustment', 'purchase')),
    reference_id UUID,
    quantity_change INTEGER NOT NULL,
    transaction_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS for Inventory
ALTER TABLE public.supplier_inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Suppliers can view their inventory" 
    ON public.supplier_inventory FOR SELECT 
    TO authenticated USING (supplier_id = public.get_supplier_id());

-- Initialize existing suppliers in inventory table securely
INSERT INTO public.supplier_inventory (supplier_id)
SELECT id FROM public.suppliers
ON CONFLICT (supplier_id) DO NOTHING;

-- 3. Massive `complete_delivery` transaction (Step 4)
CREATE OR REPLACE FUNCTION public.complete_delivery(
    p_customer_id UUID,
    p_supplier_product_id UUID,
    p_quantity INTEGER,
    p_jars_delivered INTEGER,
    p_jars_returned INTEGER,
    p_amount_collected NUMERIC(10,2),
    p_payment_method TEXT DEFAULT 'cash'
) RETURNS UUID 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_supplier_id UUID;
    v_customer_supplier_id UUID;
    v_delivery_id UUID;
    v_unit_price NUMERIC(10,2);
    v_total_amount NUMERIC(10,2);
    v_current_jar_balance INTEGER;
    v_next_due_date DATE;
    v_today DATE;
BEGIN
    v_supplier_id := public.get_supplier_id();
    IF v_supplier_id IS NULL THEN RAISE EXCEPTION 'Not authenticated as a supplier'; END IF;
    v_today := (NOW() AT TIME ZONE 'Asia/Kolkata')::DATE;
    
    -- Verify customer ownership
    SELECT supplier_id INTO v_customer_supplier_id FROM public.supplier_customers WHERE id = p_customer_id;
    IF v_customer_supplier_id != v_supplier_id THEN RAISE EXCEPTION 'Unauthorized: Customer not yours'; END IF;

    -- 1. Resolve Effective Price Server-Side
    v_unit_price := public.get_effective_customer_price(p_customer_id, p_supplier_product_id);
    v_total_amount := p_quantity * v_unit_price;

    -- 2. Mark Delivery Completed (Snapshotting the unit price)
    INSERT INTO public.deliveries (supplier_id, supplier_customer_id, status, delivery_date, total_amount)
    VALUES (v_supplier_id, p_customer_id, 'delivered', v_today, v_total_amount)
    RETURNING id INTO v_delivery_id;

    INSERT INTO public.delivery_items (delivery_id, supplier_product_id, quantity, unit_price, total_price)
    VALUES (v_delivery_id, p_supplier_product_id, p_quantity, v_unit_price, v_total_amount);

    -- 3. Create Financial Debit (Ledger)
    IF v_total_amount > 0 THEN
        INSERT INTO public.customer_ledger_entries (supplier_id, supplier_customer_id, reference_type, reference_id, entry_type, amount, created_by)
        VALUES (v_supplier_id, p_customer_id, 'delivery', v_delivery_id, 'debit', v_total_amount, auth.uid());
    END IF;

    -- 4. Record Payment (Credit Ledger)
    IF p_amount_collected > 0 THEN
        INSERT INTO public.payments (supplier_id, supplier_customer_id, delivery_id, amount, payment_method)
        VALUES (v_supplier_id, p_customer_id, v_delivery_id, p_amount_collected, p_payment_method);

        INSERT INTO public.customer_ledger_entries (supplier_id, supplier_customer_id, reference_type, reference_id, entry_type, amount, created_by)
        VALUES (v_supplier_id, p_customer_id, 'payment', v_delivery_id, 'credit', p_amount_collected, auth.uid());
    END IF;

    -- 5. Update Jar State (Transactionally locked)
    IF p_jars_delivered > 0 OR p_jars_returned > 0 THEN
        -- Lock the row to prevent race conditions
        SELECT jars_with_customer INTO v_current_jar_balance 
        FROM public.customer_jar_balances 
        WHERE supplier_customer_id = p_customer_id 
        FOR UPDATE;

        IF (v_current_jar_balance + p_jars_delivered - p_jars_returned) < 0 THEN
            RAISE EXCEPTION 'Negative jar balance constraint violation';
        END IF;

        INSERT INTO public.jar_transactions (supplier_customer_id, delivery_id, jars_delivered, jars_returned)
        VALUES (p_customer_id, v_delivery_id, p_jars_delivered, p_jars_returned);
        
        UPDATE public.customer_jar_balances
        SET jars_with_customer = jars_with_customer + p_jars_delivered - p_jars_returned
        WHERE supplier_customer_id = p_customer_id;

        -- Update Supplier Inventory logic
        UPDATE public.supplier_inventory
        SET available = available - p_jars_delivered + p_jars_returned,
            with_customers = with_customers + p_jars_delivered - p_jars_returned
        WHERE supplier_id = v_supplier_id;
        
        IF p_jars_delivered > 0 THEN
            INSERT INTO public.supplier_inventory_transactions (supplier_id, reference_type, reference_id, quantity_change)
            VALUES (v_supplier_id, 'delivery', v_delivery_id, -p_jars_delivered);
        END IF;
        
        IF p_jars_returned > 0 THEN
            INSERT INTO public.supplier_inventory_transactions (supplier_id, reference_type, reference_id, quantity_change)
            VALUES (v_supplier_id, 'return', v_delivery_id, p_jars_returned);
        END IF;
    END IF;

    -- 6. Advance Recurring Schedule
    UPDATE public.customer_delivery_schedules
    SET next_delivery_date = v_today + interval_days
    WHERE supplier_customer_id = p_customer_id 
    AND supplier_product_id = p_supplier_product_id
    AND is_active = true;

    RETURN v_delivery_id;
END;
$$;
