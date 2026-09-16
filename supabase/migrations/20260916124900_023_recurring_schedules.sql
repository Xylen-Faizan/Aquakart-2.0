-- 023_recurring_schedules.sql

-- 1. Redefine create_delivery_schedule for strict ownership and timezone safety
CREATE OR REPLACE FUNCTION public.create_delivery_schedule(
    p_customer_id UUID,
    p_supplier_product_id UUID,
    p_quantity INTEGER,
    p_interval_days INTEGER,
    p_first_delivery_date DATE
) RETURNS VOID 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_supplier_id UUID;
    v_owns_customer BOOLEAN;
    v_owns_product BOOLEAN;
BEGIN
    v_supplier_id := public.get_supplier_id();
    IF v_supplier_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated as a supplier';
    END IF;

    -- Verify ownership
    SELECT EXISTS (
        SELECT 1 FROM public.supplier_customers 
        WHERE id = p_customer_id AND supplier_id = v_supplier_id
    ) INTO v_owns_customer;

    IF NOT v_owns_customer THEN RAISE EXCEPTION 'Unauthorized: Customer not yours'; END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.supplier_products 
        WHERE id = p_supplier_product_id AND supplier_id = v_supplier_id
    ) INTO v_owns_product;

    IF NOT v_owns_product THEN RAISE EXCEPTION 'Unauthorized: Product not yours'; END IF;

    -- Inactivate any existing schedule for this exact product
    UPDATE public.customer_delivery_schedules
    SET is_active = false
    WHERE supplier_customer_id = p_customer_id 
    AND supplier_product_id = p_supplier_product_id
    AND is_active = true;

    -- Insert new schedule
    INSERT INTO public.customer_delivery_schedules (
        supplier_customer_id,
        supplier_product_id,
        quantity,
        interval_days,
        next_delivery_date,
        is_active
    ) VALUES (
        p_customer_id,
        p_supplier_product_id,
        p_quantity,
        p_interval_days,
        p_first_delivery_date,
        true
    );
END;
$$;

-- 2. Create the daily delivery manifest generator (Step 4 preview)
CREATE OR REPLACE FUNCTION public.get_today_manifest()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_supplier_id UUID;
    v_today DATE;
    v_result JSON;
BEGIN
    v_supplier_id := public.get_supplier_id();
    IF v_supplier_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated as a supplier';
    END IF;

    -- Explicit timezone evaluation
    v_today := (NOW() AT TIME ZONE 'Asia/Kolkata')::DATE;

    SELECT json_agg(
        json_build_object(
            'schedule_id', s.id,
            'customer_id', c.id,
            'customer_name', c.name,
            'customer_phone', c.phone,
            'address', c.address,
            'product_id', p.id,
            'product_name', p.name,
            'quantity', s.quantity,
            'unit_price', public.get_effective_customer_price(c.id, p.id),
            'next_delivery_date', s.next_delivery_date
        )
    )
    INTO v_result
    FROM public.customer_delivery_schedules s
    JOIN public.supplier_customers c ON c.id = s.supplier_customer_id
    JOIN public.supplier_products sp ON sp.id = s.supplier_product_id
    JOIN public.products p ON p.id = sp.product_id
    WHERE s.is_active = true
    AND s.next_delivery_date <= v_today
    AND c.supplier_id = v_supplier_id;

    RETURN COALESCE(v_result, '[]'::json);
END;
$$;
