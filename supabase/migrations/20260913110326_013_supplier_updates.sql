-- 013_supplier_updates.sql

-- 1. Capacity Midnight Fix: Add capacity_date to orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS capacity_date DATE;

-- Migrate existing data
UPDATE public.orders 
SET capacity_date = timezone('Asia/Kolkata', created_at)::date 
WHERE capacity_date IS NULL;

-- 2. Modify accept_order to securely set capacity_date at time of acceptance
CREATE OR REPLACE FUNCTION public.accept_order(p_order_id UUID) RETURNS VOID AS $$
DECLARE
    v_order RECORD;
    v_total_quantity INT;
    v_order_date DATE;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
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

-- 3. Modify update_order_status to strictly use capacity_date for subsequent state changes
CREATE OR REPLACE FUNCTION public.update_order_status(p_order_id UUID, p_new_status TEXT) RETURNS VOID AS $$
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
    END IF;

    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    SELECT SUM(quantity) INTO v_total_quantity FROM public.order_items WHERE order_id = p_order_id;
    
    v_order_date := v_order.capacity_date;

    IF p_new_status = 'cancelled' AND v_order.status IN ('accepted', 'preparing', 'out_for_delivery') THEN
        UPDATE public.supplier_capacity SET reserved_quantity = reserved_quantity - v_total_quantity WHERE supplier_id = v_order.supplier_id AND date = v_order_date;
    ELSIF p_new_status = 'delivered' AND v_order.status = 'out_for_delivery' THEN
        UPDATE public.supplier_capacity SET reserved_quantity = reserved_quantity - v_total_quantity, fulfilled_quantity = fulfilled_quantity + v_total_quantity WHERE supplier_id = v_order.supplier_id AND date = v_order_date;
    END IF;

    UPDATE public.orders SET status = p_new_status WHERE id = p_order_id;
    INSERT INTO public.order_status_history (order_id, status, changed_by) VALUES (p_order_id, p_new_status, auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. Supplier Product Pricing RPC
CREATE OR REPLACE FUNCTION public.set_supplier_product(
    p_product_id UUID,
    p_price NUMERIC,
    p_available BOOLEAN
) RETURNS VOID AS $$
DECLARE
    v_supplier_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    
    v_supplier_id := public.get_supplier_id();
    IF v_supplier_id IS NULL THEN RAISE EXCEPTION 'Supplier record not found for user'; END IF;

    IF p_price <= 0 THEN RAISE EXCEPTION 'Price must be greater than zero'; END IF;

    INSERT INTO public.supplier_products (supplier_id, product_id, price, available)
    VALUES (v_supplier_id, p_product_id, p_price, p_available)
    ON CONFLICT (supplier_id, product_id) 
    DO UPDATE SET 
        price = EXCLUDED.price,
        available = EXCLUDED.available,
        updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
