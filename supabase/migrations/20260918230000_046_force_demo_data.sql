-- 046_force_demo_data.sql
-- Ensures all existing suppliers meet every single condition to be visible in the customer app.

DO $$ 
DECLARE
    s_record RECORD;
    v_product_id UUID;
    v_date DATE := timezone('Asia/Kolkata', now())::date;
BEGIN
    -- 1. Get the global product ID for 20L Jar
    SELECT id INTO v_product_id FROM public.products WHERE name ILIKE '%20L%' LIMIT 1;
    
    IF v_product_id IS NULL THEN
        -- Fallback if no product found
        SELECT id INTO v_product_id FROM public.products LIMIT 1;
    END IF;

    -- Iterate over every single supplier in the DB
    FOR s_record IN SELECT id FROM public.suppliers LOOP
        
        -- 2. Force Location, Verification, and Status
        UPDATE public.suppliers
        SET is_active = true,
            is_verified = true,
            is_accepting_orders = true,
            lat = COALESCE(lat, 23.6693),
            lng = COALESCE(lng, 86.1511)
        WHERE id = s_record.id;
        
        -- 3. Force capacity for today
        IF NOT EXISTS (SELECT 1 FROM public.supplier_capacity WHERE supplier_id = s_record.id AND date = v_date) THEN
            INSERT INTO public.supplier_capacity (supplier_id, date, max_capacity, reserved_quantity, fulfilled_quantity)
            VALUES (s_record.id, v_date, 100, 0, 0);
        ELSE
            UPDATE public.supplier_capacity
            SET max_capacity = GREATEST(max_capacity, 50)
            WHERE supplier_id = s_record.id AND date = v_date;
        END IF;
        
        -- 4. Force Supplier Product (Pricing)
        IF v_product_id IS NOT NULL THEN
            IF NOT EXISTS (SELECT 1 FROM public.supplier_products WHERE supplier_id = s_record.id AND product_id = v_product_id) THEN
                INSERT INTO public.supplier_products (supplier_id, product_id, price, available)
                VALUES (s_record.id, v_product_id, 40, true);
            ELSE
                UPDATE public.supplier_products
                SET available = true,
                    price = COALESCE(price, 40)
                WHERE supplier_id = s_record.id AND product_id = v_product_id;
            END IF;
        END IF;
        
    END LOOP;
END $$;
