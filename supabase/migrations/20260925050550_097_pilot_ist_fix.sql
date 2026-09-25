-- ============================================================================
-- 097_pilot_ist_fix.sql
-- Fixes CURRENT_DATE to use IST boundary (Asia/Kolkata)
-- ============================================================================

-- Update complete_delivery
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
    SET next_delivery_date = (timezone('Asia/Kolkata', now()))::date + interval_days
    WHERE supplier_customer_id = p_customer_id
      AND supplier_product_id = p_supplier_product_id
      AND is_active = true;

    RETURN v_delivery_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Update complete_delivery_run_stop
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
    SELECT * INTO v_stop FROM public.delivery_run_stops WHERE id = p_stop_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Stop not found'; END IF;
    IF v_stop.run_id != p_run_id THEN RAISE EXCEPTION 'Stop mismatch'; END IF;
    IF v_stop.status = 'completed' THEN RAISE EXCEPTION 'Already completed'; END IF;

    -- Type: Scheduled
    IF v_stop.schedule_id IS NOT NULL THEN
        SELECT * INTO v_sched FROM public.customer_delivery_schedules WHERE id = v_stop.schedule_id;
        
        PERFORM public._complete_delivery_accounting(
            v_run.supplier_id, v_sched.supplier_customer_id, v_sched.supplier_product_id,
            COALESCE(p_jars_delivered, v_sched.quantity),
            v_sched.price,
            COALESCE(p_jars_delivered, v_sched.quantity),
            COALESCE(p_jars_returned, COALESCE(p_jars_delivered, v_sched.quantity)),
            COALESCE(p_amount_collected, v_sched.price * COALESCE(p_jars_delivered, v_sched.quantity)),
            p_payment_method
        );

        UPDATE public.customer_delivery_schedules
        SET next_delivery_date = (timezone('Asia/Kolkata', now()))::date + interval_days
        WHERE id = v_sched.id;
        
    -- Type: On-Demand
    ELSIF v_stop.order_id IS NOT NULL THEN
        SELECT * INTO v_order FROM public.orders WHERE id = v_stop.order_id;
        
        -- Resolve SP
        SELECT id INTO v_sp_id FROM public.supplier_products
        WHERE supplier_id = v_run.supplier_id AND product_id = v_order.product_id;

        -- Resolve supplier_customer
        SELECT id INTO v_supplier_customer_id FROM public.supplier_customers 
        WHERE supplier_id = v_run.supplier_id AND user_id = v_order.customer_id LIMIT 1;
        
        IF v_supplier_customer_id IS NULL THEN
            SELECT * INTO v_customer_profile FROM public.profiles WHERE id = v_order.customer_id;
            INSERT INTO public.supplier_customers (supplier_id, user_id, name, phone, customer_type, is_active)
            VALUES (v_run.supplier_id, v_order.customer_id, COALESCE(v_customer_profile.name, 'Customer'), COALESCE(v_customer_profile.phone, ''), 'household', true)
            RETURNING id INTO v_supplier_customer_id;

            INSERT INTO public.customer_jar_balances (supplier_customer_id, jars_with_customer)
            VALUES (v_supplier_customer_id, 0);
        END IF;

        PERFORM public._complete_delivery_accounting(
            v_run.supplier_id, v_supplier_customer_id, v_sp_id,
            v_order.quantity, v_order.delivery_fee, 
            COALESCE(p_jars_delivered, v_order.quantity),
            COALESCE(p_jars_returned, COALESCE(p_jars_delivered, v_order.quantity)),
            COALESCE(p_amount_collected, v_order.total),
            p_payment_method,
            v_order.id
        );

        UPDATE public.orders SET status = 'completed', payment_status = 'completed' WHERE id = v_order.id;
    END IF;

    -- Mark stop completed
    UPDATE public.delivery_run_stops
    SET status = 'completed',
        actual_arrival = now(),
        actual_departure = now(),
        updated_at = now()
    WHERE id = p_stop_id;
END;
$$;
