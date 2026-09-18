-- 062_arrival_alerts_fix.sql

-- Make stop_id optional in delivery_notifications so we can send alerts directly tied to an order
ALTER TABLE public.delivery_notifications ALTER COLUMN stop_id DROP NOT NULL;
ALTER TABLE public.delivery_notifications ADD COLUMN order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE;

-- Create an RPC to notify by order ID (which we have in the manifest)
CREATE OR REPLACE FUNCTION public.notify_customer_arrival_by_order(p_order_id UUID)
RETURNS VOID AS $$
DECLARE
    v_customer_id UUID;
    v_supplier_id UUID;
    v_title TEXT := 'Your Delivery is Arriving Soon!';
    v_body TEXT := 'Our delivery vehicle is nearby and will arrive shortly.';
BEGIN
    -- Get order details
    SELECT customer_id, supplier_id INTO v_customer_id, v_supplier_id
    FROM public.orders
    WHERE id = p_order_id;

    IF v_customer_id IS NULL THEN
        RAISE EXCEPTION 'Order not found';
    END IF;

    -- Only allow if the caller is the supplier
    IF (v_supplier_id != public.get_supplier_id()) THEN
        RAISE EXCEPTION 'Not authorized to send alerts for this order';
    END IF;

    -- Insert into delivery_notifications to trigger the Push Notification Webhook
    INSERT INTO public.delivery_notifications (
        user_id,
        order_id,
        notification_type,
        title,
        body,
        status,
        scheduled_for
    ) VALUES (
        v_customer_id,
        p_order_id,
        'eta_alert',
        v_title,
        v_body,
        'pending',
        now()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
