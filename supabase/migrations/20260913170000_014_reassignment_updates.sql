-- 014_reassignment_updates.sql

-- 1. Fix accept_order to verify supplier authorization
CREATE OR REPLACE FUNCTION public.accept_order(p_order_id UUID) RETURNS VOID AS $$
DECLARE
    v_order RECORD;
    v_total_quantity INT;
    v_order_date DATE;
    v_supplier_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    
    v_supplier_id := public.get_supplier_id();

    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
    IF v_supplier_id IS NULL OR v_order.supplier_id != v_supplier_id THEN RAISE EXCEPTION 'Order is not assigned to you'; END IF;
    IF v_order.status != 'placed' THEN RAISE EXCEPTION 'Order must be in placed status to accept'; END IF;

    SELECT SUM(quantity) INTO v_total_quantity FROM public.order_items WHERE order_id = p_order_id;
    v_order_date := timezone('Asia/Kolkata', now())::date;

    -- Lock and check capacity
    PERFORM 1 FROM public.supplier_capacity WHERE supplier_id = v_order.supplier_id AND date = v_order_date FOR UPDATE;

    UPDATE public.supplier_capacity
    SET reserved_quantity = reserved_quantity + v_total_quantity
    WHERE supplier_id = v_order.supplier_id AND date = v_order_date
    AND max_capacity >= reserved_quantity + fulfilled_quantity + v_total_quantity;

    IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient capacity'; END IF;

    UPDATE public.orders SET status = 'accepted', capacity_date = v_order_date WHERE id = p_order_id;
    INSERT INTO public.order_status_history (order_id, status, changed_by) VALUES (p_order_id, 'accepted', auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Fix reject_order to verify supplier authorization
CREATE OR REPLACE FUNCTION public.reject_order(p_order_id UUID, p_reason TEXT) RETURNS VOID AS $$
DECLARE
    v_order RECORD;
    v_supplier_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    
    v_supplier_id := public.get_supplier_id();

    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
    IF v_supplier_id IS NULL OR v_order.supplier_id != v_supplier_id THEN RAISE EXCEPTION 'Order is not assigned to you'; END IF;
    IF v_order.status != 'placed' THEN RAISE EXCEPTION 'Order must be in placed status to reject'; END IF;

    UPDATE public.orders SET status = 'rejected', rejection_reason = p_reason WHERE id = p_order_id;
    INSERT INTO public.order_status_history (order_id, status, changed_by, notes) VALUES (p_order_id, 'rejected', auth.uid(), p_reason);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Fix update_order_status to verify supplier authorization
CREATE OR REPLACE FUNCTION public.update_order_status(p_order_id UUID, p_new_status TEXT) RETURNS VOID AS $$
DECLARE
    v_order RECORD;
    v_total_quantity INT;
    v_order_date DATE;
    v_supplier_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

    IF p_new_status = 'accepted' THEN
        PERFORM public.accept_order(p_order_id);
        RETURN;
    END IF;
    IF p_new_status = 'rejected' THEN
        PERFORM public.reject_order(p_order_id, 'Rejected by supplier');
        RETURN;
    END IF;

    v_supplier_id := public.get_supplier_id();

    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
    IF v_order.supplier_id != v_supplier_id THEN RAISE EXCEPTION 'Order is not assigned to you'; END IF;

    -- Validations
    IF v_order.status = 'placed' AND p_new_status NOT IN ('cancelled') THEN RAISE EXCEPTION 'Invalid transition'; END IF;
    IF v_order.status = 'accepted' AND p_new_status NOT IN ('preparing', 'cancelled') THEN RAISE EXCEPTION 'Invalid transition'; END IF;
    IF v_order.status = 'preparing' AND p_new_status NOT IN ('out_for_delivery', 'cancelled') THEN RAISE EXCEPTION 'Invalid transition'; END IF;
    IF v_order.status = 'out_for_delivery' AND p_new_status NOT IN ('delivered') THEN RAISE EXCEPTION 'Invalid transition'; END IF;
    IF v_order.status IN ('delivered', 'rejected', 'cancelled') THEN RAISE EXCEPTION 'Order is in terminal state'; END IF;

    v_order_date := v_order.capacity_date;
    IF v_order_date IS NULL THEN
        v_order_date := timezone('Asia/Kolkata', v_order.created_at)::date;
    END IF;

    SELECT SUM(quantity) INTO v_total_quantity FROM public.order_items WHERE order_id = p_order_id;

    IF p_new_status = 'cancelled' AND v_order.status IN ('accepted', 'preparing', 'out_for_delivery') THEN
        UPDATE public.supplier_capacity SET reserved_quantity = reserved_quantity - v_total_quantity
        WHERE supplier_id = v_order.supplier_id AND date = v_order_date;
    END IF;

    IF p_new_status = 'delivered' THEN
        UPDATE public.supplier_capacity 
        SET reserved_quantity = reserved_quantity - v_total_quantity,
            fulfilled_quantity = fulfilled_quantity + v_total_quantity
        WHERE supplier_id = v_order.supplier_id AND date = v_order_date;
    END IF;

    UPDATE public.orders SET status = p_new_status WHERE id = p_order_id;
    INSERT INTO public.order_status_history (order_id, status, changed_by) VALUES (p_order_id, p_new_status, auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Update admin_reassign_order to validate target supplier is active and has the product available
CREATE OR REPLACE FUNCTION public.admin_reassign_order(p_order_id UUID, p_new_supplier_id UUID) RETURNS VOID AS $$
DECLARE
    v_order RECORD;
    v_target_supplier RECORD;
    v_order_item RECORD;
    v_supplier_product RECORD;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin only'; END IF;

    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
    IF v_order.status != 'placed' THEN RAISE EXCEPTION 'Can only reassign placed orders'; END IF;

    -- Validate target supplier is active
    SELECT * INTO v_target_supplier FROM public.suppliers WHERE id = p_new_supplier_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Target supplier not found'; END IF;
    IF NOT v_target_supplier.is_active THEN RAISE EXCEPTION 'Target supplier is not active'; END IF;
    -- (We don't necessarily enforce is_accepting_orders here, as admin might forcefully assign it, but let's check it for safety if requested. Wait, user specifically said: "verify target supplier: is active, offers the ordered product, has that product available".)

    -- Verify target supplier offers the ordered product and has it available
    FOR v_order_item IN SELECT * FROM public.order_items WHERE order_id = p_order_id
    LOOP
        SELECT * INTO v_supplier_product FROM public.supplier_products 
        WHERE supplier_id = p_new_supplier_id AND product_id = v_order_item.product_id;
        
        IF NOT FOUND THEN RAISE EXCEPTION 'Target supplier does not offer product %', v_order_item.product_id; END IF;
        IF NOT v_supplier_product.available THEN RAISE EXCEPTION 'Target supplier product % is not available', v_order_item.product_id; END IF;
    END LOOP;

    UPDATE public.orders SET supplier_id = p_new_supplier_id WHERE id = p_order_id;
    INSERT INTO public.order_status_history (order_id, status, changed_by, notes) VALUES (p_order_id, 'placed', auth.uid(), 'Admin reassigned supplier');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
