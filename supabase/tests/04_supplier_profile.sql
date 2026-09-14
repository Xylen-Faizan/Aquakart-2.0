BEGIN;
SELECT plan(11);

-- Setup test user
DO $$
BEGIN
    -- Create test user
    INSERT INTO auth.users (id, email) VALUES ('00000000-0000-0000-0000-000000000100', 'test_supplier@example.com');
    
    -- Ensure profile exists (handled by trigger, but just in case)
    -- Update role to supplier
    UPDATE public.profiles SET role = 'supplier' WHERE id = '00000000-0000-0000-0000-000000000100';
    
    -- Create supplier record
    INSERT INTO public.suppliers (id, profile_id, business_name, is_active)
    VALUES ('00000000-0000-0000-0000-000000000200', '00000000-0000-0000-0000-000000000100', 'Old Name', true);
    
    -- Create product
    INSERT INTO public.products (id, name, unit) VALUES ('00000000-0000-0000-0000-000000000300', 'Test Product', 'jar') ON CONFLICT DO NOTHING;
END $$;

-- 1. Test update_supplier_profile
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000100", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);

SELECT lives_ok(
    $$ SELECT public.update_supplier_profile(p_business_name := 'New Name', p_is_accepting_orders := true) $$,
    'Supplier can update permitted profile fields'
);

SELECT results_eq(
    $$ SELECT business_name FROM public.suppliers WHERE id = '00000000-0000-0000-0000-000000000200' $$,
    ARRAY['New Name'::TEXT],
    'Business name was updated successfully'
);

-- Try to update someone else's profile (it should silently ignore because of the WHERE profile_id = auth.uid())
-- To test this, we can just ensure that if we call update_supplier_profile while logged in as another user, our original supplier is untouched.
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000999", "role": "authenticated"}', true);
SELECT lives_ok(
    $$ SELECT public.update_supplier_profile(p_business_name := 'Hacked Name') $$,
    'RPC executes but should not affect the other supplier'
);

SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000100", "role": "authenticated"}', true);
SELECT results_eq(
    $$ SELECT business_name FROM public.suppliers WHERE id = '00000000-0000-0000-0000-000000000200' $$,
    ARRAY['New Name'::TEXT],
    'Other user cannot modify our business name'
);

-- 2. Test RLS for direct updates (Supplier cannot directly modify id, profile_id, is_active via UPDATE)
-- Wait, we just block UPDATE entirely for suppliers on `suppliers` table? Let's check. 
-- In 010_rls.sql, the policy for suppliers is:
-- CREATE POLICY "Suppliers can update own profile" ON public.suppliers FOR UPDATE USING (profile_id = auth.uid());
-- But we can't test RLS easily if we didn't restrict column updates, however update_supplier_profile is what the client uses.
-- We will test that they cannot change `is_active` via the RPC (because the RPC doesn't accept `p_is_active`).

-- 3. Test set_supplier_product
SELECT lives_ok(
    $$ SELECT public.set_supplier_product('00000000-0000-0000-0000-000000000300'::uuid, 50.00, true) $$,
    'Supplier can set product price'
);

SELECT results_eq(
    $$ SELECT price::numeric FROM public.supplier_products WHERE supplier_id = '00000000-0000-0000-0000-000000000200' $$,
    ARRAY[50.00::numeric],
    'Price was saved correctly'
);

-- Negative test: Price <= 0
SELECT throws_ok(
    $$ SELECT public.set_supplier_product('00000000-0000-0000-0000-000000000300'::uuid, -10.00, true) $$,
    'Price must be greater than zero',
    'Cannot set negative price'
);
SELECT throws_ok(
    $$ SELECT public.set_supplier_product('00000000-0000-0000-0000-000000000300'::uuid, 0, true) $$,
    'Price must be greater than zero',
    'Cannot set zero price'
);

-- Another user cannot manipulate this supplier's product
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000999", "role": "authenticated"}', true);
SELECT throws_ok(
    $$ SELECT public.set_supplier_product('00000000-0000-0000-0000-000000000300'::uuid, 10.00, true) $$,
    'Supplier record not found for user',
    'Other user without supplier record gets error'
);

-- Reset to admin to check final states
SELECT set_config('role', 'postgres', true);
SELECT set_config('request.jwt.claims', '', true);

-- Verify that the supplier id was not changed
SELECT results_eq(
    $$ SELECT id FROM public.suppliers WHERE profile_id = '00000000-0000-0000-0000-000000000100' $$,
    ARRAY['00000000-0000-0000-0000-000000000200'::uuid],
    'Supplier ID was preserved'
);

-- Verify that is_active was not changed
SELECT results_eq(
    $$ SELECT is_active FROM public.suppliers WHERE profile_id = '00000000-0000-0000-0000-000000000100' $$,
    ARRAY[true],
    'is_active was preserved'
);

SELECT * FROM finish();
ROLLBACK;
