-- 041_fix_ambiguous_column.sql
-- Fixes ambiguous column reference in get_supplier_forecast

CREATE OR REPLACE FUNCTION public.get_supplier_forecast(p_supplier_id UUID DEFAULT NULL)
RETURNS TABLE (
    supplier_id UUID,
    business_name TEXT,
    scheduled_demand INT,
    avg_marketplace_demand INT,
    total_forecast INT,
    current_inventory INT,
    shortfall INT,
    is_at_risk BOOLEAN
) AS $$
DECLARE
    v_supplier_id UUID;
    v_tomorrow DATE := CURRENT_DATE + INTERVAL '1 day';
    v_seven_days_ago DATE := CURRENT_DATE - INTERVAL '7 days';
BEGIN
    -- If p_supplier_id is null, assume it's the supplier calling for their own dashboard
    IF p_supplier_id IS NULL THEN
        v_supplier_id := public.get_supplier_id();
    ELSE
        v_supplier_id := p_supplier_id;
    END IF;

    RETURN QUERY
    WITH tomorrow_schedules AS (
        SELECT COALESCE(SUM(quantity), 0)::INT AS demand
        FROM public.customer_delivery_schedules
        WHERE supplier_customer_id IN (SELECT sc.id FROM public.supplier_customers sc WHERE sc.supplier_id = v_supplier_id)
        AND is_active = true
        AND next_delivery_date = v_tomorrow
    ),
    historical_orders AS (
        SELECT COALESCE(SUM(oi.quantity) / 7.0, 0)::INT AS avg_demand
        FROM public.orders o
        JOIN public.order_items oi ON oi.order_id = o.id
        WHERE o.supplier_id = v_supplier_id
        AND o.status = 'delivered'
        AND timezone('Asia/Kolkata', o.created_at)::date >= v_seven_days_ago
        AND timezone('Asia/Kolkata', o.created_at)::date < CURRENT_DATE
    ),
    inventory AS (
        SELECT COALESCE(available, 0)::INT AS jars
        FROM public.supplier_inventory si
        WHERE si.supplier_id = v_supplier_id
    )
    SELECT 
        s.id AS supplier_id,
        s.business_name,
        ts.demand AS scheduled_demand,
        ho.avg_demand AS avg_marketplace_demand,
        (ts.demand + ho.avg_demand) AS total_forecast,
        inv.jars AS current_inventory,
        GREATEST(0, (ts.demand + ho.avg_demand) - inv.jars) AS shortfall,
        ((ts.demand + ho.avg_demand) > inv.jars) AS is_at_risk
    FROM public.suppliers s,
         tomorrow_schedules ts,
         historical_orders ho,
         inventory inv
    WHERE s.id = v_supplier_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
