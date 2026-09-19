-- ============================================================================
-- 073_dispatch_engine_rpc.sql
-- Phase 5: Dispatch engine, route insertion, atomic acceptance
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. RPC: create_dispatch_request
--    Customer-facing: creates a dispatch request and returns its ID.
--    Search is kept separate so it can later move to an Edge worker.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_dispatch_request(
    p_address_id  UUID,
    p_product_id  UUID,
    p_quantity    INTEGER
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_caller    UUID := auth.uid();
    v_config    RECORD;
    v_request_id UUID;
BEGIN
    -- 1. Validate caller is a customer
    PERFORM 1 FROM public.profiles WHERE id = v_caller;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Profile not found';
    END IF;

    -- 2. Validate address belongs to customer
    PERFORM 1 FROM public.addresses WHERE id = p_address_id AND user_id = v_caller;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Address does not belong to this user';
    END IF;

    -- 3. Validate product exists
    PERFORM 1 FROM public.products WHERE id = p_product_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product not found';
    END IF;

    -- 4. Get config for expiry
    SELECT * INTO v_config FROM public.dispatch_config WHERE id = 1;

    -- 5. Create the dispatch request
    INSERT INTO public.order_dispatch_requests (
        customer_id, address_id, product_id, quantity,
        status, expires_at
    )
    VALUES (
        v_caller, p_address_id, p_product_id, p_quantity,
        'searching',
        now() + (v_config.search_timeout_seconds || ' seconds')::INTERVAL
    )
    RETURNING id INTO v_request_id;

    RETURN v_request_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. RPC: find_eligible_vehicles
--    Backend dispatch engine. Finds active vehicles that can serve a request.
--    Kept as a separate function so it can be called from Edge Function later.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION find_eligible_vehicles(p_request_id UUID)
RETURNS INTEGER  -- number of offers created
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_request     RECORD;
    v_config      RECORD;
    v_cust_lat    FLOAT;
    v_cust_lng    FLOAT;
    v_candidate   RECORD;
    v_offer_count INTEGER := 0;
    v_best_pos    INTEGER;
    v_best_detour FLOAT;
    v_stop        RECORD;
    v_prev_lat    FLOAT;
    v_prev_lng    FLOAT;
    v_next_lat    FLOAT;
    v_next_lng    FLOAT;
    v_extra_dist  FLOAT;
    v_min_extra   FLOAT;
    v_min_pos     INTEGER;
    v_eta_min     INTEGER;
    v_assumed_speed FLOAT;
    v_dist_to_cust FLOAT;
BEGIN
    -- 1. Fetch dispatch request
    SELECT * INTO v_request
    FROM public.order_dispatch_requests
    WHERE id = p_request_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Dispatch request not found';
    END IF;

    IF v_request.status NOT IN ('searching', 'offered') THEN
        RETURN 0;  -- Already assigned or expired
    END IF;

    -- 2. Get config
    SELECT * INTO v_config FROM public.dispatch_config WHERE id = 1;
    v_assumed_speed := v_config.assumed_speed_kmh;

    -- 3. Get customer coordinates
    SELECT latitude, longitude INTO v_cust_lat, v_cust_lng
    FROM public.addresses
    WHERE id = v_request.address_id;

    IF v_cust_lat IS NULL OR v_cust_lng IS NULL THEN
        -- Cannot match without coordinates
        UPDATE public.order_dispatch_requests
        SET status = 'failed' WHERE id = p_request_id;
        RETURN 0;
    END IF;

    -- 4. Find candidate active runs with fresh GPS and sufficient capacity
    FOR v_candidate IN
        SELECT
            dr.id AS run_id,
            dr.supplier_id,
            dr.vehicle_id,
            dr.driver_id,
            dr.helper_id,
            vl.latitude AS veh_lat,
            vl.longitude AS veh_lng,
            vl.captured_at AS gps_time,
            -- Calculate straight-line distance from vehicle to customer
            calculate_distance_km(vl.latitude, vl.longitude, v_cust_lat, v_cust_lng) AS dist_km
        FROM public.delivery_runs dr
        -- Latest GPS per run
        JOIN LATERAL (
            SELECT latitude, longitude, captured_at
            FROM public.vehicle_locations
            WHERE run_id = dr.id
            ORDER BY captured_at DESC
            LIMIT 1
        ) vl ON true
        -- Supplier must sell this product
        JOIN public.supplier_products sp
            ON sp.supplier_id = dr.supplier_id
            AND sp.product_id = v_request.product_id
            AND sp.is_available = true
        WHERE dr.status = 'in_progress'
          -- GPS freshness check
          AND vl.captured_at >= (now() - (v_config.location_freshness_seconds || ' seconds')::INTERVAL)
          -- Distance filter
          AND calculate_distance_km(vl.latitude, vl.longitude, v_cust_lat, v_cust_lng) <= v_config.max_customer_distance_km
        ORDER BY calculate_distance_km(vl.latitude, vl.longitude, v_cust_lat, v_cust_lng) ASC
        LIMIT 10  -- Evaluate top 10 closest
    LOOP
        -- 5. Check opportunity capacity for this run
        PERFORM 1
        FROM get_vehicle_capacity_state(v_candidate.run_id) cap
        WHERE cap.opportunity_capacity >= v_request.quantity;

        IF NOT FOUND THEN
            CONTINUE;  -- Insufficient capacity
        END IF;

        -- 6. Evaluate route insertion positions
        v_min_extra := 999999;
        v_min_pos := NULL;

        -- Get future stops (not yet delivered/skipped)
        -- Try inserting customer at each valid position
        -- Position 0 = right after current vehicle location

        -- First: evaluate insertion as first future stop
        v_prev_lat := v_candidate.veh_lat;
        v_prev_lng := v_candidate.veh_lng;

        -- Get the first future stop
        SELECT a.latitude, a.longitude, drs.sequence_number
        INTO v_next_lat, v_next_lng, v_best_pos
        FROM public.delivery_run_stops drs
        JOIN public.addresses a ON a.id = drs.address_id
        WHERE drs.run_id = v_candidate.run_id
          AND drs.status IN ('planned', 'en_route')
        ORDER BY drs.sequence_number ASC
        LIMIT 1;

        IF v_next_lat IS NOT NULL THEN
            -- Insert before first future stop
            v_extra_dist :=
                calculate_distance_km(v_prev_lat, v_prev_lng, v_cust_lat, v_cust_lng)
                + calculate_distance_km(v_cust_lat, v_cust_lng, v_next_lat, v_next_lng)
                - calculate_distance_km(v_prev_lat, v_prev_lng, v_next_lat, v_next_lng);

            IF v_extra_dist < v_min_extra THEN
                v_min_extra := v_extra_dist;
                v_min_pos := COALESCE(v_best_pos, 1);
            END IF;
        ELSE
            -- No future stops — append at end
            v_extra_dist := calculate_distance_km(v_prev_lat, v_prev_lng, v_cust_lat, v_cust_lng);
            v_min_extra := v_extra_dist;
            v_min_pos := 1;
        END IF;

        -- Evaluate insertion between consecutive future stops
        FOR v_stop IN
            SELECT
                a.latitude AS stop_lat,
                a.longitude AS stop_lng,
                drs.sequence_number AS seq,
                LEAD(a2.latitude) OVER (ORDER BY drs.sequence_number) AS next_stop_lat,
                LEAD(a2.longitude) OVER (ORDER BY drs.sequence_number) AS next_stop_lng,
                LEAD(drs2.sequence_number) OVER (ORDER BY drs.sequence_number) AS next_seq
            FROM public.delivery_run_stops drs
            JOIN public.addresses a ON a.id = drs.address_id
            -- Self-join for LEAD function workaround
            LEFT JOIN LATERAL (
                SELECT drs2.id, drs2.sequence_number, drs2.address_id
                FROM public.delivery_run_stops drs2
                WHERE drs2.run_id = v_candidate.run_id
                  AND drs2.status IN ('planned', 'en_route')
                  AND drs2.sequence_number > drs.sequence_number
                ORDER BY drs2.sequence_number ASC
                LIMIT 1
            ) drs2 ON true
            LEFT JOIN public.addresses a2 ON a2.id = drs2.address_id
            WHERE drs.run_id = v_candidate.run_id
              AND drs.status IN ('planned', 'en_route')
            ORDER BY drs.sequence_number ASC
        LOOP
            IF v_stop.next_stop_lat IS NOT NULL THEN
                -- Insert between this stop and next stop
                v_extra_dist :=
                    calculate_distance_km(v_stop.stop_lat, v_stop.stop_lng, v_cust_lat, v_cust_lng)
                    + calculate_distance_km(v_cust_lat, v_cust_lng, v_stop.next_stop_lat, v_stop.next_stop_lng)
                    - calculate_distance_km(v_stop.stop_lat, v_stop.stop_lng, v_stop.next_stop_lat, v_stop.next_stop_lng);

                IF v_extra_dist < v_min_extra THEN
                    v_min_extra := v_extra_dist;
                    v_min_pos := v_stop.seq + 1;
                END IF;
            ELSE
                -- This is the last stop — append after
                v_extra_dist :=
                    calculate_distance_km(v_stop.stop_lat, v_stop.stop_lng, v_cust_lat, v_cust_lng);

                IF v_extra_dist < v_min_extra THEN
                    v_min_extra := v_extra_dist;
                    v_min_pos := v_stop.seq + 1;
                END IF;
            END IF;
        END LOOP;

        -- 7. Check detour limit
        v_eta_min := CEIL((v_min_extra / v_assumed_speed) * 60);

        IF v_eta_min > v_config.max_route_detour_minutes THEN
            CONTINUE;  -- Too much detour
        END IF;

        -- 8. Calculate direct ETA from vehicle to customer
        v_dist_to_cust := calculate_distance_km(v_candidate.veh_lat, v_candidate.veh_lng, v_cust_lat, v_cust_lng);

        -- 9. Create the offer
        INSERT INTO public.delivery_offers (
            dispatch_request_id, supplier_id, vehicle_id, run_id,
            helper_id, driver_id,
            distance_km, eta_minutes, detour_minutes, insertion_position,
            status, expires_at
        )
        VALUES (
            p_request_id,
            v_candidate.supplier_id,
            v_candidate.vehicle_id,
            v_candidate.run_id,
            v_candidate.helper_id,
            v_candidate.driver_id,
            v_dist_to_cust,
            CEIL((v_dist_to_cust / v_assumed_speed) * 60),
            v_eta_min,
            v_min_pos,
            'pending',
            now() + (v_config.offer_expiry_seconds || ' seconds')::INTERVAL
        );

        v_offer_count := v_offer_count + 1;
    END LOOP;

    -- 10. Update dispatch request status
    IF v_offer_count > 0 THEN
        UPDATE public.order_dispatch_requests
        SET status = 'offered'
        WHERE id = p_request_id;
    ELSE
        -- No eligible vehicles found
        UPDATE public.order_dispatch_requests
        SET status = 'failed'
        WHERE id = p_request_id;
    END IF;

    RETURN v_offer_count;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. RPC: accept_delivery_offer
--    Atomic acceptance: creates canonical order, inserts route stop,
--    reserves capacity. Only one offer per request can win.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION accept_delivery_offer(p_offer_id UUID)
RETURNS UUID  -- Returns the created order ID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_offer      RECORD;
    v_request    RECORD;
    v_run        RECORD;
    v_caller     UUID := auth.uid();
    v_is_auth    BOOLEAN := false;
    v_order_id   UUID;
    v_sp         RECORD;
    v_price      NUMERIC(10,2);
    v_total      NUMERIC(10,2);
    v_new_seq    INTEGER;
    v_cap_ok     BOOLEAN;
BEGIN
    -- 1. Lock and fetch the offer
    SELECT * INTO v_offer
    FROM public.delivery_offers
    WHERE id = p_offer_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Offer not found';
    END IF;

    IF v_offer.status != 'pending' THEN
        RAISE EXCEPTION 'Offer is no longer available (status: %)', v_offer.status;
    END IF;

    IF v_offer.expires_at < now() THEN
        UPDATE public.delivery_offers SET status = 'expired' WHERE id = p_offer_id;
        RAISE EXCEPTION 'Offer has expired';
    END IF;

    -- 2. Lock and fetch the dispatch request
    SELECT * INTO v_request
    FROM public.order_dispatch_requests
    WHERE id = v_offer.dispatch_request_id
    FOR UPDATE;

    IF v_request.status NOT IN ('searching', 'offered') THEN
        RAISE EXCEPTION 'Request is no longer available (status: %)', v_request.status;
    END IF;

    -- 3. Lock the delivery run
    SELECT * INTO v_run
    FROM public.delivery_runs
    WHERE id = v_offer.run_id
    FOR UPDATE;

    IF v_run.status != 'in_progress' THEN
        RAISE EXCEPTION 'Run is no longer in progress';
    END IF;

    -- 4. Verify caller authorization (helper or supplier)
    IF v_offer.helper_id IS NOT NULL THEN
        PERFORM 1 FROM public.helpers
        WHERE id = v_offer.helper_id AND profile_id = v_caller;
        IF FOUND THEN v_is_auth := true; END IF;
    END IF;

    IF NOT v_is_auth THEN
        PERFORM 1 FROM public.suppliers
        WHERE id = v_offer.supplier_id AND profile_id = v_caller;
        IF FOUND THEN v_is_auth := true; END IF;
    END IF;

    IF NOT v_is_auth THEN
        RAISE EXCEPTION 'Unauthorized: only the assigned helper or supplier can accept';
    END IF;

    -- 5. Recalculate capacity
    SELECT EXISTS (
        SELECT 1 FROM get_vehicle_capacity_state(v_offer.run_id) cap
        WHERE cap.opportunity_capacity >= v_request.quantity
    ) INTO v_cap_ok;

    IF NOT v_cap_ok THEN
        UPDATE public.delivery_offers SET status = 'cancelled' WHERE id = p_offer_id;
        RAISE EXCEPTION 'Insufficient vehicle capacity';
    END IF;

    -- 6. Get supplier product and pricing
    SELECT sp.*, sp.price AS default_price
    INTO v_sp
    FROM public.supplier_products sp
    WHERE sp.supplier_id = v_offer.supplier_id
      AND sp.product_id = v_request.product_id
      AND sp.is_available = true
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product not available from this supplier';
    END IF;

    v_price := v_sp.default_price;
    v_total := v_price * v_request.quantity;

    -- 7. Create canonical order
    INSERT INTO public.orders (
        customer_id, supplier_id, address_id,
        status, subtotal, delivery_fee, total,
        payment_method, payment_status
    )
    VALUES (
        v_request.customer_id,
        v_offer.supplier_id,
        v_request.address_id,
        'out_for_delivery',
        v_total, 0, v_total,
        'cash', 'pending'
    )
    RETURNING id INTO v_order_id;

    -- Create order items
    INSERT INTO public.order_items (order_id, product_id, quantity, unit_price, total)
    VALUES (v_order_id, v_request.product_id, v_request.quantity, v_price, v_total);

    -- Order status history
    INSERT INTO public.order_status_history (order_id, status, changed_by)
    VALUES (v_order_id, 'out_for_delivery', v_caller);

    -- 8. Renumber future stops and insert new stop
    -- Shift all future stops at or after the insertion position
    v_new_seq := v_offer.insertion_position;

    UPDATE public.delivery_run_stops
    SET sequence_number = sequence_number + 1
    WHERE run_id = v_offer.run_id
      AND status IN ('planned', 'en_route')
      AND sequence_number >= v_new_seq;

    -- Insert the opportunistic stop
    INSERT INTO public.delivery_run_stops (
        run_id, sequence_number, customer_id, address_id,
        product_id, quantity, unit_price, total_amount,
        status, stop_type, order_id
    )
    VALUES (
        v_offer.run_id,
        v_new_seq,
        v_request.customer_id,
        v_request.address_id,
        v_request.product_id,
        v_request.quantity,
        v_price,
        v_total,
        'planned',
        'opportunistic',
        v_order_id
    );

    -- 9. Update dispatch request
    UPDATE public.order_dispatch_requests
    SET status = 'assigned',
        assigned_order_id = v_order_id,
        assigned_run_id = v_offer.run_id,
        assigned_vehicle_id = v_offer.vehicle_id,
        assigned_supplier_id = v_offer.supplier_id
    WHERE id = v_request.id;

    -- 10. Mark this offer accepted, cancel all others for same request
    UPDATE public.delivery_offers
    SET status = 'accepted',
        responded_at = now(),
        responded_by = v_caller
    WHERE id = p_offer_id;

    UPDATE public.delivery_offers
    SET status = 'cancelled'
    WHERE dispatch_request_id = v_request.id
      AND id != p_offer_id
      AND status = 'pending';

    RETURN v_order_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. RPC: decline_delivery_offer
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION decline_delivery_offer(p_offer_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_offer   RECORD;
    v_caller  UUID := auth.uid();
    v_is_auth BOOLEAN := false;
BEGIN
    SELECT * INTO v_offer
    FROM public.delivery_offers
    WHERE id = p_offer_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Offer not found';
    END IF;

    IF v_offer.status != 'pending' THEN
        RETURN;  -- Already handled
    END IF;

    -- Verify caller
    IF v_offer.helper_id IS NOT NULL THEN
        PERFORM 1 FROM public.helpers WHERE id = v_offer.helper_id AND profile_id = v_caller;
        IF FOUND THEN v_is_auth := true; END IF;
    END IF;
    IF NOT v_is_auth THEN
        PERFORM 1 FROM public.suppliers WHERE id = v_offer.supplier_id AND profile_id = v_caller;
        IF FOUND THEN v_is_auth := true; END IF;
    END IF;
    IF NOT v_is_auth THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    UPDATE public.delivery_offers
    SET status = 'declined',
        responded_at = now(),
        responded_by = v_caller
    WHERE id = p_offer_id;
END;
$$;
