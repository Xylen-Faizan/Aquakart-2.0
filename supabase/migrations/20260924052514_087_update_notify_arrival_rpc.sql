-- 087_update_notify_arrival_rpc.sql

CREATE OR REPLACE FUNCTION public.notify_customer_arrival_by_order(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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

    -- Update order status to out_for_delivery
    UPDATE public.orders 
    SET status = 'out_for_delivery' 
    WHERE id = p_order_id;
    
    INSERT INTO public.order_status_history (order_id, status, changed_by, notes) 
    VALUES (p_order_id, 'out_for_delivery', auth.uid(), 'Supplier sent arrival alert');

    -- Insert into delivery_notifications to trigger the Push Notification Webhook
    INSERT INTO public.delivery_notifications (
        user_id,
        order_id,
        notification_type,
        title,
        body,
        status
    ) VALUES (
        v_customer_id,
        p_order_id,
        'eta_alert',
        v_title,
        v_body,
        'pending'
    );
END;
$function$;