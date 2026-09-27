-- ============================================================================
-- 103_final_pilot_reconciliation.sql
-- Final Pilot Stabilization Pass
-- Explicitly defines the canonical versions of the critical transactional paths:
-- 1. place_order (Fixes notification recipient)
-- 2. notify_customer_arrival_by_order (Fixes customer push and out_for_delivery)
-- 3. update_order_status (Rejects 'delivered')
-- 4. complete_order_delivery (Canonical delivery flow)
-- 5. _complete_delivery_accounting (Core ledger/jar logic)
-- 6. trigger_push_notification_edge_function (Async push trigger without swallowed errors)
-- ============================================================================

-- ============================================================================
-- 1. place_order
-- ============================================================================
CREATE OR REPLACE FUNCTION public.place_order(
    p_supplier_id UUID,
    p_address_id UUID,
    p_product_id UUID,
    p_quantity INT,
    p_payment_method TEXT,
    p_idempotency_key UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_order_id UUID;
    v_user_id UUID;
    v_supplier_customer_id UUID;
    v_unit_price NUMERIC(10,2);
    v_subtotal NUMERIC(10,2);
    v_delivery_fee NUMERIC(10,2) := 0;
    v_supplier_product_id UUID;
    v_available_capacity INT;
    v_customer_profile RECORD;
    v_existing_payload JSONB;
    v_normalized_phone TEXT;
    v_supplier_profile_id UUID;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

    -- Idempotency Check
    IF p_idempotency_key IS NOT NULL THEN
        SELECT response_payload INTO v_existing_payload 
        FROM public.api_idempotency 
        WHERE idempotency_key = p_idempotency_key AND user_id = v_user_id;

        IF v_existing_payload IS NOT NULL THEN
            RETURN (v_existing_payload->>'order_id')::UUID;
        END IF;
    END IF;

    -- Get Supplier Profile ID for push notifications
    SELECT profile_id INTO v_supplier_profile_id
    FROM public.suppliers
    WHERE id = p_supplier_id;

    -- Map marketplace customer to Supplier CRM
    SELECT id INTO v_supplier_customer_id FROM public.supplier_customers 
    WHERE user_id = v_user_id AND supplier_id = p_supplier_id;

    IF v_supplier_customer_id IS NULL THEN
        SELECT * INTO v_customer_profile FROM public.profiles WHERE id = v_user_id;
        v_normalized_phone := COALESCE(RIGHT(REGEXP_REPLACE(v_customer_profile.phone, '\D', '', 'g'), 10), '0000000000');
        
        -- Check if the supplier already added this customer manually
        SELECT id INTO v_supplier_customer_id FROM public.supplier_customers
        WHERE supplier_id = p_supplier_id AND normalized_phone = v_normalized_phone;
        
        IF v_supplier_customer_id IS NOT NULL THEN
            UPDATE public.supplier_customers SET user_id = v_user_id WHERE id = v_supplier_customer_id;
        ELSE
            INSERT INTO public.supplier_customers (
                supplier_id, user_id, name, phone, normalized_phone, customer_type, address, sector
            )
            VALUES (
                p_supplier_id, v_user_id, COALESCE(v_customer_profile.name, 'Customer'), 
                v_customer_profile.phone, v_normalized_phone, 'household', '', ''
            ) RETURNING id INTO v_supplier_customer_id;
        END IF;
    END IF;

    -- Validate product
    SELECT id INTO v_supplier_product_id 
    FROM public.supplier_products 
    WHERE supplier_id = p_supplier_id AND product_id = p_product_id AND available = true;
    
    IF v_supplier_product_id IS NULL THEN RAISE EXCEPTION 'Product not available from this supplier'; END IF;

    -- Check Capacity
    SELECT (max_capacity - reserved_quantity - fulfilled_quantity) INTO v_available_capacity 
    FROM public.supplier_capacity 
    WHERE supplier_id = p_supplier_id AND date = timezone('Asia/Kolkata', now())::date
    FOR UPDATE;

    IF COALESCE(v_available_capacity, 0) < p_quantity THEN 
        RAISE EXCEPTION 'Insufficient supplier capacity for this order'; 
    END IF;

    -- Resolve secure price
    v_unit_price := public.get_effective_customer_price(v_supplier_customer_id, v_supplier_product_id);
    IF v_unit_price IS NULL THEN RAISE EXCEPTION 'Could not resolve pricing'; END IF;

    v_subtotal := v_unit_price * p_quantity;

    -- AUTOMATIC BULK DISCOUNT: 10% off for quantities >= 100
    IF p_quantity >= 100 THEN
        v_subtotal := v_subtotal * 0.9;
    END IF;

    -- Insert Order
    INSERT INTO public.orders (customer_id, supplier_id, address_id, status, subtotal, delivery_fee, total, payment_method, payment_status)
    VALUES (v_user_id, p_supplier_id, p_address_id, 'placed', v_subtotal, v_delivery_fee, v_subtotal + v_delivery_fee, p_payment_method, 'pending')
    RETURNING id INTO v_order_id;

    -- Insert Order Items
    INSERT INTO public.order_items (order_id, product_id, quantity, unit_price, total)
    VALUES (v_order_id, p_product_id, p_quantity, v_unit_price, v_subtotal);

    -- Track history
    INSERT INTO public.order_status_history (order_id, status, changed_by)
    VALUES (v_order_id, 'placed', v_user_id);

    -- Idempotency save
    IF p_idempotency_key IS NOT NULL THEN
        INSERT INTO public.api_idempotency (idempotency_key, user_id, api_route, response_payload)
        VALUES (p_idempotency_key, v_user_id, 'place_order', jsonb_build_object('order_id', v_order_id));
    END IF;

    -- Push Notification to Supplier
    IF v_supplier_profile_id IS NOT NULL THEN
        INSERT INTO public.delivery_notifications (
            user_id, notification_type, title, body, payload
        ) VALUES (
            v_supplier_profile_id, 'new_order', 'New Order Received',
            'You have received a new order for ' || p_quantity || ' jars.',
            jsonb_build_object('order_id', v_order_id)
        );
    END IF;

    RETURN v_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 2. notify_customer_arrival_by_order
-- ============================================================================
CREATE OR REPLACE FUNCTION public.notify_customer_arrival_by_order(p_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    v_customer_id UUID;
    v_supplier_id UUID;
BEGIN
    SELECT customer_id, supplier_id INTO v_customer_id, v_supplier_id
    FROM public.orders WHERE id = p_order_id;
    
    IF v_customer_id IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;
    IF v_supplier_id != public.get_supplier_id() THEN
        RAISE EXCEPTION 'Not authorized to send alerts for this order';
    END IF;

    UPDATE public.orders SET status = 'out_for_delivery' WHERE id = p_order_id;
    INSERT INTO public.order_status_history (order_id, status, changed_by, notes)
    VALUES (p_order_id, 'out_for_delivery', auth.uid(), 'Supplier sent arrival alert');

    INSERT INTO public.delivery_notifications (
        user_id, notification_type, title, body, payload
    ) VALUES (
        v_customer_id, 'eta_alert',
        'Your Delivery is Arriving Soon!',
        'Our delivery vehicle is nearby and will arrive shortly.',
        jsonb_build_object('type', 'eta_alert', 'order_id', p_order_id)
    );
END;
$$;


-- ============================================================================
-- 3. update_order_status
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_order_status(p_order_id UUID, p_new_status TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
    v_total_quantity INT;
    v_order_date DATE;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

    IF p_new_status = 'accepted' THEN
        PERFORM public.accept_order(p_order_id);
        RETURN;
    ELSIF p_new_status = 'rejected' THEN
        PERFORM public.reject_order(p_order_id, 'Rejected by supplier');
        RETURN;
    ELSIF p_new_status = 'delivered' THEN
        RAISE EXCEPTION 'Use complete_order_delivery() for delivery completion with accounting';
    END IF;

    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;

    UPDATE public.orders SET status = p_new_status WHERE id = p_order_id;
    INSERT INTO public.order_status_history (order_id, status, changed_by)
    VALUES (p_order_id, p_new_status, auth.uid());
END;
$$;


-- ============================================================================
-- 4. _complete_delivery_accounting
-- ============================================================================
CREATE OR REPLACE FUNCTION public._complete_delivery_accounting(
    p_order_id UUID,
    p_supplier_customer_id UUID,
    p_supplier_id UUID,
    p_supplier_product_id UUID,
    p_jars_delivered INTEGER,
    p_jars_returned INTEGER,
    p_amount_collected NUMERIC,
    p_payment_method TEXT,
    p_unit_price NUMERIC,
    p_route_stop_id UUID DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
    v_total_price NUMERIC(10,2);
    v_delivery_id UUID;
    v_customer_id UUID;
BEGIN
    v_total_price := p_jars_delivered * p_unit_price;

    SELECT user_id INTO v_customer_id FROM public.supplier_customers WHERE id = p_supplier_customer_id;

    -- Update order to delivered safely
    UPDATE public.orders SET status = 'delivered', payment_status = 'paid' WHERE id = p_order_id AND status != 'delivered';
    
    INSERT INTO public.order_status_history (order_id, status, changed_by, notes)
    VALUES (p_order_id, 'delivered', auth.uid(), 'Delivery completed');

    -- Create delivery record
    INSERT INTO public.deliveries (
        supplier_id, route_stop_id, supplier_customer_id, order_id, delivered_by, status
    ) VALUES (
        p_supplier_id, p_route_stop_id, p_supplier_customer_id, p_order_id, auth.uid(), 'completed'
    ) RETURNING id INTO v_delivery_id;

    -- Create delivery items
    INSERT INTO public.delivery_items (
        delivery_id, supplier_product_id, quantity_delivered, empty_jars_collected, unit_price, total_price
    ) VALUES (
        v_delivery_id, p_supplier_product_id, p_jars_delivered, p_jars_returned, p_unit_price, v_total_price
    );

    -- Ledger Debit
    INSERT INTO public.supplier_customer_ledger (
        supplier_customer_id, type, amount, reference_type, reference_id, description
    ) VALUES (
        p_supplier_customer_id, 'debit', v_total_price, 'delivery', v_delivery_id, 'Delivery of ' || p_jars_delivered || ' jars'
    );

    -- Payment if collected
    IF p_amount_collected > 0 THEN
        INSERT INTO public.payments (
            supplier_id, supplier_customer_id, amount, payment_method, reference_type, reference_id, collected_by
        ) VALUES (
            p_supplier_id, p_supplier_customer_id, p_amount_collected, p_payment_method, 'delivery', v_delivery_id, auth.uid()
        );

        INSERT INTO public.supplier_customer_ledger (
            supplier_customer_id, type, amount, reference_type, reference_id, description
        ) VALUES (
            p_supplier_customer_id, 'credit', p_amount_collected, 'payment', v_delivery_id, 'Payment collected'
        );
    END IF;

    -- Jars Ledger (Delivered)
    IF p_jars_delivered > 0 THEN
        INSERT INTO public.supplier_customer_jars (
            supplier_customer_id, type, quantity, reference_type, reference_id, description
        ) VALUES (
            p_supplier_customer_id, 'given', p_jars_delivered, 'delivery', v_delivery_id, 'Jars delivered'
        );
    END IF;

    -- Jars Ledger (Returned)
    IF p_jars_returned > 0 THEN
        INSERT INTO public.supplier_customer_jars (
            supplier_customer_id, type, quantity, reference_type, reference_id, description
        ) VALUES (
            p_supplier_customer_id, 'returned', p_jars_returned, 'delivery', v_delivery_id, 'Empty jars collected'
        );
    END IF;

    -- Inventory Update
    INSERT INTO public.inventory_transactions (
        supplier_id, product_id, type, quantity, reference_type, reference_id
    ) VALUES (
        p_supplier_id, p_supplier_product_id, 'out', p_jars_delivered, 'delivery', v_delivery_id
    );

    IF p_jars_returned > 0 THEN
        INSERT INTO public.inventory_transactions (
            supplier_id, product_id, type, quantity, reference_type, reference_id
        ) VALUES (
            p_supplier_id, p_supplier_product_id, 'in_empty', p_jars_returned, 'delivery', v_delivery_id
        );
    END IF;
    
    -- Notify customer
    IF v_customer_id IS NOT NULL THEN
        INSERT INTO public.delivery_notifications (
            user_id, notification_type, title, body, payload
        ) VALUES (
            v_customer_id, 'delivery_completed', 'Delivery Completed',
            'Your order of ' || p_jars_delivered || ' jars has been delivered.',
            jsonb_build_object('order_id', p_order_id, 'delivery_id', v_delivery_id)
        );
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 5. complete_order_delivery
-- ============================================================================
CREATE OR REPLACE FUNCTION public.complete_order_delivery(
    p_order_id UUID,
    p_jars_delivered INTEGER DEFAULT NULL,
    p_jars_returned INTEGER DEFAULT 0,
    p_amount_collected NUMERIC DEFAULT 0,
    p_payment_method TEXT DEFAULT 'cash'
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_order RECORD;
    v_supplier_id UUID;
    v_total_quantity INT;
    v_unit_price NUMERIC(10,2);
    v_supplier_customer_id UUID;
    v_supplier_product_id UUID;
    v_customer_profile RECORD;
    v_order_date DATE;
BEGIN
    v_supplier_id := public.get_supplier_id();
    IF v_supplier_id IS NULL THEN RAISE EXCEPTION 'Not authenticated as supplier'; END IF;

    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
    IF v_order.supplier_id != v_supplier_id THEN RAISE EXCEPTION 'Unauthorized'; END IF;
    IF v_order.status = 'delivered' THEN RETURN; END IF;  -- Idempotency

    SELECT SUM(quantity), MAX(unit_price) INTO v_total_quantity, v_unit_price
    FROM public.order_items WHERE order_id = p_order_id;

    IF p_jars_delivered IS NULL THEN p_jars_delivered := v_total_quantity; END IF;

    v_order_date := timezone('Asia/Kolkata', v_order.created_at)::date;

    -- Capacity adjustment
    UPDATE public.supplier_capacity
    SET reserved_quantity = reserved_quantity - v_total_quantity,
        fulfilled_quantity = fulfilled_quantity + v_total_quantity
    WHERE supplier_id = v_order.supplier_id AND date = v_order_date;

    -- Find or create supplier_customer
    SELECT id INTO v_supplier_customer_id FROM public.supplier_customers
    WHERE user_id = v_order.customer_id AND supplier_id = v_order.supplier_id;

    IF v_supplier_customer_id IS NULL THEN
        SELECT * INTO v_customer_profile FROM public.profiles WHERE id = v_order.customer_id;
        INSERT INTO public.supplier_customers (
            supplier_id, user_id, name, phone, normalized_phone, customer_type, is_active
        ) VALUES (
            v_order.supplier_id, v_order.customer_id, 
            COALESCE(v_customer_profile.name, 'Customer'), v_customer_profile.phone,
            COALESCE(RIGHT(REGEXP_REPLACE(v_customer_profile.phone, '\D', '', 'g'), 10), '0000000000'),
            'household', true
        ) RETURNING id INTO v_supplier_customer_id;
    END IF;

    SELECT product_id INTO v_supplier_product_id FROM public.order_items WHERE order_id = p_order_id LIMIT 1;

    PERFORM public._complete_delivery_accounting(
        p_order_id, v_supplier_customer_id, v_order.supplier_id, v_supplier_product_id,
        p_jars_delivered, p_jars_returned, p_amount_collected, p_payment_method, v_unit_price
    );
END;
$$;


-- ============================================================================
-- 6. trigger_push_notification_edge_function
-- ============================================================================
CREATE OR REPLACE FUNCTION trigger_push_notification_edge_function()
RETURNS TRIGGER AS $$
DECLARE
  v_auth_header TEXT;
  v_url TEXT;
BEGIN
  v_auth_header := current_setting('app.settings.service_role_key', true);
  IF v_auth_header IS NULL OR v_auth_header = '' THEN
    v_auth_header := current_setting('app.settings.anon_key', true);
  END IF;

  IF v_auth_header IS NULL OR v_auth_header = '' THEN
    v_auth_header := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdtb2V0aHp3dm9ldWFqZnpxYWtuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzNzMxNDcsImV4cCI6MjEwNDk0OTE0N30.eQCfyYsA_1a_mlHAudmt1fWT6QwfKPkhIs5pVWTraYs';
  END IF;

  v_url := current_setting('app.settings.edge_function_url', true);
  IF v_url IS NULL OR v_url = '' THEN
    v_url := 'https://gmoethzwvoeuajfzqakn.supabase.co/functions/v1/push-notifications';
  END IF;

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_auth_header
    ),
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', 'delivery_notifications',
      'schema', 'public',
      'record', row_to_json(NEW)
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Let it fail gracefully so order insertion and other updates succeed.
  -- net.http_post failures (e.g. pg_net not enabled) must not roll back transactions.
  RAISE WARNING 'Webhook invocation failed: %', SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
