-- 07_network_integration.sql
BEGIN;

-- Tests for Phase 5 Customer <-> Supplier Network Integration

-- 1. Test get_available_suppliers filters unverified
-- Temporarily set a supplier to unverified
UPDATE public.suppliers SET is_verified = false WHERE business_name = 'Pure Jal';

-- Verify it doesn't appear
DO $$
DECLARE
    v_count INT;
BEGIN
    SELECT count(*) INTO v_count FROM public.get_available_suppliers(23.6693, 86.1511) WHERE business_name = 'Pure Jal';
    IF v_count > 0 THEN RAISE EXCEPTION 'Unverified supplier appeared in marketplace'; END IF;
END $$;

-- Set back to verified
UPDATE public.suppliers SET is_verified = true WHERE business_name = 'Pure Jal';

-- Verify it now appears (assuming active and accepting)
DO $$
DECLARE
    v_count INT;
BEGIN
    SELECT count(*) INTO v_count FROM public.get_available_suppliers(23.6693, 86.1511) WHERE business_name = 'Pure Jal';
    IF v_count = 0 THEN RAISE EXCEPTION 'Verified active supplier missing from marketplace'; END IF;
END $$;


-- 2. Test place_order dynamic customer creation and capacity check
DO $$
DECLARE
    v_supplier_id UUID;
    v_product_id UUID;
    v_order_id UUID;
    v_supplier_customer_id UUID;
    v_auth_uid UUID := (SELECT id FROM auth.users LIMIT 1);
BEGIN
    -- Mock authentication
    PERFORM set_config('request.jwt.claims', format('{"sub": "%s", "role": "authenticated"}', v_auth_uid), true);

    SELECT id INTO v_supplier_id FROM public.suppliers WHERE business_name = 'Pure Jal' LIMIT 1;
    SELECT product_id INTO v_product_id FROM public.supplier_products WHERE supplier_id = v_supplier_id LIMIT 1;

    -- Delete existing customer mapping if it exists to test dynamic creation
    DELETE FROM public.supplier_customers WHERE user_id = v_auth_uid AND supplier_id = v_supplier_id;

    -- Place an order
    v_order_id := public.place_order(
        v_supplier_id,
        (SELECT id FROM public.addresses WHERE profile_id = v_auth_uid LIMIT 1),
        v_product_id,
        2,
        'cash'
    );

    IF v_order_id IS NULL THEN RAISE EXCEPTION 'place_order failed to return UUID'; END IF;

    -- Verify supplier_customers was created dynamically
    SELECT id INTO v_supplier_customer_id FROM public.supplier_customers WHERE user_id = v_auth_uid AND supplier_id = v_supplier_id;
    IF v_supplier_customer_id IS NULL THEN RAISE EXCEPTION 'place_order failed to dynamically create CRM customer'; END IF;

    -- Test capacity enforcement (Try ordering more than available)
    BEGIN
        PERFORM public.place_order(
            v_supplier_id,
            (SELECT id FROM public.addresses WHERE profile_id = v_auth_uid LIMIT 1),
            v_product_id,
            9999, -- Exceeds capacity
            'cash'
        );
        RAISE EXCEPTION 'Capacity check failed - Allowed excessive order';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM != 'Insufficient supplier capacity for this order' THEN 
            RAISE EXCEPTION 'Unexpected error msg for capacity failure: %', SQLERRM;
        END IF;
    END;
END $$;

-- 3. Test Converged Manifest
DO $$
DECLARE
    v_supplier_id UUID;
    v_count INT;
BEGIN
    SELECT id INTO v_supplier_id FROM public.suppliers WHERE business_name = 'Pure Jal' LIMIT 1;
    
    -- Mock authentication as supplier
    PERFORM set_config('request.jwt.claims', format('{"sub": "%s", "role": "authenticated"}', (SELECT profile_id FROM public.suppliers WHERE id = v_supplier_id)), true);

    -- get_today_manifest should return the order we just placed (source = 'marketplace')
    SELECT count(*) INTO v_count FROM public.get_today_manifest() WHERE source = 'marketplace';
    IF v_count = 0 THEN RAISE EXCEPTION 'Live marketplace orders not converging into Supplier manifest'; END IF;
END $$;

-- 4. Test Automated Delivery Converging (update_order_status -> complete_delivery)
DO $$
DECLARE
    v_supplier_id UUID;
    v_order_id UUID;
    v_deliveries_count_before INT;
    v_deliveries_count_after INT;
BEGIN
    SELECT id INTO v_supplier_id FROM public.suppliers WHERE business_name = 'Pure Jal' LIMIT 1;
    
    -- Pick an order in placed status
    SELECT id INTO v_order_id FROM public.orders WHERE supplier_id = v_supplier_id AND status = 'placed' LIMIT 1;

    -- Mock auth as supplier
    PERFORM set_config('request.jwt.claims', format('{"sub": "%s", "role": "authenticated"}', (SELECT profile_id FROM public.suppliers WHERE id = v_supplier_id)), true);

    SELECT count(*) INTO v_deliveries_count_before FROM public.deliveries WHERE supplier_id = v_supplier_id;

    -- Move order to delivered
    PERFORM public.update_order_status(v_order_id, 'accepted');
    PERFORM public.update_order_status(v_order_id, 'out_for_delivery');
    PERFORM public.update_order_status(v_order_id, 'delivered');

    -- Verify delivery was created
    SELECT count(*) INTO v_deliveries_count_after FROM public.deliveries WHERE supplier_id = v_supplier_id;

    IF v_deliveries_count_after <= v_deliveries_count_before THEN
        RAISE EXCEPTION 'update_order_status failed to automatically trigger complete_delivery';
    END IF;
END $$;


ROLLBACK;
