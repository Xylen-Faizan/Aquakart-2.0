-- ============================================================================
-- 082_pilot_hardening_pass.sql
-- Pilot Hardening Pass: DB Correctness, Accounting, Security, Tracking
-- ============================================================================

-- ============================================================================
-- 1. Database Correctness: available vs is_available
-- ============================================================================
-- Redefine accept_delivery_offer to fix sp.is_available to sp.available
-- Also we will update it in a moment to handle supplier_customers creation
-- First, let's add the column to orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS supplier_customer_id UUID REFERENCES public.supplier_customers(id);

-- ============================================================================
-- 2. Accounting Engine Unification
-- ============================================================================
CREATE OR REPLACE FUNCTION public._complete_delivery_accounting(
    p_supplier_id UUID,
    p_supplier_customer_id UUID,
    p_supplier_product_id UUID,
    p_quantity INTEGER,
    p_price NUMERIC,
    p_jars_delivered INTEGER,
    p_jars_returned INTEGER,
    p_amount_collected NUMERIC,
    p_payment_method TEXT,
    p_reference_order_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_delivery_id UUID;
    v_total_amount NUMERIC(10,2);
BEGIN
    v_total_amount := p_quantity * p_price;

    -- 1. Create Delivery Record
    INSERT INTO public.deliveries (
        supplier_id, supplier_customer_id, status, delivery_date, total_amount, order_id
    ) VALUES (
        p_supplier_id, p_supplier_customer_id, 'delivered', CURRENT_DATE, v_total_amount, p_reference_order_id
    ) RETURNING id INTO v_delivery_id;

    IF p_supplier_product_id IS NOT NULL THEN
        INSERT INTO public.delivery_items (
            delivery_id, supplier_product_id, quantity, unit_price, total_price
        ) VALUES (
            v_delivery_id, p_supplier_product_id, p_quantity, p_price, v_total_amount
        );
    END IF;

    -- 2. Process Jars Delivered
    IF p_jars_delivered > 0 THEN
        INSERT INTO public.jar_transactions (
            supplier_customer_id, transaction_type, quantity, delivery_id, jars_delivered, jars_returned
        ) VALUES (
            p_supplier_customer_id, 'delivered_to_customer', p_jars_delivered, v_delivery_id, p_jars_delivered, 0
        );
        
        -- Update Inventory
        UPDATE public.supplier_inventory 
        SET available = available - p_jars_delivered, updated_at = NOW()
        WHERE supplier_id = p_supplier_id;
    END IF;

    -- 3. Process Jars Returned
    IF p_jars_returned > 0 THEN
        INSERT INTO public.jar_transactions (
            supplier_customer_id, transaction_type, quantity, delivery_id, jars_delivered, jars_returned
        ) VALUES (
            p_supplier_customer_id, 'returned_by_customer', p_jars_returned, v_delivery_id, 0, p_jars_returned
        );
        
        -- Update Inventory
        UPDATE public.supplier_inventory 
        SET available = available + p_jars_returned, updated_at = NOW()
        WHERE supplier_id = p_supplier_id;
    END IF;

    -- Update Customer Jar Balance
    INSERT INTO public.customer_jar_balances (supplier_customer_id, jars_with_customer)
    VALUES (p_supplier_customer_id, p_jars_delivered - p_jars_returned)
    ON CONFLICT (supplier_customer_id) 
    DO UPDATE SET 
        jars_with_customer = public.customer_jar_balances.jars_with_customer + p_jars_delivered - p_jars_returned,
        updated_at = NOW();

    -- 4. Process Payment Collection
    IF p_amount_collected > 0 THEN
        INSERT INTO public.payments (
            supplier_id, supplier_customer_id, delivery_id, amount, payment_method
        ) VALUES (
            p_supplier_id, p_supplier_customer_id, v_delivery_id, p_amount_collected, p_payment_method
        );
    END IF;

    RETURN v_delivery_id;
END;
$$;

-- Refactor complete_delivery to use the shared engine
CREATE OR REPLACE FUNCTION public.complete_delivery(
    p_customer_id UUID, -- This is actually supplier_customer_id based on original logic
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
    SELECT supplier_id INTO v_customer_supplier_id FROM public.supplier_customers WHERE id = p_customer_id;
    IF v_customer_supplier_id != v_supplier_id THEN RAISE EXCEPTION 'Unauthorized'; END IF;

    v_delivery_id := public._complete_delivery_accounting(
        v_supplier_id,
        p_customer_id,
        p_supplier_product_id,
        p_quantity,
        p_price,
        p_jars_delivered,
        p_jars_returned,
        p_amount_collected,
        p_payment_method
    );

    -- 5. Update Schedule (push next delivery date if applicable)
    UPDATE public.customer_delivery_schedules
    SET next_delivery_date = CURRENT_DATE + interval_days
    WHERE supplier_customer_id = p_customer_id AND supplier_product_id = p_supplier_product_id;

    RETURN v_delivery_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 3. Fix accept_delivery_offer (Accounting connection & Active en_route protection)
-- ============================================================================
CREATE OR REPLACE FUNCTION accept_delivery_offer(
    p_offer_id UUID
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_offer RECORD;
    v_request RECORD;
    v_run RECORD;
    v_sp RECORD;
    v_price NUMERIC;
    v_total NUMERIC;
    v_order_id UUID;
    v_caller UUID := auth.uid();
    v_cap_ok BOOLEAN;
    v_new_seq INTEGER;
    v_supplier_customer_id UUID;
BEGIN
    -- 1. Lock and check offer
    SELECT * INTO v_offer FROM public.delivery_offers WHERE id = p_offer_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Offer not found'; END IF;
    IF v_offer.status != 'pending' THEN RAISE EXCEPTION 'Offer is not pending'; END IF;

    -- 2. Lock request
    SELECT * INTO v_request FROM public.order_dispatch_requests WHERE id = v_offer.request_id FOR UPDATE;
    IF v_request.status != 'searching' THEN
        UPDATE public.delivery_offers SET status = 'cancelled' WHERE id = p_offer_id;
        RAISE EXCEPTION 'Request is no longer active';
    END IF;

    -- 3. Verify Run exists
    SELECT * INTO v_run FROM public.delivery_runs WHERE id = v_offer.run_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Run not found'; END IF;

    -- 4. Authorize (Driver or Helper or Supplier)
    IF v_caller != (SELECT profile_id FROM public.drivers WHERE id = v_run.driver_id)
       AND (v_run.helper_id IS NULL OR v_caller != (SELECT profile_id FROM public.helpers WHERE id = v_run.helper_id))
       AND v_caller != (SELECT profile_id FROM public.suppliers WHERE id = v_run.supplier_id) THEN
        RAISE EXCEPTION 'Unauthorized: only assigned crew or supplier can accept';
    END IF;

    -- 5. Recalculate capacity
    SELECT EXISTS (
        SELECT 1 FROM get_vehicle_capacity_state(v_offer.run_id) cap
        WHERE cap.opportunity_capacity >= v_request.quantity
    ) INTO v_cap_ok;

    IF NOT v_cap_ok THEN
        UPDATE public.delivery_offers SET status = 'cancelled' WHERE id = p_offer_id;
        RAISE EXCEPTION 'Insufficient vehicle capacity';
    END IF;

    -- 6. Get supplier product and pricing
    SELECT sp.*, sp.price AS default_price
    INTO v_sp
    FROM public.supplier_products sp
    WHERE sp.supplier_id = v_offer.supplier_id
      AND sp.product_id = v_request.product_id
      AND sp.available = true -- FIX P0: Correct column name
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product not available from this supplier';
    END IF;

    v_price := v_sp.default_price;
    v_total := v_price * v_request.quantity;

    -- 7. Find or create supplier_customer relationship
    SELECT id INTO v_supplier_customer_id
    FROM public.supplier_customers
    WHERE supplier_id = v_offer.supplier_id AND customer_id = v_request.customer_id
    LIMIT 1;

    IF NOT FOUND THEN
        INSERT INTO public.supplier_customers (supplier_id, customer_id, status)
        VALUES (v_offer.supplier_id, v_request.customer_id, 'active')
        RETURNING id INTO v_supplier_customer_id;
        
        -- Initialize jar balance
        INSERT INTO public.customer_jar_balances (supplier_customer_id, jars_with_customer)
        VALUES (v_supplier_customer_id, 0);
    END IF;

    -- 8. Create canonical order
    INSERT INTO public.orders (
        customer_id, supplier_id, address_id,
        status, subtotal, delivery_fee, total,
        payment_method, payment_status, supplier_customer_id
    )
    VALUES (
        v_request.customer_id,
        v_offer.supplier_id,
        v_request.address_id,
        'out_for_delivery',
        v_total, 0, v_total,
        'cash', 'pending',
        v_supplier_customer_id
    )
    RETURNING id INTO v_order_id;

    -- Create order items
    INSERT INTO public.order_items (order_id, product_id, quantity, unit_price, total)
    VALUES (v_order_id, v_request.product_id, v_request.quantity, v_price, v_total);

    INSERT INTO public.order_status_history (order_id, status, changed_by)
    VALUES (v_order_id, 'out_for_delivery', v_caller);

    -- 9. Renumber future stops and insert new stop
    -- Shift all future stops at or after the insertion position
    v_new_seq := v_offer.insertion_position;

    UPDATE public.delivery_run_stops
    SET sequence_number = sequence_number + 1
    WHERE run_id = v_offer.run_id
      AND status = 'planned' -- Protect en_route stop
      AND sequence_number >= v_new_seq;

    -- Insert the opportunistic stop
    INSERT INTO public.delivery_run_stops (
        run_id, sequence_number, customer_id, address_id,
        product_id, quantity, unit_price, total_amount,
        status, stop_type, order_id
    )
    VALUES (
        v_offer.run_id, v_new_seq, v_request.customer_id, v_request.address_id,
        v_request.product_id, v_request.quantity, v_price, v_total,
        'planned', 'opportunistic', v_order_id
    );

    -- 10. Update states
    UPDATE public.delivery_offers SET status = 'accepted', updated_at = now() WHERE id = p_offer_id;
    UPDATE public.order_dispatch_requests SET status = 'accepted', updated_at = now() WHERE id = v_offer.request_id;
    
    -- Cancel competing offers
    UPDATE public.delivery_offers SET status = 'cancelled', updated_at = now()
    WHERE request_id = v_offer.request_id AND id != p_offer_id AND status = 'pending';

    -- Trigger domino effect for ETAs
    PERFORM public.recalculate_route_eta(v_offer.run_id);
    
    -- Create Notification for Customer
    INSERT INTO public.delivery_notifications (
        supplier_id, recipient_id, type, title, message, related_entity_id, related_entity_type
    ) VALUES (
        v_offer.supplier_id, v_request.customer_id, 'order_status', 
        'Order Accepted', 'A nearby vehicle has accepted your order and is on the way.',
        v_order_id, 'order'
    );

    RETURN v_order_id;
END;
$$;
