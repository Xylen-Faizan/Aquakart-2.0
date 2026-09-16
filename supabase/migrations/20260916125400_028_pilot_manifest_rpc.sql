-- 028_pilot_manifest_rpc.sql

-- 1. Refined Get Supplier Today
-- Returns deterministic aggregates required for the operational dashboard
CREATE OR REPLACE FUNCTION public.get_supplier_today()
RETURNS JSON AS $$
DECLARE
    v_supplier_id UUID;
    v_result JSON;
    v_deliveries_due INTEGER := 0;
    v_jars_required INTEGER := 0;
    v_expected_revenue NUMERIC(10,2) := 0;
    v_deliveries_done INTEGER := 0;
    v_billed_today NUMERIC(10,2) := 0;
    v_collected_today NUMERIC(10,2) := 0;
    v_outstanding_total NUMERIC(10,2) := 0;
BEGIN
    v_supplier_id := public.get_supplier_id();
    IF v_supplier_id IS NULL THEN RAISE EXCEPTION 'Not a supplier'; END IF;

    -- Calculate due metrics (Expected Revenue uses effective price)
    SELECT 
        COUNT(*),
        COALESCE(SUM(cds.quantity), 0),
        COALESCE(SUM(cds.quantity * public.get_effective_customer_price(sc.id, cds.supplier_product_id)), 0)
    INTO v_deliveries_due, v_jars_required, v_expected_revenue
    FROM public.customer_delivery_schedules cds
    JOIN public.supplier_customers sc ON cds.supplier_customer_id = sc.id
    WHERE sc.supplier_id = v_supplier_id 
    AND cds.is_active = true 
    AND cds.next_delivery_date <= CURRENT_DATE;

    -- Calculate completed deliveries today
    SELECT COUNT(*), COALESCE(SUM(total_amount), 0)
    INTO v_deliveries_done, v_billed_today
    FROM public.deliveries
    WHERE supplier_id = v_supplier_id AND delivery_date = CURRENT_DATE AND status = 'delivered';

    -- Collected Today
    SELECT COALESCE(SUM(amount), 0) INTO v_collected_today
    FROM public.payments
    WHERE supplier_id = v_supplier_id AND DATE(payment_date) = CURRENT_DATE;

    -- Outstanding Total (using the ledger)
    SELECT (
        COALESCE(SUM(CASE WHEN entry_type = 'debit' THEN amount ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN entry_type = 'credit' THEN amount ELSE 0 END), 0)
    ) INTO v_outstanding_total
    FROM public.customer_ledger_entries
    WHERE supplier_id = v_supplier_id;

    v_result := json_build_object(
        'deliveries_due', v_deliveries_due,
        'jars_required', v_jars_required,
        'expected_revenue', v_expected_revenue,
        'deliveries_done', v_deliveries_done,
        'billed_today', v_billed_today,
        'collected_today', v_collected_today,
        'outstanding_total', v_outstanding_total
    );

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Get Today Manifest
-- Returns flat, UI-ready data for today's deliveries
CREATE OR REPLACE FUNCTION public.get_today_manifest()
RETURNS JSON AS $$
DECLARE
    v_supplier_id UUID;
    v_result JSON;
BEGIN
    v_supplier_id := public.get_supplier_id();
    IF v_supplier_id IS NULL THEN RAISE EXCEPTION 'Not a supplier'; END IF;

    SELECT json_agg(manifest_row)
    INTO v_result
    FROM (
        SELECT 
            sc.id AS customer_id,
            sc.name AS customer_name,
            sc.customer_type,
            sc.phone,
            sc.address,
            sc.sector,
            cds.supplier_product_id,
            cds.quantity,
            public.get_effective_customer_price(sc.id, cds.supplier_product_id) AS effective_unit_price,
            (cds.quantity * public.get_effective_customer_price(sc.id, cds.supplier_product_id)) AS expected_amount,
            COALESCE(cjb.jars_with_customer, 0) AS jar_balance_before,
            cds.next_delivery_date
        FROM public.customer_delivery_schedules cds
        JOIN public.supplier_customers sc ON cds.supplier_customer_id = sc.id
        LEFT JOIN public.customer_jar_balances cjb ON cjb.supplier_customer_id = sc.id
        WHERE sc.supplier_id = v_supplier_id 
        AND cds.is_active = true 
        AND cds.next_delivery_date <= CURRENT_DATE
        -- Exclude customers who already received a delivery today for this product
        AND NOT EXISTS (
            SELECT 1 FROM public.deliveries d
            JOIN public.delivery_items di ON d.id = di.delivery_id
            WHERE d.supplier_customer_id = sc.id 
            AND d.delivery_date = CURRENT_DATE 
            AND d.status = 'delivered'
            AND di.supplier_product_id = cds.supplier_product_id
        )
        ORDER BY sc.sector, sc.name
    ) manifest_row;

    RETURN COALESCE(v_result, '[]'::json);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
