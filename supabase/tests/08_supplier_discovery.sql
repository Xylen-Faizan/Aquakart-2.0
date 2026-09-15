BEGIN;

SELECT plan(3);

-- Test 1: Function exists and has correct return type
SELECT has_function('public', 'get_available_suppliers', ARRAY['double precision', 'double precision']);

-- Setup mock data to test logic
INSERT INTO auth.users (id, email) VALUES
    ('66666666-6666-6666-6666-666666666666', 'testsup@example.com'),
    ('77777777-7777-7777-7777-777777777777', 'testsup2@example.com')
ON CONFLICT DO NOTHING;

INSERT INTO public.profiles (id, email, role, name) VALUES
    ('66666666-6666-6666-6666-666666666666', 'testsup@example.com', 'supplier', 'Test Sup'),
    ('77777777-7777-7777-7777-777777777777', 'testsup2@example.com', 'supplier', 'Test Sup 2')
ON CONFLICT DO NOTHING;

INSERT INTO public.suppliers (id, profile_id, business_name, lat, lng, is_active, is_accepting_orders) VALUES
    ('88888888-8888-8888-8888-888888888888', '66666666-6666-6666-6666-666666666666', 'Open Supplier 2', 23.6, 86.1, true, true),
    ('99999999-9999-9999-9999-999999999999', '77777777-7777-7777-7777-777777777777', 'Closed Supplier 2', 23.6, 86.1, true, false)
ON CONFLICT DO NOTHING;

-- Set capacity only for open supplier
INSERT INTO public.supplier_capacity (supplier_id, date, max_capacity, reserved_quantity, fulfilled_quantity) VALUES
    ('88888888-8888-8888-8888-888888888888', timezone('Asia/Kolkata', now())::date, 100, 10, 0)
ON CONFLICT DO NOTHING;

-- Insert product price
INSERT INTO public.products (id, name) VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Test Jar 2') ON CONFLICT DO NOTHING;
INSERT INTO public.supplier_products (supplier_id, product_id, price, available) VALUES
    ('88888888-8888-8888-8888-888888888888', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 85.00, true)
ON CONFLICT DO NOTHING;

-- Test 2: Open supplier is returned with correct values
SELECT results_eq(
    $$ SELECT id, business_name, is_accepting_orders, available_quantity, price FROM public.get_available_suppliers(23.6, 86.1) WHERE id = '88888888-8888-8888-8888-888888888888' $$,
    $$ VALUES ('88888888-8888-8888-8888-888888888888'::uuid, 'Open Supplier 2'::text, true, 90::integer, 85.00::numeric) $$,
    'Open supplier should be returned with correct calculated available_quantity (100-10) and price'
);

-- Test 3: Closed supplier is not returned
SELECT is_empty(
    $$ SELECT * FROM public.get_available_suppliers(23.6, 86.1) WHERE id = '99999999-9999-9999-9999-999999999999' $$,
    'Closed supplier should not be returned'
);

SELECT * FROM finish();
ROLLBACK;
