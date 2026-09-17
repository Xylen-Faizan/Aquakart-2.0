DROP FUNCTION IF EXISTS public.get_supplier_customers;
DROP FUNCTION IF EXISTS public.get_supplier_today;
DROP FUNCTION IF EXISTS public.get_today_manifest;
DROP FUNCTION IF EXISTS public.get_supplier_inventory_stats;
DROP FUNCTION IF EXISTS public.get_jar_activity;
DROP FUNCTION IF EXISTS public.get_customer_ledger;-- Migration: 036_phase3_supplier_os_operational
-- Description: RPCs for Supplier OS UI Integration

-- ==========================================
-- 1. Customer CRM RPCs
-- ==========================================

CREATE OR REPLACE FUNCTION public.get_supplier_customers(
    p_search TEXT DEFAULT NULL,
    p_customer_type public.customer_type_enum DEFAULT NULL,
    p_limit INT DEFAULT 50,
    p_offset INT DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    name TEXT,
    phone TEXT,
    customer_type public.customer_type_enum,
    address TEXT,
    sector TEXT,
    is_active BOOLEAN,
    active_price NUMERIC,
    jar_balance INT,
    next_due_date DATE,
    outstanding_balance NUMERIC,
    last_delivery_at TIMESTAMPTZ,
    schedule_active BOOLEAN,
    schedule_quantity INT,
    schedule_interval INT
) AS $$
DECLARE
    v_supplier_id UUID;
