-- 038_phase5_network_integration.sql
-- Network Integration bridging the Marketplace and the Supplier OS CRM

-- 1. Secure Supplier Discovery (Strictly enforce verification and availability)
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
    SELECT s.id, s.profile_id, s.business_name, s.description, s.phone, s.address, s.lat, s.lng, s.is_accepting_orders,
           (6371 * acos(cos(radians(p_lat)) * cos(radians(s.lat)) * cos(radians(s.lng) - radians(p_lng)) + sin(radians(p_lat)) * sin(radians(s.lat)))) AS distance,
           (6371 * acos(cos(radians(p_lat)) * cos(radians(s.lat)) * cos(radians(s.lng) - radians(p_lng)) + sin(radians(p_lat)) * sin(radians(s.lat)))) AS distance_km,
           COALESCE(
               -- Try to get custom price for this customer and supplier
               (
                   SELECT cpp.price 
                   FROM public.customer_product_prices cpp
                   JOIN public.supplier_customers sc ON cpp.supplier_customer_id = sc.id
                   WHERE sc.user_id = v_user_id AND sc.supplier_id = s.id
                   AND cpp.supplier_product_id = (SELECT sp.id FROM public.supplier_products sp WHERE sp.supplier_id = s.id AND sp.available = true LIMIT 1)
                   AND cpp.effective_until IS NULL
                   LIMIT 1
               ),
               -- Fallback to public price
               (SELECT sp.price FROM public.supplier_products sp WHERE sp.supplier_id = s.id AND sp.available = true LIMIT 1)
           ) as price,
           (SELECT (sc.max_capacity - sc.reserved_quantity - sc.fulfilled_quantity) FROM public.supplier_capacity sc WHERE sc.supplier_id = s.id AND sc.date = timezone('Asia/Kolkata', now())::date LIMIT 1) as available_quantity
    FROM public.suppliers s
    WHERE s.is_active = true 
    AND s.is_verified = true 
    AND s.is_accepting_orders = true
    AND EXISTS (
        SELECT 1 FROM public.supplier_products sp WHERE sp.supplier_id = s.id AND sp.available = true
    )
    AND EXISTS (
        SELECT 1 FROM public.supplier_capacity sc
        WHERE sc.supplier_id = s.id AND sc.date = timezone('Asia/Kolkata', now())::date
        AND (sc.max_capacity - sc.reserved_quantity - sc.fulfilled_quantity) > 0
    )
    ORDER BY distance ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;


