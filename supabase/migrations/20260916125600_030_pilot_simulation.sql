-- 030_pilot_simulation.sql

-- This script serves as the "Golden Simulation" for the Bokaro Supplier OS Pilot.
-- It seeds a realistic business scenario that can be reconciled against the SQL views.

DO $$
DECLARE
    v_supplier_id UUID;
    v_product_id UUID;
    v_sp_id UUID;
    v_cust_id UUID;
    v_delivery_id UUID;
    i INTEGER;
    v_price NUMERIC;
    v_interval INTEGER;
    v_today DATE := CURRENT_DATE;
BEGIN
    -- 1. Ensure Amrit Dhara simulation supplier exists (separated from real data)
    SELECT id INTO v_supplier_id FROM public.suppliers WHERE business_name = 'Amrit Dhara (Simulation)' LIMIT 1;
    
    IF v_supplier_id IS NULL THEN
        -- Generate a new UUID for the supplier
        v_supplier_id := gen_random_uuid();
        
        -- Insert into auth.users (this will trigger profile creation automatically)
        INSERT INTO auth.users (id, email, raw_user_meta_data) 
        VALUES (v_supplier_id, 'simulation@aquakart.com', '{"name": "Amrit Dhara (Simulation)"}'::jsonb) 
        ON CONFLICT DO NOTHING;

        -- Update the automatically created profile to have the supplier role and phone
        UPDATE public.profiles 
        SET role = 'supplier', phone = '9999900000', name = 'Amrit Dhara (Simulation)'
        WHERE id = v_supplier_id;

        -- Create the supplier record
        INSERT INTO public.suppliers (id, profile_id, business_name, phone, address)
        VALUES (v_supplier_id, v_supplier_id, 'Amrit Dhara (Simulation)', '9999900000', 'Sector 4');
    END IF;

    -- 2. Setup Products
    -- Ensure global product exists
    SELECT id INTO v_product_id FROM public.products WHERE name = '20L Jar' LIMIT 1;
    IF v_product_id IS NULL THEN
        INSERT INTO public.products (name, description, unit)
        VALUES ('20L Jar', 'Standard 20L Water Jar', 'jar')
        RETURNING id INTO v_product_id;
    END IF;

    -- Ensure supplier offers this product
    SELECT id INTO v_sp_id FROM public.supplier_products 
    WHERE supplier_id = v_supplier_id AND product_id = v_product_id LIMIT 1;
    
    IF v_sp_id IS NULL THEN
        INSERT INTO public.supplier_products (supplier_id, product_id, price, available)
        VALUES (v_supplier_id, v_product_id, 25.00, true)
        RETURNING id INTO v_sp_id;
    END IF;

    -- 3. Set Initial Inventory (500 Jars)
    -- We use a transaction record to ensure proper accounting
    INSERT INTO public.supplier_inventory (supplier_id, owned, available)
    VALUES (v_supplier_id, 500, 500)
    ON CONFLICT (supplier_id) DO UPDATE 
    SET owned = 500, available = 500, with_customers = 0, damaged = 0, missing = 0;

    INSERT INTO public.supplier_inventory_transactions (supplier_id, reference_type, quantity_change)
    VALUES (v_supplier_id, 'purchase', 500);

    -- 4. Create 30 Varied Customers
    FOR i IN 1..30 LOOP
        -- Distribute customer types
        DECLARE
            v_type customer_type_enum;
            v_sector TEXT;
            v_qty INTEGER;
        BEGIN
            IF i % 5 = 0 THEN v_type := 'office'; v_sector := 'Sector 12'; v_price := 30.00; v_interval := 7; v_qty := 5;
            ELSIF i % 3 = 0 THEN v_type := 'shop'; v_sector := 'Chas'; v_price := 25.00; v_interval := 2; v_qty := 2;
            ELSE v_type := 'household'; v_sector := 'Sector 4'; v_price := 20.00; v_interval := 1; v_qty := 1;
            END IF;

            -- Check if customer exists to make script idempotent
            SELECT id INTO v_cust_id FROM public.supplier_customers 
            WHERE supplier_id = v_supplier_id AND phone = '99999000' || LPAD(i::TEXT, 2, '0');

            IF v_cust_id IS NULL THEN
                INSERT INTO public.supplier_customers (supplier_id, name, phone, normalized_phone, customer_type, sector)
                VALUES (v_supplier_id, 'Simulation Cust ' || i, '99999000' || LPAD(i::TEXT, 2, '0'), '99999000' || LPAD(i::TEXT, 2, '0'), v_type, v_sector)
                RETURNING id INTO v_cust_id;

                INSERT INTO public.customer_jar_balances (supplier_customer_id, jars_with_customer)
                VALUES (v_cust_id, 0);

                -- Set Pricing
                INSERT INTO public.customer_product_prices (supplier_customer_id, supplier_product_id, price)
                VALUES (v_cust_id, v_sp_id, v_price);

                -- Set Schedule (First delivery is TODAY)
                INSERT INTO public.customer_delivery_schedules (supplier_customer_id, supplier_product_id, quantity, interval_days, next_delivery_date)
                VALUES (v_cust_id, v_sp_id, v_qty, v_interval, v_today);
            END IF;
        END;
    END LOOP;

    -- 5. Simulate Executing Deliveries (Using a transaction block as the supplier would)
    -- We temporarily impersonate the supplier to bypass RLS in the RPC
    PERFORM set_config('request.jwt.claims', format('{"sub": "%s"}', v_supplier_id), true);

    -- Deliver to the first 10 customers
    FOR v_cust_id IN (SELECT id FROM public.supplier_customers WHERE supplier_id = v_supplier_id LIMIT 10) LOOP
        -- We extract the scheduled quantity for this customer
        DECLARE
            v_sched_qty INTEGER;
            v_eff_price NUMERIC;
        BEGIN
            SELECT quantity INTO v_sched_qty 
            FROM public.customer_delivery_schedules 
            WHERE supplier_customer_id = v_cust_id AND is_active = true;

            v_eff_price := public.get_effective_customer_price(v_cust_id, v_sp_id);

            -- Execute the delivery (supplying scheduled qty, returning 0 jars since this is the first delivery)
            -- Partial payment simulation: 50% pay in full, 50% pay nothing
            IF v_cust_id > '00000000-0000-0000-0000-000000000000'::UUID /* random condition */ THEN
                PERFORM public.complete_delivery(
                    v_cust_id, v_sp_id, v_sched_qty, 
                    v_sched_qty, 0, -- jars delivered, jars returned
                    (v_sched_qty * v_eff_price), -- fully paid
                    'cash'
                );
            ELSE
                PERFORM public.complete_delivery(
                    v_cust_id, v_sp_id, v_sched_qty, 
                    v_sched_qty, 0, -- jars delivered, jars returned
                    0, -- unpaid
                    'cash'
                );
            END IF;
        END;
    END LOOP;

END;
$$;
