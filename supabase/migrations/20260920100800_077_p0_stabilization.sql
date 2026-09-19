-- ============================================================================
-- 077_p0_stabilization.sql
-- Fixes for P0 architectural blockers before field testing
-- ============================================================================

-- ============================================================================
-- FIX P0-5: Internal vs Client Capacity RPC
-- ============================================================================
-- 1. Internal capacity calculation (bypasses RLS, used by dispatch engine)
CREATE OR REPLACE FUNCTION internal_get_vehicle_capacity_state(p_run_id UUID)
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
    RETURN QUERY
    WITH load_totals AS (
        SELECT COALESCE(SUM(quantity), 0) AS loaded
        FROM public.delivery_run_loads
        WHERE delivery_run_loads.run_id = p_run_id
          AND status = 'confirmed'
    ),
    stop_totals AS (
        SELECT 
            COALESCE(SUM(CASE WHEN status = 'delivered' THEN quantity ELSE 0 END), 0) AS delivered,
            COALESCE(SUM(CASE WHEN status IN ('planned', 'en_route') THEN quantity ELSE 0 END), 0) AS remaining
        FROM public.delivery_run_stops
        WHERE delivery_run_stops.run_id = p_run_id
    )
    SELECT
        p_run_id,
        lt.loaded,
        st.delivered,
        (lt.loaded - st.delivered) AS physical_remaining,
        st.remaining AS scheduled_remaining,
        GREATEST(0::BIGINT, (lt.loaded - st.delivered - st.remaining)) AS opportunity_capacity
    FROM load_totals lt, stop_totals st;
END;
$$;

-- 2. Authorized client-facing capacity function
CREATE OR REPLACE FUNCTION get_vehicle_capacity_state(p_run_id UUID)
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
DECLARE
    v_caller UUID := auth.uid();
    v_is_auth BOOLEAN := false;
    v_run RECORD;
BEGIN
    SELECT * INTO v_run FROM public.delivery_runs WHERE id = p_run_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Run not found'; END IF;

    -- Verify caller is supplier owner
    PERFORM 1 FROM public.suppliers WHERE id = v_run.supplier_id AND profile_id = v_caller;
    IF FOUND THEN v_is_auth := true; END IF;

    -- Verify caller is assigned driver
    IF NOT v_is_auth THEN
        PERFORM 1 FROM public.drivers WHERE id = v_run.driver_id AND profile_id = v_caller;
        IF FOUND THEN v_is_auth := true; END IF;
    END IF;

    -- Verify caller is assigned helper
    IF NOT v_is_auth AND v_run.helper_id IS NOT NULL THEN
        PERFORM 1 FROM public.helpers WHERE id = v_run.helper_id AND profile_id = v_caller;
        IF FOUND THEN v_is_auth := true; END IF;
    END IF;

    IF NOT v_is_auth THEN
        RAISE EXCEPTION 'Unauthorized: only assigned crew or supplier can view capacity';
    END IF;

    RETURN QUERY SELECT * FROM internal_get_vehicle_capacity_state(p_run_id);
END;
$$;


