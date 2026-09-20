-- 079_fix_customer_dashboard_rpc.sql

-- 1. Get active supplier info for a customer
CREATE OR REPLACE FUNCTION public.get_customer_subscription_status()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_profile_id UUID;
    v_result JSON;
BEGIN
    v_profile_id := auth.uid();
    IF v_profile_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

    -- Look for an active supplier_customers record
    SELECT json_build_object(
        'supplier_customer_id', sc.id,
        'supplier_id', s.id,
        'business_name', s.business_name,
        'business_phone', s.phone,
        'jar_balance', COALESCE(cjb.jars_with_customer, 0),
        'outstanding_balance', COALESCE(
            (SELECT SUM(CASE WHEN entry_type = 'debit' THEN amount ELSE -amount END)
             FROM public.customer_ledger_entries cle
             WHERE cle.supplier_customer_id = sc.id), 
            0
        )
    ) INTO v_result
    FROM public.supplier_customers sc
    JOIN public.suppliers s ON sc.supplier_id = s.id
    LEFT JOIN public.customer_jar_balances cjb ON sc.id = cjb.supplier_customer_id
    WHERE sc.user_id = v_profile_id
    AND sc.is_active = true
    ORDER BY sc.created_at DESC
    LIMIT 1;

    RETURN v_result; -- Returns null if no active subscription found
END;
$$;

-- 2. Get Monthly Ledger
CREATE OR REPLACE FUNCTION public.get_customer_monthly_ledger(
    p_month INTEGER,
    p_year INTEGER
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_profile_id UUID;
    v_supplier_customer_id UUID;
    v_result JSON;
    v_jars_consumed INTEGER;
    v_bill_generated NUMERIC(10,2);
    v_amount_paid NUMERIC(10,2);
    v_start_date DATE;
    v_end_date DATE;
BEGIN
    v_profile_id := auth.uid();
    IF v_profile_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

    -- Get the supplier_customer_id
    SELECT id INTO v_supplier_customer_id
    FROM public.supplier_customers
    WHERE user_id = v_profile_id AND is_active = true
    ORDER BY created_at DESC LIMIT 1;

    IF v_supplier_customer_id IS NULL THEN RAISE EXCEPTION 'No active subscription'; END IF;

    v_start_date := make_date(p_year, p_month, 1);
    v_end_date := (v_start_date + interval '1 month - 1 day')::date;

    -- Jars Consumed
    SELECT COALESCE(SUM(di.quantity), 0) INTO v_jars_consumed
    FROM public.deliveries d
    JOIN public.delivery_items di ON d.id = di.delivery_id
    WHERE d.supplier_customer_id = v_supplier_customer_id
    AND d.delivery_date >= v_start_date AND d.delivery_date <= v_end_date
    AND d.status = 'delivered';

    -- Bill Generated (Debits in this month)
    SELECT COALESCE(SUM(amount), 0) INTO v_bill_generated
    FROM public.customer_ledger_entries
    WHERE supplier_customer_id = v_supplier_customer_id
    AND reference_type = 'delivery' AND entry_type = 'debit'
    AND created_at >= v_start_date AND created_at < v_start_date + interval '1 month';

    -- Amount Paid (Credits in this month)
    SELECT COALESCE(SUM(amount), 0) INTO v_amount_paid
    FROM public.customer_ledger_entries
    WHERE supplier_customer_id = v_supplier_customer_id
    AND reference_type = 'payment' AND entry_type = 'credit'
    AND created_at >= v_start_date AND created_at < v_start_date + interval '1 month';

    -- Build entries list (both deliveries and payments)
    SELECT json_build_object(
        'jars_consumed', v_jars_consumed,
        'bill_generated', v_bill_generated,
        'amount_paid', v_amount_paid,
        'entries', COALESCE(
            json_agg(
                json_build_object(
                    'id', cle.id,
                    'type', cle.reference_type,
                    'amount', cle.amount,
                    'entry_type', cle.entry_type,
                    'created_at', cle.created_at,
                    -- Include jar details if it's a delivery
                    'jars', (
                        SELECT json_build_object('delivered', jt.jars_delivered, 'returned', jt.jars_returned)
                        FROM public.jar_transactions jt
                        WHERE jt.delivery_id = cle.reference_id
                        LIMIT 1
                    ),
                    -- Include payment method if it's a payment
                    'payment_method', (
                        SELECT p.payment_method
                        FROM public.payments p
                        WHERE (p.delivery_id = cle.reference_id OR p.id = cle.reference_id)
                        AND p.supplier_customer_id = cle.supplier_customer_id
                        LIMIT 1
                    )
                ) ORDER BY cle.created_at DESC
            ), 
            '[]'::json
        )
    ) INTO v_result
    FROM public.customer_ledger_entries cle
    WHERE cle.supplier_customer_id = v_supplier_customer_id
    AND cle.created_at >= v_start_date AND cle.created_at < v_start_date + interval '1 month';

    RETURN COALESCE(v_result, json_build_object(
        'jars_consumed', 0,
        'bill_generated', 0,
        'amount_paid', 0,
        'entries', '[]'::json
    ));
END;
$$;
