-- 063_capacity_and_brands.sql

-- 1. Rename Ecosia to Aquafina in products table
UPDATE public.products 
SET name = 'Aquafina 20L', description = 'Aquafina 20L Jar'
WHERE name = 'Ecosia 20L';

-- 2. Fix the capacity issue for the demo environment 
-- If the current supplier hasn't set capacity today (because of new session ID), 
-- it falls back to the most recently set capacity across ALL suppliers today.
CREATE OR REPLACE FUNCTION public.get_supplier_current_capacity(p_supplier_id UUID DEFAULT NULL)
RETURNS INT AS $$
DECLARE
    v_supplier_id UUID;
    v_capacity INT;
BEGIN
    v_supplier_id := COALESCE(p_supplier_id, public.get_supplier_id());
    
    -- 1. Try to get the capacity explicitly for this supplier
    SELECT sc.max_capacity INTO v_capacity
    FROM public.supplier_capacity sc
    WHERE sc.supplier_id = v_supplier_id AND sc.date = timezone('Asia/Kolkata', now())::date
    LIMIT 1;

    -- 2. If not found (e.g. they got a new session ID), fetch the latest capacity ANY supplier set today
    IF v_capacity IS NULL THEN
        SELECT max_capacity INTO v_capacity
        FROM public.supplier_capacity 
        WHERE date = timezone('Asia/Kolkata', now())::date
        ORDER BY created_at DESC 
        LIMIT 1;
    END IF;

    -- 3. If STILL null, fallback to the last recorded capacity for this supplier on any day
    IF v_capacity IS NULL THEN
        SELECT max_capacity INTO v_capacity 
        FROM public.supplier_capacity 
        WHERE supplier_id = v_supplier_id 
        ORDER BY date DESC 
        LIMIT 1;
    END IF;

    RETURN COALESCE(v_capacity, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
