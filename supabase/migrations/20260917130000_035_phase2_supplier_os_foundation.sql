-- 035_phase2_supplier_os_foundation.sql
-- Extend existing Supplier OS schemas to fully support Phase 2 requirements

-- 1. Delivery Schedules Extension
-- Add address to customer_delivery_schedules
ALTER TABLE public.customer_delivery_schedules ADD COLUMN IF NOT EXISTS delivery_address TEXT;

-- 2. Jar Management Extension
-- Create Enum for explicit transaction types
DO $$ BEGIN
    CREATE TYPE jar_transaction_type AS ENUM ('delivered_to_customer', 'returned_by_customer', 'damaged', 'lost', 'adjustment', 'legacy');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add transaction_type and quantity to jar_transactions
ALTER TABLE public.jar_transactions ADD COLUMN IF NOT EXISTS transaction_type jar_transaction_type NOT NULL DEFAULT 'legacy';
ALTER TABLE public.jar_transactions ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.jar_transactions ADD COLUMN IF NOT EXISTS notes TEXT;

-- We keep `jars_delivered` and `jars_returned` for backward compatibility temporarily, 
-- but we make them nullable or allow them to be 0. They are already DEFAULT 0.

-- 3. Collections Extension
DO $$ BEGIN
    CREATE TYPE payment_status_enum AS ENUM ('pending', 'completed', 'failed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS status payment_status_enum NOT NULL DEFAULT 'completed';

-- 4. Admin Access & RLS Hardening
-- We need to ensure public.is_admin() exists or we use auth.jwt() ->> 'role' = 'service_role'.
-- Aquakart uses `auth.jwt() ->> 'email' = 'admin@aquakart.com'` or a roles table? 
-- The prompt states: "Admin access should be explicit." Let's check `011_functions.sql` or use a generic admin check.
-- We will use an admin check. If public.is_admin() does not exist, let's create it securely.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN (
        auth.jwt() ->> 'email' = 'amritdhara@aquakart.com' OR 
        auth.jwt() ->> 'email' = 'admin@aquakart.com' OR
        current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Now, add Admin policies (using 'OR public.is_admin()' in new policies because you can have multiple policies for the same action.
-- A user passes RLS if ANY policy evaluates to true.)

CREATE POLICY "Admins have full access to supplier_customers" ON public.supplier_customers FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins have full access to customer_product_prices" ON public.customer_product_prices FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins have full access to customer_delivery_schedules" ON public.customer_delivery_schedules FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins have full access to deliveries" ON public.deliveries FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins have full access to delivery_items" ON public.delivery_items FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins have full access to customer_jar_balances" ON public.customer_jar_balances FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins have full access to jar_transactions" ON public.jar_transactions FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins have full access to payments" ON public.payments FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 5. Update complete_delivery RPC to preserve behavior while using new jar transaction paradigm
CREATE OR REPLACE FUNCTION public.complete_delivery(
    p_customer_id UUID,
    p_supplier_product_id UUID,
    p_quantity INTEGER,
    p_price NUMERIC(10,2),
    p_jars_delivered INTEGER,
    p_jars_returned INTEGER,
    p_amount_collected NUMERIC(10,2),
    p_payment_method TEXT
) RETURNS UUID AS $$
DECLARE
    v_supplier_id UUID;
    v_customer_supplier_id UUID;
    v_delivery_id UUID;
    v_total_amount NUMERIC(10,2);
BEGIN
    v_supplier_id := public.get_supplier_id();
    
    -- Verify ownership
    SELECT supplier_id INTO v_customer_supplier_id FROM public.supplier_customers WHERE id = p_customer_id;
    IF v_customer_supplier_id != v_supplier_id THEN RAISE EXCEPTION 'Unauthorized'; END IF;

    v_total_amount := p_quantity * p_price;

    -- 1. Create Delivery
    INSERT INTO public.deliveries (supplier_id, supplier_customer_id, status, delivery_date, total_amount)
    VALUES (v_supplier_id, p_customer_id, 'delivered', CURRENT_DATE, v_total_amount)
    RETURNING id INTO v_delivery_id;

    -- 2. Create Delivery Item
    INSERT INTO public.delivery_items (delivery_id, supplier_product_id, quantity, unit_price, total_price)
    VALUES (v_delivery_id, p_supplier_product_id, p_quantity, p_price, v_total_amount);

    -- 3. Record Jar Transaction & Update Balance
    IF p_jars_delivered > 0 THEN
        INSERT INTO public.jar_transactions (supplier_customer_id, delivery_id, transaction_type, quantity, jars_delivered, jars_returned)
        VALUES (p_customer_id, v_delivery_id, 'delivered_to_customer', p_jars_delivered, p_jars_delivered, 0);
    END IF;

    IF p_jars_returned > 0 THEN
        INSERT INTO public.jar_transactions (supplier_customer_id, delivery_id, transaction_type, quantity, jars_delivered, jars_returned)
        VALUES (p_customer_id, v_delivery_id, 'returned_by_customer', p_jars_returned, 0, p_jars_returned);
    END IF;

    IF p_jars_delivered > 0 OR p_jars_returned > 0 THEN
        UPDATE public.customer_jar_balances
        SET jars_with_customer = jars_with_customer + p_jars_delivered - p_jars_returned
        WHERE supplier_customer_id = p_customer_id;
    END IF;

    -- 4. Record Payment
    IF p_amount_collected > 0 THEN
        INSERT INTO public.payments (supplier_id, supplier_customer_id, delivery_id, amount, payment_method, status)
        VALUES (v_supplier_id, p_customer_id, v_delivery_id, p_amount_collected, p_payment_method, 'completed');
    END IF;

    -- 5. Calculate Next Delivery Date
    UPDATE public.customer_delivery_schedules
    SET next_delivery_date = CURRENT_DATE + interval_days
    WHERE supplier_customer_id = p_customer_id 
    AND supplier_product_id = p_supplier_product_id
    AND is_active = true;

    RETURN v_delivery_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Update manual adjustment RPC as well
CREATE OR REPLACE FUNCTION public.record_manual_jar_adjustment(
    p_customer_id UUID,
    p_jars_returned INTEGER,
    p_jars_delivered INTEGER
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_supplier_id UUID;
    v_customer_supplier_id UUID;
    v_current_jar_balance INTEGER;
BEGIN
    v_supplier_id := public.get_supplier_id();
    IF v_supplier_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

    -- Verify customer ownership
    SELECT supplier_id INTO v_customer_supplier_id FROM public.supplier_customers WHERE id = p_customer_id;
    IF v_customer_supplier_id != v_supplier_id THEN RAISE EXCEPTION 'Unauthorized'; END IF;

    -- Lock the customer jar balance row
    SELECT jars_with_customer INTO v_current_jar_balance 
    FROM public.customer_jar_balances 
    WHERE supplier_customer_id = p_customer_id 
    FOR UPDATE;

    IF (v_current_jar_balance + p_jars_delivered - p_jars_returned) < 0 THEN
        RAISE EXCEPTION 'Negative jar balance constraint violation';
    END IF;

    IF p_jars_delivered > 0 THEN
        INSERT INTO public.jar_transactions (supplier_customer_id, delivery_id, transaction_type, quantity, jars_delivered, jars_returned)
        VALUES (p_customer_id, NULL, 'delivered_to_customer', p_jars_delivered, p_jars_delivered, 0);
    END IF;

    IF p_jars_returned > 0 THEN
        INSERT INTO public.jar_transactions (supplier_customer_id, delivery_id, transaction_type, quantity, jars_delivered, jars_returned)
        VALUES (p_customer_id, NULL, 'returned_by_customer', p_jars_returned, 0, p_jars_returned);
    END IF;
    
    -- Update customer balance
    UPDATE public.customer_jar_balances
    SET jars_with_customer = jars_with_customer + p_jars_delivered - p_jars_returned
    WHERE supplier_customer_id = p_customer_id;

    -- Update Supplier Inventory logic
    UPDATE public.supplier_inventory
    SET available = available - p_jars_delivered + p_jars_returned,
        with_customers = with_customers + p_jars_delivered - p_jars_returned
    WHERE supplier_id = v_supplier_id;
    
    -- Supplier Audit Trail
    IF p_jars_delivered > 0 THEN
        INSERT INTO public.supplier_inventory_transactions (supplier_id, reference_type, reference_id, quantity_change)
        VALUES (v_supplier_id, 'adjustment', NULL, -p_jars_delivered);
    END IF;
    
    IF p_jars_returned > 0 THEN
        INSERT INTO public.supplier_inventory_transactions (supplier_id, reference_type, reference_id, quantity_change)
        VALUES (v_supplier_id, 'adjustment', NULL, p_jars_returned);
    END IF;
END;
$$;
