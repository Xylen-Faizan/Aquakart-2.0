-- ============================================================================
-- 083_pilot_hardening_pass_2.sql
-- Pilot Hardening Pass: Delivery Stop & Security
-- ============================================================================

-- ============================================================================
-- 4. Fix complete_delivery_run_stop to hit the shared accounting engine
-- ============================================================================
CREATE OR REPLACE FUNCTION complete_delivery_run_stop(
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

    -- Defaults if null
    IF p_jars_delivered IS NULL THEN p_jars_delivered := v_stop.quantity; END IF;
    IF p_jars_returned IS NULL THEN p_jars_returned := v_stop.quantity; END IF;
    IF p_amount_collected IS NULL THEN p_amount_collected := v_stop.total_amount; END IF;

    IF v_stop.stop_type = 'scheduled' THEN
        SELECT supplier_customer_id, supplier_product_id INTO v_sched FROM public.customer_delivery_schedules WHERE id = v_stop.schedule_id;
        IF v_sched IS NOT NULL THEN
            PERFORM public._complete_delivery_accounting(
                v_run.supplier_id,
                v_sched.supplier_customer_id,
                v_sched.supplier_product_id,
                v_stop.quantity,
                v_stop.unit_price,
                p_jars_delivered,
                p_jars_returned,
                p_amount_collected,
                p_payment_method,
                NULL
            );
        END IF;
    ELSIF v_stop.stop_type = 'opportunistic' THEN
        SELECT * INTO v_order FROM public.orders WHERE id = v_stop.order_id;
        
        -- Get the supplier_product_id for inventory logging
        SELECT id INTO v_sp_id FROM public.supplier_products 
        WHERE supplier_id = v_run.supplier_id AND product_id = v_stop.product_id LIMIT 1;
        
        IF v_order IS NOT NULL AND v_order.supplier_customer_id IS NOT NULL THEN
            PERFORM public._complete_delivery_accounting(
                v_run.supplier_id,
                v_order.supplier_customer_id,
                v_sp_id,
                v_stop.quantity,
                v_stop.unit_price,
                p_jars_delivered,
                p_jars_returned,
                p_amount_collected,
                p_payment_method,
                v_order.id
            );
        END IF;

        UPDATE public.orders SET status = 'delivered', payment_status = 'paid', updated_at = now() WHERE id = v_stop.order_id AND status != 'delivered';
        INSERT INTO public.order_status_history (order_id, status, changed_by) VALUES (v_stop.order_id, 'delivered', v_caller);
    END IF;

    UPDATE public.delivery_run_stops SET status = 'delivered', actual_arrival_time = COALESCE(actual_arrival_time, NOW()), actual_departure_time = NOW() WHERE id = v_stop.id;

    PERFORM public.recalculate_route_eta(p_run_id);
END;
$$;

-- ============================================================================
-- 5. Security: Driver/Helper GPS Authorization
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
    v_is_auth BOOLEAN := false;
BEGIN
    SELECT * INTO v_run FROM public.delivery_runs WHERE id = p_run_id;
    IF NOT FOUND OR v_run.status != 'in_progress' THEN RETURN; END IF;

    -- Authorize driver
    IF (SELECT profile_id FROM public.drivers WHERE id = v_run.driver_id) = v_caller THEN
        v_is_auth := true;
    END IF;
    -- Authorize helper
    IF NOT v_is_auth AND v_run.helper_id IS NOT NULL THEN
        IF (SELECT profile_id FROM public.helpers WHERE id = v_run.helper_id) = v_caller THEN
            v_is_auth := true;
        END IF;
    END IF;
    -- Authorize supplier
    IF NOT v_is_auth THEN
        IF (SELECT profile_id FROM public.suppliers WHERE id = v_run.supplier_id) = v_caller THEN
            v_is_auth := true;
        END IF;
    END IF;

    IF NOT v_is_auth THEN
        RAISE EXCEPTION 'Unauthorized: only the assigned crew or supplier can update location';
    END IF;

    v_vehicle_id := v_run.vehicle_id;
    SELECT * INTO v_config FROM public.dispatch_configurations ORDER BY created_at DESC LIMIT 1;

    INSERT INTO public.vehicle_locations (run_id, vehicle_id, latitude, longitude, accuracy_m, speed, captured_at)
    VALUES (p_run_id, v_vehicle_id, p_lat, p_lng, p_accuracy, p_speed, p_timestamp);

    INSERT INTO public.delivery_run_live_state (run_id, vehicle_id, latitude, longitude, captured_at, status)
    VALUES (p_run_id, v_vehicle_id, p_lat, p_lng, p_timestamp, 'moving')
    ON CONFLICT (run_id) DO UPDATE SET latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude, captured_at = EXCLUDED.captured_at, status = EXCLUDED.status;

    PERFORM public.recalculate_route_eta(p_run_id);
END;
$$;
