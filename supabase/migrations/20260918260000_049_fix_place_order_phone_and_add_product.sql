-- 049_fix_place_order_phone_and_add_product.sql
-- Fix normalized_phone issue and add 20L Cool Jar product

-- 1. Insert the 20L Cool Jar product globally
INSERT INTO public.products (id, name, description, unit, active)
VALUES (
    'a3e21b44-9999-4444-bbbb-ccddeeff0011', 
    '20L Cool Jar (Chilled Water Dispenser)', 
    'Insulated chilled water jar with tap', 
    'jar', 
    true
)
ON CONFLICT (id) DO NOTHING;

-- 2. Force this product to be available for all active suppliers (like Pure Jal)
DO $$
DECLARE
    s_record RECORD;
BEGIN
    FOR s_record IN SELECT id FROM public.suppliers WHERE is_active = true LOOP
        INSERT INTO public.supplier_products (supplier_id, product_id, price, available)
        VALUES (s_record.id, 'a3e21b44-9999-4444-bbbb-ccddeeff0011', 50, true)
        ON CONFLICT (supplier_id, product_id) DO UPDATE 
        SET available = true, price = COALESCE(public.supplier_products.price, 50);
    END LOOP;
END $$;


-- 3. Fix place_order to provide normalized_phone
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

    -- Map marketplace customer to Supplier CRM (Create if doesn't exist)
    SELECT id INTO v_supplier_customer_id FROM public.supplier_customers 
    WHERE user_id = v_user_id AND supplier_id = p_supplier_id;

    IF v_supplier_customer_id IS NULL THEN
        -- Get user profile details to populate CRM
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

    -- Check Capacity First WITH ROW LOCK to prevent race conditions
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
