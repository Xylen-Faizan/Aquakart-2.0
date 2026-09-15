-- 016_bokaro_suppliers.sql
-- Idempotent setup script for real Bokaro suppliers (Pilot Phase)

DO $$
DECLARE
    supp1_id uuid := 'b0000000-0000-0000-0000-000000000001';
    supp2_id uuid := 'b0000000-0000-0000-0000-000000000002';
    supp3_id uuid := 'b0000000-0000-0000-0000-000000000003';
    prod_id uuid := '00000000-0000-0000-0000-000000000001'; -- 20L Water Jar (from 012_seed)
BEGIN
    -- 1. Insert into auth.users (idempotent, skips if exists)
    INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password, 
        email_confirmed_at, recovery_sent_at, last_sign_in_at, 
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at, 
        confirmation_token, email_change, email_change_token_new, recovery_token
    )
    VALUES 
        ('00000000-0000-0000-0000-000000000000', supp1_id, 'authenticated', 'authenticated', 'contact@purejal.com', crypt('password123', gen_salt('bf')), now(), NULL, NULL, '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
        ('00000000-0000-0000-0000-000000000000', supp2_id, 'authenticated', 'authenticated', 'info@bokaroaqua.in', crypt('password123', gen_salt('bf')), now(), NULL, NULL, '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
        ('00000000-0000-0000-0000-000000000000', supp3_id, 'authenticated', 'authenticated', 'delivery@citywater.com', crypt('password123', gen_salt('bf')), now(), NULL, NULL, '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '')
    ON CONFLICT (id) DO UPDATE SET 
        encrypted_password = EXCLUDED.encrypted_password, 
        email = EXCLUDED.email,
        aud = 'authenticated',
        role = 'authenticated';

    -- 2. Insert into profiles
    INSERT INTO public.profiles (id, email, name, role, phone)
    VALUES 
        (supp1_id, 'contact@purejal.com', 'Pure Jal Water Supply', 'supplier', '9999999901'),
        (supp2_id, 'info@bokaroaqua.in', 'Bokaro Aqua Purifiers', 'supplier', '9999999902'),
        (supp3_id, 'delivery@citywater.com', 'City Water (Camp 2)', 'supplier', '9999999903')
    ON CONFLICT (id) DO UPDATE SET role = 'supplier';

    -- 3. Insert into suppliers (REAL approximate coordinates for Bokaro)
    INSERT INTO public.suppliers (id, profile_id, business_name, description, phone, address, lat, lng, is_active, is_accepting_orders)
    VALUES 
        -- Sector 4 Market coordinates
        (supp1_id, supp1_id, 'Pure Jal (Sector 4)', 'Premium RO Water, fast delivery to all nearby sectors.', '9999999901', 'Shop 12, Sector 4 Market, Bokaro', 23.6613, 86.1661, true, true),
        -- Sector 2 coordinates
        (supp2_id, supp2_id, 'Bokaro Aqua (Sector 2)', 'Hygienic 20L jars with seal.', '9999999902', 'Main Road, Sector 2, Bokaro', 23.6743, 86.1581, true, true),
        -- Camp 2 coordinates (Currently closed to test logic)
        (supp3_id, supp3_id, 'City Water (Camp 2)', 'Wholesale supplier.', '9999999903', 'Camp 2 Industrial Area, Bokaro', 23.6553, 86.1451, true, false)
    ON CONFLICT (profile_id) DO UPDATE SET 
        lat = EXCLUDED.lat, 
        lng = EXCLUDED.lng,
        is_accepting_orders = EXCLUDED.is_accepting_orders,
        business_name = EXCLUDED.business_name;

    -- 4. Insert supplier_products
    INSERT INTO public.supplier_products (supplier_id, product_id, price, available)
    VALUES 
        (supp1_id, prod_id, 80, true),
        (supp2_id, prod_id, 75, true),
        (supp3_id, prod_id, 85, true)
    ON CONFLICT (supplier_id, product_id) DO UPDATE SET price = EXCLUDED.price;

    -- 5. Insert supplier_capacity (for today and tomorrow)
    INSERT INTO public.supplier_capacity (supplier_id, date, max_capacity, reserved_quantity, fulfilled_quantity)
    VALUES 
        (supp1_id, current_date, 100, 0, 0),
        (supp2_id, current_date, 150, 0, 0),
        (supp3_id, current_date, 200, 0, 0),
        (supp1_id, current_date + interval '1 day', 100, 0, 0),
        (supp2_id, current_date + interval '1 day', 150, 0, 0)
    ON CONFLICT (supplier_id, date) DO NOTHING;
END $$;
