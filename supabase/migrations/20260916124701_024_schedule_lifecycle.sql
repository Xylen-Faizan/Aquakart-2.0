-- 024_schedule_lifecycle.sql
-- Expose full schedule details in get_supplier_customers

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
            'schedule_active', (
                SELECT is_active 
                FROM public.customer_delivery_schedules cds 
                WHERE cds.supplier_customer_id = sc.id 
                ORDER BY cds.updated_at DESC 
                LIMIT 1
            ),
            'schedule_quantity', (
                SELECT quantity 
                FROM public.customer_delivery_schedules cds 
                WHERE cds.supplier_customer_id = sc.id 
                ORDER BY cds.updated_at DESC 
                LIMIT 1
            ),
            'schedule_interval', (
                SELECT interval_days 
                FROM public.customer_delivery_schedules cds 
                WHERE cds.supplier_customer_id = sc.id 
                ORDER BY cds.updated_at DESC 
                LIMIT 1
            ),
            'outstanding_balance', COALESCE((
                SELECT SUM(CASE WHEN entry_type = 'charge' THEN amount ELSE -amount END)
                FROM public.supplier_ledgers sl
                WHERE sl.supplier_customer_id = sc.id
            ), 0),
            'last_delivery_at', (
                SELECT created_at
                FROM public.deliveries d
                WHERE d.supplier_customer_id = sc.id
                ORDER BY created_at DESC
                LIMIT 1
            )
        )
    ) INTO v_result
    FROM public.supplier_customers sc
    WHERE sc.supplier_id = v_supplier_id
    AND (p_search IS NULL OR sc.name ILIKE '%' || p_search || '%' OR sc.phone ILIKE '%' || p_search || '%')
    AND (p_customer_type IS NULL OR sc.customer_type = p_customer_type)
    ORDER BY sc.name ASC
    LIMIT p_limit
    OFFSET p_offset;

    RETURN COALESCE(v_result, '[]'::json);
END;
$$;

-- Pause / Cancel / Resume functions
CREATE OR REPLACE FUNCTION public.set_delivery_schedule_status(
    p_customer_id UUID,
    p_supplier_product_id UUID,
    p_is_active BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.customer_delivery_schedules
    SET is_active = p_is_active,
        updated_at = NOW()
    WHERE supplier_customer_id = p_customer_id 
    AND supplier_product_id = p_supplier_product_id;
END;
$$;
