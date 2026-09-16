-- 021_supplier_customers_queries.sql

-- 1. Modified create_supplier_customer to be strictly supplier-scoped and atomic
CREATE OR REPLACE FUNCTION public.create_supplier_customer(
    p_name TEXT,
    p_phone TEXT,
    p_customer_type customer_type_enum DEFAULT 'household',
    p_address TEXT DEFAULT NULL,
    p_sector TEXT DEFAULT NULL,
    p_landmark TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_supplier_id UUID;
    v_customer_id UUID;
    v_normalized_phone TEXT;
BEGIN
    -- Derive authenticated supplier strictly
    v_supplier_id := public.get_supplier_id();
    IF v_supplier_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated as a supplier';
    END IF;

    -- Basic phone normalization (strip non-digits, take last 10)
    v_normalized_phone := RIGHT(REGEXP_REPLACE(p_phone, '\D', '', 'g'), 10);
    
    IF LENGTH(v_normalized_phone) < 10 THEN
        RAISE EXCEPTION 'Invalid phone number format';
    END IF;

    -- Check if this supplier already has this customer
    IF EXISTS (
        SELECT 1 FROM public.supplier_customers 
        WHERE supplier_id = v_supplier_id 
        AND normalized_phone = v_normalized_phone
    ) THEN
        RAISE EXCEPTION 'Customer with this phone number already exists for your business';
    END IF;

    -- Insert the supplier customer relationship
    INSERT INTO public.supplier_customers (
        supplier_id,
        name,
        phone,
        normalized_phone,
        customer_type,
        address,
        sector,
        landmark,
        notes
    ) VALUES (
        v_supplier_id,
        p_name,
        p_phone,
        v_normalized_phone,
        p_customer_type,
        p_address,
        p_sector,
        p_landmark,
        p_notes
    )
    RETURNING id INTO v_customer_id;

    -- Initialize jar balance to 0 for this new customer
    INSERT INTO public.customer_jar_balances (
        supplier_customer_id,
        jars_with_customer
    ) VALUES (
        v_customer_id,
        0
    );

    RETURN v_customer_id;
END;
$$;

-- 2. get_supplier_customers RPC with search, filter, and pagination
CREATE OR REPLACE FUNCTION public.get_supplier_customers(
    p_search TEXT DEFAULT NULL,
    p_customer_type customer_type_enum DEFAULT NULL,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_supplier_id UUID;
    v_result JSON;
BEGIN
    -- Derive authenticated supplier strictly
    v_supplier_id := public.get_supplier_id();
    IF v_supplier_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated as a supplier';
    END IF;

    SELECT json_agg(
        json_build_object(
            'id', sc.id,
            'name', sc.name,
            'phone', sc.phone,
            'customer_type', sc.customer_type,
            'address', sc.address,
            'sector', sc.sector,
            'is_active', sc.is_active,
            'active_price', (
                SELECT price 
                FROM public.customer_product_prices cpp 
                WHERE cpp.supplier_customer_id = sc.id 
                AND (cpp.effective_until IS NULL OR cpp.effective_until > NOW())
                ORDER BY cpp.effective_from DESC 
                LIMIT 1
            ),
            'jar_balance', COALESCE((
                SELECT jars_with_customer 
                FROM public.customer_jar_balances cjb 
                WHERE cjb.supplier_customer_id = sc.id
            ), 0),
            'next_due_date', (
                SELECT next_delivery_date 
                FROM public.customer_delivery_schedules cds 
                WHERE cds.supplier_customer_id = sc.id 
                AND cds.is_active = true 
                ORDER BY cds.next_delivery_date ASC 
                LIMIT 1
            ),
            'outstanding_balance', 0, -- Placeholder for Step 6 ledger implementation
            'last_delivery_at', (
                SELECT delivery_date
                FROM public.deliveries d
                WHERE d.supplier_customer_id = sc.id
                AND d.status = 'delivered'
                ORDER BY d.delivery_date DESC
                LIMIT 1
            )
        )
    )
    INTO v_result
    FROM public.supplier_customers sc
    WHERE sc.supplier_id = v_supplier_id
    AND (p_search IS NULL OR sc.name ILIKE '%' || p_search || '%' OR sc.phone ILIKE '%' || p_search || '%')
    AND (p_customer_type IS NULL OR sc.customer_type = p_customer_type)
    ORDER BY sc.name ASC
    LIMIT p_limit
    OFFSET p_offset;

    -- Return empty array instead of null if no results
    RETURN COALESCE(v_result, '[]'::json);
END;
$$;
