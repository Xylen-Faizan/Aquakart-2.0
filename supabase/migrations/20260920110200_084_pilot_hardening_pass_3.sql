-- ============================================================================
-- 084_pilot_hardening_pass_3.sql
-- Pilot Hardening Pass: Dispatch Logic, Tracking, Notifications
-- ============================================================================

-- ============================================================================
-- 6. Fix generate_daily_run product resolution & remove old signature
-- ============================================================================
DROP FUNCTION IF EXISTS public.generate_daily_run(UUID, DATE, UUID, UUID, UUID[]);

CREATE OR REPLACE FUNCTION public.generate_daily_run(
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
-- 7. Notifications separation
-- ============================================================================
CREATE OR REPLACE FUNCTION create_opportunity_notifications(p_offer_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_offer RECORD;
    v_run RECORD;
    v_helper_profile UUID;
    v_driver_profile UUID;
    v_supplier_profile UUID;
BEGIN
    SELECT * INTO v_offer FROM public.delivery_offers WHERE id = p_offer_id;
    IF NOT FOUND THEN RETURN; END IF;

    SELECT * INTO v_run FROM public.delivery_runs WHERE id = v_offer.run_id;
    IF NOT FOUND THEN RETURN; END IF;

    -- Helper (Primary)
    IF v_run.helper_id IS NOT NULL THEN
        SELECT profile_id INTO v_helper_profile FROM public.helpers WHERE id = v_run.helper_id;
        IF v_helper_profile IS NOT NULL THEN
            INSERT INTO public.delivery_notifications (
                supplier_id, recipient_id, type, title, message, related_entity_id, related_entity_type
            ) VALUES (
                v_offer.supplier_id, v_helper_profile, 'opportunity',
                'New Delivery Opportunity', 'A nearby customer wants an immediate delivery.',
                p_offer_id, 'offer'
            );
        END IF;
    END IF;

    -- Supplier (Secondary)
    SELECT profile_id INTO v_supplier_profile FROM public.suppliers WHERE id = v_run.supplier_id;
    IF v_supplier_profile IS NOT NULL THEN
        INSERT INTO public.delivery_notifications (
            supplier_id, recipient_id, type, title, message, related_entity_id, related_entity_type
        ) VALUES (
            v_offer.supplier_id, v_supplier_profile, 'opportunity',
            'New Delivery Opportunity', 'A nearby customer wants an immediate delivery (sent to vehicle).',
            p_offer_id, 'offer'
        );
    END IF;

    -- Driver (Optional/Informational)
    SELECT profile_id INTO v_driver_profile FROM public.drivers WHERE id = v_run.driver_id;
    IF v_driver_profile IS NOT NULL AND v_helper_profile IS NULL THEN
        -- Only alert driver if there's no helper, keeping driver focused on driving if there is a helper
        INSERT INTO public.delivery_notifications (
            supplier_id, recipient_id, type, title, message, related_entity_id, related_entity_type
        ) VALUES (
            v_offer.supplier_id, v_driver_profile, 'opportunity',
            'New Delivery Opportunity', 'A nearby customer wants an immediate delivery.',
            p_offer_id, 'offer'
        );
    END IF;
END;
$$;


-- ============================================================================
-- 8. find_eligible_vehicles (Active stop protection, Timeout behavior, Wire notifs)
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

    IF v_request.customer_id != v_caller THEN
        RAISE EXCEPTION 'Unauthorized: Caller must own the dispatch request';
    END IF;

    IF v_request.status != 'searching' THEN RETURN 0; END IF;

    -- Check if it should expire rather than fail immediately
    IF v_request.expires_at < now() THEN
        UPDATE public.order_dispatch_requests SET status = 'failed' WHERE id = p_request_id;
        RETURN 0;
    END IF;

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
            AND sp.available = true 
        WHERE dr.status = 'in_progress'
          AND vl.captured_at >= (now() - (v_config.location_freshness_seconds || ' seconds')::INTERVAL)
          AND calculate_distance_km(vl.latitude, vl.longitude, v_cust_lat, v_cust_lng) <= v_config.max_customer_distance_km
        ORDER BY calculate_distance_km(vl.latitude, vl.longitude, v_cust_lat, v_cust_lng) ASC
        LIMIT 10
    LOOP
        -- Check capacity
        PERFORM 1 FROM internal_get_vehicle_capacity_state(v_candidate.run_id) cap
        WHERE cap.opportunity_capacity >= v_request.quantity;

        IF NOT FOUND THEN CONTINUE; END IF;

        -- Insertion Logic (PROTECT en_route STOP)
        v_min_extra := 999999;
        v_min_pos := NULL;

        -- We want to find the LAST en_route stop, or just vehicle position if no en_route
        -- The candidate position should logically start AFTER any en_route stop
        SELECT a.latitude, a.longitude
        INTO v_prev_lat, v_prev_lng
        FROM public.delivery_run_stops drs
        JOIN public.addresses a ON a.id = drs.address_id
        WHERE drs.run_id = v_candidate.run_id
          AND drs.status = 'en_route'
        ORDER BY drs.sequence_number DESC LIMIT 1;
        
        IF NOT FOUND THEN
            v_prev_lat := v_candidate.veh_lat;
            v_prev_lng := v_candidate.veh_lng;
        END IF;

        -- Only evaluate 'planned' stops for insertion
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
            -- If no planned stops, we just insert at the end. We need max seq.
            SELECT COALESCE(MAX(sequence_number), 0) + 1 INTO v_min_pos 
            FROM public.delivery_run_stops WHERE run_id = v_candidate.run_id;
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
                    v_min_pos := COALESCE(v_stop.next_seq, v_stop.seq + 1);
                END IF;
            ELSE
                v_extra_dist := calculate_distance_km(v_stop.stop_lat, v_stop.stop_lng, v_cust_lat, v_cust_lng);
                IF v_extra_dist < v_min_extra THEN
                    v_min_extra := v_extra_dist;
                    v_min_pos := v_stop.seq + 1;
                END IF;
            END IF;
        END LOOP;

        IF v_min_extra > v_config.max_extra_distance_km THEN CONTINUE; END IF;

        v_dist_to_cust := calculate_distance_km(v_candidate.veh_lat, v_candidate.veh_lng, v_cust_lat, v_cust_lng);
        v_eta_min := GREATEST(1, ROUND((v_dist_to_cust / v_assumed_speed) * 60));

        INSERT INTO public.delivery_offers (
            request_id, supplier_id, run_id, extra_distance_km, eta_minutes, insertion_position,
            status, expires_at
        )
        VALUES (
            p_request_id, v_candidate.supplier_id, v_candidate.run_id,
            v_extra_dist, v_eta_min, v_min_pos,
            'pending', now() + (v_config.offer_expiry_seconds || ' seconds')::INTERVAL
        )
        ON CONFLICT (dispatch_request_id, run_id) DO NOTHING
        RETURNING id INTO v_new_offer_id;

        IF v_new_offer_id IS NOT NULL THEN
            v_offer_count := v_offer_count + 1;
            PERFORM create_opportunity_notifications(v_new_offer_id);
        END IF;
    END LOOP;

    -- Only mark offered if count > 0, otherwise stay searching until expired
    IF v_offer_count > 0 THEN
        UPDATE public.order_dispatch_requests SET status = 'offered' WHERE id = p_request_id;
    END IF;

    RETURN v_offer_count;
END;
$$;


-- ============================================================================
-- 9. get_order_tracking_state run_id payload
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_order_tracking_state(p_order_id uuid)
 RETURNS TABLE(order_status text, vehicle_lat double precision, vehicle_lng double precision, eta_minutes integer, vehicle_number text, stop_status text, last_updated timestamp with time zone, gps_fresh boolean, run_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;