-- 2. Smart Order Placement (Dynamic CRM Sync + Secure Pricing + Capacity check)
CREATE OR REPLACE FUNCTION public.place_order(
    p_supplier_id UUID,
    p_address_id UUID,
    p_product_id UUID,
    p_quantity INT,
    p_payment_method TEXT
) RETURNS UUID AS $$
DECLARE
    v_order_id UUID;
    v_user_id UUID;
    v_supplier_customer_id UUID;
    v_unit_price NUMERIC(10,2);
    v_subtotal NUMERIC(10,2);
    v_delivery_fee NUMERIC(10,2) := 0;
    v_supplier_product_id UUID;
    v_available_capacity INT;
    v_customer_profile RECORD;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

    -- Map marketplace customer to Supplier CRM (Create if doesn't exist)
    SELECT id INTO v_supplier_customer_id FROM public.supplier_customers 
    WHERE user_id = v_user_id AND supplier_id = p_supplier_id;

    IF v_supplier_customer_id IS NULL THEN
        -- Get user profile details to populate CRM
        SELECT * INTO v_customer_profile FROM public.profiles WHERE id = v_user_id;
        
        INSERT INTO public.supplier_customers (supplier_id, user_id, name, phone, customer_type, address, sector)
        VALUES (
            p_supplier_id, 
            v_user_id, 
            v_customer_profile.full_name, 
            v_customer_profile.phone, 
            'individual', 
            '', 
            ''
        ) RETURNING id INTO v_supplier_customer_id;
    END IF;

    -- Validate product and get supplier_product_id
    SELECT id INTO v_supplier_product_id 
    FROM public.supplier_products 
    WHERE supplier_id = p_supplier_id AND product_id = p_product_id AND available = true;
    
    IF v_supplier_product_id IS NULL THEN RAISE EXCEPTION 'Product not available from this supplier'; END IF;

    -- Check Capacity First
    SELECT (max_capacity - reserved_quantity - fulfilled_quantity) INTO v_available_capacity 
    FROM public.supplier_capacity 
    WHERE supplier_id = p_supplier_id AND date = timezone('Asia/Kolkata', now())::date;

    IF COALESCE(v_available_capacity, 0) < p_quantity THEN 
        RAISE EXCEPTION 'Insufficient supplier capacity for this order'; 
    END IF;

    -- Resolve secure price
    v_unit_price := public.get_effective_customer_price(v_supplier_customer_id, v_supplier_product_id);
    IF v_unit_price IS NULL THEN RAISE EXCEPTION 'Could not resolve pricing'; END IF;

    v_subtotal := v_unit_price * p_quantity;

    -- Insert Order
    INSERT INTO public.orders (customer_id, supplier_id, address_id, status, subtotal, delivery_fee, total, payment_method, payment_status)
    VALUES (v_user_id, p_supplier_id, p_address_id, 'placed', v_subtotal, v_delivery_fee, v_subtotal + v_delivery_fee, p_payment_method, 'pending')
    RETURNING id INTO v_order_id;

    -- Insert Order Items
    INSERT INTO public.order_items (order_id, product_id, quantity, unit_price, total)
    VALUES (v_order_id, p_product_id, p_quantity, v_unit_price, v_subtotal);

    -- Track history
    INSERT INTO public.order_status_history (order_id, status, changed_by)
    VALUES (v_order_id, 'placed', v_user_id);

    RETURN v_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. Automated Order Completion (Converge marketplace order into CRM Delivery)
CREATE OR REPLACE FUNCTION public.update_order_status(p_order_id UUID, p_new_status TEXT) RETURNS VOID AS $$
DECLARE
    v_order RECORD;
    v_total_quantity INT;
    v_order_date DATE;
    v_supplier_customer_id UUID;
    v_supplier_product_id UUID;
    v_unit_price NUMERIC(10,2);
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

    IF p_new_status = 'accepted' THEN
        PERFORM public.accept_order(p_order_id);
        RETURN;
    ELSIF p_new_status = 'rejected' THEN
        PERFORM public.reject_order(p_order_id, 'Rejected by supplier');
        RETURN;
    END IF;

    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    SELECT SUM(quantity), MAX(unit_price), (array_agg(product_id))[1] INTO v_total_quantity, v_unit_price, v_supplier_product_id 
    FROM public.order_items WHERE order_id = p_order_id;
    
    v_order_date := timezone('Asia/Kolkata', v_order.created_at)::date;

    IF p_new_status = 'cancelled' AND v_order.status IN ('accepted', 'preparing', 'out_for_delivery') THEN
        UPDATE public.supplier_capacity SET reserved_quantity = reserved_quantity - v_total_quantity 
        WHERE supplier_id = v_order.supplier_id AND date = v_order_date;
        
    ELSIF p_new_status = 'delivered' AND v_order.status = 'out_for_delivery' THEN
        -- Standard order capacity logic
        UPDATE public.supplier_capacity SET reserved_quantity = reserved_quantity - v_total_quantity, fulfilled_quantity = fulfilled_quantity + v_total_quantity 
        WHERE supplier_id = v_order.supplier_id AND date = v_order_date;
        
        -- Get the CRM mapping
        SELECT id INTO v_supplier_customer_id FROM public.supplier_customers 
        WHERE user_id = v_order.customer_id AND supplier_id = v_order.supplier_id;
        
        -- Get the exact supplier product
        SELECT id INTO v_supplier_product_id FROM public.supplier_products 
        WHERE supplier_id = v_order.supplier_id AND product_id = (SELECT product_id FROM public.order_items WHERE order_id = p_order_id LIMIT 1);

        -- Record the transaction into the Supplier CRM (creates delivery, adjusts jars, ledger)
        IF v_supplier_customer_id IS NOT NULL AND v_supplier_product_id IS NOT NULL THEN
            PERFORM public.complete_delivery(
                v_supplier_customer_id,
                v_supplier_product_id,
                v_total_quantity,
                v_unit_price,
                v_total_quantity, -- Assumes jars delivered = quantity
                0, -- No returned jars tracked directly in marketplace yet
                (CASE WHEN v_order.payment_status = 'paid' THEN v_order.total ELSE 0 END), -- Amount collected
                v_order.payment_method
            );
        END IF;
    END IF;

    UPDATE public.orders SET status = p_new_status WHERE id = p_order_id;
    INSERT INTO public.order_status_history (order_id, status, changed_by) VALUES (p_order_id, p_new_status, auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. Converged Manifest (Scheduled CRM + Live Marketplace)
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
      AND o.status IN ('placed', 'accepted', 'preparing', 'out_for_delivery')
      AND timezone('Asia/Kolkata', o.created_at)::date = CURRENT_DATE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 5. Converged Today Overview (Scheduled CRM + Live Marketplace)
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
          AND timezone('Asia/Kolkata', o.created_at)::date = CURRENT_DATE
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
