-- 092_phase1_accounting_integrity_run_stop.sql

CREATE OR REPLACE FUNCTION public.complete_delivery_run_stop(p_run_id uuid, p_stop_id uuid, p_jars_delivered integer DEFAULT NULL::integer, p_jars_returned integer DEFAULT NULL::integer, p_amount_collected numeric DEFAULT NULL::numeric, p_payment_method text DEFAULT 'cash'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        
        IF v_order IS NOT NULL THEN
            v_supplier_customer_id := v_order.supplier_customer_id;
            
            IF v_supplier_customer_id IS NULL THEN
                -- Attempt to find existing one just in case
                SELECT id INTO v_supplier_customer_id FROM public.supplier_customers 
                WHERE user_id = v_order.customer_id AND supplier_id = v_run.supplier_id;
                
                IF v_supplier_customer_id IS NULL THEN
                    -- Fetch customer profile to create the relationship
                    SELECT * INTO v_customer_profile FROM public.profiles WHERE id = v_order.customer_id;
                    
                    INSERT INTO public.supplier_customers (
                        supplier_id, 
                        user_id, 
                        name, 
                        phone, 
                        customer_type, 
                        status
                    ) VALUES (
                        v_run.supplier_id,
                        v_order.customer_id,
                        v_customer_profile.name,
                        v_customer_profile.phone,
                        'household',
                        'active'
                    ) RETURNING id INTO v_supplier_customer_id;
                END IF;
                
                -- Update order to link it
                UPDATE public.orders SET supplier_customer_id = v_supplier_customer_id WHERE id = v_order.id;
            END IF;
            
            PERFORM public._complete_delivery_accounting(
                v_run.supplier_id,
                v_supplier_customer_id,
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
$function$;
