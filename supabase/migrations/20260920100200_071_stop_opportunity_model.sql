-- ============================================================================
-- 071_stop_opportunity_model.sql
-- Phase 3: Extend delivery_run_stops for opportunistic stops,
--          secure run start, and centralized stop completion
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. EXTEND delivery_run_stops WITH stop_type AND order_id
-- ---------------------------------------------------------------------------
ALTER TABLE public.delivery_run_stops
  ADD COLUMN IF NOT EXISTS stop_type TEXT NOT NULL DEFAULT 'scheduled'
  CHECK (stop_type IN ('scheduled', 'opportunistic'));

ALTER TABLE public.delivery_run_stops
  ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES public.orders(id);

CREATE INDEX IF NOT EXISTS idx_delivery_run_stops_order
  ON public.delivery_run_stops(order_id);

CREATE INDEX IF NOT EXISTS idx_delivery_run_stops_run_seq
  ON public.delivery_run_stops(run_id, sequence_number);

CREATE INDEX IF NOT EXISTS idx_delivery_run_stops_run_status
  ON public.delivery_run_stops(run_id, status);

-- ---------------------------------------------------------------------------
-- 2. RPC: start_delivery_run
--    Server-validated run start. Driver must be authenticated, assigned,
--    and load must be confirmed.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION start_delivery_run(p_run_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_run       RECORD;
    v_caller    UUID := auth.uid();
    v_driver_id UUID;
    v_load_confirmed BOOLEAN;
BEGIN
    -- 1. Fetch and lock the run
    SELECT * INTO v_run
    FROM public.delivery_runs
    WHERE id = p_run_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Run not found';
    END IF;

    -- 2. Validate run status
    IF v_run.status NOT IN ('planned', 'loading') THEN
        RAISE EXCEPTION 'Run cannot be started from status: %', v_run.status;
    END IF;

    -- 3. Verify caller is the assigned driver
    SELECT id INTO v_driver_id
    FROM public.drivers
    WHERE profile_id = v_caller AND id = v_run.driver_id;

    IF v_driver_id IS NULL THEN
        -- Also allow supplier to start
        PERFORM 1 FROM public.suppliers
        WHERE id = v_run.supplier_id AND profile_id = v_caller;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Unauthorized: only the assigned driver or supplier can start this run';
        END IF;
    END IF;

    -- 4. Verify load is confirmed
    SELECT EXISTS (
        SELECT 1 FROM public.delivery_run_loads
        WHERE run_id = p_run_id AND confirmed_at IS NOT NULL
    ) INTO v_load_confirmed;

    IF NOT v_load_confirmed THEN
        RAISE EXCEPTION 'Cannot start run: vehicle load has not been confirmed';
    END IF;

    -- 5. Verify vehicle assignment is valid for today
    PERFORM 1 FROM public.vehicle_assignments
    WHERE vehicle_id = v_run.vehicle_id
      AND driver_id = v_run.driver_id
      AND assignment_date = v_run.run_date;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cannot start run: vehicle assignment is not valid for this date';
    END IF;

    -- 6. Start the run
    UPDATE public.delivery_runs
    SET status = 'in_progress',
        started_at = now()
    WHERE id = p_run_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. RPC: complete_delivery_run_stop
--    Centralized stop completion that handles both scheduled and opportunistic stops.
--    Determines stop_type and executes appropriate business logic transactionally.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION complete_delivery_run_stop(
    p_stop_id        UUID,
    p_actual_quantity INTEGER DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_stop       RECORD;
    v_run        RECORD;
    v_caller     UUID := auth.uid();
    v_is_auth    BOOLEAN := false;
    v_quantity   INTEGER;
BEGIN
    -- 1. Fetch and lock the stop
    SELECT * INTO v_stop
    FROM public.delivery_run_stops
    WHERE id = p_stop_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Stop not found';
    END IF;

    -- 2. Fetch and lock the run
    SELECT * INTO v_run
    FROM public.delivery_runs
    WHERE id = v_stop.run_id
    FOR UPDATE;

    IF v_run.status != 'in_progress' THEN
        RAISE EXCEPTION 'Run is not in progress';
    END IF;

    -- 3. Verify caller is authorized (driver, helper, or supplier)
    -- Driver check
    PERFORM 1 FROM public.drivers
    WHERE id = v_run.driver_id AND profile_id = v_caller;
    IF FOUND THEN v_is_auth := true; END IF;

    -- Helper check
    IF NOT v_is_auth AND v_run.helper_id IS NOT NULL THEN
        PERFORM 1 FROM public.helpers
        WHERE id = v_run.helper_id AND profile_id = v_caller;
        IF FOUND THEN v_is_auth := true; END IF;
    END IF;

    -- Supplier check
    IF NOT v_is_auth THEN
        PERFORM 1 FROM public.suppliers
        WHERE id = v_run.supplier_id AND profile_id = v_caller;
        IF FOUND THEN v_is_auth := true; END IF;
    END IF;

    IF NOT v_is_auth THEN
        RAISE EXCEPTION 'Unauthorized: caller is not assigned to this run';
    END IF;

    -- 4. Determine actual quantity
    v_quantity := COALESCE(p_actual_quantity, v_stop.quantity);

    -- 5. Mark stop as delivered
    UPDATE public.delivery_run_stops
    SET status = 'delivered',
        delivered_at = now(),
        quantity = v_quantity
    WHERE id = p_stop_id;

    -- 6. Handle stop-type specific logic
    IF v_stop.stop_type = 'scheduled' THEN
        -- For scheduled stops: advance the recurring schedule if applicable
        IF v_stop.schedule_id IS NOT NULL THEN
            -- Mark the schedule's next delivery as completed and advance
            UPDATE public.customer_delivery_schedules
            SET next_delivery_date = next_delivery_date + (interval_days || ' days')::INTERVAL
            WHERE id = v_stop.schedule_id
              AND is_active = true;
        END IF;

    ELSIF v_stop.stop_type = 'opportunistic' THEN
        -- For opportunistic stops: update the canonical order status
        IF v_stop.order_id IS NOT NULL THEN
            UPDATE public.orders
            SET status = 'delivered',
                updated_at = now()
            WHERE id = v_stop.order_id;

            -- Record in order status history
            INSERT INTO public.order_status_history (order_id, status, changed_by)
            VALUES (v_stop.order_id, 'delivered', v_caller);
        END IF;
    END IF;

    -- 7. Check if all stops are completed/skipped → auto-complete the run
    IF NOT EXISTS (
        SELECT 1 FROM public.delivery_run_stops
        WHERE run_id = v_stop.run_id
          AND status IN ('planned', 'en_route')
    ) THEN
        UPDATE public.delivery_runs
        SET status = 'completed',
            ended_at = now()
        WHERE id = v_stop.run_id;
    END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. UPDATE generate_daily_run to include helper_id
-- ---------------------------------------------------------------------------
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
    -- Create the run (now with helper_id)
    INSERT INTO public.delivery_runs (supplier_id, vehicle_id, driver_id, helper_id, run_date, status)
    VALUES (p_supplier_id, p_vehicle_id, p_driver_id, p_helper_id, p_run_date, 'planned')
    RETURNING id INTO v_run_id;

    -- Create stops from schedules
    FOREACH v_schedule_id IN ARRAY p_schedule_ids
    LOOP
        SELECT
            cds.customer_id,
            p.default_address_id as address_id,
            cds.product_id,
            cds.quantity,
            sc.price as unit_price
        INTO v_schedule_record
        FROM public.customer_delivery_schedules cds
        JOIN public.profiles p ON p.id = cds.customer_id
        LEFT JOIN public.supplier_customers sc ON sc.customer_id = cds.customer_id AND sc.supplier_id = cds.supplier_id
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
