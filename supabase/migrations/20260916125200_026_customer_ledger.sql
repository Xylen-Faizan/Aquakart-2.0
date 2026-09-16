-- 026_customer_ledger.sql

-- 1. Get Customer Ledger
CREATE OR REPLACE FUNCTION public.get_customer_ledger(
    p_customer_id UUID,
    p_limit INTEGER DEFAULT 50
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_supplier_id UUID;
    v_owns_customer BOOLEAN;
    v_result JSON;
    v_outstanding NUMERIC(10,2);
BEGIN
    v_supplier_id := public.get_supplier_id();
    IF v_supplier_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

    -- Verify ownership
    SELECT EXISTS (
        SELECT 1 FROM public.supplier_customers 
        WHERE id = p_customer_id AND supplier_id = v_supplier_id
    ) INTO v_owns_customer;

    IF NOT v_owns_customer THEN RAISE EXCEPTION 'Unauthorized'; END IF;

    -- Calculate Outstanding Balance dynamically from ledger
    SELECT COALESCE(SUM(CASE WHEN entry_type = 'debit' THEN amount ELSE -amount END), 0)
    INTO v_outstanding
    FROM public.customer_ledger_entries
    WHERE supplier_customer_id = p_customer_id;

    -- Get entries
    SELECT json_build_object(
        'outstanding_balance', v_outstanding,
        'entries', COALESCE(
            json_agg(
                json_build_object(
                    'id', id,
                    'reference_type', reference_type,
                    'entry_type', entry_type,
                    'amount', amount,
                    'created_at', created_at
                ) ORDER BY created_at DESC
            ), 
            '[]'::json
        )
    ) INTO v_result
    FROM (
        SELECT id, reference_type, entry_type, amount, created_at
        FROM public.customer_ledger_entries
        WHERE supplier_customer_id = p_customer_id
        ORDER BY created_at DESC
        LIMIT p_limit
    ) sub;

    RETURN COALESCE(v_result, json_build_object('outstanding_balance', 0, 'entries', '[]'::json));
END;
$$;

-- 2. Record Manual Ledger Payment
CREATE OR REPLACE FUNCTION public.record_ledger_payment(
    p_customer_id UUID,
    p_amount NUMERIC(10,2),
    p_payment_method TEXT DEFAULT 'cash'
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_supplier_id UUID;
    v_owns_customer BOOLEAN;
BEGIN
    v_supplier_id := public.get_supplier_id();
    IF v_supplier_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

    IF p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;

    -- Verify ownership
    SELECT EXISTS (
        SELECT 1 FROM public.supplier_customers 
        WHERE id = p_customer_id AND supplier_id = v_supplier_id
    ) INTO v_owns_customer;

    IF NOT v_owns_customer THEN RAISE EXCEPTION 'Unauthorized'; END IF;

    -- Record Payment (this automatically reflects in the ledger because we insert to both)
    INSERT INTO public.payments (supplier_id, supplier_customer_id, amount, payment_method)
    VALUES (v_supplier_id, p_customer_id, p_amount, p_payment_method);

    INSERT INTO public.customer_ledger_entries (supplier_id, supplier_customer_id, reference_type, entry_type, amount, created_by)
    VALUES (v_supplier_id, p_customer_id, 'payment', 'credit', p_amount, auth.uid());
END;
$$;
