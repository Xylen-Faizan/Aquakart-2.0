-- 061_branded_products_and_bulk.sql

-- 1. Insert Branded Products
INSERT INTO public.products (id, name, description, unit, active)
VALUES 
    ('b1b1b1b1-1111-1111-1111-111111111111', 'Bisleri 20L', 'Premium mineral water 20L Jar', 'jar', true),
    ('e2e2e2e2-2222-2222-2222-222222222222', 'Ecosia 20L', 'Natural spring water 20L Jar', 'jar', true),
    ('a3a3a3a3-3333-3333-3333-333333333333', 'Kinley 20L', 'Purified water 20L Jar', 'jar', true)
ON CONFLICT (id) DO NOTHING;

-- Force these products to be available for all active suppliers (for the demo)
DO $$
DECLARE
    s_record RECORD;
BEGIN
    FOR s_record IN SELECT id FROM public.suppliers WHERE is_active = true LOOP
        INSERT INTO public.supplier_products (supplier_id, product_id, price, available)
        VALUES 
            (s_record.id, 'b1b1b1b1-1111-1111-1111-111111111111', 80, true),
            (s_record.id, 'e2e2e2e2-2222-2222-2222-222222222222', 75, true),
            (s_record.id, 'a3a3a3a3-3333-3333-3333-333333333333', 75, true)
        ON CONFLICT (supplier_id, product_id) DO UPDATE 
        SET available = true;
    END LOOP;
END $$;

-- 2. Update place_order to handle bulk discounts automatically
CREATE OR REPLACE FUNCTION public.place_order(
    p_supplier_id UUID,
    p_address_id UUID,
    p_product_id UUID,
    p_quantity INT,
    p_payment_method TEXT,
    p_idempotency_key UUID DEFAULT NULL
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
    v_existing_payload JSONB;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

    -- Idempotency Check
    IF p_idempotency_key IS NOT NULL THEN
        SELECT response_payload INTO v_existing_payload 
        FROM public.api_idempotency 
        WHERE idempotency_key = p_idempotency_key AND user_id = v_user_id;

        IF v_existing_payload IS NOT NULL THEN
            RETURN (v_existing_payload->>'order_id')::UUID;
        END IF;
    END IF;

    -- Map marketplace customer to Supplier CRM
    SELECT id INTO v_supplier_customer_id FROM public.supplier_customers 
    WHERE user_id = v_user_id AND supplier_id = p_supplier_id;

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

    -- Check Capacity
    SELECT (max_capacity - reserved_quantity - fulfilled_quantity) INTO v_available_capacity 
    FROM public.supplier_capacity 
    WHERE supplier_id = p_supplier_id AND date = timezone('Asia/Kolkata', now())::date
    FOR UPDATE;

    IF COALESCE(v_available_capacity, 0) < p_quantity THEN 
        RAISE EXCEPTION 'Insufficient supplier capacity for this order'; 
    END IF;

    -- Resolve secure price
    v_unit_price := public.get_effective_customer_price(v_supplier_customer_id, v_supplier_product_id);
    IF v_unit_price IS NULL THEN RAISE EXCEPTION 'Could not resolve pricing'; END IF;

    v_subtotal := v_unit_price * p_quantity;

    -- AUTOMATIC BULK DISCOUNT: 10% off for quantities >= 100
    IF p_quantity >= 100 THEN
        v_subtotal := v_subtotal * 0.9;
    END IF;

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

    -- Idempotency save
    IF p_idempotency_key IS NOT NULL THEN
        INSERT INTO public.api_idempotency (idempotency_key, user_id, api_route, response_payload)
        VALUES (p_idempotency_key, v_user_id, 'place_order', jsonb_build_object('order_id', v_order_id));
    END IF;

    RETURN v_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. Create notify_customer_arrival RPC for Supplier App
CREATE OR REPLACE FUNCTION public.notify_customer_arrival(p_stop_id UUID)
RETURNS VOID AS $$
DECLARE
    v_run_id UUID;
    v_customer_id UUID;
    v_supplier_id UUID;
    v_title TEXT := 'Your Delivery is Arriving Soon!';
    v_body TEXT := 'Our delivery vehicle is nearby and will arrive shortly.';
BEGIN
    -- Verify the caller is a supplier and get context
    SELECT r.supplier_id INTO v_supplier_id
    FROM public.delivery_runs r
    JOIN public.delivery_run_stops s ON s.run_id = r.id
    WHERE s.id = p_stop_id;

    IF v_supplier_id IS NULL THEN
        RAISE EXCEPTION 'Stop not found';
    END IF;

    -- Only allow if the caller is the supplier OR an active driver for this supplier
    IF (v_supplier_id != public.get_supplier_id()) THEN
        IF NOT EXISTS (SELECT 1 FROM public.drivers WHERE supplier_id = v_supplier_id AND profile_id = auth.uid() AND is_active = true) THEN
            RAISE EXCEPTION 'Not authorized to send alerts for this stop';
        END IF;
    END IF;

    -- Get customer ID
    SELECT customer_id INTO v_customer_id
    FROM public.delivery_run_stops
    WHERE id = p_stop_id;

    -- Update stop status to indicate en_route or that alert was sent
    UPDATE public.delivery_run_stops
    SET status = 'en_route',
        arrival_alert_sent_at = now(),
        updated_at = now()
    WHERE id = p_stop_id;

    -- Insert into delivery_notifications to trigger the Push Notification Webhook
    INSERT INTO public.delivery_notifications (
        user_id,
        stop_id,
        notification_type,
        title,
        body,
        status,
        scheduled_for
    ) VALUES (
        v_customer_id,
        p_stop_id,
        'eta_alert',
        v_title,
        v_body,
        'pending',
        now()
    );

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
