-- 050_fix_marketplace_order_visibility.sql
-- Removes the problematic date filter for live marketplace orders so they always show until delivered/cancelled

-- 1. Update get_supplier_today to include all active marketplace orders regardless of timezone artifacts
CREATE OR REPLACE FUNCTION public.get_supplier_today()
RETURNS TABLE (
    deliveries_due INT,
    jars_required INT,
    expected_revenue NUMERIC,
    deliveries_done INT,
    billed_today NUMERIC,
    collected_today NUMERIC,
    outstanding_total NUMERIC
) AS $$
DECLARE
    v_supplier_id UUID;
BEGIN
    v_supplier_id := public.get_supplier_id();

    RETURN QUERY
    WITH due_schedules AS (
        SELECT 
            s.quantity,
            COALESCE(cp.price, sp.price) AS price
        FROM public.customer_delivery_schedules s
        JOIN public.supplier_customers c ON c.id = s.supplier_customer_id
        JOIN public.supplier_products sp ON sp.id = s.supplier_product_id
        LEFT JOIN public.customer_product_prices cp ON cp.supplier_customer_id = c.id AND (cp.effective_until IS NULL OR cp.effective_until > NOW())
        WHERE c.supplier_id = v_supplier_id 
          AND s.is_active = true 
          AND s.next_delivery_date <= CURRENT_DATE
    ),
    live_orders AS (
        SELECT 
            oi.quantity,
            oi.unit_price AS price
        FROM public.orders o
        JOIN public.order_items oi ON oi.order_id = o.id
        WHERE o.supplier_id = v_supplier_id 
          AND o.status IN ('placed', 'accepted', 'preparing', 'out_for_delivery')
          -- REMOVED timezone date check so active orders always appear!
    ),
    todays_deliveries AS (
        SELECT 
            di.quantity, 
            d.total_amount,
            (SELECT COALESCE(SUM(amount), 0) FROM public.payments WHERE delivery_id = d.id) AS collected
        FROM public.deliveries d
        LEFT JOIN public.delivery_items di ON di.delivery_id = d.id
        WHERE d.supplier_id = v_supplier_id 
          AND d.delivery_date = CURRENT_DATE
          AND d.status = 'delivered'
    ),
    total_outstanding AS (
        SELECT COALESCE(SUM(balance), 0) AS amt
        FROM public.customer_ledger
        WHERE supplier_customer_id IN (SELECT id FROM public.supplier_customers WHERE supplier_id = v_supplier_id)
    )
    SELECT 
        (SELECT COUNT(*)::INT FROM due_schedules) + (SELECT COUNT(*)::INT FROM live_orders) AS deliveries_due,
        (SELECT COALESCE(SUM(quantity), 0)::INT FROM due_schedules) + (SELECT COALESCE(SUM(quantity), 0)::INT FROM live_orders) AS jars_required,
        (SELECT COALESCE(SUM(quantity * price), 0) FROM due_schedules) + (SELECT COALESCE(SUM(quantity * price), 0) FROM live_orders) AS expected_revenue,
        (SELECT COUNT(*)::INT FROM todays_deliveries) AS deliveries_done,
        (SELECT COALESCE(SUM(total_amount), 0) FROM todays_deliveries) AS billed_today,
        (SELECT COALESCE(SUM(collected), 0) FROM todays_deliveries) AS collected_today,
        (SELECT amt FROM total_outstanding) AS outstanding_total;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Update get_today_manifest to also remove the date filter
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
    order_id UUID
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
        NULL::UUID AS order_id
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
        COALESCE(c.address, addr.full_address) AS address,
        c.sector,
        sp.id AS supplier_product_id,
        oi.quantity,
        oi.unit_price AS effective_unit_price,
        (oi.quantity * oi.unit_price) AS expected_amount,
        COALESCE(jb.jars_with_customer, 0) AS jar_balance_before,
        CURRENT_DATE AS next_delivery_date,
        'marketplace'::TEXT AS source,
        o.id AS order_id
    FROM public.orders o
    JOIN public.order_items oi ON oi.order_id = o.id
    JOIN public.supplier_customers c ON c.user_id = o.customer_id AND c.supplier_id = o.supplier_id
    JOIN public.supplier_products sp ON sp.product_id = oi.product_id AND sp.supplier_id = o.supplier_id
    LEFT JOIN public.addresses addr ON addr.id = o.address_id
    LEFT JOIN public.customer_jar_balances jb ON jb.supplier_customer_id = c.id
    WHERE o.supplier_id = v_supplier_id 
      AND o.status IN ('placed', 'accepted', 'preparing', 'out_for_delivery');
      -- REMOVED timezone date check so active orders always appear!
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
