-- Fix _complete_delivery_accounting syntax and constraints
-- 1. Remove non-existent columns (route_stop_id, delivered_by) from the deliveries INSERT
-- 2. Add missing NOT NULL delivery_date
-- 3. Change status from 'completed' to 'delivered' to satisfy CHECK constraint
-- 4. Remove non-existent columns (quantity_delivered, empty_jars_collected) from delivery_items INSERT

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

    -- FIX: Proper column names, valid status enum, and include NOT NULL delivery_date
    INSERT INTO public.deliveries (
        supplier_id, supplier_customer_id, order_id, status, delivery_date
    ) VALUES (
        p_supplier_id, p_supplier_customer_id, p_order_id, 'delivered', CURRENT_DATE
    ) RETURNING id INTO v_delivery_id;

    -- FIX: Proper column names (quantity instead of quantity_delivered)
    INSERT INTO public.delivery_items (
        delivery_id, supplier_product_id, quantity, unit_price, total_price
    ) VALUES (
        v_delivery_id, p_supplier_product_id, p_jars_delivered, p_unit_price, v_total_price
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
