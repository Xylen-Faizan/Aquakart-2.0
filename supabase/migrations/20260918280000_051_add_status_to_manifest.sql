-- 051_add_status_to_manifest.sql
-- Add status field to get_today_manifest to allow UI to render Accept/Reject for placed orders

DROP FUNCTION IF EXISTS public.get_today_manifest();

CREATE OR REPLACE FUNCTION public.get_today_manifest()
RETURNS TABLE (
    customer_id UUID,
    customer_name TEXT,
    customer_type public.customer_type_enum,
    phone TEXT,
    address TEXT,
    sector TEXT,
    supplier_product_id UUID,
    quantity INT,
    effective_unit_price NUMERIC,
    expected_amount NUMERIC,
    jar_balance_before INT,
    next_delivery_date DATE,
    source TEXT,
    order_id UUID,
    status TEXT
) AS $$
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
        'scheduled'::TEXT AS status
    FROM public.customer_delivery_schedules s
    JOIN public.supplier_customers c ON c.id = s.supplier_customer_id
    JOIN public.supplier_products sp ON sp.id = s.supplier_product_id
    LEFT JOIN public.customer_product_prices cp ON cp.supplier_customer_id = c.id AND (cp.effective_until IS NULL OR cp.effective_until > NOW())
    LEFT JOIN public.customer_jar_balances jb ON jb.supplier_customer_id = c.id
    WHERE c.supplier_id = v_supplier_id 
      AND s.is_active = true 
      AND s.next_delivery_date <= CURRENT_DATE

    UNION ALL

    -- 2. Live Marketplace Orders
    SELECT 
        c.id AS customer_id,
        c.name AS customer_name,
        c.customer_type,
        c.phone,
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
        o.status::TEXT AS status
    FROM public.orders o
    JOIN public.order_items oi ON oi.order_id = o.id
    JOIN public.supplier_customers c ON c.user_id = o.customer_id AND c.supplier_id = o.supplier_id
    JOIN public.supplier_products sp ON sp.product_id = oi.product_id AND sp.supplier_id = o.supplier_id
    LEFT JOIN public.addresses addr ON addr.id = o.address_id
    LEFT JOIN public.customer_jar_balances jb ON jb.supplier_customer_id = c.id
    WHERE o.supplier_id = v_supplier_id 
      AND o.status IN ('placed', 'accepted', 'preparing', 'out_for_delivery');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
