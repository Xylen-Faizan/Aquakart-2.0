-- 020_supplier_os_rpc.sql

-- 1. Create Supplier Customer
CREATE OR REPLACE FUNCTION public.create_supplier_customer(
    p_name TEXT,
    p_phone TEXT,
    p_normalized_phone TEXT,
    p_customer_type public.customer_type_enum,
    p_address TEXT,
    p_sector TEXT
) RETURNS UUID AS $$
DECLARE
    v_supplier_id UUID;
    v_customer_id UUID;
BEGIN
    v_supplier_id := public.get_supplier_id();
    IF v_supplier_id IS NULL THEN RAISE EXCEPTION 'Not a supplier'; END IF;

    INSERT INTO public.supplier_customers (
        supplier_id, name, phone, normalized_phone, customer_type, address, sector
    ) VALUES (
        v_supplier_id, p_name, p_phone, p_normalized_phone, p_customer_type, p_address, p_sector
    ) RETURNING id INTO v_customer_id;

    -- Initialize jar balance to 0
    INSERT INTO public.customer_jar_balances (supplier_customer_id, jars_with_customer)
    VALUES (v_customer_id, 0);

    RETURN v_customer_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Set Customer Price
CREATE OR REPLACE FUNCTION public.set_customer_price(
    p_customer_id UUID,
    p_supplier_product_id UUID,
    p_price NUMERIC(10,2)
) RETURNS VOID AS $$
DECLARE
    v_supplier_id UUID;
    v_customer_supplier_id UUID;
BEGIN
    v_supplier_id := public.get_supplier_id();
    
    -- Verify ownership
    SELECT supplier_id INTO v_customer_supplier_id FROM public.supplier_customers WHERE id = p_customer_id;
    IF v_customer_supplier_id != v_supplier_id THEN RAISE EXCEPTION 'Unauthorized'; END IF;

    -- Expire current active price
    UPDATE public.customer_product_prices
    SET effective_until = NOW()
    WHERE supplier_customer_id = p_customer_id 
    AND supplier_product_id = p_supplier_product_id 
    AND effective_until IS NULL;

    -- Insert new price
    INSERT INTO public.customer_product_prices (supplier_customer_id, supplier_product_id, price)
    VALUES (p_customer_id, p_supplier_product_id, p_price);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Create Delivery Schedule
CREATE OR REPLACE FUNCTION public.create_delivery_schedule(
    p_customer_id UUID,
    p_supplier_product_id UUID,
    p_quantity INTEGER,
    p_interval_days INTEGER,
    p_first_delivery_date DATE
) RETURNS VOID AS $$
DECLARE
    v_supplier_id UUID;
    v_customer_supplier_id UUID;
BEGIN
    v_supplier_id := public.get_supplier_id();
    
    -- Verify ownership
    SELECT supplier_id INTO v_customer_supplier_id FROM public.supplier_customers WHERE id = p_customer_id;
    IF v_customer_supplier_id != v_supplier_id THEN RAISE EXCEPTION 'Unauthorized'; END IF;

    -- Inactivate existing schedules for this product
    UPDATE public.customer_delivery_schedules
    SET is_active = false
    WHERE supplier_customer_id = p_customer_id 
    AND supplier_product_id = p_supplier_product_id
    AND is_active = true;

    -- Insert new schedule
    INSERT INTO public.customer_delivery_schedules (supplier_customer_id, supplier_product_id, quantity, interval_days, next_delivery_date)
    VALUES (p_customer_id, p_supplier_product_id, p_quantity, p_interval_days, p_first_delivery_date);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Complete Delivery
CREATE OR REPLACE FUNCTION public.complete_delivery(
    p_customer_id UUID,
    p_supplier_product_id UUID,
    p_quantity INTEGER,
    p_price NUMERIC(10,2),
    p_jars_delivered INTEGER,
    p_jars_returned INTEGER,
    p_amount_collected NUMERIC(10,2),
    p_payment_method TEXT
) RETURNS UUID AS $$
DECLARE
    v_supplier_id UUID;
    v_customer_supplier_id UUID;
    v_delivery_id UUID;
    v_total_amount NUMERIC(10,2);
