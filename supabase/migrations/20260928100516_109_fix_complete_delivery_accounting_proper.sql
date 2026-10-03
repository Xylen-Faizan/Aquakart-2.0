-- 109_fix_complete_delivery_accounting_proper.sql
-- The _complete_delivery_accounting function was referencing multiple non-existent tables
-- and columns (e.g. supplier_customer_ledger instead of customer_ledger_entries).
-- This migration fully restores the correct schema references from 024_deliveries_transaction.sql.

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
    v_today DATE;
BEGIN
    v_today := (NOW() AT TIME ZONE 'Asia/Kolkata')::DATE;
    v_total_price := p_jars_delivered * p_unit_price;

    SELECT user_id INTO v_customer_id
    FROM public.supplier_customers
    WHERE id = p_supplier_customer_id;

    IF p_order_id IS NOT NULL THEN
        UPDATE public.orders
        SET status = 'delivered',
            payment_status = CASE WHEN p_amount_collected >= v_total_price AND v_total_price > 0 THEN 'paid' ELSE 'pending' END
        WHERE id = p_order_id AND status != 'delivered';

        INSERT INTO public.order_status_history (order_id, status, changed_by, notes)
        VALUES (p_order_id, 'delivered', auth.uid(), 'Delivery completed');
    END IF;

    -- 1. Create delivery record
    INSERT INTO public.deliveries (
        supplier_id, supplier_customer_id, status, delivery_date, total_amount, order_id
    ) VALUES (
        p_supplier_id, p_supplier_customer_id, 'delivered', v_today, v_total_price, p_order_id
    ) RETURNING id INTO v_delivery_id;

    -- 2. Create delivery items
    INSERT INTO public.delivery_items (
        delivery_id, supplier_product_id, quantity, unit_price, total_price
    ) VALUES (
        v_delivery_id, p_supplier_product_id, p_jars_delivered, p_unit_price, v_total_price
    );

    -- 3. Create Financial Debit (Ledger)
    IF v_total_price > 0 THEN
        INSERT INTO public.customer_ledger_entries (
            supplier_id, supplier_customer_id, reference_type, reference_id, entry_type, amount, created_by
        ) VALUES (
            p_supplier_id, p_supplier_customer_id, 'delivery', v_delivery_id, 'debit', v_total_price, auth.uid()
        );
    END IF;

    -- 4. Record Payment (Credit Ledger)
    IF p_amount_collected > 0 THEN
        INSERT INTO public.payments (
            supplier_id, supplier_customer_id, delivery_id, amount, payment_method
        ) VALUES (
            p_supplier_id, p_supplier_customer_id, v_delivery_id, p_amount_collected, p_payment_method
        );

        INSERT INTO public.customer_ledger_entries (
            supplier_id, supplier_customer_id, reference_type, reference_id, entry_type, amount, created_by
        ) VALUES (
            p_supplier_id, p_supplier_customer_id, 'payment', v_delivery_id, 'credit', p_amount_collected, auth.uid()
        );
    END IF;

    -- 5. Update Jar State and Inventory
    IF p_jars_delivered > 0 OR p_jars_returned > 0 THEN
        INSERT INTO public.jar_transactions (
            supplier_customer_id, delivery_id, jars_delivered, jars_returned
        ) VALUES (
            p_supplier_customer_id, v_delivery_id, p_jars_delivered, p_jars_returned
        );
        
        UPDATE public.customer_jar_balances
        SET jars_with_customer = jars_with_customer + p_jars_delivered - p_jars_returned
        WHERE supplier_customer_id = p_supplier_customer_id;

        -- Update Supplier Inventory logic
        UPDATE public.supplier_inventory
        SET available = available - p_jars_delivered + p_jars_returned,
            with_customers = with_customers + p_jars_delivered - p_jars_returned
        WHERE supplier_id = p_supplier_id;
        
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
    END IF;

    -- 6. Trigger push notification for customer
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
