-- 039_phase6_network_intelligence.sql
-- Predictive balancing and intelligent routing

-- 1. Modified get_available_suppliers (Phase 6 Intelligence)
DROP FUNCTION IF EXISTS public.get_available_suppliers(DOUBLE PRECISION, DOUBLE PRECISION);
CREATE OR REPLACE FUNCTION public.get_available_suppliers(p_lat DOUBLE PRECISION, p_lng DOUBLE PRECISION)
RETURNS TABLE (
    id UUID,
    profile_id UUID,
    business_name TEXT,
    description TEXT,
    phone TEXT,
    address TEXT,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    is_accepting_orders BOOLEAN,
    distance DOUBLE PRECISION,
    distance_km DOUBLE PRECISION,
    price NUMERIC(10,2),
    available_quantity INTEGER
) AS $$
DECLARE
    v_user_id UUID;
BEGIN
    v_user_id := auth.uid();

    RETURN QUERY
    SELECT 
        s.id, s.profile_id, s.business_name, s.description, s.phone, s.address, s.lat, s.lng, s.is_accepting_orders,
        -- Apply artificial +5km penalty if capacity is dangerously low (< 10%)
        (CASE 
            WHEN (sc.max_capacity - sc.reserved_quantity - sc.fulfilled_quantity) < (sc.max_capacity * 0.10) 
            THEN (6371 * acos(cos(radians(p_lat)) * cos(radians(s.lat)) * cos(radians(s.lng) - radians(p_lng)) + sin(radians(p_lat)) * sin(radians(s.lat)))) + 5.0
            ELSE (6371 * acos(cos(radians(p_lat)) * cos(radians(s.lat)) * cos(radians(s.lng) - radians(p_lng)) + sin(radians(p_lat)) * sin(radians(s.lat))))
        END) AS distance,
        (CASE 
            WHEN (sc.max_capacity - sc.reserved_quantity - sc.fulfilled_quantity) < (sc.max_capacity * 0.10) 
            THEN (6371 * acos(cos(radians(p_lat)) * cos(radians(s.lat)) * cos(radians(s.lng) - radians(p_lng)) + sin(radians(p_lat)) * sin(radians(s.lat)))) + 5.0
            ELSE (6371 * acos(cos(radians(p_lat)) * cos(radians(s.lat)) * cos(radians(s.lng) - radians(p_lng)) + sin(radians(p_lat)) * sin(radians(s.lat))))
        END) AS distance_km,
        COALESCE(
            (
                SELECT cpp.price 
                FROM public.customer_product_prices cpp
                JOIN public.supplier_customers s_c ON cpp.supplier_customer_id = s_c.id
                WHERE s_c.user_id = v_user_id AND s_c.supplier_id = s.id
                AND cpp.supplier_product_id = (SELECT sp.id FROM public.supplier_products sp WHERE sp.supplier_id = s.id AND sp.available = true LIMIT 1)
                AND cpp.effective_until IS NULL
                LIMIT 1
            ),
            (SELECT sp.price FROM public.supplier_products sp WHERE sp.supplier_id = s.id AND sp.available = true LIMIT 1)
        ) as price,
        (sc.max_capacity - sc.reserved_quantity - sc.fulfilled_quantity) as available_quantity
    FROM public.suppliers s
    JOIN public.supplier_capacity sc ON sc.supplier_id = s.id AND sc.date = timezone('Asia/Kolkata', now())::date
    WHERE s.is_active = true 
    AND s.is_verified = true 
    AND s.is_accepting_orders = true
    AND (sc.max_capacity - sc.reserved_quantity - sc.fulfilled_quantity) > 0
    AND EXISTS (
        SELECT 1 FROM public.supplier_products sp WHERE sp.supplier_id = s.id AND sp.available = true
    )
    ORDER BY distance ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;


-- 2. Predictive Forecasting
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
        FROM public.supplier_inventory
        WHERE supplier_inventory.supplier_id = v_supplier_id
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


-- 3. Network Health Aggregation (For Admin)
CREATE OR REPLACE FUNCTION public.get_network_health_risks()
RETURNS TABLE (
    supplier_id UUID,
    business_name TEXT,
    total_forecast INT,
    current_inventory INT,
    shortfall INT
) AS $$
BEGIN
    IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin only'; END IF;

    RETURN QUERY
    SELECT 
        f.supplier_id,
        f.business_name,
        f.total_forecast,
        f.current_inventory,
        f.shortfall
    FROM public.suppliers s
    CROSS JOIN LATERAL public.get_supplier_forecast(s.id) f
    WHERE s.is_active = true 
    AND f.is_at_risk = true
    ORDER BY f.shortfall DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
