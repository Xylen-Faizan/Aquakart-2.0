-- ============================================================================
-- 074_live_run_state.sql
-- Phase 6: Compact live state layer, extended location processing,
--          and customer order tracking RPC
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. CREATE delivery_run_live_state TABLE
--    One row per active run — the current real-time state.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.delivery_run_live_state (
    run_id           UUID PRIMARY KEY REFERENCES public.delivery_runs(id) ON DELETE CASCADE,
    vehicle_id       UUID NOT NULL REFERENCES public.vehicles(id),
    latitude         DOUBLE PRECISION NOT NULL,
    longitude        DOUBLE PRECISION NOT NULL,
    speed            DOUBLE PRECISION,
    heading          DOUBLE PRECISION,
    accuracy_m       DOUBLE PRECISION,
    captured_at      TIMESTAMPTZ NOT NULL,
    current_stop_id  UUID REFERENCES public.delivery_run_stops(id),
    eta_minutes      INTEGER,
    updated_at       TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER set_updated_at_delivery_run_live_state
BEFORE UPDATE ON public.delivery_run_live_state
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ---------------------------------------------------------------------------
-- 2. RLS FOR delivery_run_live_state
-- ---------------------------------------------------------------------------
ALTER TABLE public.delivery_run_live_state ENABLE ROW LEVEL SECURITY;

-- Supplier can see all their active runs
CREATE POLICY "Suppliers can view their live run state" ON public.delivery_run_live_state
    FOR SELECT
    USING (run_id IN (
        SELECT id FROM public.delivery_runs
        WHERE supplier_id IN (
            SELECT id FROM public.suppliers WHERE profile_id = auth.uid()
        )
    ));

-- Driver can see their assigned run
CREATE POLICY "Drivers can view their live run state" ON public.delivery_run_live_state
    FOR SELECT
    USING (run_id IN (
        SELECT id FROM public.delivery_runs
        WHERE driver_id IN (
            SELECT id FROM public.drivers WHERE profile_id = auth.uid()
        )
    ));

-- Helper can see their assigned run
CREATE POLICY "Helpers can view their live run state" ON public.delivery_run_live_state
    FOR SELECT
    USING (run_id IN (
        SELECT id FROM public.delivery_runs
        WHERE helper_id IN (
            SELECT id FROM public.helpers WHERE profile_id = auth.uid()
        )
    ));

-- ---------------------------------------------------------------------------
-- 3. EXTEND process_vehicle_location TO UPDATE LIVE STATE
--    Replaces the existing function. Adds:
--    - delivery_run_live_state upsert
--    - Handles both scheduled and opportunistic stops
--    - Uses dispatch_config for alert thresholds
--    - Atomic duplicate alert protection
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION process_vehicle_location(
    p_run_id       UUID,
    p_lat          DOUBLE PRECISION,
    p_lng          DOUBLE PRECISION,
    p_speed        DOUBLE PRECISION,
    p_accuracy_m   DOUBLE PRECISION,
    p_heading      DOUBLE PRECISION,
    p_altitude     DOUBLE PRECISION,
    p_captured_at  TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_vehicle_id   UUID;
    v_run_status   delivery_run_status;
    v_current_stop RECORD;
    v_customer_lat FLOAT;
    v_customer_lng FLOAT;
    v_distance_km  FLOAT;
    v_eta_minutes  INTEGER;
    v_config       RECORD;
    v_speed_kmh    FLOAT;
    v_alert_sent   UUID;
BEGIN
    -- 1. Validate run and get vehicle
    SELECT vehicle_id, status INTO v_vehicle_id, v_run_status
    FROM public.delivery_runs
    WHERE id = p_run_id;

    IF v_run_status != 'in_progress' THEN
        RAISE EXCEPTION 'Run is not in progress';
    END IF;

    -- 2. Insert telemetry (append-only)
    INSERT INTO public.vehicle_locations (
        run_id, vehicle_id, latitude, longitude, speed, accuracy_m, heading, altitude, captured_at
    ) VALUES (
        p_run_id, v_vehicle_id, p_lat, p_lng, p_speed, p_accuracy_m, p_heading, p_altitude, p_captured_at
    );

    -- 3. Get dispatch config
    SELECT * INTO v_config FROM public.dispatch_config WHERE id = 1;

    -- 4. Determine current stop (first planned/en_route stop by sequence)
    SELECT drs.* INTO v_current_stop
    FROM public.delivery_run_stops drs
    WHERE drs.run_id = p_run_id
      AND drs.status IN ('planned', 'en_route')
    ORDER BY drs.sequence_number ASC
    LIMIT 1;

    -- 5. Upsert live state (always update even if no stops)
    INSERT INTO public.delivery_run_live_state (
        run_id, vehicle_id, latitude, longitude, speed, heading,
        accuracy_m, captured_at, current_stop_id, eta_minutes
    )
    VALUES (
        p_run_id, v_vehicle_id, p_lat, p_lng, p_speed, p_heading,
        p_accuracy_m, p_captured_at,
        CASE WHEN v_current_stop IS NOT NULL THEN v_current_stop.id ELSE NULL END,
        NULL
    )
    ON CONFLICT (run_id) DO UPDATE SET
        latitude = EXCLUDED.latitude,
        longitude = EXCLUDED.longitude,
        speed = EXCLUDED.speed,
        heading = EXCLUDED.heading,
        accuracy_m = EXCLUDED.accuracy_m,
        captured_at = EXCLUDED.captured_at,
        current_stop_id = EXCLUDED.current_stop_id;

    -- If accuracy is terrible (>100m), don't trigger alerts
    IF p_accuracy_m > 100 THEN
        RETURN;
    END IF;

    -- If no stops remaining, nothing more to do
    IF v_current_stop IS NULL THEN
        RETURN;
    END IF;

    -- 6. Get customer location
    SELECT latitude, longitude INTO v_customer_lat, v_customer_lng
    FROM public.addresses
    WHERE id = v_current_stop.address_id;

    IF v_customer_lat IS NULL OR v_customer_lng IS NULL THEN
        RETURN;
    END IF;

    -- 7. Calculate ETA
    v_distance_km := calculate_distance_km(p_lat, p_lng, v_customer_lat, v_customer_lng);

    -- Use current speed if reasonable, else default
    IF p_speed IS NOT NULL AND (p_speed * 3.6) > 5 AND (p_speed * 3.6) < 80 THEN
        v_speed_kmh := p_speed * 3.6;
    ELSE
        v_speed_kmh := v_config.assumed_speed_kmh;
    END IF;

    v_eta_minutes := CEIL((v_distance_km / v_speed_kmh) * 60);

    -- Update ETA on the stop
    UPDATE public.delivery_run_stops
    SET eta_minutes = v_eta_minutes,
        eta_calculated_at = now()
    WHERE id = v_current_stop.id;

    -- Update live state ETA
    UPDATE public.delivery_run_live_state
    SET eta_minutes = v_eta_minutes
    WHERE run_id = p_run_id;

    -- 8. Trigger arrival notification (atomic duplicate protection)
    IF (v_distance_km * 1000) <= v_config.arrival_alert_distance_m
       AND v_eta_minutes <= v_config.arrival_alert_eta_minutes
       AND v_current_stop.arrival_alert_sent_at IS NULL
    THEN
        -- Atomic conditional update prevents duplicate alerts
        UPDATE public.delivery_run_stops
        SET arrival_alert_sent_at = now(),
            status = 'en_route'
        WHERE id = v_current_stop.id
          AND arrival_alert_sent_at IS NULL
        RETURNING id INTO v_alert_sent;

        -- Only create notification if we won the update
        IF v_alert_sent IS NOT NULL THEN
            INSERT INTO public.delivery_notifications (
                user_id, stop_id, notification_type, title, body, payload
            )
            SELECT
                v_current_stop.customer_id,
                v_current_stop.id,
                'arrival_alert',
                'Water arriving soon!',
                CASE WHEN v_current_stop.stop_type = 'opportunistic'
                    THEN 'Your on-demand water delivery is approximately ' || v_eta_minutes || ' minutes away.'
                    ELSE 'Your water delivery is approximately ' || v_eta_minutes || ' minutes away.'
                END,
                jsonb_build_object(
                    'type', 'arrival_alert',
                    'eta_minutes', v_eta_minutes,
                    'run_id', p_run_id,
                    'stop_id', v_current_stop.id,
                    'vehicle_id', v_vehicle_id,
                    'stop_type', v_current_stop.stop_type,
                    'order_id', v_current_stop.order_id
                );
        END IF;
    END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. RPC: get_order_tracking_state
--    Customer-facing: returns live tracking info for their order.
--    Prevents cross-customer location leakage.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_order_tracking_state(p_order_id UUID)
RETURNS TABLE (
    order_status      TEXT,
    vehicle_lat       DOUBLE PRECISION,
    vehicle_lng       DOUBLE PRECISION,
    eta_minutes       INTEGER,
    vehicle_number    TEXT,
    stop_status       TEXT,
    last_updated      TIMESTAMPTZ,
    gps_fresh         BOOLEAN
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
        (ls.captured_at >= now() - interval '90 seconds') AS gps_fresh
    FROM public.orders o
    -- Find the opportunistic stop that references this order
    LEFT JOIN public.delivery_run_stops drs ON drs.order_id = o.id
    LEFT JOIN public.delivery_runs dr ON dr.id = drs.run_id
    LEFT JOIN public.delivery_run_live_state ls ON ls.run_id = dr.id
    LEFT JOIN public.vehicles v ON v.id = dr.vehicle_id
    WHERE o.id = p_order_id
      AND o.customer_id = v_caller;  -- SECURITY: only own orders
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Enable Supabase Realtime on key tables
-- ---------------------------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_run_live_state;
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_dispatch_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_offers;
