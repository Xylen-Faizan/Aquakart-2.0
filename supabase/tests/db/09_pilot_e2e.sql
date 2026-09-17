-- 09_pilot_e2e.sql
-- The Happy Path E2E Test

BEGIN;

-- 1. Create a dummy customer
DO $$
DECLARE
    v_customer_uid UUID := gen_random_uuid();
    v_supplier_uid UUID := gen_random_uuid();
    v_product_id UUID;
    v_address_id UUID;
    v_order_id UUID;
    v_idempotency_key UUID := gen_random_uuid();
BEGIN
    -- Customer setup
    INSERT INTO auth.users (id, email) VALUES (v_customer_uid, 'test_customer_pilot@example.com');
    INSERT INTO public.profiles (id, email, full_name, phone, role)
    VALUES (v_customer_uid, 'test_customer_pilot@example.com', 'Pilot Customer', '9999999990', 'customer');
    
    INSERT INTO public.customer_addresses (customer_id, label, address, sector, location)
    VALUES (v_customer_uid, 'Home', 'Test Address', 'Sector 4', ST_SetSRID(ST_MakePoint(86.1511, 23.6693), 4326))
    RETURNING id INTO v_address_id;

    -- Supplier setup
    INSERT INTO auth.users (id, email) VALUES (v_supplier_uid, 'test_supplier_pilot@example.com');
    INSERT INTO public.profiles (id, email, full_name, phone, role)
    VALUES (v_supplier_uid, 'test_supplier_pilot@example.com', 'Pilot Supplier', '9999999991', 'supplier');
    
    INSERT INTO public.suppliers (id, business_name, owner_name, phone, location)
    VALUES (v_supplier_uid, 'Pilot Water Co', 'Pilot Supplier', '9999999991', ST_SetSRID(ST_MakePoint(86.1511, 23.6693), 4326));

    -- Setup Product
    INSERT INTO public.products (name, type, size, price, image_url)
    VALUES ('Pilot 20L', 'jar', '20L', 40, '')
    RETURNING id INTO v_product_id;

    INSERT INTO public.supplier_products (supplier_id, product_id, available)
    VALUES (v_supplier_uid, v_product_id, true);

    -- Set exact capacity
    INSERT INTO public.supplier_capacity (supplier_id, date, max_capacity, reserved_quantity, fulfilled_quantity)
    VALUES (v_supplier_uid, timezone('Asia/Kolkata', now())::date, 10, 0, 0);

    -- Impersonate customer to place order
    EXECUTE format('SET request.jwt.claims TO ''{"sub": "%s"}''', v_customer_uid);
    
    SELECT public.place_order(v_supplier_uid, v_address_id, v_product_id, 1, 'cash', v_idempotency_key) INTO v_order_id;
    
    -- Try idempotency replay
    IF (SELECT public.place_order(v_supplier_uid, v_address_id, v_product_id, 1, 'cash', v_idempotency_key)) != v_order_id THEN
        RAISE EXCEPTION 'Idempotency failed!';
    END IF;

    -- Impersonate supplier to complete order
    EXECUTE format('SET request.jwt.claims TO ''{"sub": "%s"}''', v_supplier_uid);
    PERFORM public.update_order_status(v_order_id, 'delivered');

    -- Assertions
    IF (SELECT fulfilled_quantity FROM public.supplier_capacity WHERE supplier_id = v_supplier_uid AND date = timezone('Asia/Kolkata', now())::date) != 1 THEN
        RAISE EXCEPTION 'Capacity was not correctly updated on delivery!';
    END IF;

    IF (SELECT jars_in_hand FROM public.supplier_inventory WHERE supplier_id = v_supplier_uid AND product_id = v_product_id) != -1 THEN
        RAISE EXCEPTION 'Supplier inventory (jars in hand) was not correctly decremented on delivery!';
    END IF;
    
    IF (SELECT jars_with_customers FROM public.supplier_inventory WHERE supplier_id = v_supplier_uid AND product_id = v_product_id) != 1 THEN
        RAISE EXCEPTION 'Supplier inventory (jars with customers) was not correctly incremented on delivery!';
    END IF;

    RAISE NOTICE 'Happy Path Pilot E2E Test Passed Successfully!';
END $$;

ROLLBACK;
