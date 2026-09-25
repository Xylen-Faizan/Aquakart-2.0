-- 098_restore_canonical_run_stop.sql
-- Restore the canonical run-stop completion after the IST hardening migration.
-- The prior 097 IST migration accidentally reintroduced obsolete stop columns
-- and unsafe defaults. This migration restores the 096 canonical accounting path
-- while retaining the IST business-date correction.

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
            SET next_delivery_date = (timezone('Asia/Kolkata', now()))::date + interval_days
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

