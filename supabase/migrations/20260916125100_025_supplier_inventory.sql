-- 025_supplier_inventory.sql

-- 1. Get Inventory Stats
CREATE OR REPLACE FUNCTION public.get_supplier_inventory_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_supplier_id UUID;
    v_result JSON;
BEGIN
    v_supplier_id := public.get_supplier_id();
    IF v_supplier_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

    SELECT json_build_object(
        'owned', COALESCE(owned, 0),
        'available', COALESCE(available, 0),
        'with_customers', COALESCE(with_customers, 0),
        'damaged', COALESCE(damaged, 0),
        'missing', COALESCE(missing, 0)
    ) INTO v_result
    FROM public.supplier_inventory
    WHERE supplier_id = v_supplier_id;

    -- If no row exists, return default
    IF v_result IS NULL THEN
        RETURN json_build_object(
            'owned', 0,
            'available', 0,
            'with_customers', 0,
            'damaged', 0,
            'missing', 0
        );
    END IF;

    RETURN v_result;
END;
$$;

-- 2. Get Recent Jar Transactions
CREATE OR REPLACE FUNCTION public.get_jar_activity(p_limit INTEGER DEFAULT 20)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_supplier_id UUID;
    v_result JSON;
BEGIN
    v_supplier_id := public.get_supplier_id();
    IF v_supplier_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

    SELECT json_agg(
        json_build_object(
            'id', t.id,
            'customer_name', c.name,
            'jars_delivered', t.jars_delivered,
            'jars_returned', t.jars_returned,
            'created_at', t.created_at
        )
    ) INTO v_result
    FROM (
        SELECT jt.id, jt.supplier_customer_id, jt.jars_delivered, jt.jars_returned, jt.created_at
        FROM public.jar_transactions jt
        JOIN public.supplier_customers sc ON sc.id = jt.supplier_customer_id
        WHERE sc.supplier_id = v_supplier_id
        ORDER BY jt.created_at DESC
        LIMIT p_limit
    ) t
    JOIN public.supplier_customers c ON c.id = t.supplier_customer_id;

    RETURN COALESCE(v_result, '[]'::json);
END;
$$;

-- 3. Record Manual Jar Return / Adjustment
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

    -- Record transaction (null delivery_id implies manual)
    INSERT INTO public.jar_transactions (supplier_customer_id, delivery_id, jars_delivered, jars_returned)
    VALUES (p_customer_id, NULL, p_jars_delivered, p_jars_returned);
    
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
