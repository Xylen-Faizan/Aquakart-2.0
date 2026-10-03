-- ============================================================================
-- 107_fix_delivery_accounting.sql
-- Fixes the inventory transaction crash in _complete_delivery_accounting
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

    -- Inventory Update (FIX: Correct table and columns)
    IF p_jars_delivered > 0 THEN
        INSERT INTO public.supplier_inventory_transactions (
            supplier_id, reference_type, reference_id, quantity_change
        ) VALUES (
            p_supplier_id, 'delivery', v_delivery_id, -p_jars_delivered
        );
    END IF;

    IF p_jars_returned > 0 THEN
        INSERT INTO public.supplier_inventory_transactions (
            supplier_id, reference_type, reference_id, quantity_change
        ) VALUES (
            p_supplier_id, 'return', v_delivery_id, p_jars_returned
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
