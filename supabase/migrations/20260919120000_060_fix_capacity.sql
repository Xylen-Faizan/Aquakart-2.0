-- 060_fix_capacity.sql

-- Creates an RPC to get the exact same capacity fallback logic as the customer app
CREATE OR REPLACE FUNCTION public.get_supplier_current_capacity(p_supplier_id UUID DEFAULT NULL)
RETURNS INT AS $$
DECLARE
    v_supplier_id UUID;
    v_capacity INT;
BEGIN
    v_supplier_id := COALESCE(p_supplier_id, public.get_supplier_id());
    IF v_supplier_id IS NULL THEN
        RETURN 0;
    END IF;

    SELECT (
        COALESCE(sc.max_capacity, (SELECT max_capacity FROM public.supplier_capacity WHERE supplier_id = v_supplier_id ORDER BY date DESC LIMIT 1), 0)
    ) INTO v_capacity
    FROM public.suppliers dummy 
    LEFT JOIN public.supplier_capacity sc ON sc.supplier_id = v_supplier_id AND sc.date = timezone('Asia/Kolkata', now())::date 
    WHERE dummy.id = v_supplier_id LIMIT 1;

    RETURN COALESCE(v_capacity, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
