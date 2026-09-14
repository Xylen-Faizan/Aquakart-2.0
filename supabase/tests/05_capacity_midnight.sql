BEGIN;
SELECT plan(13);

-- Setup test users and data
DO $$
BEGIN
    -- Customer
    INSERT INTO auth.users (id, email) VALUES ('00000000-0000-0000-0000-000000000500', 'cust@example.com');
    UPDATE public.profiles SET role = 'customer' WHERE id = '00000000-0000-0000-0000-000000000500';
    INSERT INTO public.addresses (id, user_id, label, address, lat, lng) VALUES ('00000000-0000-0000-0000-000000000600', '00000000-0000-0000-0000-000000000500', 'Home', '123 Test St', 23.0, 86.0);
    
    -- Supplier
    INSERT INTO auth.users (id, email) VALUES ('00000000-0000-0000-0000-000000000100', 'supp@example.com');
    UPDATE public.profiles SET role = 'supplier' WHERE id = '00000000-0000-0000-0000-000000000100';
    INSERT INTO public.suppliers (id, profile_id, business_name, is_active) VALUES ('00000000-0000-0000-0000-000000000200', '00000000-0000-0000-0000-000000000100', 'Supp', true);
    
    -- Product & Pricing
    INSERT INTO public.products (id, name, unit) VALUES ('00000000-0000-0000-0000-000000000300', 'Test Product', 'jar') ON CONFLICT DO NOTHING;
    INSERT INTO public.supplier_products (supplier_id, product_id, price, available) VALUES ('00000000-0000-0000-0000-000000000200', '00000000-0000-0000-0000-000000000300', 50.00, true);
    
    -- Capacity for "Yesterday" and "Today" and "Tomorrow"
    -- We'll explicitly set capacity for specific dates to test midnight crossover
    INSERT INTO public.supplier_capacity (supplier_id, date, max_capacity, reserved_quantity, fulfilled_quantity)
    VALUES 
    ('00000000-0000-0000-0000-000000000200', '2026-09-12', 10, 0, 0),
    ('00000000-0000-0000-0000-000000000200', '2026-09-13', 10, 0, 0),
    ('00000000-0000-0000-0000-000000000200', '2026-09-14', 10, 0, 0);

END $$;

-- 1. Simulate an order placed at 11:59 PM on 2026-09-12
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000500", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);

SELECT lives_ok(
    $$ SELECT public.place_order('00000000-0000-0000-0000-000000000200', '00000000-0000-0000-0000-000000000600', '00000000-0000-0000-0000-000000000300', 2, 'cash') $$,
    'Customer can place order'
);

-- Force the created_at to be yesterday at 11:59 PM (UTC corresponding to 23:59 IST)
-- We need to become superuser to update created_at directly
SELECT set_config('role', 'postgres', true);
UPDATE public.orders SET created_at = '2026-09-12 18:29:00+00' WHERE customer_id = '00000000-0000-0000-0000-000000000500';

-- 2. Simulate acceptance at 11:59 PM on 2026-09-12
SELECT set_config('role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000100", "role": "authenticated"}', true);

-- But wait, accept_order uses `now()` inside the function for capacity date!
-- We can't mock `now()` inside the plpgsql easily without mocking the function.
-- Let's test the logic by manually verifying what accept_order does using a transaction with set local timezone? No, now() is transaction time.
-- The easiest way to test midnight crossover is to verify that `update_order_status` respects `capacity_date`.
-- So let's mock the `capacity_date` that `accept_order` would have set.

-- Become superuser to force accepted state and capacity_date
SELECT set_config('role', 'postgres', true);
-- Accept the order manually as if it happened yesterday
UPDATE public.orders SET status = 'accepted', capacity_date = '2026-09-12' WHERE customer_id = '00000000-0000-0000-0000-000000000500';
UPDATE public.supplier_capacity SET reserved_quantity = 2 WHERE date = '2026-09-12';

-- Verify setup
SELECT results_eq(
    $$ SELECT reserved_quantity FROM public.supplier_capacity WHERE date = '2026-09-12' $$,
    ARRAY[2],
    'Capacity reserved correctly for yesterday'
);
SELECT results_eq(
    $$ SELECT reserved_quantity FROM public.supplier_capacity WHERE date = '2026-09-13' $$,
    ARRAY[0],
    'Today capacity is 0'
);

-- Now, back to supplier. It's "today" now. The supplier delivers the order.
SELECT set_config('role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000100", "role": "authenticated"}', true);

-- Update order to preparing
SELECT lives_ok(
    $$ SELECT public.update_order_status((SELECT id FROM public.orders LIMIT 1), 'preparing') $$,
    'Supplier sets to preparing'
);

-- Update order to out_for_delivery
SELECT lives_ok(
    $$ SELECT public.update_order_status((SELECT id FROM public.orders LIMIT 1), 'out_for_delivery') $$,
    'Supplier sets to out_for_delivery'
);

-- Update to delivered
SELECT lives_ok(
    $$ SELECT public.update_order_status((SELECT id FROM public.orders LIMIT 1), 'delivered') $$,
    'Supplier sets to delivered'
);

-- Become admin to query safely
SELECT set_config('role', 'postgres', true);

-- Verify that yesterday's capacity was reduced from reserved and added to fulfilled
SELECT results_eq(
    $$ SELECT reserved_quantity FROM public.supplier_capacity WHERE date = '2026-09-12' $$,
    ARRAY[0],
    'Yesterday reserved quantity went back to 0'
);
SELECT results_eq(
    $$ SELECT fulfilled_quantity FROM public.supplier_capacity WHERE date = '2026-09-12' $$,
    ARRAY[2],
    'Yesterday fulfilled quantity increased to 2'
);

-- Verify that today's capacity was NOT touched
SELECT results_eq(
    $$ SELECT reserved_quantity FROM public.supplier_capacity WHERE date = '2026-09-13' $$,
    ARRAY[0],
    'Today reserved quantity remains 0'
);
SELECT results_eq(
    $$ SELECT fulfilled_quantity FROM public.supplier_capacity WHERE date = '2026-09-13' $$,
    ARRAY[0],
    'Today fulfilled quantity remains 0'
);

-- 3. Test Cancellation crossover
-- We setup another order for yesterday, accepted yesterday.
UPDATE public.orders SET status = 'accepted', capacity_date = '2026-09-12' WHERE customer_id = '00000000-0000-0000-0000-000000000500';
UPDATE public.supplier_capacity SET reserved_quantity = 2, fulfilled_quantity = 0 WHERE date = '2026-09-12';

SELECT set_config('role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000100", "role": "authenticated"}', true);

-- Supplier cancels the order
SELECT lives_ok(
    $$ SELECT public.update_order_status((SELECT id FROM public.orders LIMIT 1), 'cancelled') $$,
    'Supplier sets to cancelled'
);

SELECT set_config('role', 'postgres', true);

-- Verify yesterday's reserved capacity was released
SELECT results_eq(
    $$ SELECT reserved_quantity FROM public.supplier_capacity WHERE date = '2026-09-12' $$,
    ARRAY[0],
    'Yesterday reserved quantity went back to 0 on cancel'
);

-- Verify today's capacity was completely untouched
SELECT results_eq(
    $$ SELECT reserved_quantity FROM public.supplier_capacity WHERE date = '2026-09-13' $$,
    ARRAY[0],
    'Today reserved capacity remains 0 after cancel'
);

SELECT * FROM finish();
ROLLBACK;
