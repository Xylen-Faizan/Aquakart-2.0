-- 106_push_notifications_e2e_fix.sql
-- Reconciles the push-token schema, trigger delivery, and route-stop completion path.

CREATE TABLE IF NOT EXISTS public.user_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    expo_push_token TEXT NOT NULL,
    platform TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_seen_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_devices_user_token
    ON public.user_devices(user_id, expo_push_token);

CREATE INDEX IF NOT EXISTS idx_user_devices_active_user
    ON public.user_devices(user_id)
    WHERE is_active = true;

ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own devices" ON public.user_devices;
CREATE POLICY "Users can read own devices"
    ON public.user_devices FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own devices" ON public.user_devices;
CREATE POLICY "Users can insert own devices"
    ON public.user_devices FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own devices" ON public.user_devices;
CREATE POLICY "Users can update own devices"
    ON public.user_devices FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

INSERT INTO public.user_devices (user_id, expo_push_token, is_active, last_seen_at)
SELECT id, expo_push_token, true, COALESCE(updated_at, now())
FROM public.profiles
WHERE expo_push_token IS NOT NULL
  AND NULLIF(trim(expo_push_token), '') IS NOT NULL
ON CONFLICT (user_id, expo_push_token) DO UPDATE
SET is_active = true, last_seen_at = EXCLUDED.last_seen_at;

