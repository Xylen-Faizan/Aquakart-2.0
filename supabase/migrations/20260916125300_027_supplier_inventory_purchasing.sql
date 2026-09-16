-- 027_supplier_inventory_purchasing.sql

-- 1. Record Inventory Purchase
CREATE OR REPLACE FUNCTION public.record_inventory_purchase(
    p_quantity INTEGER,
    p_unit_price NUMERIC(10,2) DEFAULT 0
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_supplier_id UUID;
BEGIN
    v_supplier_id := public.get_supplier_id();
    IF v_supplier_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

    IF p_quantity <= 0 THEN RAISE EXCEPTION 'Quantity must be positive'; END IF;

    -- Update inventory totals
    UPDATE public.supplier_inventory
    SET owned = owned + p_quantity,
        available = available + p_quantity
    WHERE supplier_id = v_supplier_id;

    -- Add transaction record
    INSERT INTO public.supplier_inventory_transactions (supplier_id, reference_type, quantity_change)
    VALUES (v_supplier_id, 'purchase', p_quantity);
END;
$$;