-- ============================================================================
-- FIX P0-2: generate_daily_run schema inconsistency
-- ============================================================================
CREATE OR REPLACE FUNCTION generate_daily_run(
    p_supplier_id  UUID,
    p_run_date     DATE,
    p_vehicle_id   UUID,
    p_driver_id    UUID,
    p_schedule_ids UUID[],
    p_helper_id    UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_run_id UUID;
    v_schedule_id UUID;
    v_seq INT := 1;
    v_schedule_record RECORD;
BEGIN
    INSERT INTO public.delivery_runs (supplier_id, vehicle_id, driver_id, helper_id, run_date, status)
    VALUES (p_supplier_id, p_vehicle_id, p_driver_id, p_helper_id, p_run_date, 'planned')
    RETURNING id INTO v_run_id;

    FOREACH v_schedule_id IN ARRAY p_schedule_ids
    LOOP
        SELECT
            sc.customer_id,
            COALESCE(cds.delivery_address, p.default_address_id) as address_id,
            sp.product_id,
            cds.quantity,
            COALESCE(public.get_effective_price(cds.supplier_customer_id, cds.supplier_product_id), sp.price) as unit_price
        INTO v_schedule_record
        FROM public.customer_delivery_schedules cds
        JOIN public.supplier_customers sc ON sc.id = cds.supplier_customer_id
        JOIN public.profiles p ON p.id = sc.customer_id
        JOIN public.supplier_products sp ON sp.id = cds.supplier_product_id
        WHERE cds.id = v_schedule_id;

        IF FOUND THEN
            INSERT INTO public.delivery_run_stops (
                run_id, schedule_id, sequence_number, customer_id, address_id,
                product_id, quantity, unit_price, total_amount, status, stop_type
            )
            VALUES (
                v_run_id,
                v_schedule_id,
                v_seq,
                v_schedule_record.customer_id,
                v_schedule_record.address_id,
                v_schedule_record.product_id,
                v_schedule_record.quantity,
                COALESCE(v_schedule_record.unit_price, 0),
                v_schedule_record.quantity * COALESCE(v_schedule_record.unit_price, 0),
                'planned',
                'scheduled'
            );
            v_seq := v_seq + 1;
        END IF;
    END LOOP;

    RETURN v_run_id;
END;
$$;


-- ============================================================================
-- FIX P0-1, P0-3, P0-4, P0-6: find_eligible_vehicles
-- ============================================================================
CREATE OR REPLACE FUNCTION find_eligible_vehicles(p_request_id UUID)
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
    SELECT * INTO v_config FROM public.dispatch_configurations ORDER BY created_at DESC LIMIT 1;
    v_assumed_speed := COALESCE(v_config.assumed_speed_kmh, 30.0);

    SELECT * INTO v_request FROM public.order_dispatch_requests WHERE id = p_request_id;
    IF NOT FOUND THEN RETURN 0; END IF;

    -- FIX P0-6: Authorization
    IF v_request.customer_id != v_caller THEN
        RAISE EXCEPTION 'Unauthorized: Caller must own the dispatch request';
    END IF;

    IF v_request.status != 'searching' THEN RETURN 0; END IF;

    SELECT latitude, longitude INTO v_cust_lat, v_cust_lng
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
            vl.latitude AS veh_lat,
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
            AND sp.available = true -- FIX P0-1: Correct column name
        WHERE dr.status = 'in_progress'
          AND vl.captured_at >= (now() - (v_config.location_freshness_seconds || ' seconds')::INTERVAL)
          AND calculate_distance_km(vl.latitude, vl.longitude, v_cust_lat, v_cust_lng) <= v_config.max_customer_distance_km
        ORDER BY calculate_distance_km(vl.latitude, vl.longitude, v_cust_lat, v_cust_lng) ASC
        LIMIT 10
    LOOP
        -- Check capacity using internal function (avoids RLS blockers)
        PERFORM 1 FROM internal_get_vehicle_capacity_state(v_candidate.run_id) cap
        WHERE cap.opportunity_capacity >= v_request.quantity;

        IF NOT FOUND THEN CONTINUE; END IF;

        -- FIX P0-4: Current-stop protection
        v_min_extra := 999999;
        v_min_pos := NULL;
        v_prev_lat := v_candidate.veh_lat;
        v_prev_lng := v_candidate.veh_lng;

        -- Only evaluate 'planned' stops, protecting 'en_route' stop
        SELECT a.latitude, a.longitude, drs.sequence_number
        INTO v_next_lat, v_next_lng, v_best_pos
        FROM public.delivery_run_stops drs
        JOIN public.addresses a ON a.id = drs.address_id
        WHERE drs.run_id = v_candidate.run_id
          AND drs.status = 'planned'
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
            v_min_pos := 1;
        END IF;

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
            LEFT JOIN LATERAL (
                SELECT drs2.id, drs2.sequence_number, drs2.address_id
                FROM public.delivery_run_stops drs2
                WHERE drs2.run_id = v_candidate.run_id
                  AND drs2.status = 'planned'
                  AND drs2.sequence_number > drs.sequence_number
                ORDER BY drs2.sequence_number ASC LIMIT 1
            ) drs2 ON true
            LEFT JOIN public.addresses a2 ON a2.id = drs2.address_id
            WHERE drs.run_id = v_candidate.run_id
              AND drs.status = 'planned'
            ORDER BY drs.sequence_number ASC
        LOOP
            IF v_stop.next_stop_lat IS NOT NULL THEN
                v_extra_dist := calculate_distance_km(v_stop.stop_lat, v_stop.stop_lng, v_cust_lat, v_cust_lng)
                    + calculate_distance_km(v_cust_lat, v_cust_lng, v_stop.next_stop_lat, v_stop.next_stop_lng)
                    - calculate_distance_km(v_stop.stop_lat, v_stop.stop_lng, v_stop.next_stop_lat, v_stop.next_stop_lng);
                IF v_extra_dist < v_min_extra THEN
                    v_min_extra := v_extra_dist;
                    v_min_pos := v_stop.seq + 1;
                END IF;
            ELSE
                v_extra_dist := calculate_distance_km(v_stop.stop_lat, v_stop.stop_lng, v_cust_lat, v_cust_lng);
                IF v_extra_dist < v_min_extra THEN
                    v_min_extra := v_extra_dist;
                    v_min_pos := v_stop.seq + 1;
                END IF;
            END IF;
        END LOOP;

        v_eta_min := CEIL((v_min_extra / v_assumed_speed) * 60);

        IF v_eta_min > v_config.max_route_detour_minutes THEN CONTINUE; END IF;

        v_dist_to_cust := calculate_distance_km(v_candidate.veh_lat, v_candidate.veh_lng, v_cust_lat, v_cust_lng);

        -- Insert Offer safely
        INSERT INTO public.delivery_offers (
            dispatch_request_id, supplier_id, vehicle_id, run_id,
            helper_id, driver_id, distance_km, eta_minutes, detour_minutes, insertion_position,
            status, expires_at
        )
        VALUES (
            p_request_id, v_candidate.supplier_id, v_candidate.vehicle_id, v_candidate.run_id,
            v_candidate.helper_id, v_candidate.driver_id, v_dist_to_cust,
            CEIL((v_dist_to_cust / v_assumed_speed) * 60), v_eta_min, v_min_pos,
            'pending', now() + (v_config.offer_expiry_seconds || ' seconds')::INTERVAL
        )
        ON CONFLICT (dispatch_request_id, run_id) DO NOTHING
        RETURNING id INTO v_new_offer_id;

        IF v_new_offer_id IS NOT NULL THEN
            v_offer_count := v_offer_count + 1;
            -- FIX P0-3: Wire notification
            PERFORM create_opportunity_notifications(v_new_offer_id);
        END IF;
    END LOOP;

    -- FIX P0-6 Retry logic: Do NOT mark as failed if zero offers. The client will retry until timeout.
    IF v_offer_count > 0 THEN
        UPDATE public.order_dispatch_requests SET status = 'offered' WHERE id = p_request_id;
    END IF;

    RETURN v_offer_count;
END;
$$;


-- ============================================================================
-- FIX P0-3, P0-4: accept_delivery_offer
-- ============================================================================
CREATE OR REPLACE FUNCTION accept_delivery_offer(p_offer_id UUID)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_offer RECORD; v_request RECORD; v_run RECORD; v_sp RECORD; v_stop RECORD;
    v_caller UUID := auth.uid();
    v_is_auth BOOLEAN := false; v_cap_ok BOOLEAN;
    v_order_id UUID;
    v_price NUMERIC(10,2); v_total NUMERIC(10,2);
    v_new_seq INTEGER;
    v_cust_lat DOUBLE PRECISION; v_cust_lng DOUBLE PRECISION;
    v_next_lat DOUBLE PRECISION; v_next_lng DOUBLE PRECISION;
    v_veh_lat DOUBLE PRECISION; v_veh_lng DOUBLE PRECISION;
    v_min_extra DOUBLE PRECISION := 999999;
    v_extra_dist DOUBLE PRECISION;
    v_best_pos INTEGER;
BEGIN
    SELECT * INTO v_offer FROM public.delivery_offers WHERE id = p_offer_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Offer not found'; END IF;
    IF v_offer.status != 'pending' THEN RAISE EXCEPTION 'Offer is no longer available'; END IF;
    IF v_offer.expires_at < now() THEN
        UPDATE public.delivery_offers SET status = 'expired' WHERE id = p_offer_id;
        RAISE EXCEPTION 'Offer has expired';
    END IF;

    SELECT * INTO v_request FROM public.order_dispatch_requests WHERE id = v_offer.dispatch_request_id FOR UPDATE;
    IF v_request.status NOT IN ('searching', 'offered') THEN RAISE EXCEPTION 'Request is no longer available'; END IF;

    SELECT * INTO v_run FROM public.delivery_runs WHERE id = v_offer.run_id FOR UPDATE;
    IF v_run.status != 'in_progress' THEN RAISE EXCEPTION 'Run is no longer in progress'; END IF;

    IF v_offer.helper_id IS NOT NULL THEN
        PERFORM 1 FROM public.helpers WHERE id = v_offer.helper_id AND profile_id = v_caller;
        IF FOUND THEN v_is_auth := true; END IF;
    END IF;

    IF NOT v_is_auth THEN
        PERFORM 1 FROM public.suppliers WHERE id = v_offer.supplier_id AND profile_id = v_caller;
        IF FOUND THEN v_is_auth := true; END IF;
    END IF;

    IF NOT v_is_auth THEN RAISE EXCEPTION 'Unauthorized: only the assigned helper or supplier can accept'; END IF;

    SELECT EXISTS (SELECT 1 FROM internal_get_vehicle_capacity_state(v_offer.run_id) cap WHERE cap.opportunity_capacity >= v_request.quantity) INTO v_cap_ok;
    IF NOT v_cap_ok THEN
        UPDATE public.delivery_offers SET status = 'cancelled' WHERE id = p_offer_id;
        RAISE EXCEPTION 'Insufficient vehicle capacity';
    END IF;

    SELECT sp.*, sp.price AS default_price INTO v_sp FROM public.supplier_products sp WHERE sp.supplier_id = v_offer.supplier_id AND sp.product_id = v_request.product_id AND sp.available = true LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'Product not available from this supplier'; END IF;

    v_price := v_sp.default_price;
    v_total := v_price * v_request.quantity;

    INSERT INTO public.orders (customer_id, supplier_id, address_id, status, subtotal, delivery_fee, total, payment_method, payment_status)
    VALUES (v_request.customer_id, v_offer.supplier_id, v_request.address_id, 'out_for_delivery', v_total, 0, v_total, 'cash', 'pending')
    RETURNING id INTO v_order_id;

    INSERT INTO public.order_items (order_id, product_id, quantity, unit_price, total)
    VALUES (v_order_id, v_request.product_id, v_request.quantity, v_price, v_total);

    INSERT INTO public.order_status_history (order_id, status, changed_by)
    VALUES (v_order_id, 'out_for_delivery', v_caller);

    -- FIX P0-4: Recalculate insertion_position safely under lock to protect en_route stop
    SELECT latitude, longitude INTO v_cust_lat, v_cust_lng FROM public.addresses WHERE id = v_request.address_id;
    SELECT latitude, longitude INTO v_veh_lat, v_veh_lng FROM public.vehicle_locations WHERE run_id = v_offer.run_id ORDER BY captured_at DESC LIMIT 1;

    SELECT a.latitude, a.longitude, drs.sequence_number INTO v_next_lat, v_next_lng, v_best_pos
    FROM public.delivery_run_stops drs JOIN public.addresses a ON a.id = drs.address_id
    WHERE drs.run_id = v_offer.run_id AND drs.status = 'planned' ORDER BY drs.sequence_number ASC LIMIT 1;

    IF v_next_lat IS NOT NULL THEN
        v_min_extra := calculate_distance_km(v_veh_lat, v_veh_lng, v_cust_lat, v_cust_lng) + calculate_distance_km(v_cust_lat, v_cust_lng, v_next_lat, v_next_lng) - calculate_distance_km(v_veh_lat, v_veh_lng, v_next_lat, v_next_lng);
        v_new_seq := COALESCE(v_best_pos, 1);
    ELSE
        v_new_seq := 1;
    END IF;

    FOR v_stop IN
        SELECT a.latitude AS stop_lat, a.longitude AS stop_lng, drs.sequence_number AS seq, LEAD(a2.latitude) OVER (ORDER BY drs.sequence_number) AS next_stop_lat, LEAD(a2.longitude) OVER (ORDER BY drs.sequence_number) AS next_stop_lng
        FROM public.delivery_run_stops drs JOIN public.addresses a ON a.id = drs.address_id
        LEFT JOIN LATERAL (SELECT drs2.sequence_number, drs2.address_id FROM public.delivery_run_stops drs2 WHERE drs2.run_id = v_offer.run_id AND drs2.status = 'planned' AND drs2.sequence_number > drs.sequence_number ORDER BY drs2.sequence_number ASC LIMIT 1) drs2 ON true
        LEFT JOIN public.addresses a2 ON a2.id = drs2.address_id WHERE drs.run_id = v_offer.run_id AND drs.status = 'planned' ORDER BY drs.sequence_number ASC
    LOOP
        IF v_stop.next_stop_lat IS NOT NULL THEN
            v_extra_dist := calculate_distance_km(v_stop.stop_lat, v_stop.stop_lng, v_cust_lat, v_cust_lng) + calculate_distance_km(v_cust_lat, v_cust_lng, v_stop.next_stop_lat, v_stop.next_stop_lng) - calculate_distance_km(v_stop.stop_lat, v_stop.stop_lng, v_stop.next_stop_lat, v_stop.next_stop_lng);
            IF v_extra_dist < v_min_extra THEN v_min_extra := v_extra_dist; v_new_seq := v_stop.seq + 1; END IF;
        ELSE
            v_extra_dist := calculate_distance_km(v_stop.stop_lat, v_stop.stop_lng, v_cust_lat, v_cust_lng);
            IF v_extra_dist < v_min_extra THEN v_min_extra := v_extra_dist; v_new_seq := v_stop.seq + 1; END IF;
        END IF;
    END LOOP;

    -- Shift future planned stops
    UPDATE public.delivery_run_stops SET sequence_number = sequence_number + 1 WHERE run_id = v_offer.run_id AND status = 'planned' AND sequence_number >= v_new_seq;

    INSERT INTO public.delivery_run_stops (run_id, sequence_number, customer_id, address_id, product_id, quantity, unit_price, total_amount, status, stop_type, order_id)
    VALUES (v_offer.run_id, v_new_seq, v_request.customer_id, v_request.address_id, v_request.product_id, v_request.quantity, v_price, v_total, 'planned', 'opportunistic', v_order_id);

    UPDATE public.order_dispatch_requests SET status = 'assigned', assigned_order_id = v_order_id, assigned_run_id = v_offer.run_id, assigned_vehicle_id = v_offer.vehicle_id, assigned_supplier_id = v_offer.supplier_id WHERE id = v_request.id;

    UPDATE public.delivery_offers SET status = 'accepted', responded_at = now(), responded_by = v_caller WHERE id = p_offer_id;
    UPDATE public.delivery_offers SET status = 'cancelled' WHERE dispatch_request_id = v_request.id AND id != p_offer_id AND status = 'pending';

    -- FIX P0-3: Wire acceptance notification
    PERFORM create_acceptance_notification(v_order_id, v_request.id);

    RETURN v_order_id;
END;
$$;


-- ============================================================================
-- FIX P0-7: process_vehicle_location authorization
-- ============================================================================
CREATE OR REPLACE FUNCTION process_vehicle_location(
    p_run_id UUID,
    p_lat DOUBLE PRECISION,
    p_lng DOUBLE PRECISION,
    p_accuracy DOUBLE PRECISION,
    p_speed DOUBLE PRECISION,
    p_timestamp TIMESTAMPTZ DEFAULT now()
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_run RECORD;
    v_current_stop RECORD;
    v_customer_lat DOUBLE PRECISION;
    v_customer_lng DOUBLE PRECISION;
    v_distance_km DOUBLE PRECISION;
    v_speed_kmh DOUBLE PRECISION;
    v_eta_minutes INTEGER;
    v_alert_sent UUID;
    v_config RECORD;
    v_vehicle_id UUID;
    v_caller UUID := auth.uid();
BEGIN
    SELECT * INTO v_run FROM public.delivery_runs WHERE id = p_run_id;
    IF NOT FOUND OR v_run.status != 'in_progress' THEN RETURN; END IF;

    -- Verify caller is the assigned driver
    IF (SELECT profile_id FROM public.drivers WHERE id = v_run.driver_id) != v_caller THEN
        RAISE EXCEPTION 'Unauthorized: only the assigned driver can update location';
    END IF;

    v_vehicle_id := v_run.vehicle_id;
    SELECT * INTO v_config FROM public.dispatch_configurations ORDER BY created_at DESC LIMIT 1;

    INSERT INTO public.vehicle_locations (run_id, vehicle_id, latitude, longitude, accuracy_m, speed, captured_at)
    VALUES (p_run_id, v_vehicle_id, p_lat, p_lng, p_accuracy, p_speed, p_timestamp);

    INSERT INTO public.delivery_run_live_state (run_id, vehicle_id, latitude, longitude, captured_at, status)
    VALUES (p_run_id, v_vehicle_id, p_lat, p_lng, p_timestamp, 'moving')
    ON CONFLICT (run_id) DO UPDATE SET latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude, captured_at = EXCLUDED.captured_at, status = EXCLUDED.status;

    SELECT * INTO v_current_stop FROM public.delivery_run_stops WHERE run_id = p_run_id AND status IN ('planned', 'en_route') ORDER BY sequence_number ASC LIMIT 1;
    IF v_current_stop IS NULL THEN RETURN; END IF;

    SELECT latitude, longitude INTO v_customer_lat, v_customer_lng FROM public.addresses WHERE id = v_current_stop.address_id;
    IF v_customer_lat IS NULL OR v_customer_lng IS NULL THEN RETURN; END IF;

    v_distance_km := calculate_distance_km(p_lat, p_lng, v_customer_lat, v_customer_lng);

    IF p_speed IS NOT NULL AND (p_speed * 3.6) > 5 AND (p_speed * 3.6) < 80 THEN
        v_speed_kmh := p_speed * 3.6;
    ELSE
        v_speed_kmh := COALESCE(v_config.assumed_speed_kmh, 30.0);
    END IF;

    v_eta_minutes := CEIL((v_distance_km / v_speed_kmh) * 60);

    UPDATE public.delivery_run_stops SET eta_minutes = v_eta_minutes, eta_calculated_at = now() WHERE id = v_current_stop.id;
    UPDATE public.delivery_run_live_state SET eta_minutes = v_eta_minutes WHERE run_id = p_run_id;

    IF (v_distance_km * 1000) <= COALESCE(v_config.arrival_alert_distance_m, 500) AND v_eta_minutes <= COALESCE(v_config.arrival_alert_eta_minutes, 5) AND v_current_stop.arrival_alert_sent_at IS NULL THEN
        UPDATE public.delivery_run_stops SET arrival_alert_sent_at = now(), status = 'en_route' WHERE id = v_current_stop.id AND arrival_alert_sent_at IS NULL RETURNING id INTO v_alert_sent;
        IF v_alert_sent IS NOT NULL THEN
            INSERT INTO public.delivery_notifications (user_id, stop_id, notification_type, title, body, payload)
            SELECT v_current_stop.customer_id, v_current_stop.id, 'arrival_alert', 'Water arriving soon!', CASE WHEN v_current_stop.stop_type = 'opportunistic' THEN 'Your on-demand water delivery is approximately ' || v_eta_minutes || ' minutes away.' ELSE 'Your water delivery is approximately ' || v_eta_minutes || ' minutes away.' END, jsonb_build_object('type', 'arrival_alert', 'eta_minutes', v_eta_minutes, 'run_id', p_run_id, 'stop_id', v_current_stop.id, 'vehicle_id', v_vehicle_id, 'stop_type', v_current_stop.stop_type, 'order_id', v_current_stop.order_id);
        END IF;
    END IF;
END;
$$;


-- ============================================================================
-- FIX P0-8: complete_delivery_run_stop
-- ============================================================================
CREATE OR REPLACE FUNCTION complete_delivery_run_stop(p_run_id UUID, p_stop_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_stop RECORD;
    v_run RECORD;
    v_caller UUID := auth.uid();
    v_is_auth BOOLEAN := false;
BEGIN
    SELECT * INTO v_run FROM public.delivery_runs WHERE id = p_run_id;
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

    SELECT * INTO v_stop FROM public.delivery_run_stops WHERE id = p_stop_id AND run_id = p_run_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Stop not found'; END IF;
    IF v_stop.status = 'delivered' THEN RETURN; END IF;

    -- Execute existing business logic depending on stop type
    IF v_stop.stop_type = 'scheduled' THEN
        -- Rely on existing idempotency delivery logic to do deliveries, jar transactions, schedule advancement
        -- v_stop.schedule_id connects to customer_delivery_schedules
        -- The original RPC was mark_delivery_status
        DECLARE
            v_sched RECORD;
        BEGIN
            SELECT supplier_customer_id INTO v_sched FROM public.customer_delivery_schedules WHERE id = v_stop.schedule_id;
            IF v_sched IS NOT NULL THEN
                PERFORM public.mark_delivery_status(v_run.supplier_id, v_sched.supplier_customer_id, 'delivered', v_stop.quantity, 0);
            END IF;
        END;
    ELSIF v_stop.stop_type = 'opportunistic' THEN
        -- Fulfill the canonical order directly
        UPDATE public.orders SET status = 'delivered', payment_status = 'paid', updated_at = now() WHERE id = v_stop.order_id AND status != 'delivered';
        INSERT INTO public.order_status_history (order_id, status, changed_by) VALUES (v_stop.order_id, 'delivered', v_caller);
    END IF;

    -- Finally, mark route stop as complete
    UPDATE public.delivery_run_stops SET status = 'delivered', actual_arrival_time = COALESCE(actual_arrival_time, NOW()), actual_departure_time = NOW() WHERE id = v_stop.id;
END;
$$;


-- ============================================================================
-- FIX P0-9: get_order_tracking_state returns run_id
-- ============================================================================
DROP FUNCTION IF EXISTS get_order_tracking_state(UUID);

CREATE OR REPLACE FUNCTION get_order_tracking_state(p_order_id UUID)
RETURNS TABLE (
    order_status      TEXT,
    vehicle_lat       DOUBLE PRECISION,
    vehicle_lng       DOUBLE PRECISION,
    eta_minutes       INTEGER,
    vehicle_number    TEXT,
    stop_status       TEXT,
    last_updated      TIMESTAMPTZ,
    gps_fresh         BOOLEAN,
    run_id            UUID
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_caller UUID := auth.uid();
BEGIN
    RETURN QUERY
    SELECT
        o.status AS order_status,
        ls.latitude AS vehicle_lat,
        ls.longitude AS vehicle_lng,
        ls.eta_minutes,
        v.vehicle_number,
        drs.status::TEXT AS stop_status,
        ls.captured_at AS last_updated,
        (ls.captured_at >= now() - interval '90 seconds') AS gps_fresh,
        dr.id AS run_id
    FROM public.orders o
    LEFT JOIN public.delivery_run_stops drs ON drs.order_id = o.id
    LEFT JOIN public.delivery_runs dr ON dr.id = drs.run_id
    LEFT JOIN public.delivery_run_live_state ls ON ls.run_id = dr.id
    LEFT JOIN public.vehicles v ON v.id = dr.vehicle_id
    WHERE o.id = p_order_id
      AND o.customer_id = v_caller;  -- SECURITY: only own orders
END;
$$;

-- FIX P0-10: profiles.full_name -> profiles.name inside create_opportunity_notifications
CREATE OR REPLACE FUNCTION create_opportunity_notifications(p_offer_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_offer RECORD; v_request RECORD; v_helper_profile UUID; v_supplier_profile UUID; v_customer_name TEXT; v_product_name TEXT; v_body TEXT; v_payload JSONB;
BEGIN
    SELECT * INTO v_offer FROM public.delivery_offers WHERE id = p_offer_id;
    IF NOT FOUND THEN RETURN; END IF;
    SELECT * INTO v_request FROM public.order_dispatch_requests WHERE id = v_offer.dispatch_request_id;
    IF NOT FOUND THEN RETURN; END IF;

    SELECT name INTO v_customer_name FROM public.profiles WHERE id = v_request.customer_id;
    SELECT name INTO v_product_name FROM public.products WHERE id = v_request.product_id;

    v_body := v_request.quantity || ' × ' || COALESCE(v_product_name, 'Water') || ' • ETA ' || v_offer.eta_minutes || ' min' || ' • Detour ' || v_offer.detour_minutes || ' min';
    v_payload := jsonb_build_object('type', 'opportunity_order_offer', 'offer_id', p_offer_id, 'dispatch_request_id', v_request.id, 'run_id', v_offer.run_id, 'vehicle_id', v_offer.vehicle_id, 'quantity', v_request.quantity, 'product_id', v_request.product_id, 'distance_km', v_offer.distance_km, 'eta_minutes', v_offer.eta_minutes, 'detour_minutes', v_offer.detour_minutes);

    IF v_offer.helper_id IS NOT NULL THEN
        SELECT profile_id INTO v_helper_profile FROM public.helpers WHERE id = v_offer.helper_id;
        IF v_helper_profile IS NOT NULL THEN
            INSERT INTO public.delivery_notifications (user_id, notification_type, title, body, payload, offer_id, dispatch_request_id, run_id)
            VALUES (v_helper_profile, 'opportunity_order_offer_helper', 'New AquaKart Delivery Opportunity', v_body, v_payload, p_offer_id, v_request.id, v_offer.run_id);
            -- Idempotency handled by the table structure if unique constraints existed, but it's safe to insert. 
        END IF;
    END IF;

    SELECT profile_id INTO v_supplier_profile FROM public.suppliers WHERE id = v_offer.supplier_id;
    IF v_supplier_profile IS NOT NULL THEN
        INSERT INTO public.delivery_notifications (user_id, notification_type, title, body, payload, offer_id, dispatch_request_id, run_id)
        VALUES (v_supplier_profile, 'opportunity_order_offer_supplier', 'New AquaKart Opportunity Near Vehicle', v_body, v_payload, p_offer_id, v_request.id, v_offer.run_id);
    END IF;
END;
$$;
