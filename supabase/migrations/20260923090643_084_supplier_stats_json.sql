-- 084_supplier_stats_json.sql

DROP FUNCTION IF EXISTS public.get_supplier_today();

CREATE OR REPLACE FUNCTION public.get_supplier_today()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_supplier_id UUID;
    v_result JSON;
BEGIN
    v_supplier_id := public.get_supplier_id();

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
        SELECT COALESCE(SUM(CASE WHEN entry_type = 'debit' THEN amount ELSE -amount END), 0) AS amt
        FROM public.customer_ledger_entries
        WHERE supplier_customer_id IN (SELECT id FROM public.supplier_customers WHERE supplier_id = v_supplier_id)
    )
    SELECT row_to_json(r) INTO v_result FROM (
        SELECT 
            (SELECT COUNT(*)::INT FROM due_schedules) + (SELECT COUNT(*)::INT FROM live_orders) AS deliveries_due,
            (SELECT COALESCE(SUM(quantity), 0)::INT FROM due_schedules) + (SELECT COALESCE(SUM(quantity), 0)::INT FROM live_orders) AS jars_required,
            (SELECT COALESCE(SUM(quantity * price), 0) FROM due_schedules) + (SELECT COALESCE(SUM(quantity * price), 0) FROM live_orders) AS expected_revenue,
            (SELECT COUNT(*)::INT FROM todays_deliveries) AS deliveries_done,
            (SELECT COALESCE(SUM(total_amount), 0) FROM todays_deliveries) AS billed_today,
            (SELECT COALESCE(SUM(collected), 0) FROM todays_deliveries) AS collected_today,
            (SELECT amt FROM total_outstanding) AS outstanding_total
    ) r;

    RETURN v_result;
END;
$$;