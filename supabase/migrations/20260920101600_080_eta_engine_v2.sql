-- 080_eta_engine_v2.sql

-- ============================================================================
-- 1. Helper Function: Recalculate Route ETA (The "Domino Effect")
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
    v_dropoff_time_minutes INTEGER := 2; -- Assumed time per house cluster
    v_stop RECORD;
    v_cust_lat DOUBLE PRECISION;
    v_cust_lng DOUBLE PRECISION;
    v_distance_km DOUBLE PRECISION;
    v_base_driving_time INTEGER;
    v_cumulative_eta INTEGER;
    v_stops_before INTEGER := 0;
    v_prev_lat DOUBLE PRECISION := NULL;
    v_prev_lng DOUBLE PRECISION := NULL;
    v_cluster_bonus INTEGER := 0;
BEGIN
    -- 1. Get latest vehicle position
    SELECT latitude, longitude INTO v_veh_lat, v_veh_lng 
    FROM public.vehicle_locations 
    WHERE run_id = p_run_id ORDER BY captured_at DESC LIMIT 1;

    -- If no GPS yet, we can't calculate purely on distance from vehicle.
    -- We could fallback to last stop, but for now we require at least one GPS point.
    IF v_veh_lat IS NULL OR v_veh_lng IS NULL THEN
        RETURN;
    END IF;

    SELECT * INTO v_config FROM public.dispatch_configurations ORDER BY created_at DESC LIMIT 1;
    v_speed_kmh := COALESCE(v_config.assumed_speed_kmh, 30.0);

    -- 2. Iterate through all remaining planned/en_route stops
    FOR v_stop IN 
        SELECT drs.*, a.latitude, a.longitude
        FROM public.delivery_run_stops drs
        JOIN public.addresses a ON drs.address_id = a.id
        WHERE drs.run_id = p_run_id AND drs.status IN ('planned', 'en_route')
        ORDER BY drs.sequence_number ASC
    LOOP
        v_cust_lat := v_stop.latitude;
        v_cust_lng := v_stop.longitude;
        
        IF v_cust_lat IS NULL OR v_cust_lng IS NULL THEN
            CONTINUE;
        END IF;

        -- Check if this stop is in a cluster with the PREVIOUS stop
        IF v_prev_lat IS NOT NULL AND v_prev_lng IS NOT NULL THEN
            IF calculate_distance_km(v_prev_lat, v_prev_lng, v_cust_lat, v_cust_lng) * 1000 < 50 THEN
                -- It's in a cluster! No extra driving time, just drop-off time.
                v_cluster_bonus := v_cluster_bonus + 0; -- Driving time is 0
            ELSE
                -- Not in a cluster, add driving time between previous and current
                v_cluster_bonus := v_cluster_bonus + CEIL((calculate_distance_km(v_prev_lat, v_prev_lng, v_cust_lat, v_cust_lng) / v_speed_kmh) * 60);
            END IF;
        END IF;

        -- Base driving time is from current vehicle location to this specific stop directly
        -- But cumulative ETA is better: driving from vehicle to first stop + cluster hops
        IF v_stops_before = 0 THEN
            v_base_driving_time := CEIL((calculate_distance_km(v_veh_lat, v_veh_lng, v_cust_lat, v_cust_lng) / v_speed_kmh) * 60);
            v_cumulative_eta := v_base_driving_time;
        ELSE
            -- Cumulative = base time to first stop + hops + drop-off time for previous stops
            v_cumulative_eta := v_base_driving_time + v_cluster_bonus + (v_stops_before * v_dropoff_time_minutes);
        END IF;

        -- Update the ETA in the database
        UPDATE public.delivery_run_stops 
        SET eta_minutes = v_cumulative_eta, 
            eta_calculated_at = now() 
        WHERE id = v_stop.id;

        -- Tier 1 Notification: Approaching (15 mins)
        IF v_cumulative_eta <= 15 AND v_stop.approaching_alert_sent_at IS NULL THEN
            UPDATE public.delivery_run_stops SET approaching_alert_sent_at = now() WHERE id = v_stop.id;
            
            INSERT INTO public.delivery_notifications (user_id, stop_id, notification_type, title, body, payload)
            SELECT v_stop.customer_id, v_stop.id, 'approaching_alert', 'Delivery Approaching', 
                   'Your AquaKart delivery is approaching your area (approx ' || v_cumulative_eta || ' mins).',
                   jsonb_build_object('eta_minutes', v_cumulative_eta, 'run_id', p_run_id, 'stop_id', v_stop.id);
        END IF;

        -- Tier 2 Notification: Arriving Soon (5 mins)
        IF v_cumulative_eta <= 5 AND v_stop.arrival_alert_sent_at IS NULL THEN
            UPDATE public.delivery_run_stops SET arrival_alert_sent_at = now(), status = 'en_route' WHERE id = v_stop.id;
            
            INSERT INTO public.delivery_notifications (user_id, stop_id, notification_type, title, body, payload)
            SELECT v_stop.customer_id, v_stop.id, 'arrival_alert', 'Arriving Soon', 
                   'Your AquaKart delivery is about 5 minutes away.',
                   jsonb_build_object('eta_minutes', v_cumulative_eta, 'run_id', p_run_id, 'stop_id', v_stop.id);
        END IF;

        -- Keep state for next loop iteration
        v_prev_lat := v_cust_lat;
        v_prev_lng := v_cust_lng;
        v_stops_before := v_stops_before + 1;
        
    END LOOP;

END;
$$;


-- ============================================================================
-- 2. Modify complete_delivery_run_stop to trigger Domino Effect
-- ============================================================================
ALTER TABLE public.delivery_run_stops ADD COLUMN IF NOT EXISTS approaching_alert_sent_at TIMESTAMPTZ;

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
    -- [Existing Auth logic from 077]
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

    -- [Existing Delivery Logic]
    IF v_stop.stop_type = 'scheduled' THEN
        DECLARE
            v_sched RECORD;
        BEGIN
            SELECT supplier_customer_id INTO v_sched FROM public.customer_delivery_schedules WHERE id = v_stop.schedule_id;
            IF v_sched IS NOT NULL THEN
                PERFORM public.mark_delivery_status(v_run.supplier_id, v_sched.supplier_customer_id, 'delivered', v_stop.quantity, 0);
            END IF;
        END;
    ELSIF v_stop.stop_type = 'opportunistic' THEN
        UPDATE public.orders SET status = 'delivered', payment_status = 'paid', updated_at = now() WHERE id = v_stop.order_id AND status != 'delivered';
        INSERT INTO public.order_status_history (order_id, status, changed_by) VALUES (v_stop.order_id, 'delivered', v_caller);
    END IF;

    UPDATE public.delivery_run_stops SET status = 'delivered', actual_arrival_time = COALESCE(actual_arrival_time, NOW()), actual_departure_time = NOW() WHERE id = v_stop.id;

    -- NEW: Trigger the Domino Effect!
    PERFORM public.recalculate_route_eta(p_run_id);
END;
$$;


-- ============================================================================
-- 3. Update process_vehicle_location for Hybrid ETA logic
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
    v_config RECORD;
    v_vehicle_id UUID;
    v_caller UUID := auth.uid();
BEGIN
    SELECT * INTO v_run FROM public.delivery_runs WHERE id = p_run_id;
    IF NOT FOUND OR v_run.status != 'in_progress' THEN RETURN; END IF;

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

    -- Instead of duplicating the ETA logic, we call the Domino Effect function
    -- which recalculates ETAs for all upcoming stops based on this fresh GPS update.
    PERFORM public.recalculate_route_eta(p_run_id);
END;
$$;