BEGIN
    v_supplier_id := public.get_supplier_id();

    RETURN QUERY
    SELECT 
        c.id,
        c.name,
        c.phone,
        c.customer_type,
        c.address,
        c.sector,
        c.is_active,
        cp.price AS active_price,
        COALESCE(jb.jars_with_customer, 0) AS jar_balance,
        s.next_delivery_date AS next_due_date,
        (
            -- Deliveries cost money (increase outstanding)
            COALESCE((SELECT SUM(total_amount) FROM public.deliveries d WHERE d.supplier_customer_id = c.id), 0)
            - 
            -- Payments reduce outstanding
            COALESCE((SELECT SUM(amount) FROM public.payments p WHERE p.supplier_customer_id = c.id), 0)
        ) AS outstanding_balance,
        (
            SELECT MAX(created_at) FROM public.deliveries d WHERE d.supplier_customer_id = c.id
        ) AS last_delivery_at,
        s.is_active AS schedule_active,
        s.quantity AS schedule_quantity,
        s.interval_days AS schedule_interval
    FROM public.supplier_customers c
    LEFT JOIN public.customer_product_prices cp ON cp.supplier_customer_id = c.id AND (cp.effective_until IS NULL OR cp.effective_until > NOW())
    LEFT JOIN public.customer_jar_balances jb ON jb.supplier_customer_id = c.id
    LEFT JOIN public.customer_delivery_schedules s ON s.supplier_customer_id = c.id
    WHERE c.supplier_id = v_supplier_id
      AND (p_search IS NULL OR c.name ILIKE '%' || p_search || '%' OR c.phone ILIKE '%' || p_search || '%')
      AND (p_customer_type IS NULL OR c.customer_type = p_customer_type)
    ORDER BY c.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION public.create_supplier_customer(
    p_name TEXT,
    p_phone TEXT,
    p_customer_type public.customer_type_enum DEFAULT 'household',
    p_address TEXT DEFAULT NULL,
    p_sector TEXT DEFAULT NULL,
    p_landmark TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_supplier_id UUID;
    v_customer_id UUID;
BEGIN
    v_supplier_id := public.get_supplier_id();
    
    INSERT INTO public.supplier_customers (
        supplier_id, name, phone, normalized_phone, customer_type, address, sector, landmark, notes
    ) VALUES (
        v_supplier_id, p_name, p_phone, p_phone, p_customer_type, p_address, p_sector, p_landmark, p_notes
    ) RETURNING id INTO v_customer_id;
    
    RETURN v_customer_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION public.set_customer_price(
    p_customer_id UUID,
    p_supplier_product_id UUID,
    p_price NUMERIC
) RETURNS VOID AS $$
DECLARE
    v_supplier_id UUID;
    v_customer_supplier_id UUID;
BEGIN
    v_supplier_id := public.get_supplier_id();
    
    SELECT supplier_id INTO v_customer_supplier_id FROM public.supplier_customers WHERE id = p_customer_id;
    IF v_customer_supplier_id != v_supplier_id THEN RAISE EXCEPTION 'Unauthorized'; END IF;

    -- Deactivate old prices for this product
    UPDATE public.customer_product_prices 
    SET effective_until = NOW(), updated_at = NOW()
    WHERE supplier_customer_id = p_customer_id AND supplier_product_id = p_supplier_product_id AND (effective_until IS NULL OR effective_until > NOW());

    -- Insert new active price
    INSERT INTO public.customer_product_prices (
        supplier_customer_id, supplier_product_id, price, effective_from
    ) VALUES (
        p_customer_id, p_supplier_product_id, p_price, NOW()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION public.create_delivery_schedule(
    p_customer_id UUID,
    p_supplier_product_id UUID,
    p_quantity INT,
    p_interval_days INT,
    p_first_delivery_date DATE
) RETURNS VOID AS $$
DECLARE
    v_supplier_id UUID;
    v_customer_supplier_id UUID;
BEGIN
    v_supplier_id := public.get_supplier_id();
    
    SELECT supplier_id INTO v_customer_supplier_id FROM public.supplier_customers WHERE id = p_customer_id;
    IF v_customer_supplier_id != v_supplier_id THEN RAISE EXCEPTION 'Unauthorized'; END IF;

    -- Upsert schedule
    IF EXISTS (SELECT 1 FROM public.customer_delivery_schedules WHERE supplier_customer_id = p_customer_id AND supplier_product_id = p_supplier_product_id) THEN
        UPDATE public.customer_delivery_schedules 
        SET quantity = p_quantity,
            interval_days = p_interval_days,
            next_delivery_date = p_first_delivery_date,
            is_active = true,
            updated_at = NOW()
        WHERE supplier_customer_id = p_customer_id AND supplier_product_id = p_supplier_product_id;
    ELSE
        INSERT INTO public.customer_delivery_schedules (
            supplier_customer_id, supplier_product_id, quantity, interval_days, next_delivery_date, is_active
        ) VALUES (
            p_customer_id, p_supplier_product_id, p_quantity, p_interval_days, p_first_delivery_date, true
        );
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION public.set_delivery_schedule_status(
    p_customer_id UUID,
    p_supplier_product_id UUID,
    p_is_active BOOLEAN
) RETURNS VOID AS $$
DECLARE
    v_supplier_id UUID;
    v_customer_supplier_id UUID;
BEGIN
    v_supplier_id := public.get_supplier_id();
    
    SELECT supplier_id INTO v_customer_supplier_id FROM public.supplier_customers WHERE id = p_customer_id;
    IF v_customer_supplier_id != v_supplier_id THEN RAISE EXCEPTION 'Unauthorized'; END IF;

    UPDATE public.customer_delivery_schedules 
    SET is_active = p_is_active, updated_at = NOW()
    WHERE supplier_customer_id = p_customer_id AND supplier_product_id = p_supplier_product_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- ==========================================
-- 2. Dashboard RPCs
-- ==========================================

CREATE OR REPLACE FUNCTION public.get_supplier_today()
RETURNS TABLE (
    deliveries_due INT,
    jars_required INT,
    expected_revenue NUMERIC,
    deliveries_done INT,
    billed_today NUMERIC,
    collected_today NUMERIC,
    outstanding_total NUMERIC
) AS $$
DECLARE
    v_supplier_id UUID;
BEGIN
    v_supplier_id := public.get_supplier_id();

    RETURN QUERY
    WITH due_schedules AS (
        SELECT 
            s.quantity,
            COALESCE(cp.price, sp.price) AS price
        FROM public.customer_delivery_schedules s
        JOIN public.supplier_customers c ON c.id = s.supplier_customer_id
        JOIN public.supplier_products sp ON sp.id = s.supplier_product_id
        LEFT JOIN public.customer_product_prices cp ON cp.supplier_customer_id = c.id AND (cp.effective_until IS NULL OR cp.effective_until > NOW())
        WHERE c.supplier_id = v_supplier_id 
          AND s.is_active = true 
          AND s.next_delivery_date <= CURRENT_DATE
    ),
    todays_deliveries AS (
        SELECT 
            di.quantity, 
            di.total_price AS total_amount
        FROM public.delivery_items di
        JOIN public.deliveries d ON d.id = di.delivery_id
        WHERE d.supplier_id = v_supplier_id 
          AND DATE(d.created_at) = CURRENT_DATE
    ),
    todays_collections AS (
        SELECT amount 
        FROM public.payments p
        JOIN public.supplier_customers c ON c.id = p.supplier_customer_id
        WHERE c.supplier_id = v_supplier_id 
          AND DATE(p.created_at) = CURRENT_DATE
    ),
    all_time_totals AS (
        SELECT 
            COALESCE((SELECT SUM(total_amount) FROM public.deliveries d JOIN public.supplier_customers c ON c.id = d.supplier_customer_id WHERE c.supplier_id = v_supplier_id), 0) AS total_billed,
            COALESCE((SELECT SUM(amount) FROM public.payments p JOIN public.supplier_customers c ON c.id = p.supplier_customer_id WHERE c.supplier_id = v_supplier_id), 0) AS total_collected
    )
    SELECT 
        (SELECT COUNT(*)::INT FROM due_schedules) AS deliveries_due,
        (SELECT COALESCE(SUM(quantity), 0)::INT FROM due_schedules) AS jars_required,
        (SELECT COALESCE(SUM(quantity * price), 0)::NUMERIC FROM due_schedules) AS expected_revenue,
        (SELECT COUNT(*)::INT FROM todays_deliveries) AS deliveries_done,
        (SELECT COALESCE(SUM(total_amount), 0)::NUMERIC FROM todays_deliveries) AS billed_today,
        (SELECT COALESCE(SUM(amount), 0)::NUMERIC FROM todays_collections) AS collected_today,
        (SELECT total_billed - total_collected FROM all_time_totals) AS outstanding_total;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION public.get_today_manifest()
RETURNS TABLE (
    customer_id UUID,
    customer_name TEXT,
    customer_type public.customer_type_enum,
    phone TEXT,
    address TEXT,
    sector TEXT,
    supplier_product_id UUID,
    quantity INT,
    effective_unit_price NUMERIC,
    expected_amount NUMERIC,
    jar_balance_before INT,
    next_delivery_date DATE
) AS $$
DECLARE
    v_supplier_id UUID;
BEGIN
    v_supplier_id := public.get_supplier_id();

    RETURN QUERY
    SELECT 
        c.id AS customer_id,
        c.name AS customer_name,
        c.customer_type,
        c.phone,
        c.address,
        c.sector,
        s.supplier_product_id,
        s.quantity,
        COALESCE(cp.price, sp.price) AS effective_unit_price,
        (s.quantity * COALESCE(cp.price, sp.price)) AS expected_amount,
        COALESCE(jb.jars_with_customer, 0) AS jar_balance_before,
        s.next_delivery_date
    FROM public.customer_delivery_schedules s
    JOIN public.supplier_customers c ON c.id = s.supplier_customer_id
    JOIN public.supplier_products sp ON sp.id = s.supplier_product_id
    LEFT JOIN public.customer_product_prices cp ON cp.supplier_customer_id = c.id AND (cp.effective_until IS NULL OR cp.effective_until > NOW())
    LEFT JOIN public.customer_jar_balances jb ON jb.supplier_customer_id = c.id
    WHERE c.supplier_id = v_supplier_id 
      AND s.is_active = true 
      AND s.next_delivery_date <= CURRENT_DATE
    ORDER BY c.sector, c.name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==========================================
-- 3. Inventory RPCs
-- ==========================================

CREATE OR REPLACE FUNCTION public.get_supplier_inventory_stats()
RETURNS TABLE (
    owned INT,
    available INT,
    with_customers INT,
    damaged INT,
    missing INT
) AS $$
DECLARE
    v_supplier_id UUID;
BEGIN
    v_supplier_id := public.get_supplier_id();

    RETURN QUERY
    SELECT 
        COALESCE(i.owned, 0) AS owned,
        COALESCE(i.available, 0) AS available,
        COALESCE(
            (SELECT SUM(jb.jars_with_customer) 
             FROM public.customer_jar_balances jb 
             JOIN public.supplier_customers c ON c.id = jb.supplier_customer_id 
             WHERE c.supplier_id = v_supplier_id), 0
        )::INT AS with_customers,
        COALESCE(i.damaged, 0) AS damaged,
        COALESCE(i.missing, 0) AS missing
    FROM public.supplier_inventory i
    WHERE i.supplier_id = v_supplier_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION public.get_jar_activity(p_limit INT DEFAULT 20)
RETURNS TABLE (
    id UUID,
    customer_name TEXT,
    jars_delivered INT,
    jars_returned INT,
    created_at TIMESTAMPTZ
) AS $$
DECLARE
    v_supplier_id UUID;
BEGIN
    v_supplier_id := public.get_supplier_id();

    RETURN QUERY
    SELECT 
        jt.id,
        c.name AS customer_name,
        CASE WHEN jt.transaction_type = 'delivered_to_customer' THEN jt.quantity ELSE 0 END AS jars_delivered,
        CASE WHEN jt.transaction_type = 'returned_by_customer' THEN jt.quantity ELSE 0 END AS jars_returned,
        jt.created_at
    FROM public.jar_transactions jt
    JOIN public.supplier_customers c ON c.id = jt.supplier_customer_id
    WHERE c.supplier_id = v_supplier_id
      AND jt.transaction_type IN ('delivered_to_customer', 'returned_by_customer')
    ORDER BY jt.created_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION public.record_inventory_purchase(
    p_quantity INT,
    p_unit_price NUMERIC DEFAULT 0
) RETURNS VOID AS $$
DECLARE
    v_supplier_id UUID;
BEGIN
    v_supplier_id := public.get_supplier_id();
    
    INSERT INTO public.supplier_inventory (supplier_id, owned, available)
    VALUES (v_supplier_id, p_quantity, p_quantity)
    ON CONFLICT (supplier_id) 
    DO UPDATE SET 
        owned = public.supplier_inventory.owned + p_quantity,
        available = public.supplier_inventory.available + p_quantity,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==========================================
-- 4. Ledger RPCs
-- ==========================================

CREATE OR REPLACE FUNCTION public.get_customer_ledger(p_customer_id UUID)
RETURNS JSON AS $$
DECLARE
    v_supplier_id UUID;
    v_customer_supplier_id UUID;
    v_outstanding NUMERIC;
    v_entries JSON;
BEGIN
    v_supplier_id := public.get_supplier_id();
    
    SELECT supplier_id INTO v_customer_supplier_id FROM public.supplier_customers WHERE id = p_customer_id;
    IF v_customer_supplier_id != v_supplier_id THEN RAISE EXCEPTION 'Unauthorized'; END IF;

    -- Calculate outstanding
    SELECT 
        COALESCE((SELECT SUM(total_amount) FROM public.deliveries WHERE supplier_customer_id = p_customer_id), 0)
        - 
        COALESCE((SELECT SUM(amount) FROM public.payments WHERE supplier_customer_id = p_customer_id), 0)
    INTO v_outstanding;

    -- Get entries (combining deliveries and payments)
    WITH combined_entries AS (
        SELECT 
            id,
            'delivery' AS reference_type,
            'debit' AS entry_type,
            total_amount AS amount,
            created_at
        FROM public.deliveries 
        WHERE supplier_customer_id = p_customer_id

        UNION ALL

        SELECT 
            id,
            'payment' AS reference_type,
            'credit' AS entry_type,
            amount,
            created_at
        FROM public.payments
        WHERE supplier_customer_id = p_customer_id
    )
    SELECT json_agg(row_to_json(e)) INTO v_entries
    FROM (
        SELECT * FROM combined_entries ORDER BY created_at DESC LIMIT 100
    ) e;

    RETURN json_build_object(
        'outstanding_balance', v_outstanding,
        'entries', COALESCE(v_entries, '[]'::json)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION public.record_ledger_payment(
    p_customer_id UUID,
    p_amount NUMERIC,
    p_payment_method TEXT DEFAULT 'cash'
) RETURNS VOID AS $$
DECLARE
    v_supplier_id UUID;
    v_customer_supplier_id UUID;
BEGIN
    v_supplier_id := public.get_supplier_id();
    
    SELECT supplier_id INTO v_customer_supplier_id FROM public.supplier_customers WHERE id = p_customer_id;
    IF v_customer_supplier_id != v_supplier_id THEN RAISE EXCEPTION 'Unauthorized'; END IF;

    INSERT INTO public.payments (
        supplier_customer_id, amount, payment_method, status
    ) VALUES (
        p_customer_id, p_amount, p_payment_method::public.payment_method_enum, 'completed'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ==========================================
-- 5. Update complete_delivery with idempotency key
-- ==========================================

DROP FUNCTION IF EXISTS public.complete_delivery(UUID, UUID, INTEGER, NUMERIC, INTEGER, INTEGER, NUMERIC, TEXT);
DROP FUNCTION IF EXISTS public.complete_delivery(UUID, UUID, INTEGER, NUMERIC, INTEGER, INTEGER, NUMERIC, TEXT, UUID);

CREATE OR REPLACE FUNCTION public.complete_delivery(
    p_customer_id UUID,
    p_supplier_product_id UUID,
    p_quantity INTEGER,
    p_price NUMERIC,
    p_jars_delivered INTEGER,
    p_jars_returned INTEGER,
    p_amount_collected NUMERIC,
    p_payment_method TEXT,
    p_idempotency_key UUID DEFAULT NULL
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

    -- 1. Create Delivery Record
    INSERT INTO public.deliveries (
        supplier_id, supplier_customer_id, status, delivery_date, total_amount
    ) VALUES (
        v_supplier_id, p_customer_id, 'delivered', CURRENT_DATE, v_total_amount
    ) RETURNING id INTO v_delivery_id;

    INSERT INTO public.delivery_items (
        delivery_id, supplier_product_id, quantity, unit_price, total_price
    ) VALUES (
        v_delivery_id, p_supplier_product_id, p_quantity, p_price, v_total_amount
    );

    -- 2. Process Jars Delivered
    IF p_jars_delivered > 0 THEN
        INSERT INTO public.jar_transactions (
            supplier_customer_id, transaction_type, quantity, delivery_id, jars_delivered, jars_returned
        ) VALUES (
            p_customer_id, 'delivered_to_customer', p_jars_delivered, v_delivery_id, p_jars_delivered, 0
        );
        
        -- Update Inventory
        UPDATE public.supplier_inventory 
        SET available = available - p_jars_delivered, updated_at = NOW()
        WHERE supplier_id = v_supplier_id;
    END IF;

    -- 3. Process Jars Returned
    IF p_jars_returned > 0 THEN
        INSERT INTO public.jar_transactions (
            supplier_customer_id, transaction_type, quantity, delivery_id, jars_delivered, jars_returned
        ) VALUES (
            p_customer_id, 'returned_by_customer', p_jars_returned, v_delivery_id, 0, p_jars_returned
        );
        
        -- Update Inventory
        UPDATE public.supplier_inventory 
        SET available = available + p_jars_returned, updated_at = NOW()
        WHERE supplier_id = v_supplier_id;
    END IF;

    -- Update Customer Jar Balance
    INSERT INTO public.customer_jar_balances (supplier_customer_id, jars_with_customer)
    VALUES (p_customer_id, p_jars_delivered - p_jars_returned)
    ON CONFLICT (supplier_customer_id) 
    DO UPDATE SET 
        jars_with_customer = public.customer_jar_balances.jars_with_customer + p_jars_delivered - p_jars_returned,
        updated_at = NOW();

    -- 4. Process Payment Collection
    IF p_amount_collected > 0 THEN
        INSERT INTO public.payments (
            supplier_id, supplier_customer_id, delivery_id, amount, payment_method
        ) VALUES (
            v_supplier_id, p_customer_id, v_delivery_id, p_amount_collected, p_payment_method
        );
    END IF;

    -- 5. Update Schedule (push next delivery date if applicable)
    UPDATE public.customer_delivery_schedules
    SET next_delivery_date = CURRENT_DATE + interval_days
    WHERE supplier_customer_id = p_customer_id AND supplier_product_id = p_supplier_product_id;

    RETURN v_delivery_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;



