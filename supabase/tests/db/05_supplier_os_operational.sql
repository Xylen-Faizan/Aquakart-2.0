-- tests/db/05_supplier_os_operational.sql
BEGIN;
SELECT plan(8);

-- 1. Setup Test Data (Assuming Phase 2 test data setup still applies, Supplier 1 has profile 0000...1)
-- 1. Setup Test Data
INSERT INTO auth.users (id, email) VALUES 
('00000000-0000-0000-0000-000000000001', 'supplier1@test.com')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, name, phone, role) VALUES 
('00000000-0000-0000-0000-000000000001', 'Test Supplier 1', '9999999991', 'supplier')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.suppliers (id, profile_id, business_name) VALUES
('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000001', 'Supplier 1 Biz')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.products (id, name, description, unit) VALUES 
('90000000-0000-0000-0000-000000000001', '20L Jar', 'Water', 'jar')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.supplier_products (id, supplier_id, product_id, price) VALUES
('44444444-4444-4444-4444-444444444441', '11111111-1111-1111-1111-111111111111', '90000000-0000-0000-0000-000000000001', 30)
ON CONFLICT (id) DO NOTHING;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000001"}', true);
SET ROLE authenticated;
SET ROLE authenticated;
SET ROLE authenticated;

-- Test 1: create_supplier_customer
SELECT lives_ok(
    $$ SELECT public.create_supplier_customer('John Doe', '5551234567') $$,
    'Supplier 1 can create a customer'
);

-- Test 2: set_customer_price
-- Get the ID of the customer we just created and product
CREATE TEMP TABLE temp_ids AS 
SELECT c.id AS c_id, p.id AS p_id 
FROM public.supplier_customers c 
CROSS JOIN public.supplier_products p 
WHERE c.name = 'John Doe' AND p.supplier_id = '11111111-1111-1111-1111-111111111111' LIMIT 1;

SELECT lives_ok(
    $$ SELECT public.set_customer_price((SELECT c_id FROM temp_ids), (SELECT p_id FROM temp_ids), 40) $$,
    'Supplier 1 can set customer price'
);

-- Test 3: create_delivery_schedule
SELECT lives_ok(
    $$ SELECT public.create_delivery_schedule((SELECT c_id FROM temp_ids), (SELECT p_id FROM temp_ids), 2, 3, CURRENT_DATE) $$,
    'Supplier 1 can create delivery schedule'
);

-- Test 4: get_supplier_customers returns correctly
SELECT results_eq(
    $$ SELECT c.name, c.active_price::INT, c.schedule_quantity, c.schedule_interval FROM public.get_supplier_customers('John Doe') c $$,
    $$ VALUES ('John Doe', 40, 2, 3) $$,
    'get_supplier_customers aggregates price and schedule correctly'
);

-- Test 5: get_today_manifest returns our new customer
SELECT results_eq(
    $$ SELECT customer_name, quantity, effective_unit_price::INT, expected_amount::INT FROM public.get_today_manifest() WHERE customer_name = 'John Doe' $$,
    $$ VALUES ('John Doe', 2, 40, 80) $$,
    'get_today_manifest correctly lists due deliveries'
);

-- Test 6: complete_delivery idempotency key accepted
SELECT lives_ok(
    $$ 
    SELECT public.complete_delivery(
        (SELECT c_id FROM temp_ids), 
        (SELECT p_id FROM temp_ids), 
        2, 40, 2, 1, 80, 'cash', '123e4567-e89b-12d3-a456-426614174000'::uuid
    ) 
    $$,
    'complete_delivery accepts new signature with idempotency_key'
);

-- Test 7: get_customer_ledger
SELECT lives_ok(
    $$ SELECT public.get_customer_ledger((SELECT c_id FROM temp_ids)) $$,
    'get_customer_ledger runs without error'
);

-- Test 8: get_supplier_today stats update
SELECT results_eq(
    $$ SELECT deliveries_done, collected_today::INT FROM public.get_supplier_today() $$,
    $$ VALUES (1, 80) $$,
    'get_supplier_today reflects completed delivery and collection'
);

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
