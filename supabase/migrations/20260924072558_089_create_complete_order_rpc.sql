-- 089_create_complete_order_rpc.sql

CREATE OR REPLACE FUNCTION public.complete_order(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_supplier_id UUID;
    v_order_supplier_id UUID;
    v_order_status text;
BEGIN
    v_supplier_id := public.get_supplier_id();
    IF v_supplier_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated as a supplier';
    END IF;

    SELECT supplier_id, status INTO v_order_supplier_id, v_order_status
    FROM public.orders
    WHERE id = p_order_id;

    IF v_order_supplier_id != v_supplier_id THEN
        RAISE EXCEPTION 'Unauthorized: Order not yours';
    END IF;

    UPDATE public.orders 
    SET status = 'delivered' 
    WHERE id = p_order_id;
    
    INSERT INTO public.order_status_history (order_id, status, changed_by, notes) 
    VALUES (p_order_id, 'delivered', auth.uid(), 'Supplier marked order as delivered');

END;
$function$;