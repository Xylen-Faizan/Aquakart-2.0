CREATE OR REPLACE FUNCTION public.update_order_status(p_order_id uuid, p_new_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_order RECORD;
    v_total_quantity INT;
    v_order_date DATE;
    v_supplier_customer_id UUID;
    v_supplier_product_id UUID;
    v_unit_price NUMERIC(10,2);
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

    IF p_new_status = 'accepted' THEN
        PERFORM public.accept_order(p_order_id);
        RETURN;
    ELSIF p_new_status = 'rejected' THEN
        PERFORM public.reject_order(p_order_id, 'Rejected by supplier');
        RETURN;
    END IF;

    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    
    -- Removed MAX(product_id) which causes error since UUID cannot be maxed
    SELECT SUM(quantity), MAX(unit_price) INTO v_total_quantity, v_unit_price 
    FROM public.order_items WHERE order_id = p_order_id;
    
    v_order_date := timezone('Asia/Kolkata', v_order.created_at)::date;

    IF p_new_status = 'cancelled' AND v_order.status IN ('accepted', 'preparing', 'out_for_delivery') THEN
        UPDATE public.supplier_capacity SET reserved_quantity = reserved_quantity - v_total_quantity 
        WHERE supplier_id = v_order.supplier_id AND date = v_order_date;
        
    ELSIF p_new_status = 'delivered' AND v_order.status = 'out_for_delivery' THEN
        -- Standard order capacity logic
        UPDATE public.supplier_capacity SET reserved_quantity = reserved_quantity - v_total_quantity, fulfilled_quantity = fulfilled_quantity + v_total_quantity 
        WHERE supplier_id = v_order.supplier_id AND date = v_order_date;
        
        -- Get the CRM mapping
        SELECT id INTO v_supplier_customer_id FROM public.supplier_customers 
        WHERE user_id = v_order.customer_id AND supplier_id = v_order.supplier_id;
        
        -- Get the exact supplier product
        SELECT id INTO v_supplier_product_id FROM public.supplier_products 
        WHERE supplier_id = v_order.supplier_id AND product_id = (SELECT product_id FROM public.order_items WHERE order_id = p_order_id LIMIT 1);

        -- Record the transaction into the Supplier CRM (creates delivery, adjusts jars, ledger)
        IF v_supplier_customer_id IS NOT NULL AND v_supplier_product_id IS NOT NULL THEN
            PERFORM public.complete_delivery(
                v_supplier_customer_id,
                v_supplier_product_id,
                v_total_quantity,
                v_unit_price,
                v_total_quantity, -- Assumes jars delivered = quantity
                0, -- No returned jars tracked directly in marketplace yet
                (CASE WHEN v_order.payment_status = 'paid' THEN v_order.total ELSE 0 END), -- Amount collected
                v_order.payment_method
            );
        END IF;
    END IF;

    UPDATE public.orders SET status = p_new_status WHERE id = p_order_id;
    INSERT INTO public.order_status_history (order_id, status, changed_by) VALUES (p_order_id, p_new_status, auth.uid());
    
END;
$function$;
