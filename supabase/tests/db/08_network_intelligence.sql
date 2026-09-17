-- 08_network_intelligence.sql
BEGIN;

-- 1. Test get_supplier_forecast
DO $$
DECLARE
    v_supplier_id UUID;
    v_forecast RECORD;
BEGIN
    SELECT id INTO v_supplier_id FROM public.suppliers WHERE business_name = 'Pure Jal' LIMIT 1;
    
    -- Mock authentication
    PERFORM set_config('request.jwt.claims', format('{"sub": "%s", "role": "authenticated"}', (SELECT profile_id FROM public.suppliers WHERE id = v_supplier_id)), true);

    -- Force inventory low to trigger risk
    UPDATE public.supplier_inventory SET available = 5 WHERE supplier_id = v_supplier_id;

    -- Add a dummy schedule for tomorrow
    INSERT INTO public.customer_delivery_schedules (supplier_customer_id, supplier_product_id, quantity, interval_days, next_delivery_date, is_active)
    VALUES (
        (SELECT id FROM public.supplier_customers WHERE supplier_id = v_supplier_id LIMIT 1),
        (SELECT id FROM public.supplier_products WHERE supplier_id = v_supplier_id LIMIT 1),
        20,
        1,
        CURRENT_DATE + INTERVAL '1 day',
        true
    );

    SELECT * INTO v_forecast FROM public.get_supplier_forecast(v_supplier_id);
    
    IF v_forecast.shortfall <= 0 THEN RAISE EXCEPTION 'Forecast failed to detect shortfall'; END IF;
    IF v_forecast.is_at_risk != true THEN RAISE EXCEPTION 'Forecast failed to flag as at risk'; END IF;
END $$;


-- 2. Test get_network_health_risks
DO $$
DECLARE
    v_count INT;
BEGIN
    -- Mock admin
    PERFORM set_config('request.jwt.claims', '{"role": "authenticated"}', true);
    PERFORM set_config('request.jwt.claims', format('{"sub": "%s", "role": "authenticated"}', (SELECT id FROM public.profiles WHERE email = 'admin@bokarowater.com')), true);
    
    SELECT count(*) INTO v_count FROM public.get_network_health_risks();
    IF v_count = 0 THEN RAISE EXCEPTION 'Admin failed to see at risk supplier'; END IF;
END $$;

-- 3. Test Routing Penalty
DO $$
DECLARE
    v_supplier_id UUID;
    v_distance_before DOUBLE PRECISION;
    v_distance_after DOUBLE PRECISION;
BEGIN
    SELECT id INTO v_supplier_id FROM public.suppliers WHERE business_name = 'Pure Jal' LIMIT 1;
    
    -- Ensure capacity is high
    UPDATE public.supplier_capacity SET max_capacity = 100, reserved_quantity = 0, fulfilled_quantity = 0 WHERE supplier_id = v_supplier_id AND date = timezone('Asia/Kolkata', now())::date;
    
    -- Get baseline distance
    SELECT distance INTO v_distance_before FROM public.get_available_suppliers(23.6693, 86.1511) WHERE id = v_supplier_id;

    -- Drop capacity below 10%
    UPDATE public.supplier_capacity SET max_capacity = 100, reserved_quantity = 95, fulfilled_quantity = 0 WHERE supplier_id = v_supplier_id AND date = timezone('Asia/Kolkata', now())::date;

    -- Get penalized distance
    SELECT distance INTO v_distance_after FROM public.get_available_suppliers(23.6693, 86.1511) WHERE id = v_supplier_id;

    IF v_distance_after <= v_distance_before THEN RAISE EXCEPTION 'Routing penalty was not applied when capacity dropped below 10%%'; END IF;
    IF ABS((v_distance_after - v_distance_before) - 5.0) > 0.01 THEN RAISE EXCEPTION 'Routing penalty was not exactly +5km'; END IF;
END $$;

ROLLBACK;
