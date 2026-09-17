-- Phase 4: Admin Dashboard + Network Operations
-- Adds network visibility RPCs and administrative operations

-- 1. Schema Extensions
-- ==========================================
ALTER TABLE public.suppliers 
ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN (
        auth.jwt() ->> 'email' = 'amritdhara@aquakart.com' OR 
        auth.jwt() ->> 'email' = 'admin@aquakart.com' OR
        current_setting('request.jwt.claims', true)::json->>'role' = 'service_role' OR
        public.get_user_role() = 'admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Overview & Network Views
-- ==========================================

-- 4.1 Admin Overview
CREATE OR REPLACE FUNCTION public.get_admin_network_overview()
RETURNS TABLE (
    total_suppliers BIGINT,
    active_suppliers BIGINT,
    total_customers BIGINT,
    orders_today BIGINT,
    deliveries_today BIGINT,
    pending_orders BIGINT,
    jars_in_network BIGINT
) AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    RETURN QUERY
    SELECT 
        (SELECT COUNT(*) FROM public.suppliers)::BIGINT AS total_suppliers,
        (SELECT COUNT(*) FROM public.suppliers WHERE is_active = true)::BIGINT AS active_suppliers,
        (SELECT COUNT(id) FROM public.supplier_customers)::BIGINT AS total_customers,
        (SELECT COUNT(*) FROM public.orders WHERE DATE(created_at AT TIME ZONE 'UTC') = current_date)::BIGINT AS orders_today,
        (SELECT COUNT(*) FROM public.deliveries WHERE DATE(delivery_date AT TIME ZONE 'UTC') = current_date AND status = 'completed')::BIGINT AS deliveries_today,
        (SELECT COUNT(*) FROM public.orders WHERE status IN ('placed', 'accepted', 'preparing', 'out_for_delivery'))::BIGINT AS pending_orders,
        (SELECT COALESCE(SUM(jars_with_customer), 0) FROM public.customer_jar_balances)::BIGINT AS jars_in_network;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4.3 Customer Network View
CREATE OR REPLACE FUNCTION public.get_admin_customer_network_view()
RETURNS TABLE (
    sector TEXT,
    customer_count BIGINT
) AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    RETURN QUERY
    SELECT 
        COALESCE(sc.sector, 'Unassigned') AS sector,
        COUNT(sc.id)::BIGINT AS customer_count
    FROM public.supplier_customers sc
    GROUP BY COALESCE(sc.sector, 'Unassigned')
    ORDER BY customer_count DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4.6 Network capacity view
CREATE OR REPLACE FUNCTION public.get_admin_network_capacity()
RETURNS TABLE (
    supplier_name TEXT,
    sector TEXT,
    total_capacity INT,
    reserved_capacity INT,
    remaining_capacity INT
) AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    RETURN QUERY
    SELECT 
        s.business_name AS supplier_name,
        COALESCE(s.address, 'Unassigned') AS sector,
        sc.max_capacity AS total_capacity,
        (sc.reserved_quantity + sc.fulfilled_quantity) AS reserved_capacity,
        (sc.max_capacity - (sc.reserved_quantity + sc.fulfilled_quantity)) AS remaining_capacity
    FROM public.suppliers s
    JOIN public.supplier_capacity sc ON sc.supplier_id = s.id
    WHERE sc.date = current_date
    ORDER BY remaining_capacity DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. Supplier Management
-- ==========================================

-- 4.2 Supplier Management
CREATE OR REPLACE FUNCTION public.get_admin_suppliers_list()
RETURNS TABLE (
    supplier_id UUID,
    business_name TEXT,
    area TEXT,
    status TEXT,
    capacity INT,
    active_customers BIGINT,
    orders_today BIGINT,
    fulfillment_rate NUMERIC
) AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    RETURN QUERY
    WITH supplier_stats AS (
        SELECT 
            s.id,
            COUNT(DISTINCT c.id) AS active_customers,
            COUNT(DISTINCT o.id) AS orders_today,
            COUNT(DISTINCT CASE WHEN o.status = 'delivered' THEN o.id END) AS fulfilled_orders
        FROM public.suppliers s
        LEFT JOIN public.supplier_customers c ON c.supplier_id = s.id AND c.is_active = true
        LEFT JOIN public.orders o ON o.supplier_id = s.id AND DATE(o.created_at AT TIME ZONE 'UTC') = current_date
        GROUP BY s.id
    )
    SELECT 
        s.id AS supplier_id,
        s.business_name,
        COALESCE(s.address, 'Unassigned') AS area,
        CASE 
            WHEN s.is_active AND s.is_verified THEN 'Active'
            WHEN s.is_active AND NOT s.is_verified THEN 'Pending Verification'
            ELSE 'Inactive'
        END AS status,
        COALESCE(cap.max_capacity, 0) AS capacity,
        COALESCE(st.active_customers, 0)::BIGINT AS active_customers,
        COALESCE(st.orders_today, 0)::BIGINT AS orders_today,
        CASE 
            WHEN st.orders_today > 0 THEN ROUND((st.fulfilled_orders::NUMERIC / st.orders_today::NUMERIC) * 100, 2)
            ELSE 0 
        END AS fulfillment_rate
    FROM public.suppliers s
    LEFT JOIN public.supplier_capacity cap ON cap.supplier_id = s.id AND cap.date = current_date
    LEFT JOIN supplier_stats st ON st.id = s.id
    ORDER BY s.business_name ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION public.admin_update_supplier_status(
    p_supplier_id UUID,
    p_is_active BOOLEAN,
    p_is_verified BOOLEAN
)
RETURNS VOID AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    UPDATE public.suppliers
    SET 
        is_active = COALESCE(p_is_active, is_active),
        is_verified = COALESCE(p_is_verified, is_verified)
    WHERE id = p_supplier_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. Order Monitoring & Reassignment
-- ==========================================

-- 4.4 Order Monitoring
CREATE OR REPLACE FUNCTION public.get_admin_orders(
    p_date DATE DEFAULT current_date,
    p_supplier_id UUID DEFAULT NULL,
    p_status TEXT DEFAULT NULL,
    p_sector TEXT DEFAULT NULL
)
RETURNS TABLE (
    order_id UUID,
    display_id TEXT,
    customer_name TEXT,
    supplier_name TEXT,
    sector TEXT,
    status TEXT,
    created_at TIMESTAMPTZ,
    total_amount NUMERIC
) AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    RETURN QUERY
    SELECT 
        o.id AS order_id,
        o.display_id,
        p.full_name AS customer_name,
        s.business_name AS supplier_name,
        COALESCE(a.sector, 'Unassigned') AS sector,
        o.status,
        o.created_at,
        o.total AS total_amount
    FROM public.orders o
    JOIN public.profiles p ON p.id = o.customer_id
    JOIN public.suppliers s ON s.id = o.supplier_id
    JOIN public.addresses a ON a.id = o.address_id
    WHERE DATE(o.created_at AT TIME ZONE 'UTC') = p_date
      AND (p_supplier_id IS NULL OR o.supplier_id = p_supplier_id)
      AND (p_status IS NULL OR o.status = p_status)
      AND (p_sector IS NULL OR a.sector = p_sector)
    ORDER BY o.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4.5 Manual reassignment (Candidates)
CREATE OR REPLACE FUNCTION public.get_reassignment_candidates(
    p_order_id UUID
)
RETURNS TABLE (
    supplier_id UUID,
    business_name TEXT,
    capacity INT,
    remaining_capacity INT,
    distance_km NUMERIC
) AS $$
DECLARE
    v_order_sector TEXT;
    v_order_qty INT;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    -- Get order details
    SELECT a.sector, COALESCE((SELECT SUM(quantity) FROM public.order_items WHERE order_id = p_order_id), 0)
    INTO v_order_sector, v_order_qty
    FROM public.orders o
    JOIN public.addresses a ON a.id = o.address_id
    WHERE o.id = p_order_id;

    RETURN QUERY
    SELECT 
        s.id AS supplier_id,
        s.business_name,
        cap.max_capacity AS capacity,
        (cap.max_capacity - (cap.reserved_quantity + cap.fulfilled_quantity)) AS remaining_capacity,
        0.0::NUMERIC AS distance_km -- Mocked for now, pending geo-routing
    FROM public.suppliers s
    JOIN public.supplier_capacity cap ON cap.supplier_id = s.id AND cap.date = current_date
    WHERE s.is_active = true 
      AND s.is_accepting_orders = true
      AND s.address = v_order_sector
      AND (cap.max_capacity - (cap.reserved_quantity + cap.fulfilled_quantity)) >= v_order_qty
      AND s.id != (SELECT supplier_id FROM public.orders WHERE id = p_order_id)
    ORDER BY remaining_capacity DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4.5 Manual reassignment (Action)
DROP FUNCTION IF EXISTS public.admin_reassign_order(UUID, UUID);

CREATE OR REPLACE FUNCTION public.admin_reassign_order(
    p_order_id UUID,
    p_new_supplier_id UUID,
    p_reason TEXT DEFAULT 'Admin reassignment'
)
RETURNS VOID AS $$
DECLARE
    v_order RECORD;
    v_target_supplier RECORD;
    v_order_item RECORD;
    v_supplier_product RECORD;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
    IF v_order.status NOT IN ('placed', 'accepted', 'preparing') THEN
        RAISE EXCEPTION 'Order cannot be reassigned in current state';
    END IF;

    -- Validate target supplier is active
    SELECT * INTO v_target_supplier FROM public.suppliers WHERE id = p_new_supplier_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Target supplier not found'; END IF;
    IF NOT v_target_supplier.is_active THEN RAISE EXCEPTION 'Target supplier is not active'; END IF;

    -- Verify target supplier offers the ordered product and has it available
    FOR v_order_item IN SELECT * FROM public.order_items WHERE order_id = p_order_id
    LOOP
        SELECT * INTO v_supplier_product FROM public.supplier_products 
        WHERE supplier_id = p_new_supplier_id AND product_id = v_order_item.product_id;
        
        IF NOT FOUND THEN RAISE EXCEPTION 'Target supplier does not offer product %', v_order_item.product_id; END IF;
        IF NOT v_supplier_product.available THEN RAISE EXCEPTION 'Target supplier product % is not available', v_order_item.product_id; END IF;
    END LOOP;

    -- Update order
    UPDATE public.orders 
    SET supplier_id = p_new_supplier_id, 
        status = 'placed', -- Reset to placed for new supplier
        updated_at = NOW()
    WHERE id = p_order_id;

    -- Log history
    INSERT INTO public.order_status_history (order_id, status, notes)
    VALUES (p_order_id, 'placed', 'Reassigned to new supplier by admin: ' || p_reason);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 5. Operational Alerts
-- ==========================================

-- 4.7 Operational alerts
CREATE OR REPLACE FUNCTION public.get_admin_operational_alerts()
RETURNS TABLE (
    alert_type TEXT,
    severity TEXT,
    entity_id UUID,
    entity_name TEXT,
    message TEXT
) AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    -- Alert 1: Suppliers near capacity (>90%)
    RETURN QUERY
    SELECT 
        'capacity_warning'::TEXT AS alert_type,
        'high'::TEXT AS severity,
        s.id AS entity_id,
        s.business_name AS entity_name,
        'Supplier is operating at ' || ROUND(((cap.reserved_quantity + cap.fulfilled_quantity)::NUMERIC / NULLIF(cap.max_capacity, 0)) * 100, 1) || '% capacity' AS message
    FROM public.suppliers s
    JOIN public.supplier_capacity cap ON cap.supplier_id = s.id AND cap.date = current_date
    WHERE cap.max_capacity > 0 
      AND ((cap.reserved_quantity + cap.fulfilled_quantity)::NUMERIC / cap.max_capacity) >= 0.9
      AND s.is_active = true;

    -- Alert 2: Inactive suppliers with pending orders
    RETURN QUERY
    SELECT 
        'inactive_with_orders'::TEXT AS alert_type,
        'critical'::TEXT AS severity,
        s.id AS entity_id,
        s.business_name AS entity_name,
        'Supplier is inactive but has ' || COUNT(o.id) || ' pending orders' AS message
    FROM public.suppliers s
    JOIN public.orders o ON o.supplier_id = s.id
    WHERE s.is_active = false 
      AND o.status IN ('placed', 'accepted', 'preparing', 'out_for_delivery')
    GROUP BY s.id, s.business_name;

    -- Alert 3: Potential demand-capacity gap by sector
    RETURN QUERY
    WITH sector_demand AS (
        SELECT COALESCE(sc.sector, 'Unassigned') AS sector, COUNT(sc.id) AS demand
        FROM public.supplier_customers sc
        GROUP BY COALESCE(sc.sector, 'Unassigned')
    ),
    sector_capacity AS (
        SELECT COALESCE(s.address, 'Unassigned') AS sector, SUM(cap.max_capacity) AS total_cap
        FROM public.supplier_capacity cap
        JOIN public.suppliers s ON s.id = cap.supplier_id
        WHERE s.is_active = true AND cap.date = current_date
        GROUP BY COALESCE(s.address, 'Unassigned')
    )
    SELECT 
        'sector_capacity_gap'::TEXT AS alert_type,
        'medium'::TEXT AS severity,
        NULL::UUID AS entity_id,
        sd.sector AS entity_name,
        'Sector demand (' || sd.demand || ' customers) may exceed active supplier capacity (' || COALESCE(sc.total_cap, 0) || ' jars)' AS message
    FROM sector_demand sd
    LEFT JOIN sector_capacity sc ON sc.sector = sd.sector
    WHERE COALESCE(sc.total_cap, 0) < sd.demand * 2; -- Heuristic: Assume ~2 jars per customer max
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
