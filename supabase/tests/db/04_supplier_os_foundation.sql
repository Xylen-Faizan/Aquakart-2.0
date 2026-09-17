-- tests/db/04_supplier_os_foundation.sql
BEGIN;
SELECT plan(14);

-- 1. Setup Test Data
-- Assuming profiles exist or we create them
INSERT INTO auth.users (id, email) VALUES 
('00000000-0000-0000-0000-000000000001', 'supplier1@test.com'),
('00000000-0000-0000-0000-000000000002', 'supplier2@test.com'),
('00000000-0000-0000-0000-000000000003', 'admin@aquakart.com')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, name, phone, role) VALUES 
('00000000-0000-0000-0000-000000000001', 'Test Supplier 1', '9999999991', 'supplier'),
('00000000-0000-0000-0000-000000000002', 'Test Supplier 2', '9999999992', 'supplier')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.suppliers (id, profile_id, business_name) VALUES
('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000001', 'Supplier 1 Biz'),
('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000002', 'Supplier 2 Biz')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.products (id, name, description) VALUES
('33333333-3333-3333-3333-333333333333', '20L RO Test', 'RO Water')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.supplier_products (id, supplier_id, product_id, price) VALUES
('44444444-4444-4444-4444-444444444441', '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 40),
('44444444-4444-4444-4444-444444444442', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', 50)
ON CONFLICT (id) DO NOTHING;

-- 2. Test Admin function
SELECT set_config('request.jwt.claims', '{"email": "admin@aquakart.com"}', true);
SELECT is(public.is_admin(), true, 'Admin check passes for admin email');

-- 3. Test RLS for Supplier CRM
-- Supplier 1 adds a customer
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000001"}', true);
SET ROLE authenticated;

SELECT lives_ok(
    $$
    INSERT INTO public.supplier_customers (id, supplier_id, name, phone, normalized_phone, customer_type) 
    VALUES ('55555555-5555-5555-5555-555555555551', '11111111-1111-1111-1111-111111111111', 'Cust 1', '1234567890', '1234567890', 'household');
    $$,
    'Supplier 1 can insert their own customer'
);

-- Ensure Supplier 1 cannot insert for Supplier 2
SELECT throws_ok(
    $$
    INSERT INTO public.supplier_customers (id, supplier_id, name, phone, normalized_phone, customer_type) 
    VALUES ('55555555-5555-5555-5555-555555555552', '22222222-2222-2222-2222-222222222222', 'Cust 2', '0987654321', '0987654321', 'office');
    $$,
    'new row violates row-level security policy for table "supplier_customers"',
    'Supplier 1 cannot insert customer for Supplier 2'
);

-- 4. Test Customer Pricing RLS
SELECT lives_ok(
    $$
    INSERT INTO public.customer_product_prices (supplier_customer_id, supplier_product_id, price)
    VALUES ('55555555-5555-5555-5555-555555555551', '44444444-4444-4444-4444-444444444441', 35);
    $$,
    'Supplier 1 can insert custom price for their customer'
);

-- 5. Test Delivery Schedule (with new delivery_address field)
SELECT lives_ok(
    $$
    INSERT INTO public.customer_delivery_schedules (supplier_customer_id, supplier_product_id, quantity, interval_days, next_delivery_date, delivery_address)
    VALUES ('55555555-5555-5555-5555-555555555551', '44444444-4444-4444-4444-444444444441', 2, 1, CURRENT_DATE, 'Sector 4, Bokaro');
    $$,
    'Supplier 1 can create delivery schedule with address'
);

-- 6. Test Jar Management / Complete Delivery with explicit enums
-- Set up jar balances first
INSERT INTO public.customer_jar_balances (supplier_customer_id, jars_with_customer) VALUES ('55555555-5555-5555-5555-555555555551', 0);

SELECT lives_ok(
    $$
    SELECT public.complete_delivery(
        '55555555-5555-5555-5555-555555555551', -- customer_id
        '44444444-4444-4444-4444-444444444441', -- product_id
        2, -- quantity
        35, -- price
        2, -- jars delivered
        1, -- jars returned
        70, -- collected
        'cash'
    );
    $$,
    'complete_delivery works without breaking'
);

-- Verify it created the correct jar_transactions
SELECT results_eq(
    $$ SELECT transaction_type::text, quantity FROM public.jar_transactions WHERE supplier_customer_id = '55555555-5555-5555-5555-555555555551' ORDER BY transaction_type $$,
    $$ VALUES ('delivered_to_customer', 2), ('returned_by_customer', 1) $$,
    'Jar transactions correctly mapped to new explicit enums'
);

-- Verify it updated customer jar balances correctly
SELECT results_eq(
    $$ SELECT jars_with_customer FROM public.customer_jar_balances WHERE supplier_customer_id = '55555555-5555-5555-5555-555555555551' $$,
    $$ VALUES (1) $$,
    'Customer jar balance correctly calculated (0 + 2 - 1 = 1)'
);

-- 7. Test Payments extension (status field)
SELECT results_eq(
    $$ SELECT status::text FROM public.payments WHERE supplier_customer_id = '55555555-5555-5555-5555-555555555551' $$,
    $$ VALUES ('completed') $$,
    'Payment correctly defaulted to completed status'
);
RESET ROLE;

-- 8. Test explicit Admin Access RLS
-- Supplier 2 attempts to read Supplier 1 data
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000002"}', true);
SET ROLE authenticated;

SELECT results_eq(
    $$ SELECT count(*)::int FROM public.supplier_customers $$,
    $$ VALUES (0::int) $$,
    'Supplier 2 cannot see Supplier 1 customers'
);

SELECT results_eq(
    $$ SELECT count(*)::int FROM public.customer_jar_balances $$,
    $$ VALUES (0::int) $$,
    'Supplier 2 cannot see Supplier 1 jar balances'
);
RESET ROLE;

-- Switch to Admin
SELECT set_config('request.jwt.claims', '{"email": "admin@aquakart.com"}', true);
SET ROLE authenticated;

SELECT results_eq(
    $$ SELECT count(*)::int FROM public.supplier_customers $$,
    $$ VALUES (1::int) $$,
    'Admin can see all customers'
);

SELECT results_eq(
    $$ SELECT count(*)::int FROM public.jar_transactions $$,
    $$ VALUES (2::int) $$,
    'Admin can see all jar transactions'
);

SELECT results_eq(
    $$ SELECT count(*)::int FROM public.payments $$,
    $$ VALUES (1::int) $$,
    'Admin can see all payments'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
