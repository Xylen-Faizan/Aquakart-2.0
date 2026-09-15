-- 015_pilot_fixtures.sql

-- 1. Insert Demo Users into auth.users (Requires pgcrypto for crypt function)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ 
DECLARE
    v_admin_id UUID := '11111111-1111-1111-1111-111111111111';
    v_crystal_id UUID := '22222222-2222-2222-2222-222222222222';
    v_om_fresh_id UUID := '33333333-3333-3333-3333-333333333333';
    v_baba_jal_id UUID := '44444444-4444-4444-4444-444444444444';
    v_customer1_id UUID := '55555555-5555-5555-5555-555555555555';
    v_customer2_id UUID := '66666666-6666-6666-6666-666666666666';
BEGIN
    -- Delete them if they exist to make this idempotent
    DELETE FROM auth.users WHERE id IN (v_admin_id, v_crystal_id, v_om_fresh_id, v_baba_jal_id, v_customer1_id, v_customer2_id);

    -- Insert Admin
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, confirmation_token, recovery_token, email_change_token_new, email_change_token_current, created_at, updated_at, email_change, phone, phone_change, phone_change_token, reauthentication_token)
    VALUES (v_admin_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@aquakart.demo', crypt('password123', gen_salt('bf')), now(), '{"name":"Demo Admin"}', '', '', '', '', now(), now(), '', NULL, '', '', '');
    
    -- Insert Suppliers
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, confirmation_token, recovery_token, email_change_token_new, email_change_token_current, created_at, updated_at, email_change, phone, phone_change, phone_change_token, reauthentication_token)
    VALUES 
    (v_crystal_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'crystal@aquakart.demo', crypt('password123', gen_salt('bf')), now(), '{"name":"Crystal Water Demo"}', '', '', '', '', now(), now(), '', NULL, '', '', ''),
    (v_om_fresh_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'omfresh@aquakart.demo', crypt('password123', gen_salt('bf')), now(), '{"name":"Om Fresh Demo"}', '', '', '', '', now(), now(), '', NULL, '', '', ''),
    (v_baba_jal_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'babajal@aquakart.demo', crypt('password123', gen_salt('bf')), now(), '{"name":"Baba Jal Demo"}', '', '', '', '', now(), now(), '', NULL, '', '', '');

    -- Insert Customers
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, confirmation_token, recovery_token, email_change_token_new, email_change_token_current, created_at, updated_at, email_change, phone, phone_change, phone_change_token, reauthentication_token)
    VALUES 
    (v_customer1_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'customer1@aquakart.demo', crypt('password123', gen_salt('bf')), now(), '{"name":"Demo Customer 1"}', '', '', '', '', now(), now(), '', NULL, '', '', ''),
    (v_customer2_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'customer2@aquakart.demo', crypt('password123', gen_salt('bf')), now(), '{"name":"Demo Customer 2"}', '', '', '', '', now(), now(), '', NULL, '', '', '');

    -- Update roles in profiles
    UPDATE public.profiles SET role = 'admin' WHERE id = v_admin_id;
    UPDATE public.profiles SET role = 'supplier' WHERE id IN (v_crystal_id, v_om_fresh_id, v_baba_jal_id);

    -- Insert Supplier Records (Demo Fixtures)
    INSERT INTO public.suppliers (id, profile_id, business_name, description, is_active, is_accepting_orders, lat, lng)
    VALUES 
    ('a0000000-0000-0000-0000-000000000001', v_crystal_id, 'Crystal Water (Demo)', 'Large customer base, broad coverage', true, true, 23.6693, 86.1511),
    ('a0000000-0000-0000-0000-000000000002', v_om_fresh_id, 'Om Fresh (Demo)', 'Available capacity, needs customers', true, true, 23.6700, 86.1500),
    ('a0000000-0000-0000-0000-000000000003', v_baba_jal_id, 'Baba Jal (Demo)', 'Fragmented network supplier', true, true, 23.6800, 86.1600);

    -- Insert Supplier Products (20L Jar = '00000000-0000-0000-0000-000000000001')
    INSERT INTO public.supplier_products (supplier_id, product_id, price, available)
    VALUES
    ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 40.00, true),
    ('a0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 35.00, true),
    ('a0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 30.00, true);

    -- Insert Capacity (Today and Tomorrow)
    INSERT INTO public.supplier_capacity (supplier_id, date, max_capacity, reserved_quantity, fulfilled_quantity)
    VALUES
    ('a0000000-0000-0000-0000-000000000001', timezone('Asia/Kolkata', now())::date, 100, 0, 0),
    ('a0000000-0000-0000-0000-000000000001', timezone('Asia/Kolkata', now())::date + 1, 100, 0, 0),
    ('a0000000-0000-0000-0000-000000000002', timezone('Asia/Kolkata', now())::date, 50, 0, 0),
    ('a0000000-0000-0000-0000-000000000002', timezone('Asia/Kolkata', now())::date + 1, 50, 0, 0),
    ('a0000000-0000-0000-0000-000000000003', timezone('Asia/Kolkata', now())::date, 20, 0, 0),
    ('a0000000-0000-0000-0000-000000000003', timezone('Asia/Kolkata', now())::date + 1, 20, 0, 0);

    -- Insert Demo Address for Customers
    INSERT INTO public.addresses (id, user_id, label, address, lat, lng)
    VALUES
    ('b0000000-0000-0000-0000-000000000001', v_customer1_id, 'Home', '123 Demo Street, Sector 4, Bokaro', 23.6600, 86.1500),
    ('b0000000-0000-0000-0000-000000000002', v_customer2_id, 'Office', '456 Business Park, Sector 1, Chas', 23.6700, 86.1600);

END $$;
