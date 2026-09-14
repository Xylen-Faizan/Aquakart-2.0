-- 011_functions.sql
-- Core business logic functions

CREATE OR REPLACE FUNCTION public.place_order(
    p_supplier_id UUID,
    p_address_id UUID,
    p_product_id UUID,
    p_quantity INT,
    p_payment_method TEXT
) RETURNS UUID AS $$
DECLARE
    v_order_id UUID;
    v_unit_price NUMERIC(10,2);
    v_subtotal NUMERIC(10,2);
    v_delivery_fee NUMERIC(10,2) := 0;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

    -- Validate product and price
    SELECT price INTO v_unit_price FROM public.supplier_products WHERE supplier_id = p_supplier_id AND product_id = p_product_id;
    IF v_unit_price IS NULL THEN RAISE EXCEPTION 'Product not available from this supplier'; END IF;

    v_subtotal := v_unit_price * p_quantity;

    INSERT INTO public.orders (customer_id, supplier_id, address_id, status, subtotal, delivery_fee, total, payment_method, payment_status)
    VALUES (auth.uid(), p_supplier_id, p_address_id, 'placed', v_subtotal, v_delivery_fee, v_subtotal + v_delivery_fee, p_payment_method, 'pending')
    RETURNING id INTO v_order_id;

    INSERT INTO public.order_items (order_id, product_id, quantity, unit_price, total)
    VALUES (v_order_id, p_product_id, p_quantity, v_unit_price, v_subtotal);

    INSERT INTO public.order_status_history (order_id, status, changed_by)
    VALUES (v_order_id, 'placed', auth.uid());

    RETURN v_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
    v_order_date := timezone('Asia/Kolkata', v_order.created_at)::date;

    -- Lock and check capacity
    PERFORM 1 FROM public.supplier_capacity WHERE supplier_id = v_order.supplier_id AND date = v_order_date FOR UPDATE;

    UPDATE public.supplier_capacity
    SET reserved_quantity = reserved_quantity + v_total_quantity
    WHERE supplier_id = v_order.supplier_id AND date = v_order_date
    AND max_capacity >= reserved_quantity + fulfilled_quantity + v_total_quantity;

    IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient capacity'; END IF;

    UPDATE public.orders SET status = 'accepted' WHERE id = p_order_id;
    INSERT INTO public.order_status_history (order_id, status, changed_by) VALUES (p_order_id, 'accepted', auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.reject_order(p_order_id UUID, p_reason TEXT) RETURNS VOID AS $$
DECLARE
    v_order RECORD;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
    IF v_order.status != 'placed' THEN RAISE EXCEPTION 'Order must be in placed status to reject'; END IF;

    UPDATE public.orders SET status = 'rejected', rejection_reason = p_reason WHERE id = p_order_id;
    INSERT INTO public.order_status_history (order_id, status, changed_by, notes) VALUES (p_order_id, 'rejected', auth.uid(), p_reason);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
    v_order_date := timezone('Asia/Kolkata', v_order.created_at)::date;

    IF p_new_status = 'cancelled' AND v_order.status IN ('accepted', 'preparing', 'out_for_delivery') THEN
        UPDATE public.supplier_capacity SET reserved_quantity = reserved_quantity - v_total_quantity WHERE supplier_id = v_order.supplier_id AND date = v_order_date;
    ELSIF p_new_status = 'delivered' AND v_order.status = 'out_for_delivery' THEN
        UPDATE public.supplier_capacity SET reserved_quantity = reserved_quantity - v_total_quantity, fulfilled_quantity = fulfilled_quantity + v_total_quantity WHERE supplier_id = v_order.supplier_id AND date = v_order_date;
    END IF;

    UPDATE public.orders SET status = p_new_status WHERE id = p_order_id;
    INSERT INTO public.order_status_history (order_id, status, changed_by) VALUES (p_order_id, p_new_status, auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.admin_reassign_order(p_order_id UUID, p_new_supplier_id UUID) RETURNS VOID AS $$
DECLARE
    v_order RECORD;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin only'; END IF;

    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
    IF v_order.status != 'placed' THEN RAISE EXCEPTION 'Can only reassign placed orders'; END IF;

    UPDATE public.orders SET supplier_id = p_new_supplier_id WHERE id = p_order_id;
    INSERT INTO public.order_status_history (order_id, status, changed_by, notes) VALUES (p_order_id, 'placed', auth.uid(), 'Admin reassigned supplier');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.set_supplier_capacity(p_date DATE, p_max_capacity INT) RETURNS VOID AS $$
DECLARE
    v_supplier_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    v_supplier_id := public.get_supplier_id();

    IF p_max_capacity < (SELECT COALESCE(reserved_quantity + fulfilled_quantity, 0) FROM public.supplier_capacity WHERE supplier_id = v_supplier_id AND date = p_date) THEN
        RAISE EXCEPTION 'Max capacity cannot be less than already committed capacity';
    END IF;

    INSERT INTO public.supplier_capacity (supplier_id, date, max_capacity)
    VALUES (v_supplier_id, p_date, p_max_capacity)
    ON CONFLICT (supplier_id, date) DO UPDATE SET max_capacity = EXCLUDED.max_capacity;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.update_supplier_profile(
    p_business_name TEXT DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_phone TEXT DEFAULT NULL,
    p_address TEXT DEFAULT NULL,
    p_lat DOUBLE PRECISION DEFAULT NULL,
    p_lng DOUBLE PRECISION DEFAULT NULL,
    p_is_accepting_orders BOOLEAN DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

    UPDATE public.suppliers
    SET
        business_name = COALESCE(p_business_name, business_name),
        description = COALESCE(p_description, description),
        phone = COALESCE(p_phone, phone),
        address = COALESCE(p_address, address),
        lat = COALESCE(p_lat, lat),
        lng = COALESCE(p_lng, lng),
        is_accepting_orders = COALESCE(p_is_accepting_orders, is_accepting_orders)
    WHERE profile_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_available_suppliers(p_lat DOUBLE PRECISION, p_lng DOUBLE PRECISION)
RETURNS TABLE (
    id UUID,
    business_name TEXT,
    distance DOUBLE PRECISION
) AS $$
BEGIN
    RETURN QUERY
    SELECT s.id, s.business_name,
           (6371 * acos(cos(radians(p_lat)) * cos(radians(s.lat)) * cos(radians(s.lng) - radians(p_lng)) + sin(radians(p_lat)) * sin(radians(s.lat)))) AS distance
    FROM public.suppliers s
    WHERE s.is_active = true AND s.is_accepting_orders = true
    AND EXISTS (
        SELECT 1 FROM public.supplier_capacity sc
        WHERE sc.supplier_id = s.id AND sc.date = timezone('Asia/Kolkata', now())::date
        AND (sc.max_capacity - sc.reserved_quantity - sc.fulfilled_quantity) > 0
    )
    ORDER BY distance ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
