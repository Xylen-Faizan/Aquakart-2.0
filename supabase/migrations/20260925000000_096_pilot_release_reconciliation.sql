-- ============================================================================
-- 096_pilot_release_reconciliation.sql
--
-- SINGLE AUTHORITATIVE RECONCILIATION of all function/schema drift across
-- 104 previous migrations. Eliminates every broken override, unifies all
-- delivery-completion paths, and makes the complete water-order flow work
-- end-to-end for the Bokaro pilot.
--
-- Audit reference: 28 findings from commit f0fac8d
-- ============================================================================

-- ============================================================================
-- SECTION 1: SCHEMA FIXES
-- ============================================================================

-- 1a. Missing unique constraint required by ON CONFLICT in find_eligible_vehicles
CREATE UNIQUE INDEX IF NOT EXISTS idx_delivery_offers_request_run_unique
    ON public.delivery_offers(dispatch_request_id, run_id);

-- 1b. fulfillment_mode must be explicitly set at order creation, not defaulted
ALTER TABLE public.orders ALTER COLUMN fulfillment_mode DROP DEFAULT;

-- 1c. Drop ambiguous 2-parameter overload of complete_delivery_run_stop
--     Multiple migrations (071, 077, 080) created (UUID, UUID) signatures.
--     The 6-parameter version (with defaults) from phase1 is the canonical one.
DROP FUNCTION IF EXISTS public.complete_delivery_run_stop(UUID, UUID);

-- 1d. Ensure order_id exists on deliveries (added by 082 but safety check)
ALTER TABLE public.deliveries ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES public.orders(id);

-- 1e. Drop the broken TABLE-returning find_eligible_vehicles from Control Tower
DROP FUNCTION IF EXISTS public.find_eligible_vehicles(UUID);

-- 1f. Drop the accounting-bypassing complete_order shortcut
DROP FUNCTION IF EXISTS public.complete_order(UUID);


