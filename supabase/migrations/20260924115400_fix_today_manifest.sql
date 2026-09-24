-- 090_fix_today_manifest.sql

CREATE OR REPLACE FUNCTION public.get_today_manifest()
 RETURNS TABLE(customer_id uuid, customer_name text, customer_type customer_type_enum, phone text, address text, sector text, supplier_product_id uuid, quantity integer, effective_unit_price numeric, expected_amount numeric, jar_balance_before integer, next_delivery_date date, source text, order_id uuid, status text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_supplier_id UUID;
BEGIN
    v_supplier_id := public.get_supplier_id();

    RETURN QUERY
    -- 1. Scheduled CRM Deliveries
    SELECT 
        c.id AS customer_id,
        c.name AS customer_name,
        c.customer_type,
        c.phone,
        c.address,
        c.sector,
        s.supplier_product_id,
        s.quantity,
        COALESCE(cp.price, sp.price) AS effective_unit_price,
        (s.quantity * COALESCE(cp.price, sp.price)) AS expected_amount,
        COALESCE(jb.jars_with_customer, 0) AS jar_balance_before,
        s.next_delivery_date,
        'scheduled'::TEXT AS source,
        NULL::UUID AS order_id,
        'scheduled'::TEXT AS status,
        s.created_at AS created_at
    FROM public.customer_delivery_schedules s
    JOIN public.supplier_customers c ON c.id = s.supplier_customer_id
    JOIN public.supplier_products sp ON sp.id = s.supplier_product_id
    LEFT JOIN public.customer_product_prices cp ON cp.supplier_customer_id = c.id AND (cp.effective_until IS NULL OR cp.effective_until > NOW())
    LEFT JOIN public.customer_jar_balances jb ON jb.supplier_customer_id = c.id
    WHERE c.supplier_id = v_supplier_id 
      AND s.is_active = true 
      AND s.next_delivery_date <= CURRENT_DATE

    UNION ALL

    -- 2. Live Marketplace Orders (ONLY TODAY'S ORDERS)
    SELECT 
        COALESCE(c.id, o.customer_id) AS customer_id, -- use auth.users ID if no supplier_customers record
        COALESCE(c.name, p.name) AS customer_name,
        COALESCE(c.customer_type, 'household'::customer_type_enum) AS customer_type,
        COALESCE(c.phone, p.phone) AS phone,
        COALESCE(c.address, addr.address) AS address,
        c.sector,
        sp.id AS supplier_product_id,
        oi.quantity,
        oi.unit_price AS effective_unit_price,
        (oi.quantity * oi.unit_price) AS expected_amount,
        COALESCE(jb.jars_with_customer, 0) AS jar_balance_before,
        CURRENT_DATE AS next_delivery_date,
        'marketplace'::TEXT AS source,
        o.id AS order_id,
        o.status::TEXT AS status,
        o.created_at AS created_at
    FROM public.orders o
    JOIN public.order_items oi ON oi.order_id = o.id
    JOIN public.supplier_products sp ON sp.product_id = oi.product_id AND sp.supplier_id = o.supplier_id
    LEFT JOIN public.profiles p ON p.id = o.customer_id
    LEFT JOIN public.supplier_customers c ON c.user_id = o.customer_id AND c.supplier_id = o.supplier_id
    LEFT JOIN public.addresses addr ON addr.id = o.address_id
    LEFT JOIN public.customer_jar_balances jb ON jb.supplier_customer_id = c.id
    WHERE o.supplier_id = v_supplier_id 
      AND o.status IN ('placed', 'accepted', 'preparing', 'out_for_delivery')
      AND (o.created_at AT TIME ZONE 'Asia/Kolkata')::DATE = (NOW() AT TIME ZONE 'Asia/Kolkata')::DATE;
END;
$function$;
