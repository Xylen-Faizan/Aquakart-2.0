-- 031_idempotency_core.sql

-- 1. Add idempotency_key to deliveries
ALTER TABLE public.deliveries 
ADD COLUMN IF NOT EXISTS idempotency_key UUID UNIQUE;

-- 2. Update the massive `complete_delivery` transaction to enforce idempotency
CREATE OR REPLACE FUNCTION public.complete_delivery(
    p_customer_id UUID,
    p_supplier_product_id UUID,
    p_quantity INTEGER,
    p_jars_delivered INTEGER,
    p_jars_returned INTEGER,
    p_amount_collected NUMERIC(10,2),
    p_payment_method TEXT DEFAULT 'cash',
    p_idempotency_key UUID DEFAULT NULL
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
    -- This INSERT will fail with a unique constraint violation if the idempotency_key is already present.
    -- This is intentional. The error will bubble up, aborting the transaction.
    INSERT INTO public.deliveries (supplier_id, supplier_customer_id, status, delivery_date, total_amount, idempotency_key)
    VALUES (v_supplier_id, p_customer_id, 'delivered', v_today, v_total_amount, p_idempotency_key)
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