-- ============================================================================
-- SECTION 2: CORE ACCOUNTING ENGINE
-- Fixes: Finding #10 (missing ledger entries), inventory tracking
-- ============================================================================
CREATE OR REPLACE FUNCTION public._complete_delivery_accounting(
    p_supplier_id UUID,
    p_supplier_customer_id UUID,
    p_supplier_product_id UUID,
    p_quantity INTEGER,
    p_price NUMERIC,
    p_jars_delivered INTEGER,
    p_jars_returned INTEGER,
    p_amount_collected NUMERIC,
    p_payment_method TEXT,
    p_reference_order_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_delivery_id UUID;
    v_total_amount NUMERIC(10,2);
BEGIN
    v_total_amount := p_quantity * p_price;

    -- 1. Create Delivery Record
    INSERT INTO public.deliveries (
        supplier_id, supplier_customer_id, status, delivery_date, total_amount, order_id
    ) VALUES (
        p_supplier_id, p_supplier_customer_id, 'delivered', CURRENT_DATE, v_total_amount, p_reference_order_id
    ) RETURNING id INTO v_delivery_id;

    IF p_supplier_product_id IS NOT NULL THEN
        INSERT INTO public.delivery_items (
            delivery_id, supplier_product_id, quantity, unit_price, total_price
        ) VALUES (
            v_delivery_id, p_supplier_product_id, p_quantity, p_price, v_total_amount
        );
    END IF;

    -- 2. LEDGER DEBIT: Bill the customer for this delivery
    IF v_total_amount > 0 THEN
        INSERT INTO public.customer_ledger_entries (
            supplier_id, supplier_customer_id, reference_type, reference_id,
            entry_type, amount, created_by
        ) VALUES (
            p_supplier_id, p_supplier_customer_id, 'delivery', v_delivery_id,
            'debit', v_total_amount, auth.uid()
        );
    END IF;

    -- 3. Process Jars Delivered
    IF p_jars_delivered > 0 THEN
        INSERT INTO public.jar_transactions (
            supplier_customer_id, delivery_id, jars_delivered, jars_returned
        ) VALUES (
            p_supplier_customer_id, v_delivery_id, p_jars_delivered, 0
        );

        UPDATE public.supplier_inventory
        SET available = available - p_jars_delivered,
            with_customers = with_customers + p_jars_delivered,
            updated_at = NOW()
        WHERE supplier_id = p_supplier_id;

        INSERT INTO public.supplier_inventory_transactions (
            supplier_id, reference_type, reference_id, quantity_change
        ) VALUES (p_supplier_id, 'delivery', v_delivery_id, -p_jars_delivered);
    END IF;

    -- 4. Process Jars Returned
    IF p_jars_returned > 0 THEN
        INSERT INTO public.jar_transactions (
            supplier_customer_id, delivery_id, jars_delivered, jars_returned
        ) VALUES (
            p_supplier_customer_id, v_delivery_id, 0, p_jars_returned
        );

        UPDATE public.supplier_inventory
        SET available = available + p_jars_returned,
            with_customers = with_customers - p_jars_returned,
            updated_at = NOW()
        WHERE supplier_id = p_supplier_id;

        INSERT INTO public.supplier_inventory_transactions (
            supplier_id, reference_type, reference_id, quantity_change
        ) VALUES (p_supplier_id, 'return', v_delivery_id, p_jars_returned);
    END IF;

    -- 5. Update Customer Jar Balance
    INSERT INTO public.customer_jar_balances (supplier_customer_id, jars_with_customer)
    VALUES (p_supplier_customer_id, p_jars_delivered - p_jars_returned)
    ON CONFLICT (supplier_customer_id)
    DO UPDATE SET
        jars_with_customer = public.customer_jar_balances.jars_with_customer
                             + p_jars_delivered - p_jars_returned,
        updated_at = NOW();

    -- 6. Process Payment Collection + LEDGER CREDIT
    IF p_amount_collected > 0 THEN
        INSERT INTO public.payments (
            supplier_id, supplier_customer_id, delivery_id, amount, payment_method
        ) VALUES (
            p_supplier_id, p_supplier_customer_id, v_delivery_id,
            p_amount_collected, p_payment_method
        );

        INSERT INTO public.customer_ledger_entries (
            supplier_id, supplier_customer_id, reference_type, reference_id,
            entry_type, amount, created_by
        ) VALUES (
            p_supplier_id, p_supplier_customer_id, 'payment', v_delivery_id,
            'credit', p_amount_collected, auth.uid()
        );
    END IF;

    RETURN v_delivery_id;
END;
$$;


-- ============================================================================
-- SECTION 3: SUPPLIER CRM DELIVERY WRAPPER
-- (For direct supplier CRM deliveries with schedule advancement)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.complete_delivery(
    p_customer_id UUID,
    p_supplier_product_id UUID,
    p_quantity INTEGER,
    p_price NUMERIC,
    p_jars_delivered INTEGER,
    p_jars_returned INTEGER,
    p_amount_collected NUMERIC,
    p_payment_method TEXT,
    p_idempotency_key UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_supplier_id UUID;
    v_customer_supplier_id UUID;
    v_delivery_id UUID;
BEGIN
    v_supplier_id := public.get_supplier_id();

    -- Verify ownership
    SELECT supplier_id INTO v_customer_supplier_id
    FROM public.supplier_customers WHERE id = p_customer_id;
    IF v_customer_supplier_id != v_supplier_id THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    v_delivery_id := public._complete_delivery_accounting(
        v_supplier_id, p_customer_id, p_supplier_product_id,
        p_quantity, p_price, p_jars_delivered, p_jars_returned,
        p_amount_collected, p_payment_method
    );

    -- Advance schedule
    UPDATE public.customer_delivery_schedules
    SET next_delivery_date = CURRENT_DATE + interval_days
    WHERE supplier_customer_id = p_customer_id
      AND supplier_product_id = p_supplier_product_id
      AND is_active = true;

    RETURN v_delivery_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- SECTION 4: CANONICAL RUN-STOP COMPLETION
-- Fixes: #7 (wrong columns), #8 (bad defaults), #9 (missing schedule advance)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.complete_delivery_run_stop(
    p_run_id UUID,
    p_stop_id UUID,
    p_jars_delivered INTEGER DEFAULT NULL,
    p_jars_returned INTEGER DEFAULT NULL,
    p_amount_collected NUMERIC DEFAULT NULL,
    p_payment_method TEXT DEFAULT 'cash'
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_stop RECORD;
    v_run RECORD;
    v_caller UUID := auth.uid();
    v_is_auth BOOLEAN := false;
    v_sched RECORD;
    v_order RECORD;
    v_sp_id UUID;
    v_customer_profile RECORD;
    v_supplier_customer_id UUID;
BEGIN
    -- Auth: helper, driver, or supplier
    SELECT * INTO v_run FROM public.delivery_runs WHERE id = p_run_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Run not found'; END IF;

    IF v_run.helper_id IS NOT NULL THEN
        PERFORM 1 FROM public.helpers WHERE id = v_run.helper_id AND profile_id = v_caller;
        IF FOUND THEN v_is_auth := true; END IF;
    END IF;
    IF NOT v_is_auth THEN
        PERFORM 1 FROM public.drivers WHERE id = v_run.driver_id AND profile_id = v_caller;
        IF FOUND THEN v_is_auth := true; END IF;
    END IF;
    IF NOT v_is_auth THEN
        PERFORM 1 FROM public.suppliers WHERE id = v_run.supplier_id AND profile_id = v_caller;
        IF FOUND THEN v_is_auth := true; END IF;
    END IF;
    IF NOT v_is_auth THEN RAISE EXCEPTION 'Unauthorized'; END IF;

    -- Lock the stop
    SELECT * INTO v_stop FROM public.delivery_run_stops
    WHERE id = p_stop_id AND run_id = p_run_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Stop not found'; END IF;
    IF v_stop.status = 'delivered' THEN RETURN; END IF;  -- Idempotency

    -- SAFE DEFAULTS (Finding #8):
    -- jars_delivered defaults to order quantity
    -- jars_returned defaults to 0 (NOT quantity!)
    -- amount_collected defaults to 0 (payment is NEVER assumed!)
    IF p_jars_delivered IS NULL THEN p_jars_delivered := v_stop.quantity; END IF;
    IF p_jars_returned IS NULL THEN p_jars_returned := 0; END IF;
    IF p_amount_collected IS NULL THEN p_amount_collected := 0; END IF;

    -- ── SCHEDULED STOP ──
    IF v_stop.stop_type = 'scheduled' THEN
        SELECT cds.supplier_customer_id, cds.supplier_product_id
        INTO v_sched
        FROM public.customer_delivery_schedules cds
        WHERE cds.id = v_stop.schedule_id;

        IF v_sched IS NOT NULL THEN
            PERFORM public._complete_delivery_accounting(
                v_run.supplier_id, v_sched.supplier_customer_id,
                v_sched.supplier_product_id, v_stop.quantity, v_stop.unit_price,
                p_jars_delivered, p_jars_returned, p_amount_collected, p_payment_method,
                NULL
            );

            -- Finding #9: Advance the schedule
            UPDATE public.customer_delivery_schedules
            SET next_delivery_date = CURRENT_DATE + interval_days
            WHERE id = v_stop.schedule_id AND is_active = true;
        END IF;

    -- ── OPPORTUNISTIC STOP ──
    ELSIF v_stop.stop_type = 'opportunistic' THEN
        SELECT * INTO v_order FROM public.orders WHERE id = v_stop.order_id;

        SELECT id INTO v_sp_id FROM public.supplier_products
        WHERE supplier_id = v_run.supplier_id AND product_id = v_stop.product_id LIMIT 1;

        IF v_order IS NOT NULL THEN
            v_supplier_customer_id := v_order.supplier_customer_id;

            IF v_supplier_customer_id IS NULL THEN
                SELECT id INTO v_supplier_customer_id FROM public.supplier_customers
                WHERE user_id = v_order.customer_id AND supplier_id = v_run.supplier_id;

                IF v_supplier_customer_id IS NULL THEN
                    SELECT * INTO v_customer_profile FROM public.profiles
                    WHERE id = v_order.customer_id;

                    INSERT INTO public.supplier_customers (
                        supplier_id, user_id, name, phone,
                        normalized_phone, customer_type, is_active
                    ) VALUES (
                        v_run.supplier_id, v_order.customer_id,
                        COALESCE(v_customer_profile.name, 'Customer'),
                        COALESCE(v_customer_profile.phone, ''),
                        COALESCE(v_customer_profile.phone, ''),
                        'household', true
                    ) RETURNING id INTO v_supplier_customer_id;

                    -- Initialize jar balance
                    INSERT INTO public.customer_jar_balances (supplier_customer_id, jars_with_customer)
                    VALUES (v_supplier_customer_id, 0)
                    ON CONFLICT (supplier_customer_id) DO NOTHING;
                END IF;

                UPDATE public.orders SET supplier_customer_id = v_supplier_customer_id
                WHERE id = v_order.id;
            END IF;

            PERFORM public._complete_delivery_accounting(
                v_run.supplier_id, v_supplier_customer_id, v_sp_id,
                v_stop.quantity, v_stop.unit_price,
                p_jars_delivered, p_jars_returned, p_amount_collected, p_payment_method,
                v_order.id
            );
        END IF;

        -- Update order status (payment_status only 'paid' if amount was actually collected)
        UPDATE public.orders
        SET status = 'delivered',
            payment_status = CASE WHEN p_amount_collected > 0 THEN 'paid' ELSE 'pending' END,
            updated_at = now()
        WHERE id = v_stop.order_id AND status != 'delivered';

        INSERT INTO public.order_status_history (order_id, status, changed_by)
        VALUES (v_stop.order_id, 'delivered', v_caller);
    END IF;

    -- Mark stop delivered using CORRECT column names (Finding #7)
    UPDATE public.delivery_run_stops
    SET status = 'delivered',
        arrived_at = COALESCE(arrived_at, NOW()),
        delivered_at = NOW()
    WHERE id = v_stop.id;

    -- Trigger domino ETA recalculation
    PERFORM public.recalculate_route_eta(p_run_id);
END;
$$;


-- ============================================================================
-- SECTION 5: SUPPLIER DASHBOARD ORDER COMPLETION (NEW)
-- Replaces the old update_order_status('delivered') accounting path
-- Called by the supplier "Mark as Delivered" modal
-- ============================================================================
CREATE OR REPLACE FUNCTION public.complete_order_delivery(
    p_order_id UUID,
    p_jars_delivered INTEGER DEFAULT NULL,
    p_jars_returned INTEGER DEFAULT 0,
    p_amount_collected NUMERIC DEFAULT 0,
    p_payment_method TEXT DEFAULT 'cash'
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_order RECORD;
    v_supplier_id UUID;
    v_total_quantity INT;
    v_unit_price NUMERIC(10,2);
    v_supplier_customer_id UUID;
    v_supplier_product_id UUID;
    v_customer_profile RECORD;
    v_order_date DATE;
BEGIN
    v_supplier_id := public.get_supplier_id();
    IF v_supplier_id IS NULL THEN RAISE EXCEPTION 'Not authenticated as supplier'; END IF;

    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
    IF v_order.supplier_id != v_supplier_id THEN RAISE EXCEPTION 'Unauthorized'; END IF;
    IF v_order.status = 'delivered' THEN RETURN; END IF;  -- Idempotency

    SELECT SUM(quantity), MAX(unit_price) INTO v_total_quantity, v_unit_price
    FROM public.order_items WHERE order_id = p_order_id;

    IF p_jars_delivered IS NULL THEN p_jars_delivered := v_total_quantity; END IF;

    v_order_date := timezone('Asia/Kolkata', v_order.created_at)::date;

    -- Capacity adjustment
    UPDATE public.supplier_capacity
    SET reserved_quantity = reserved_quantity - v_total_quantity,
        fulfilled_quantity = fulfilled_quantity + v_total_quantity
    WHERE supplier_id = v_order.supplier_id AND date = v_order_date;

    -- Find or create supplier_customer
    SELECT id INTO v_supplier_customer_id FROM public.supplier_customers
    WHERE user_id = v_order.customer_id AND supplier_id = v_order.supplier_id;

    IF v_supplier_customer_id IS NULL THEN
        SELECT * INTO v_customer_profile FROM public.profiles WHERE id = v_order.customer_id;
        INSERT INTO public.supplier_customers (
            supplier_id, user_id, name, phone, normalized_phone, customer_type, is_active
        ) VALUES (
            v_order.supplier_id, v_order.customer_id,
            COALESCE(v_customer_profile.name, 'Customer'),
            COALESCE(v_customer_profile.phone, ''),
            COALESCE(v_customer_profile.phone, ''),
            'household', true
        ) RETURNING id INTO v_supplier_customer_id;

        INSERT INTO public.customer_jar_balances (supplier_customer_id, jars_with_customer)
        VALUES (v_supplier_customer_id, 0) ON CONFLICT (supplier_customer_id) DO NOTHING;
    END IF;

    UPDATE public.orders SET supplier_customer_id = v_supplier_customer_id WHERE id = p_order_id;

    -- Get supplier product
    SELECT id INTO v_supplier_product_id FROM public.supplier_products
    WHERE supplier_id = v_order.supplier_id
      AND product_id = (SELECT product_id FROM public.order_items WHERE order_id = p_order_id LIMIT 1);

    -- Run through the CANONICAL accounting engine
    IF v_supplier_customer_id IS NOT NULL AND v_supplier_product_id IS NOT NULL THEN
        PERFORM public._complete_delivery_accounting(
            v_order.supplier_id, v_supplier_customer_id, v_supplier_product_id,
            v_total_quantity, v_unit_price,
            p_jars_delivered, p_jars_returned, p_amount_collected, p_payment_method,
            p_order_id
        );
    END IF;

    -- Update order status
    UPDATE public.orders
    SET status = 'delivered',
        payment_status = CASE WHEN p_amount_collected > 0 THEN 'paid' ELSE 'pending' END,
        updated_at = now()
    WHERE id = p_order_id;

    INSERT INTO public.order_status_history (order_id, status, changed_by, notes)
    VALUES (p_order_id, 'delivered', auth.uid(), 'Supplier completed delivery via dashboard');
END;
$$;


-- ============================================================================
-- SECTION 6: DISPATCH ENGINE - find_eligible_vehicles
-- Fixes: #1 (config table), #2 (capacity RPC), #3 (UUID type error),
--        #4 (unique constraint), address columns
-- Based on 084 version with all fixes applied
-- ============================================================================
CREATE OR REPLACE FUNCTION public.find_eligible_vehicles(p_request_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_request RECORD;
    v_cust_lat DOUBLE PRECISION;
    v_cust_lng DOUBLE PRECISION;
    v_candidate RECORD;
    v_offer_count INTEGER := 0;
    v_config RECORD;
    v_prev_lat DOUBLE PRECISION;
    v_prev_lng DOUBLE PRECISION;
    v_next_lat DOUBLE PRECISION;
    v_next_lng DOUBLE PRECISION;
    v_extra_dist DOUBLE PRECISION;
    v_min_extra DOUBLE PRECISION;
    v_min_pos INTEGER;
    v_best_pos INTEGER;
    v_stop RECORD;
    v_eta_min INTEGER;
    v_dist_to_cust DOUBLE PRECISION;
    v_assumed_speed DOUBLE PRECISION;
    v_new_offer_id UUID;
    v_caller UUID := auth.uid();
BEGIN
    -- FIX #1A: Use dispatch_config (NOT dispatch_configurations)
    SELECT * INTO v_config FROM public.dispatch_config WHERE id = 1;
    v_assumed_speed := COALESCE(v_config.assumed_speed_kmh, 30.0);

    SELECT * INTO v_request FROM public.order_dispatch_requests WHERE id = p_request_id;
    IF NOT FOUND THEN RETURN 0; END IF;

    -- Authorization: caller must own the request
    IF v_request.customer_id != v_caller THEN
        RAISE EXCEPTION 'Unauthorized: Caller must own the dispatch request';
    END IF;

    IF v_request.status != 'searching' THEN RETURN 0; END IF;

    -- Check expiry
    IF v_request.expires_at < now() THEN
        UPDATE public.order_dispatch_requests SET status = 'failed' WHERE id = p_request_id;
        RETURN 0;
    END IF;

    -- FIX: Use lat/lng (NOT latitude/longitude) for addresses table
    SELECT lat, lng INTO v_cust_lat, v_cust_lng
    FROM public.addresses WHERE id = v_request.address_id;

    IF v_cust_lat IS NULL OR v_cust_lng IS NULL THEN
        UPDATE public.order_dispatch_requests SET status = 'failed' WHERE id = p_request_id;
        RETURN 0;
    END IF;

    FOR v_candidate IN
        SELECT
            dr.id AS run_id,
            dr.supplier_id,
            dr.vehicle_id,
            dr.driver_id,
            dr.helper_id,
            vl.latitude AS veh_lat,    -- vehicle_locations uses latitude/longitude
            vl.longitude AS veh_lng,
            vl.captured_at AS gps_time,
            calculate_distance_km(vl.latitude, vl.longitude, v_cust_lat, v_cust_lng) AS dist_km
        FROM public.delivery_runs dr
        JOIN LATERAL (
            SELECT latitude, longitude, captured_at
            FROM public.vehicle_locations
            WHERE run_id = dr.id ORDER BY captured_at DESC LIMIT 1
        ) vl ON true
        JOIN public.supplier_products sp
            ON sp.supplier_id = dr.supplier_id
            AND sp.product_id = v_request.product_id
            AND sp.available = true   -- FIX #13: correct column name
        WHERE dr.status = 'in_progress'
          AND vl.captured_at >= (now() - (v_config.location_freshness_seconds || ' seconds')::INTERVAL)
          AND calculate_distance_km(vl.latitude, vl.longitude, v_cust_lat, v_cust_lng)
              <= v_config.max_customer_distance_km
        ORDER BY dist_km ASC
        LIMIT 10
    LOOP
        -- FIX #2: Use internal function (no role check, safe for customer context)
        PERFORM 1 FROM internal_get_vehicle_capacity_state(v_candidate.run_id) cap
        WHERE cap.opportunity_capacity >= v_request.quantity;
        IF NOT FOUND THEN CONTINUE; END IF;

        -- Insertion position logic (PROTECT en_route stops)
        v_min_extra := 999999;
        v_min_pos := NULL;

        -- Start from last en_route stop or vehicle position
        SELECT a.lat, a.lng
        INTO v_prev_lat, v_prev_lng
        FROM public.delivery_run_stops drs
        JOIN public.addresses a ON a.id = drs.address_id
        WHERE drs.run_id = v_candidate.run_id AND drs.status = 'en_route'
        ORDER BY drs.sequence_number DESC LIMIT 1;

        IF NOT FOUND THEN
            v_prev_lat := v_candidate.veh_lat;
            v_prev_lng := v_candidate.veh_lng;
        END IF;

        -- Find first planned stop
        SELECT a.lat, a.lng, drs.sequence_number
        INTO v_next_lat, v_next_lng, v_best_pos
        FROM public.delivery_run_stops drs
        JOIN public.addresses a ON a.id = drs.address_id
        WHERE drs.run_id = v_candidate.run_id AND drs.status = 'planned'
        ORDER BY drs.sequence_number ASC LIMIT 1;

        IF v_next_lat IS NOT NULL THEN
            v_extra_dist := calculate_distance_km(v_prev_lat, v_prev_lng, v_cust_lat, v_cust_lng)
                + calculate_distance_km(v_cust_lat, v_cust_lng, v_next_lat, v_next_lng)
                - calculate_distance_km(v_prev_lat, v_prev_lng, v_next_lat, v_next_lng);
            IF v_extra_dist < v_min_extra THEN
                v_min_extra := v_extra_dist;
                v_min_pos := COALESCE(v_best_pos, 1);
            END IF;
        ELSE
            v_extra_dist := calculate_distance_km(v_prev_lat, v_prev_lng, v_cust_lat, v_cust_lng);
            v_min_extra := v_extra_dist;
            SELECT COALESCE(MAX(sequence_number), 0) + 1 INTO v_min_pos
            FROM public.delivery_run_stops WHERE run_id = v_candidate.run_id;
        END IF;

        -- Evaluate all planned stops for better insertion positions
        FOR v_stop IN
            SELECT
                a.lat AS stop_lat, a.lng AS stop_lng,
                drs.sequence_number AS seq
            FROM public.delivery_run_stops drs
            JOIN public.addresses a ON a.id = drs.address_id
            WHERE drs.run_id = v_candidate.run_id AND drs.status = 'planned'
            ORDER BY drs.sequence_number ASC
        LOOP
            -- Check insertion AFTER this stop
            SELECT a.lat, a.lng
            INTO v_next_lat, v_next_lng
            FROM public.delivery_run_stops drs2
            JOIN public.addresses a ON a.id = drs2.address_id
            WHERE drs2.run_id = v_candidate.run_id
              AND drs2.status = 'planned'
              AND drs2.sequence_number > v_stop.seq
            ORDER BY drs2.sequence_number ASC LIMIT 1;

            IF v_next_lat IS NOT NULL THEN
                v_extra_dist := calculate_distance_km(v_stop.stop_lat, v_stop.stop_lng, v_cust_lat, v_cust_lng)
                    + calculate_distance_km(v_cust_lat, v_cust_lng, v_next_lat, v_next_lng)
                    - calculate_distance_km(v_stop.stop_lat, v_stop.stop_lng, v_next_lat, v_next_lng);
            ELSE
                v_extra_dist := calculate_distance_km(v_stop.stop_lat, v_stop.stop_lng, v_cust_lat, v_cust_lng);
            END IF;

            IF v_extra_dist < v_min_extra THEN
                v_min_extra := v_extra_dist;
                v_min_pos := v_stop.seq + 1;
            END IF;
        END LOOP;

        -- Check detour is acceptable (convert distance to time)
        v_eta_min := CEIL((v_min_extra / v_assumed_speed) * 60);
        IF v_eta_min > v_config.max_route_detour_minutes THEN CONTINUE; END IF;

        v_dist_to_cust := calculate_distance_km(v_candidate.veh_lat, v_candidate.veh_lng, v_cust_lat, v_cust_lng);

        -- Insert Offer (FIX #4: unique constraint now exists)
        INSERT INTO public.delivery_offers (
            dispatch_request_id, supplier_id, vehicle_id, run_id,
            helper_id, driver_id, distance_km, eta_minutes, detour_minutes,
            insertion_position, status, expires_at
        ) VALUES (
            p_request_id, v_candidate.supplier_id, v_candidate.vehicle_id, v_candidate.run_id,
            v_candidate.helper_id, v_candidate.driver_id, v_dist_to_cust,
            GREATEST(1, CEIL((v_dist_to_cust / v_assumed_speed) * 60)),
            v_eta_min, v_min_pos,
            'pending', now() + (v_config.offer_expiry_seconds || ' seconds')::INTERVAL
        )
        ON CONFLICT (dispatch_request_id, run_id) DO NOTHING
        RETURNING id INTO v_new_offer_id;

        IF v_new_offer_id IS NOT NULL THEN
            v_offer_count := v_offer_count + 1;
            PERFORM public.create_opportunity_notifications(v_new_offer_id);
        END IF;
    END LOOP;

    -- Only mark 'offered' if we found vehicles. Otherwise stay 'searching' for retry.
    IF v_offer_count > 0 THEN
        UPDATE public.order_dispatch_requests SET status = 'offered' WHERE id = p_request_id;
    END IF;

    RETURN v_offer_count;
END;
$$;


-- ============================================================================
-- SECTION 7: OFFER ACCEPTANCE
-- Fixes: #6 (column names), notification columns, supplier_customers schema
-- ============================================================================
CREATE OR REPLACE FUNCTION public.accept_delivery_offer(p_offer_id UUID)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_offer RECORD;
    v_request RECORD;
    v_run RECORD;
    v_sp RECORD;
    v_price NUMERIC;
    v_total NUMERIC;
    v_order_id UUID;
    v_caller UUID := auth.uid();
    v_cap_ok BOOLEAN;
    v_new_seq INTEGER;
    v_supplier_customer_id UUID;
    v_customer_profile RECORD;
BEGIN
    -- 1. Lock and check offer
    SELECT * INTO v_offer FROM public.delivery_offers WHERE id = p_offer_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Offer not found'; END IF;
    IF v_offer.status != 'pending' THEN RAISE EXCEPTION 'Offer is not pending'; END IF;

    -- 2. Lock request (FIX #6: use dispatch_request_id not request_id)
    SELECT * INTO v_request FROM public.order_dispatch_requests
    WHERE id = v_offer.dispatch_request_id FOR UPDATE;
    IF v_request.status NOT IN ('searching', 'offered') THEN
        UPDATE public.delivery_offers SET status = 'cancelled' WHERE id = p_offer_id;
        RAISE EXCEPTION 'Request is no longer active';
    END IF;

    -- 3. Verify Run
    SELECT * INTO v_run FROM public.delivery_runs WHERE id = v_offer.run_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Run not found'; END IF;

    -- 4. Authorize (Driver, Helper, or Supplier)
    IF v_caller != (SELECT profile_id FROM public.drivers WHERE id = v_run.driver_id)
       AND (v_run.helper_id IS NULL OR v_caller != (SELECT profile_id FROM public.helpers WHERE id = v_run.helper_id))
       AND v_caller != (SELECT profile_id FROM public.suppliers WHERE id = v_run.supplier_id) THEN
        RAISE EXCEPTION 'Unauthorized: only assigned crew or supplier can accept';
    END IF;

    -- 5. Recalculate capacity (FIX #2: use internal function)
    SELECT EXISTS (
        SELECT 1 FROM internal_get_vehicle_capacity_state(v_offer.run_id) cap
        WHERE cap.opportunity_capacity >= v_request.quantity
    ) INTO v_cap_ok;
    IF NOT v_cap_ok THEN
        UPDATE public.delivery_offers SET status = 'cancelled' WHERE id = p_offer_id;
        RAISE EXCEPTION 'Insufficient vehicle capacity';
    END IF;

    -- 6. Get supplier product and pricing
    SELECT sp.*, sp.price AS default_price INTO v_sp
    FROM public.supplier_products sp
    WHERE sp.supplier_id = v_offer.supplier_id
      AND sp.product_id = v_request.product_id
      AND sp.available = true
    LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'Product not available'; END IF;

    v_price := v_sp.default_price;
    v_total := v_price * v_request.quantity;

    -- 7. Find or create supplier_customer (FIX #6: use user_id, normalized_phone, is_active)
    SELECT id INTO v_supplier_customer_id FROM public.supplier_customers
    WHERE supplier_id = v_offer.supplier_id AND user_id = v_request.customer_id
    LIMIT 1;

    IF NOT FOUND THEN
        SELECT * INTO v_customer_profile FROM public.profiles WHERE id = v_request.customer_id;
        INSERT INTO public.supplier_customers (
            supplier_id, user_id, name, phone, normalized_phone, customer_type, is_active
        ) VALUES (
            v_offer.supplier_id, v_request.customer_id,
            COALESCE(v_customer_profile.name, 'Customer'),
            COALESCE(v_customer_profile.phone, ''),
            COALESCE(v_customer_profile.phone, ''),
            'household', true
        ) RETURNING id INTO v_supplier_customer_id;

        INSERT INTO public.customer_jar_balances (supplier_customer_id, jars_with_customer)
        VALUES (v_supplier_customer_id, 0) ON CONFLICT (supplier_customer_id) DO NOTHING;
    END IF;

    -- 8. Create canonical order (FIX #19: explicit fulfillment_mode)
    INSERT INTO public.orders (
        customer_id, supplier_id, address_id, status, subtotal, delivery_fee, total,
        payment_method, payment_status, supplier_customer_id, fulfillment_mode
    ) VALUES (
        v_request.customer_id, v_offer.supplier_id, v_request.address_id,
        'out_for_delivery', v_total, 0, v_total,
        'cash', 'pending', v_supplier_customer_id, 'opportunistic_route'
    ) RETURNING id INTO v_order_id;

    INSERT INTO public.order_items (order_id, product_id, quantity, unit_price, total)
    VALUES (v_order_id, v_request.product_id, v_request.quantity, v_price, v_total);

    INSERT INTO public.order_status_history (order_id, status, changed_by)
    VALUES (v_order_id, 'out_for_delivery', v_caller);

    -- 9. Insert opportunistic stop
    v_new_seq := v_offer.insertion_position;

    UPDATE public.delivery_run_stops
    SET sequence_number = sequence_number + 1
    WHERE run_id = v_offer.run_id AND status = 'planned' AND sequence_number >= v_new_seq;

    INSERT INTO public.delivery_run_stops (
        run_id, sequence_number, customer_id, address_id, product_id,
        quantity, unit_price, total_amount, status, stop_type, order_id
    ) VALUES (
        v_offer.run_id, v_new_seq, v_request.customer_id, v_request.address_id,
        v_request.product_id, v_request.quantity, v_price, v_total,
        'planned', 'opportunistic', v_order_id
    );

    -- 10. Update states
    UPDATE public.delivery_offers SET status = 'accepted', responded_at = now(), responded_by = v_caller WHERE id = p_offer_id;
    UPDATE public.order_dispatch_requests
    SET status = 'accepted', assigned_order_id = v_order_id, assigned_run_id = v_offer.run_id,
        assigned_vehicle_id = v_offer.vehicle_id, assigned_supplier_id = v_offer.supplier_id
    WHERE id = v_offer.dispatch_request_id;

    -- Cancel competing offers
    UPDATE public.delivery_offers SET status = 'cancelled', updated_at = now()
    WHERE dispatch_request_id = v_offer.dispatch_request_id AND id != p_offer_id AND status = 'pending';

    PERFORM public.recalculate_route_eta(v_offer.run_id);

    -- FIX #5: Use correct notification columns
    INSERT INTO public.delivery_notifications (
        user_id, notification_type, title, body, payload
    ) VALUES (
        v_request.customer_id, 'order_accepted',
        'Order Accepted',
        'A nearby vehicle has accepted your order and is on the way.',
        jsonb_build_object('type', 'order_accepted', 'order_id', v_order_id, 'run_id', v_offer.run_id)
    );

    RETURN v_order_id;
END;
$$;


-- ============================================================================
-- SECTION 8: GPS TELEMETRY
-- Fixes: #11 (parameter names), #12 (config table)
-- Updated to accept mobile's richer parameter set
-- ============================================================================
DROP FUNCTION IF EXISTS public.process_vehicle_location(UUID, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION public.process_vehicle_location(
    p_run_id UUID,
    p_lat DOUBLE PRECISION,
    p_lng DOUBLE PRECISION,
    p_speed DOUBLE PRECISION,
    p_accuracy_m DOUBLE PRECISION DEFAULT 0,
    p_heading DOUBLE PRECISION DEFAULT NULL,
    p_altitude DOUBLE PRECISION DEFAULT NULL,
    p_captured_at TIMESTAMPTZ DEFAULT now()
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_run RECORD;
    v_config RECORD;
    v_vehicle_id UUID;
    v_caller UUID := auth.uid();
    v_is_auth BOOLEAN := false;
BEGIN
    SELECT * INTO v_run FROM public.delivery_runs WHERE id = p_run_id;
    IF NOT FOUND OR v_run.status != 'in_progress' THEN RETURN; END IF;

    -- Authorize driver, helper, or supplier
    IF (SELECT profile_id FROM public.drivers WHERE id = v_run.driver_id) = v_caller THEN
        v_is_auth := true;
    END IF;
    IF NOT v_is_auth AND v_run.helper_id IS NOT NULL THEN
        IF (SELECT profile_id FROM public.helpers WHERE id = v_run.helper_id) = v_caller THEN
            v_is_auth := true;
        END IF;
    END IF;
    IF NOT v_is_auth THEN
        IF (SELECT profile_id FROM public.suppliers WHERE id = v_run.supplier_id) = v_caller THEN
            v_is_auth := true;
        END IF;
    END IF;
    IF NOT v_is_auth THEN
        RAISE EXCEPTION 'Unauthorized: only assigned crew or supplier can update location';
    END IF;

    v_vehicle_id := v_run.vehicle_id;

    -- FIX #12: Use dispatch_config directly
    SELECT * INTO v_config FROM public.dispatch_config WHERE id = 1;

    INSERT INTO public.vehicle_locations (run_id, vehicle_id, latitude, longitude, accuracy_m, speed, captured_at)
    VALUES (p_run_id, v_vehicle_id, p_lat, p_lng, p_accuracy_m, p_speed, p_captured_at);

    INSERT INTO public.delivery_run_live_state (run_id, vehicle_id, latitude, longitude, captured_at, status)
    VALUES (p_run_id, v_vehicle_id, p_lat, p_lng, p_captured_at, 'moving')
    ON CONFLICT (run_id) DO UPDATE SET
        latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude,
        captured_at = EXCLUDED.captured_at, status = EXCLUDED.status;

    PERFORM public.recalculate_route_eta(p_run_id);
END;
$$;


-- ============================================================================
-- SECTION 9: DOMINO ETA RECALCULATION
-- Fixes: #12 (config table), address column names
-- ============================================================================
CREATE OR REPLACE FUNCTION public.recalculate_route_eta(p_run_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_veh_lat DOUBLE PRECISION;
    v_veh_lng DOUBLE PRECISION;
    v_config RECORD;
    v_speed_kmh DOUBLE PRECISION;
    v_dropoff_time_minutes INTEGER := 2;
    v_stop RECORD;
    v_distance_km DOUBLE PRECISION;
    v_base_driving_time INTEGER;
    v_cumulative_eta INTEGER;
    v_stops_before INTEGER := 0;
    v_prev_lat DOUBLE PRECISION := NULL;
    v_prev_lng DOUBLE PRECISION := NULL;
    v_cluster_bonus INTEGER := 0;
BEGIN
    SELECT latitude, longitude INTO v_veh_lat, v_veh_lng
    FROM public.vehicle_locations
    WHERE run_id = p_run_id ORDER BY captured_at DESC LIMIT 1;

    IF v_veh_lat IS NULL OR v_veh_lng IS NULL THEN RETURN; END IF;

    -- FIX #12: Use dispatch_config directly
    SELECT * INTO v_config FROM public.dispatch_config WHERE id = 1;
    v_speed_kmh := COALESCE(v_config.assumed_speed_kmh, 30.0);

    -- FIX: Use a.lat/a.lng (NOT a.latitude/a.longitude) for addresses
    FOR v_stop IN
        SELECT drs.id, drs.sequence_number, drs.customer_id, drs.stop_type,
               drs.order_id, drs.approaching_alert_sent_at, drs.arrival_alert_sent_at,
               a.lat AS stop_lat, a.lng AS stop_lng
        FROM public.delivery_run_stops drs
        JOIN public.addresses a ON drs.address_id = a.id
        WHERE drs.run_id = p_run_id AND drs.status IN ('planned', 'en_route')
        ORDER BY drs.sequence_number ASC
    LOOP
        IF v_stop.stop_lat IS NULL OR v_stop.stop_lng IS NULL THEN CONTINUE; END IF;

        IF v_prev_lat IS NOT NULL AND v_prev_lng IS NOT NULL THEN
            IF calculate_distance_km(v_prev_lat, v_prev_lng, v_stop.stop_lat, v_stop.stop_lng) * 1000 < 50 THEN
                v_cluster_bonus := v_cluster_bonus + 0;
            ELSE
                v_cluster_bonus := v_cluster_bonus + CEIL((calculate_distance_km(v_prev_lat, v_prev_lng, v_stop.stop_lat, v_stop.stop_lng) / v_speed_kmh) * 60);
            END IF;
        END IF;

        IF v_stops_before = 0 THEN
            v_base_driving_time := CEIL((calculate_distance_km(v_veh_lat, v_veh_lng, v_stop.stop_lat, v_stop.stop_lng) / v_speed_kmh) * 60);
            v_cumulative_eta := v_base_driving_time;
        ELSE
            v_cumulative_eta := v_base_driving_time + v_cluster_bonus + (v_stops_before * v_dropoff_time_minutes);
        END IF;

        UPDATE public.delivery_run_stops
        SET eta_minutes = v_cumulative_eta, eta_calculated_at = now()
        WHERE id = v_stop.id;

        -- Approaching alert (15 mins)
        IF v_cumulative_eta <= 15 AND v_stop.approaching_alert_sent_at IS NULL THEN
            UPDATE public.delivery_run_stops SET approaching_alert_sent_at = now() WHERE id = v_stop.id;
            INSERT INTO public.delivery_notifications (user_id, stop_id, notification_type, title, body, payload)
            VALUES (v_stop.customer_id, v_stop.id, 'approaching_alert', 'Delivery Approaching',
                    'Your AquaKart delivery is approaching (approx ' || v_cumulative_eta || ' mins).',
                    jsonb_build_object('eta_minutes', v_cumulative_eta, 'run_id', p_run_id, 'stop_id', v_stop.id));
        END IF;

        -- Arrival alert (5 mins)
        IF v_cumulative_eta <= 5 AND v_stop.arrival_alert_sent_at IS NULL THEN
            UPDATE public.delivery_run_stops SET arrival_alert_sent_at = now(), status = 'en_route' WHERE id = v_stop.id;
            INSERT INTO public.delivery_notifications (user_id, stop_id, notification_type, title, body, payload)
            VALUES (v_stop.customer_id, v_stop.id, 'arrival_alert', 'Arriving Soon',
                    'Your AquaKart delivery is about 5 minutes away.',
                    jsonb_build_object('eta_minutes', v_cumulative_eta, 'run_id', p_run_id, 'stop_id', v_stop.id));
        END IF;

        v_prev_lat := v_stop.stop_lat;
        v_prev_lng := v_stop.stop_lng;
        v_stops_before := v_stops_before + 1;
    END LOOP;
END;
$$;


-- ============================================================================
-- SECTION 10: NOTIFICATIONS - create_opportunity_notifications
-- Fixes: #5 (correct column names for delivery_notifications)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_opportunity_notifications(p_offer_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_offer RECORD;
    v_request RECORD;
    v_helper_profile UUID;
    v_supplier_profile UUID;
    v_customer_name TEXT;
    v_product_name TEXT;
    v_body TEXT;
    v_payload JSONB;
BEGIN
    SELECT * INTO v_offer FROM public.delivery_offers WHERE id = p_offer_id;
    IF NOT FOUND THEN RETURN; END IF;
    SELECT * INTO v_request FROM public.order_dispatch_requests WHERE id = v_offer.dispatch_request_id;
    IF NOT FOUND THEN RETURN; END IF;

    SELECT name INTO v_customer_name FROM public.profiles WHERE id = v_request.customer_id;
    SELECT name INTO v_product_name FROM public.products WHERE id = v_request.product_id;

    v_body := v_request.quantity || ' × ' || COALESCE(v_product_name, 'Water')
              || ' • ETA ' || v_offer.eta_minutes || ' min'
              || ' • Detour ' || v_offer.detour_minutes || ' min';
    v_payload := jsonb_build_object(
        'type', 'opportunity_order_offer', 'offer_id', p_offer_id,
        'dispatch_request_id', v_request.id, 'run_id', v_offer.run_id,
        'vehicle_id', v_offer.vehicle_id, 'quantity', v_request.quantity,
        'product_id', v_request.product_id, 'distance_km', v_offer.distance_km,
        'eta_minutes', v_offer.eta_minutes, 'detour_minutes', v_offer.detour_minutes
    );

    -- Helper notification (primary)
    IF v_offer.helper_id IS NOT NULL THEN
        SELECT profile_id INTO v_helper_profile FROM public.helpers WHERE id = v_offer.helper_id;
        IF v_helper_profile IS NOT NULL THEN
            INSERT INTO public.delivery_notifications (
                user_id, notification_type, title, body, payload,
                offer_id, dispatch_request_id, run_id
            ) VALUES (
                v_helper_profile, 'opportunity_order_offer_helper',
                'New AquaKart Delivery Opportunity', v_body, v_payload,
                p_offer_id, v_request.id, v_offer.run_id
            );
        END IF;
    END IF;

    -- Supplier notification (informational)
    SELECT profile_id INTO v_supplier_profile FROM public.suppliers WHERE id = v_offer.supplier_id;
    IF v_supplier_profile IS NOT NULL THEN
        INSERT INTO public.delivery_notifications (
            user_id, notification_type, title, body, payload,
            offer_id, dispatch_request_id, run_id
        ) VALUES (
            v_supplier_profile, 'opportunity_order_offer_supplier',
            'New AquaKart Opportunity Near Vehicle', v_body, v_payload,
            p_offer_id, v_request.id, v_offer.run_id
        );
    END IF;
END;
$$;


-- ============================================================================
-- SECTION 11: EXPIRE STALE DISPATCHES
-- Fixes: #17 (expiration logic), notification columns
-- ============================================================================
CREATE OR REPLACE FUNCTION public.expire_stale_dispatches()
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_offer RECORD;
BEGIN
    -- 1. Expire individual pending offers past their expiry
    FOR v_offer IN
        UPDATE public.delivery_offers
        SET status = 'expired', updated_at = now()
        WHERE status = 'pending' AND expires_at < now()
        RETURNING *
    LOOP
        -- Notify supplier of missed opportunity (correct columns)
        INSERT INTO public.delivery_notifications (
            user_id, notification_type, title, body, payload, offer_id
        ) VALUES (
            (SELECT profile_id FROM public.suppliers WHERE id = v_offer.supplier_id),
            'opportunity_expired', 'Opportunity Expired',
            'An opportunity expired without response from your staff.',
            jsonb_build_object('offer_id', v_offer.id, 'run_id', v_offer.run_id),
            v_offer.id
        );
    END LOOP;

    -- 2. Fail requests that have TIMED OUT (past their expires_at)
    --    FIX #17: Requests stay 'searching' until timeout, not until 0 offers
    UPDATE public.order_dispatch_requests
    SET status = 'failed', updated_at = now()
    WHERE status IN ('searching', 'offered')
      AND expires_at < now();
END;
$$;


-- ============================================================================
-- SECTION 12: SIMPLIFIED update_order_status
-- No longer handles accounting for 'delivered' (that goes through
-- complete_order_delivery or complete_delivery_run_stop)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_order_status(p_order_id UUID, p_new_status TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
    v_total_quantity INT;
    v_order_date DATE;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

    IF p_new_status = 'accepted' THEN
        PERFORM public.accept_order(p_order_id);
        RETURN;
    ELSIF p_new_status = 'rejected' THEN
        PERFORM public.reject_order(p_order_id, 'Rejected by supplier');
        RETURN;
    ELSIF p_new_status = 'delivered' THEN
        -- BLOCKED: Use complete_order_delivery() instead
        RAISE EXCEPTION 'Use complete_order_delivery() for delivery completion with accounting';
    END IF;

    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;

    SELECT SUM(quantity) INTO v_total_quantity FROM public.order_items WHERE order_id = p_order_id;
    v_order_date := timezone('Asia/Kolkata', v_order.created_at)::date;

    IF p_new_status = 'cancelled' AND v_order.status IN ('accepted', 'preparing', 'out_for_delivery') THEN
        UPDATE public.supplier_capacity
        SET reserved_quantity = reserved_quantity - v_total_quantity
        WHERE supplier_id = v_order.supplier_id AND date = v_order_date;
    END IF;

    UPDATE public.orders SET status = p_new_status, updated_at = now() WHERE id = p_order_id;
    INSERT INTO public.order_status_history (order_id, status, changed_by)
    VALUES (p_order_id, p_new_status, auth.uid());
END;
$$;


-- ============================================================================
-- SECTION 13: ADMIN CAPACITY WRAPPER
-- Fixes: #22 (admin cannot call role-restricted capacity function)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_get_vehicle_capacity_state(p_run_id UUID)
RETURNS TABLE (
    run_id UUID,
    loaded_quantity BIGINT,
    delivered_quantity BIGINT,
    physical_remaining BIGINT,
    scheduled_remaining BIGINT,
    opportunity_capacity BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    -- Verify caller is admin
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: admin only';
    END IF;
    RETURN QUERY SELECT * FROM public.internal_get_vehicle_capacity_state(p_run_id);
END;
$$;


-- ============================================================================
-- SECTION 14: FIX notify_customer_arrival_by_order
-- Fixes: #21 (order_id column exists on delivery_notifications per 062)
-- The current version from 087 is mostly correct. Just ensure stop_id is NULL.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.notify_customer_arrival_by_order(p_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    v_customer_id UUID;
    v_supplier_id UUID;
BEGIN
    SELECT customer_id, supplier_id INTO v_customer_id, v_supplier_id
    FROM public.orders WHERE id = p_order_id;
    IF v_customer_id IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;
    IF v_supplier_id != public.get_supplier_id() THEN
        RAISE EXCEPTION 'Not authorized to send alerts for this order';
    END IF;

    UPDATE public.orders SET status = 'out_for_delivery' WHERE id = p_order_id;
    INSERT INTO public.order_status_history (order_id, status, changed_by, notes)
    VALUES (p_order_id, 'out_for_delivery', auth.uid(), 'Supplier sent arrival alert');

    INSERT INTO public.delivery_notifications (
        user_id, notification_type, title, body, payload
    ) VALUES (
        v_customer_id, 'eta_alert',
        'Your Delivery is Arriving Soon!',
        'Our delivery vehicle is nearby and will arrive shortly.',
        jsonb_build_object('type', 'eta_alert', 'order_id', p_order_id)
    );
END;
$$;
