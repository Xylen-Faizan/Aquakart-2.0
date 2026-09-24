-- 093_phase2_read_layer.sql

-- 1. get_opportunistic_order_history
CREATE OR REPLACE FUNCTION public.get_opportunistic_order_history(p_role text)
RETURNS TABLE (
    order_id uuid,
    display_id text,
    customer_name text,
    customer_phone text,
    address text,
    quantity bigint,
    total_amount numeric,
    status text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_supplier_id uuid;
BEGIN
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

    IF p_role = 'supplier' THEN
        v_supplier_id := public.get_supplier_id();
        RETURN QUERY
        SELECT 
            o.id,
            o.display_id,
            COALESCE(c.name, p.name) AS customer_name,
            COALESCE(c.phone, p.phone) AS customer_phone,
            a.address,
            (SELECT COALESCE(SUM(oi.quantity), 0) FROM public.order_items oi WHERE oi.order_id = o.id) AS quantity,
            o.total AS total_amount,
            o.status,
            o.created_at,
            o.updated_at
        FROM public.orders o
        LEFT JOIN public.supplier_customers c ON c.id = o.supplier_customer_id
        LEFT JOIN public.profiles p ON p.id = o.customer_id
        LEFT JOIN public.addresses a ON a.id = o.address_id
        WHERE o.supplier_id = v_supplier_id
          AND o.fulfillment_mode = 'opportunistic_route'
        ORDER BY o.created_at DESC;
    ELSIF p_role = 'customer' THEN
        RETURN QUERY
        SELECT 
            o.id,
            o.display_id,
            s.business_name AS customer_name,
            s.phone AS customer_phone,
            a.address,
            (SELECT COALESCE(SUM(oi.quantity), 0) FROM public.order_items oi WHERE oi.order_id = o.id) AS quantity,
            o.total AS total_amount,
            o.status,
            o.created_at,
            o.updated_at
        FROM public.orders o
        LEFT JOIN public.suppliers s ON s.id = o.supplier_id
        LEFT JOIN public.addresses a ON a.id = o.address_id
        WHERE o.customer_id = v_user_id
          AND o.fulfillment_mode = 'opportunistic_route'
        ORDER BY o.created_at DESC;
    ELSE
        RAISE EXCEPTION 'Invalid role specified';
    END IF;
END;
$$;

-- 2. get_customer_khata_summary
CREATE OR REPLACE FUNCTION public.get_customer_khata_summary(p_supplier_customer_id uuid, p_month text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_is_auth boolean := false;
    v_start_date date;
    v_end_date date;
    v_res json;
BEGIN
    -- Verify RLS: User must be the supplier OR the customer
    PERFORM 1 FROM public.supplier_customers 
    WHERE id = p_supplier_customer_id AND (supplier_id = public.get_supplier_id() OR user_id = v_user_id);
    IF NOT FOUND THEN RAISE EXCEPTION 'Unauthorized'; END IF;

    -- Parse month boundaries in IST (Format expected: YYYY-MM)
    v_start_date := (p_month || '-01')::date;
    v_end_date := (v_start_date + interval '1 month')::date;

    WITH monthly_jars AS (
        SELECT COALESCE(SUM(jars_delivered), 0) AS total_jars 
        FROM public.jar_transactions 
        WHERE supplier_customer_id = p_supplier_customer_id
          AND (transaction_date AT TIME ZONE 'Asia/Kolkata') >= v_start_date
          AND (transaction_date AT TIME ZONE 'Asia/Kolkata') < v_end_date
    ),
    monthly_billed AS (
        SELECT COALESCE(SUM(amount), 0) AS total_billed
        FROM public.customer_ledger_entries
        WHERE supplier_customer_id = p_supplier_customer_id
          AND reference_type = 'delivery'
          AND entry_type = 'debit'
          AND (created_at AT TIME ZONE 'Asia/Kolkata') >= v_start_date
          AND (created_at AT TIME ZONE 'Asia/Kolkata') < v_end_date
    ),
    monthly_paid AS (
        SELECT COALESCE(SUM(amount), 0) AS total_paid
        FROM public.payments
        WHERE supplier_customer_id = p_supplier_customer_id
          AND (created_at AT TIME ZONE 'Asia/Kolkata') >= v_start_date
          AND (created_at AT TIME ZONE 'Asia/Kolkata') < v_end_date
    ),
    total_outstanding AS (
        SELECT COALESCE(SUM(CASE WHEN entry_type = 'debit' THEN amount ELSE -amount END), 0) AS outstanding
        FROM public.customer_ledger_entries
        WHERE supplier_customer_id = p_supplier_customer_id
    )
    SELECT row_to_json(r) INTO v_res FROM (
        SELECT 
            (SELECT total_jars FROM monthly_jars) AS total_jars,
            (SELECT total_billed FROM monthly_billed) AS total_billed,
            (SELECT total_paid FROM monthly_paid) AS total_paid,
            (SELECT outstanding FROM total_outstanding) AS outstanding
    ) r;

    RETURN v_res;
END;
$$;

-- 3. get_customer_khata_timeline
CREATE OR REPLACE FUNCTION public.get_customer_khata_timeline(p_supplier_customer_id uuid, p_month text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_start_date date;
    v_end_date date;
    v_res json;
BEGIN
    -- Verify RLS
    PERFORM 1 FROM public.supplier_customers 
    WHERE id = p_supplier_customer_id AND (supplier_id = public.get_supplier_id() OR user_id = v_user_id);
    IF NOT FOUND THEN RAISE EXCEPTION 'Unauthorized'; END IF;

    IF p_month IS NOT NULL THEN
        v_start_date := (p_month || '-01')::date;
        v_end_date := (v_start_date + interval '1 month')::date;
    END IF;

    WITH delivery_events AS (
        SELECT 
            'delivery' AS event_type,
            d.created_at AS event_timestamp,
            (SELECT COALESCE(SUM(quantity), 0) FROM public.delivery_items di WHERE di.delivery_id = d.id) AS quantity,
            d.total_amount AS amount,
            NULL AS payment_method,
            d.id AS delivery_id,
            NULL::uuid AS payment_id
        FROM public.deliveries d
        WHERE d.supplier_customer_id = p_supplier_customer_id
          AND (p_month IS NULL OR (
                (d.created_at AT TIME ZONE 'Asia/Kolkata') >= v_start_date AND 
                (d.created_at AT TIME ZONE 'Asia/Kolkata') < v_end_date
              ))
    ),
    payment_events AS (
        SELECT 
            'payment' AS event_type,
            p.created_at AS event_timestamp,
            NULL::bigint AS quantity,
            p.amount AS amount,
            p.payment_method AS payment_method,
            NULL::uuid AS delivery_id,
            p.id AS payment_id
        FROM public.payments p
        WHERE p.supplier_customer_id = p_supplier_customer_id
          AND (p_month IS NULL OR (
                (p.created_at AT TIME ZONE 'Asia/Kolkata') >= v_start_date AND 
                (p.created_at AT TIME ZONE 'Asia/Kolkata') < v_end_date
              ))
    ),
    all_events AS (
        SELECT * FROM delivery_events
        UNION ALL
        SELECT * FROM payment_events
        ORDER BY event_timestamp DESC
    )
    SELECT COALESCE(json_agg(row_to_json(all_events)), '[]'::json) INTO v_res FROM all_events;

    RETURN v_res;
END;
$$;
