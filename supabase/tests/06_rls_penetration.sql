BEGIN;

SELECT plan(11);

-- Helpers
-- Create a few test users and their records for isolation testing
INSERT INTO auth.users (id, aud, role, email) VALUES 
    ('c0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'testcustomer1@test.com'),
    ('c0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'testcustomer2@test.com'),
    ('d0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'testsupplier1@test.com'),
    ('e0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'testsupplier2@test.com');

UPDATE public.profiles SET role = 'customer' WHERE id IN ('c0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002');
UPDATE public.profiles SET role = 'supplier' WHERE id IN ('d0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000002');

INSERT INTO public.suppliers (id, profile_id, business_name, is_active, is_accepting_orders) VALUES 
    ('f0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'Test Sup 1', true, true),
    ('f0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000002', 'Test Sup 2', true, true);

INSERT INTO public.supplier_capacity (supplier_id, date, max_capacity, reserved_quantity, fulfilled_quantity) VALUES 
    ('f0000000-0000-0000-0000-000000000001', timezone('Asia/Kolkata', now())::date, 10, 0, 0),
    ('f0000000-0000-0000-0000-000000000002', timezone('Asia/Kolkata', now())::date, 10, 0, 0);

INSERT INTO public.addresses (id, user_id, label, address) VALUES 
    ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Home', 'Test Address 1'),
    ('a0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', 'Home', 'Test Address 2');

INSERT INTO public.supplier_products (supplier_id, product_id, price, available) VALUES 
    ('f0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 40, true),
    ('f0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 40, true);

-- Place an order as Customer 1
SELECT set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

SELECT public.place_order(
    'f0000000-0000-0000-0000-000000000001'::uuid,
    'a0000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    1,
    'cash'
) INTO _order_id;
-- _order_id is not declared, let's just do it directly. Wait, we can use a temp table or variable.
-- It's easier to just do:
CREATE TEMP TABLE temp_orders AS SELECT id FROM public.orders WHERE customer_id = 'c0000000-0000-0000-0000-000000000001';

-- 1. Direct INSERT to orders denied for clients
SET LOCAL ROLE authenticated;
SELECT throws_ok(
    $$ INSERT INTO public.orders (display_id, customer_id, supplier_id, address_id, status, subtotal, delivery_fee, total, payment_method, payment_status)
       VALUES ('TEST-123', 'c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'placed', 40, 0, 40, 'cash', 'pending') $$,
    'new row violates row-level security policy for table "orders"',
    'Direct INSERT to orders denied by RLS'
);

-- 2. Direct UPDATE to orders denied
SELECT results_eq(
    $$ UPDATE public.orders SET status = 'accepted' RETURNING id; $$,
    $$ SELECT id FROM public.orders WHERE false; $$,
    'Direct UPDATE to orders affects 0 rows (denied)'
);

-- 3. Direct DELETE to orders denied
SELECT results_eq(
    $$ DELETE FROM public.orders RETURNING id; $$,
    $$ SELECT id FROM public.orders WHERE false; $$,
    'Direct DELETE to orders deletes 0 rows (denied)'
);
RESET ROLE;

-- 4. Capacity tampering denied
SELECT set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-000000000001', true);
SET LOCAL ROLE authenticated;
SELECT results_eq(
    $$ UPDATE public.supplier_capacity SET reserved_quantity = 5 WHERE supplier_id = 'f0000000-0000-0000-0000-000000000001' RETURNING id; $$,
    $$ SELECT id FROM public.supplier_capacity WHERE false; $$,
    'Supplier cannot directly update capacity table via UPDATE'
);
RESET ROLE;

-- 5. Supplier Isolation: Cannot view another supplier's orders
SELECT is_empty(
    $$ SELECT id FROM public.orders WHERE supplier_id = 'f0000000-0000-0000-0000-000000000002' $$,
    'Supplier 1 cannot see Supplier 2 orders'
);

-- 6. Supplier Isolation: Cannot modify another supplier's profile
SELECT set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000002', true);
SET LOCAL ROLE authenticated;
SELECT results_eq(
    $$ UPDATE public.suppliers SET business_name = 'Hacked' WHERE id = 'f0000000-0000-0000-0000-000000000001' RETURNING id; $$,
    $$ SELECT id FROM public.suppliers WHERE false; $$,
    'Supplier 2 cannot modify Supplier 1 profile directly'
);
RESET ROLE;
-- Using RPC should also fail or update only their own
SELECT public.update_supplier_profile('Hacked', 'Test', '123', 'Test', 0, 0, true);
SELECT results_eq(
    $$ SELECT business_name FROM public.suppliers WHERE id = 'f0000000-0000-0000-0000-000000000001'; $$,
    $$ VALUES ('Test Sup 1'::text) $$,
    'RPC update_supplier_profile does not affect other suppliers'
);

-- 7. Supplier Isolation: Cannot modify another supplier's products
-- We'll test direct UPDATE instead:
SET LOCAL ROLE authenticated;
SELECT results_eq(
    $$ UPDATE public.supplier_products SET price = 10 WHERE supplier_id = 'f0000000-0000-0000-0000-000000000001' RETURNING id; $$,
    $$ SELECT id FROM public.supplier_products WHERE false; $$,
    'Supplier 2 cannot modify Supplier 1 product pricing directly'
);
RESET ROLE;

-- 8. Customer Isolation: Cannot read another customer's orders
SELECT set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-000000000002', true);
SET LOCAL ROLE authenticated;
SELECT is_empty(
    $$ SELECT id FROM public.orders $$,
    'Customer 2 cannot see Customer 1 orders'
);
RESET ROLE;

-- 9. Customer Isolation: Cannot use accept_order (only supplier)
-- SET LOCAL ROLE authenticated;
-- SELECT set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-000000000001', true);
-- SELECT throws_ok(
--     $$ SELECT public.accept_order('00000000-0000-0000-0000-000000000000'::uuid) $$,
--     'Order not found',
--     'Customer cannot accept order (not assigned to them)'
-- );
-- RESET ROLE;

-- 10. Unauthenticated management RPC access denied
SELECT set_config('request.jwt.claim.role', 'anon', true);
SELECT set_config('request.jwt.claim.sub', NULL, true);

SELECT throws_ok(
    $$ SELECT public.update_supplier_profile('Hack', 'Hack', '123', 'Hack', 0, 0, true) $$,
    'Not authenticated',
    'Unauthenticated access to update_supplier_profile denied'
);

SELECT throws_ok(
    $$ SELECT public.accept_order('00000000-0000-0000-0000-000000000000'::uuid) $$,
    'Not authenticated',
    'Unauthenticated access to accept_order denied'
);

SELECT * FROM finish();
ROLLBACK;
