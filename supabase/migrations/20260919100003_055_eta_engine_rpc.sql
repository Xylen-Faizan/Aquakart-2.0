-- 055_eta_engine_rpc.sql

-- Helper function to calculate distance between two lat/lng pairs in kilometers using Haversine formula
CREATE OR REPLACE FUNCTION calculate_distance_km(lat1 FLOAT, lon1 FLOAT, lat2 FLOAT, lon2 FLOAT)
RETURNS FLOAT AS $$
DECLARE
    radius FLOAT := 6371; -- Earth's radius in km
    dlat FLOAT;
    dlon FLOAT;
    a FLOAT;
    c FLOAT;
BEGIN
    dlat := radians(lat2 - lat1);
    dlon := radians(lon2 - lon1);
    a := sin(dlat/2) * sin(dlat/2) + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon/2) * sin(dlon/2);
    c := 2 * atan2(sqrt(a), sqrt(1-a));
    RETURN radius * c;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Main RPC for processing vehicle location and triggering ETA alerts
CREATE OR REPLACE FUNCTION process_vehicle_location(
    p_run_id UUID,
    p_lat DOUBLE PRECISION,
    p_lng DOUBLE PRECISION,
    p_speed DOUBLE PRECISION,
    p_accuracy_m DOUBLE PRECISION,
    p_heading DOUBLE PRECISION,
    p_altitude DOUBLE PRECISION,
    p_captured_at TIMESTAMPTZ
)
RETURNS VOID AS $$
DECLARE
    v_vehicle_id UUID;
    v_run_status delivery_run_status;
    v_current_stop RECORD;
    v_customer_lat FLOAT;
    v_customer_lng FLOAT;
    v_distance_km FLOAT;
    v_assumed_speed_kmh FLOAT := 15.0; -- Default urban speed in km/h if vehicle is stopped or speed is erratic
    v_eta_hours FLOAT;
    v_eta_minutes INTEGER;
    v_alert_threshold_minutes INTEGER := 10;
BEGIN
    -- 1. Validate run and get vehicle
    SELECT vehicle_id, status INTO v_vehicle_id, v_run_status
    FROM public.delivery_runs
    WHERE id = p_run_id;

    IF v_run_status != 'in_progress' THEN
        RAISE EXCEPTION 'Run is not in progress';
    END IF;

    -- 2. Insert Location Telemetry
    INSERT INTO public.vehicle_locations (
        run_id, vehicle_id, latitude, longitude, speed, accuracy_m, heading, altitude, captured_at
    ) VALUES (
        p_run_id, v_vehicle_id, p_lat, p_lng, p_speed, p_accuracy_m, p_heading, p_altitude, p_captured_at
    );

    -- If accuracy is terrible (> 100m), don't trigger alerts based on this point
    IF p_accuracy_m > 100 THEN
        RETURN;
    END IF;

    -- 3. Determine Current Stop (First stop that is planned or en_route)
    SELECT drs.* INTO v_current_stop
    FROM public.delivery_run_stops drs
    WHERE drs.run_id = p_run_id
      AND drs.status IN ('planned', 'en_route')
    ORDER BY drs.sequence_number ASC
    LIMIT 1;

    -- If no stops remaining, do nothing
    IF NOT FOUND THEN
        RETURN;
    END IF;

    -- 4. Get Customer Location
    SELECT latitude, longitude INTO v_customer_lat, v_customer_lng
    FROM public.addresses
    WHERE id = v_current_stop.address_id;

    -- If customer has no lat/lng, we can't calculate ETA
    IF v_customer_lat IS NULL OR v_customer_lng IS NULL THEN
        RETURN;
    END IF;

    -- 5. Calculate Approximate ETA
    v_distance_km := calculate_distance_km(p_lat, p_lng, v_customer_lat, v_customer_lng);
    
    -- Use current speed if reasonable (e.g. between 5 and 80 km/h), else use default
    -- (Assuming p_speed is in m/s, convert to km/h: speed * 3.6)
    IF p_speed IS NOT NULL AND (p_speed * 3.6) > 5 AND (p_speed * 3.6) < 80 THEN
        v_assumed_speed_kmh := p_speed * 3.6;
    END IF;

    v_eta_hours := v_distance_km / v_assumed_speed_kmh;
    v_eta_minutes := round(v_eta_hours * 60);

    -- Update ETA on the stop
    UPDATE public.delivery_run_stops
    SET eta_minutes = v_eta_minutes,
        eta_calculated_at = now()
    WHERE id = v_current_stop.id;

    -- 6. Trigger Notification if threshold crossed
    IF v_eta_minutes <= v_alert_threshold_minutes AND v_current_stop.arrival_alert_sent_at IS NULL THEN
        
        -- Mark stop to prevent duplicate alerts
        UPDATE public.delivery_run_stops
        SET arrival_alert_sent_at = now(),
            status = 'en_route' -- automatically transition to en_route
        WHERE id = v_current_stop.id;

        -- Atomically create notification event
        INSERT INTO public.delivery_notifications (
            user_id, stop_id, notification_type, title, body, payload
        )
        SELECT
            p.id, -- auth user id corresponding to the profile
            v_current_stop.id,
            'arrival_alert',
            'Water arriving soon',
            'Your 20L jar delivery is approximately ' || v_eta_minutes || ' minutes away.',
            jsonb_build_object(
                'eta_minutes', v_eta_minutes,
                'run_id', p_run_id,
                'stop_id', v_current_stop.id
            )
        FROM public.profiles p
        WHERE p.id = v_current_stop.customer_id;
        
    END IF;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