CREATE OR REPLACE FUNCTION public.update_push_token(p_token TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
BEGIN
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

    UPDATE public.profiles
    SET expo_push_token = p_token, updated_at = NOW()
    WHERE id = v_user_id;

    INSERT INTO public.user_devices (
        user_id, expo_push_token, is_active, last_seen_at
    )
    VALUES (v_user_id, p_token, true, NOW())
    ON CONFLICT (user_id, expo_push_token)
    DO UPDATE SET is_active = true, last_seen_at = NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_push_token(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.trigger_push_notification_edge_function()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_auth_header TEXT;
    v_url TEXT;
BEGIN
    v_auth_header := current_setting('app.settings.service_role_key', true);
    IF v_auth_header IS NULL OR v_auth_header = '' THEN
        v_auth_header := current_setting('app.settings.anon_key', true);
    END IF;

    v_url := current_setting('app.settings.edge_function_url', true);
    IF v_url IS NULL OR v_url = '' THEN
        v_url := 'https://gmoethzwvoeuajfzqakn.supabase.co/functions/v1/push-notifications';
    END IF;

    IF v_auth_header IS NULL OR v_auth_header = '' THEN
        RAISE WARNING 'Push notification webhook skipped: app.settings service/anon key is not configured';
        RETURN NEW;
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
    RAISE WARNING 'Webhook invocation failed: %', SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS delivery_notifications_webhook ON public.delivery_notifications;

CREATE TRIGGER delivery_notifications_webhook
AFTER INSERT ON public.delivery_notifications
FOR EACH ROW
WHEN (NEW.status = 'pending')
EXECUTE FUNCTION public.trigger_push_notification_edge_function();

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
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_total_price NUMERIC(10,2);
    v_delivery_id UUID;
    v_customer_id UUID;
BEGIN
    v_total_price := p_jars_delivered * p_unit_price;

    SELECT user_id INTO v_customer_id
    FROM public.supplier_customers
    WHERE id = p_supplier_customer_id;

    IF p_order_id IS NOT NULL THEN
        UPDATE public.orders
        SET status = 'delivered',
            payment_status = CASE WHEN p_amount_collected > 0 THEN 'paid' ELSE 'pending' END
        WHERE id = p_order_id AND status != 'delivered';

        INSERT INTO public.order_status_history (order_id, status, changed_by, notes)
        VALUES (p_order_id, 'delivered', auth.uid(), 'Delivery completed');
    END IF;

    INSERT INTO public.deliveries (
        supplier_id, route_stop_id, supplier_customer_id, order_id, delivered_by, status
    ) VALUES (
        p_supplier_id, p_route_stop_id, p_supplier_customer_id, p_order_id, auth.uid(), 'completed'
    ) RETURNING id INTO v_delivery_id;

    INSERT INTO public.delivery_items (
        delivery_id, supplier_product_id, quantity_delivered, empty_jars_collected,
        unit_price, total_price
    ) VALUES (
        v_delivery_id, p_supplier_product_id, p_jars_delivered, p_jars_returned,
        p_unit_price, v_total_price
    );

    INSERT INTO public.supplier_customer_ledger (
        supplier_customer_id, type, amount, reference_type, reference_id, description
    ) VALUES (
        p_supplier_customer_id, 'debit', v_total_price, 'delivery', v_delivery_id,
        'Delivery of ' || p_jars_delivered || ' jars'
    );

    IF p_amount_collected > 0 THEN
        INSERT INTO public.payments (
            supplier_id, supplier_customer_id, amount, payment_method,
            reference_type, reference_id, collected_by
        ) VALUES (
            p_supplier_id, p_supplier_customer_id, p_amount_collected, p_payment_method,
            'delivery', v_delivery_id, auth.uid()
        );

        INSERT INTO public.supplier_customer_ledger (
            supplier_customer_id, type, amount, reference_type, reference_id, description
        ) VALUES (
            p_supplier_customer_id, 'credit', p_amount_collected, 'payment', v_delivery_id,
            'Payment collected'
        );
    END IF;

    IF p_jars_delivered > 0 THEN
        INSERT INTO public.supplier_customer_jars (
            supplier_customer_id, type, quantity, reference_type, reference_id, description
        ) VALUES (
            p_supplier_customer_id, 'given', p_jars_delivered, 'delivery', v_delivery_id,
            'Jars delivered'
        );
    END IF;

    IF p_jars_returned > 0 THEN
        INSERT INTO public.supplier_customer_jars (
            supplier_customer_id, type, quantity, reference_type, reference_id, description
        ) VALUES (
            p_supplier_customer_id, 'returned', p_jars_returned, 'delivery', v_delivery_id,
            'Empty jars collected'
        );
    END IF;

    INSERT INTO public.inventory_transactions (
        supplier_id, product_id, type, quantity, reference_type, reference_id
    ) VALUES (
        p_supplier_id, p_supplier_product_id, 'out', p_jars_delivered, 'delivery', v_delivery_id
    );

    IF p_jars_returned > 0 THEN
        INSERT INTO public.inventory_transactions (
            supplier_id, product_id, type, quantity, reference_type, reference_id
        ) VALUES (
            p_supplier_id, p_supplier_product_id, 'in_empty', p_jars_returned,
            'delivery', v_delivery_id
        );
    END IF;

    IF v_customer_id IS NOT NULL THEN
        INSERT INTO public.delivery_notifications (
            user_id, notification_type, title, body, payload
        ) VALUES (
            v_customer_id,
            'delivery_completed',
            'Delivery Completed',
            'Your order of ' || p_jars_delivered || ' jars has been delivered.',
            jsonb_build_object(
                'type', 'delivery_completed',
                'order_id', p_order_id,
                'delivery_id', v_delivery_id
            )
        );
    END IF;
END;
$$;

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
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_delivery_id UUID;
BEGIN
    PERFORM public._complete_delivery_accounting(
        p_reference_order_id,
        p_supplier_customer_id,
        p_supplier_id,
        p_supplier_product_id,
        p_jars_delivered,
        p_jars_returned,
        p_amount_collected,
        p_payment_method,
        p_price,
        NULL
    );

    SELECT id INTO v_delivery_id
    FROM public.deliveries
    WHERE supplier_id = p_supplier_id
      AND supplier_customer_id = p_supplier_customer_id
      AND order_id IS NOT DISTINCT FROM p_reference_order_id
    ORDER BY created_at DESC, id DESC
    LIMIT 1;

    RETURN v_delivery_id;
END;
$$;
