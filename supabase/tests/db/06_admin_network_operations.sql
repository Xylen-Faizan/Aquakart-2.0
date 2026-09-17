BEGIN;

-- Plan the tests
SELECT plan(7);

-- Seed some basic data if not present (assuming 04_foundation seeds everything needed)
-- We will just test the RPC structures and RLS

-- TEST 1: is_verified exists on suppliers
SELECT has_column(
    'public',
    'suppliers',
    'is_verified',
    'suppliers table should have is_verified column'
);

-- TEST 2: Network Overview returns data for admin
-- Mock admin
SET LOCAL role 'authenticated';
SELECT set_config('request.jwt.claims', '{"email": "admin@aquakart.com"}', true);

SELECT lives_ok(
    $$ 
    SELECT * FROM public.get_admin_network_overview();
    $$,
    'get_admin_network_overview succeeds for admin'
);



-- TEST 4: Suppliers list returns data for admin
SET LOCAL role 'authenticated';
SELECT set_config('request.jwt.claims', '{"email": "admin@aquakart.com"}', true);

SELECT lives_ok(
    $$ 
    SELECT * FROM public.get_admin_suppliers_list();
    $$,
    'get_admin_suppliers_list succeeds for admin'
);

-- TEST 5: Network capacity returns data for admin
SET LOCAL role 'authenticated';
SELECT set_config('request.jwt.claims', '{"email": "admin@aquakart.com"}', true);

SELECT lives_ok(
    $$ 
    SELECT * FROM public.get_admin_network_capacity();
    $$,
    'get_admin_network_capacity succeeds for admin'
);

-- TEST 6: Customer Network View returns data for admin
SET LOCAL role 'authenticated';
SELECT set_config('request.jwt.claims', '{"email": "admin@aquakart.com"}', true);

SELECT lives_ok(
    $$ 
    SELECT * FROM public.get_admin_customer_network_view();
    $$,
    'get_admin_customer_network_view succeeds for admin'
);

-- TEST 7: admin_update_supplier_status updates supplier
SET LOCAL role 'authenticated';
SELECT set_config('request.jwt.claims', '{"email": "admin@aquakart.com"}', true);

SELECT lives_ok(
    $$ 
    WITH target AS (SELECT id FROM public.suppliers LIMIT 1)
    SELECT public.admin_update_supplier_status(
        (SELECT id FROM target),
        true,
        true
    );
    $$,
    'admin_update_supplier_status succeeds for admin'
);

-- TEST 8: Operational Alerts returns data for admin
SET LOCAL role 'authenticated';
SELECT set_config('request.jwt.claims', '{"email": "admin@aquakart.com"}', true);

SELECT lives_ok(
    $$ 
    SELECT * FROM public.get_admin_operational_alerts();
    $$,
    'get_admin_operational_alerts succeeds for admin'
);

-- Finish tests
SELECT * FROM finish();
ROLLBACK;
