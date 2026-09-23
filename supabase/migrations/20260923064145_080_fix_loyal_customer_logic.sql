-- 080_fix_loyal_customer_logic.sql

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

    -- Look for an active supplier_customers record where the customer has demonstrated loyalty
    -- A customer is considered "Subscribed/Loyal" if they:
    -- 1. Have an active delivery schedule (customer_delivery_schedules)
    -- 2. Owe empty jars (jars_with_customer > 0)
    -- 3. Owe money on their ledger (outstanding_balance != 0)
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
    AND (
        -- Condition 1: Has an active schedule
        EXISTS (
            SELECT 1 FROM public.customer_delivery_schedules cds 
            WHERE cds.supplier_customer_id = sc.id AND cds.is_active = true
        )
        -- Condition 2: Owes jars
        OR COALESCE(cjb.jars_with_customer, 0) > 0
        -- Condition 3: Owes money (or has negative balance/advance)
        OR COALESCE(
            (SELECT SUM(CASE WHEN entry_type = 'debit' THEN amount ELSE -amount END)
             FROM public.customer_ledger_entries cle
             WHERE cle.supplier_customer_id = sc.id), 0
        ) != 0
    )
    ORDER BY sc.created_at DESC
    LIMIT 1;

    RETURN v_result; -- Returns null if no active subscription found
END;
$$;