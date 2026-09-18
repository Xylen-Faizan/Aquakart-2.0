-- 057_persistent_capacity_and_fixes.sql
-- Makes supplier capacity persistent across days without requiring daily manual updates
-- and fixes the place_order function which was missing the capacity update.

-- 1. Update get_available_suppliers to fallback to latest known max_capacity
CREATE OR REPLACE FUNCTION public.get_available_suppliers(p_lat DOUBLE PRECISION DEFAULT NULL, p_lng DOUBLE PRECISION DEFAULT NULL)
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
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

    RETURN QUERY
    SELECT s.id, s.profile_id, s.business_name, s.description, s.phone, s.address, s.lat, s.lng, s.is_accepting_orders,
           COALESCE(
               (6371 * acos(cos(radians(p_lat)) * cos(radians(s.lat)) * cos(radians(s.lng) - radians(p_lng)) + sin(radians(p_lat)) * sin(radians(s.lat)))), 
           0) as distance,
           COALESCE(
               (6371 * acos(cos(radians(p_lat)) * cos(radians(s.lat)) * cos(radians(s.lng) - radians(p_lng)) + sin(radians(p_lat)) * sin(radians(s.lat)))), 
           0) as distance_km,
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
           (SELECT (
               COALESCE(sc.max_capacity, (SELECT max_capacity FROM public.supplier_capacity WHERE supplier_id = s.id ORDER BY date DESC LIMIT 1), 0)
               - COALESCE(sc.reserved_quantity, 0) 
               - COALESCE(sc.fulfilled_quantity, 0)
           ) 
           FROM public.suppliers dummy 
           LEFT JOIN public.supplier_capacity sc ON sc.supplier_id = s.id AND sc.date = timezone('Asia/Kolkata', now())::date 
           WHERE dummy.id = s.id LIMIT 1) as available_quantity
    FROM public.suppliers s
    WHERE s.is_active = true 
    AND s.is_verified = true 
    AND s.is_accepting_orders = true
    AND EXISTS (
        SELECT 1 FROM public.supplier_products sp WHERE sp.supplier_id = s.id AND sp.available = true
    )
    AND (SELECT (
           COALESCE(sc.max_capacity, (SELECT max_capacity FROM public.supplier_capacity WHERE supplier_id = s.id ORDER BY date DESC LIMIT 1), 0)
           - COALESCE(sc.reserved_quantity, 0) 
           - COALESCE(sc.fulfilled_quantity, 0)
       ) 
       FROM public.suppliers dummy 
       LEFT JOIN public.supplier_capacity sc ON sc.supplier_id = s.id AND sc.date = timezone('Asia/Kolkata', now())::date 
       WHERE dummy.id = s.id LIMIT 1) > 0
    ORDER BY distance ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 2. Update place_order to auto-create today's capacity row using the latest max_capacity
CREATE OR REPLACE FUNCTION public.place_order(
    p_supplier_id UUID,
    p_product_id UUID,
    p_address_id UUID,
    p_quantity INT,
    p_payment_method VARCHAR,
    p_idempotency_key VARCHAR DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_user_id UUID;
    v_order_id UUID;
    v_supplier_customer_id UUID;
    v_supplier_product_id UUID;
    v_unit_price DECIMAL;
    v_subtotal DECIMAL;
    v_delivery_fee DECIMAL := 0;
    v_available_capacity INT;
    v_customer_profile RECORD;
    v_date DATE := timezone('Asia/Kolkata', now())::date;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

    -- Check Idempotency First
    IF p_idempotency_key IS NOT NULL THEN
        SELECT (response_payload->>'order_id')::UUID INTO v_order_id
        FROM public.api_idempotency 
        WHERE idempotency_key = p_idempotency_key AND user_id = v_user_id AND api_route = 'place_order';
        
        IF v_order_id IS NOT NULL THEN
            RETURN v_order_id;
        END IF;
    END IF;

    -- Upsert Customer Relationship
    SELECT id INTO v_supplier_customer_id FROM public.supplier_customers 
    WHERE supplier_id = p_supplier_id AND user_id = v_user_id;

    IF v_supplier_customer_id IS NULL THEN
        SELECT * INTO v_customer_profile FROM public.profiles WHERE id = v_user_id;
        
        INSERT INTO public.supplier_customers (
            supplier_id, user_id, name, phone, normalized_phone, customer_type, address, sector
        )
        VALUES (
            p_supplier_id, 
            v_user_id, 
            COALESCE(v_customer_profile.name, 'Customer'), 
            v_customer_profile.phone, 
            COALESCE(RIGHT(REGEXP_REPLACE(v_customer_profile.phone, '\D', '', 'g'), 10), '0000000000'), 
            'household', 
            '', 
            ''
        ) RETURNING id INTO v_supplier_customer_id;
    END IF;

    -- Validate product and get supplier_product_id
    SELECT id INTO v_supplier_product_id 
    FROM public.supplier_products 
    WHERE supplier_id = p_supplier_id AND product_id = p_product_id AND available = true;
    
    IF v_supplier_product_id IS NULL THEN RAISE EXCEPTION 'Product not available from this supplier'; END IF;

    -- Ensure capacity row exists for today by carrying over the latest max_capacity
    INSERT INTO public.supplier_capacity (supplier_id, date, max_capacity, reserved_quantity, fulfilled_quantity)
    VALUES (
        p_supplier_id,
        v_date,
        COALESCE((SELECT max_capacity FROM public.supplier_capacity WHERE supplier_id = p_supplier_id ORDER BY date DESC LIMIT 1), 50),
        0, 0
    )
    ON CONFLICT (supplier_id, date) DO NOTHING;

    -- Check Capacity First WITH ROW LOCK to prevent race conditions
    SELECT (max_capacity - reserved_quantity - fulfilled_quantity) INTO v_available_capacity 
    FROM public.supplier_capacity 
    WHERE supplier_id = p_supplier_id AND date = v_date
    FOR UPDATE;

    IF COALESCE(v_available_capacity, 0) < p_quantity THEN 
        RAISE EXCEPTION 'Insufficient supplier capacity for this order'; 
    END IF;

    -- Reserve the capacity
    UPDATE public.supplier_capacity 
    SET reserved_quantity = reserved_quantity + p_quantity
    WHERE supplier_id = p_supplier_id AND date = v_date;

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

    -- Record successful operation in Idempotency table
    IF p_idempotency_key IS NOT NULL THEN
        INSERT INTO public.api_idempotency (idempotency_key, user_id, api_route, response_payload)
        VALUES (p_idempotency_key, v_user_id, 'place_order', jsonb_build_object('order_id', v_order_id));
    END IF;

    RETURN v_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