BEGIN
    v_supplier_id := public.get_supplier_id();
    
    -- Verify ownership
    SELECT supplier_id INTO v_customer_supplier_id FROM public.supplier_customers WHERE id = p_customer_id;
    IF v_customer_supplier_id != v_supplier_id THEN RAISE EXCEPTION 'Unauthorized'; END IF;

    v_total_amount := p_quantity * p_price;

    -- 1. Create Delivery
    INSERT INTO public.deliveries (supplier_id, supplier_customer_id, status, delivery_date, total_amount)
    VALUES (v_supplier_id, p_customer_id, 'delivered', CURRENT_DATE, v_total_amount)
    RETURNING id INTO v_delivery_id;

    -- 2. Create Delivery Item
    INSERT INTO public.delivery_items (delivery_id, supplier_product_id, quantity, unit_price, total_price)
    VALUES (v_delivery_id, p_supplier_product_id, p_quantity, p_price, v_total_amount);

    -- 3. Record Jar Transaction & Update Balance
    IF p_jars_delivered > 0 OR p_jars_returned > 0 THEN
        INSERT INTO public.jar_transactions (supplier_customer_id, delivery_id, jars_delivered, jars_returned)
        VALUES (p_customer_id, v_delivery_id, p_jars_delivered, p_jars_returned);
        
        UPDATE public.customer_jar_balances
        SET jars_with_customer = jars_with_customer + p_jars_delivered - p_jars_returned
        WHERE supplier_customer_id = p_customer_id;
    END IF;

    -- 4. Record Payment
    IF p_amount_collected > 0 THEN
        INSERT INTO public.payments (supplier_id, supplier_customer_id, delivery_id, amount, payment_method)
        VALUES (v_supplier_id, p_customer_id, v_delivery_id, p_amount_collected, p_payment_method);
    END IF;

    -- 5. Calculate Next Delivery Date
    UPDATE public.customer_delivery_schedules
    SET next_delivery_date = CURRENT_DATE + interval_days
    WHERE supplier_customer_id = p_customer_id 
    AND supplier_product_id = p_supplier_product_id
    AND is_active = true;

    RETURN v_delivery_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Get Supplier Today View
CREATE OR REPLACE FUNCTION public.get_supplier_today()
RETURNS JSON AS $$
DECLARE
    v_supplier_id UUID;
    v_result JSON;
    v_deliveries_due INTEGER;
    v_deliveries_done INTEGER;
    v_jars_with_customers INTEGER;
    v_revenue NUMERIC;
    v_collected NUMERIC;
BEGIN
    v_supplier_id := public.get_supplier_id();
    IF v_supplier_id IS NULL THEN RAISE EXCEPTION 'Not a supplier'; END IF;

    -- Deliveries Due (from schedules)
    SELECT COUNT(*) INTO v_deliveries_due
    FROM public.customer_delivery_schedules cds
    JOIN public.supplier_customers sc ON cds.supplier_customer_id = sc.id
    WHERE sc.supplier_id = v_supplier_id AND cds.is_active = true AND cds.next_delivery_date <= CURRENT_DATE;

    -- Deliveries Done Today
    SELECT COUNT(*) INTO v_deliveries_done
    FROM public.deliveries
    WHERE supplier_id = v_supplier_id AND delivery_date = CURRENT_DATE AND status = 'delivered';

    -- Jars with Customers
    SELECT COALESCE(SUM(cjb.jars_with_customer), 0) INTO v_jars_with_customers
    FROM public.customer_jar_balances cjb
    JOIN public.supplier_customers sc ON cjb.supplier_customer_id = sc.id
    WHERE sc.supplier_id = v_supplier_id;

    -- Revenue (Billed Today)
    SELECT COALESCE(SUM(total_amount), 0) INTO v_revenue
    FROM public.deliveries
    WHERE supplier_id = v_supplier_id AND delivery_date = CURRENT_DATE;

    -- Collected Today
    SELECT COALESCE(SUM(amount), 0) INTO v_collected
    FROM public.payments
    WHERE supplier_id = v_supplier_id AND DATE(payment_date) = CURRENT_DATE;

    v_result := json_build_object(
        'deliveries_due', v_deliveries_due,
        'deliveries_done', v_deliveries_done,
        'jars_with_customers', v_jars_with_customers,
        'revenue_today', v_revenue,
        'collected_today', v_collected,
        'outstanding_today', (v_revenue - v_collected)
    );

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
