-- 064_fix_capacity_isolation.sql

-- 1. Create an onboarding RPC to securely map auth.uid() -> suppliers
CREATE OR REPLACE FUNCTION public.onboard_supplier(
    p_business_name TEXT,
    p_phone TEXT,
    p_address TEXT,
    p_lat DOUBLE PRECISION,
    p_lng DOUBLE PRECISION
) RETURNS UUID AS $$
DECLARE
    v_profile_id UUID;
    v_supplier_id UUID;
BEGIN
    v_profile_id := auth.uid();
    IF v_profile_id IS NULL THEN 
        RAISE EXCEPTION 'Not authenticated'; 
    END IF;

    -- Ensure they are a supplier in profiles
    UPDATE public.profiles
    SET role = 'supplier'
    WHERE id = v_profile_id;

    -- Upsert into suppliers
    INSERT INTO public.suppliers (profile_id, business_name, phone, address, lat, lng, is_active, is_accepting_orders)
    VALUES (v_profile_id, p_business_name, p_phone, p_address, p_lat, p_lng, true, true)
    ON CONFLICT (profile_id) DO UPDATE 
    SET business_name = EXCLUDED.business_name,
        phone = EXCLUDED.phone,
        address = EXCLUDED.address,
        lat = EXCLUDED.lat,
        lng = EXCLUDED.lng
    RETURNING id INTO v_supplier_id;

    RETURN v_supplier_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Strictly enforce data isolation for capacity fetches. 
-- No cross-supplier fallback. No fallback to old dates.
CREATE OR REPLACE FUNCTION public.get_supplier_current_capacity(p_supplier_id UUID DEFAULT NULL)
RETURNS INT AS $$
DECLARE
    v_supplier_id UUID;
    v_capacity INT;
BEGIN
    -- 1. Try to get the supplier ID associated with the current session
    v_supplier_id := COALESCE(p_supplier_id, public.get_supplier_id());
    
    -- If identity cannot be resolved to a supplier, return 0 (no capacity).
    IF v_supplier_id IS NULL THEN
        RETURN 0;
    END IF;

    -- 2. Get the capacity explicitly for THIS supplier for TODAY
    SELECT sc.max_capacity INTO v_capacity
    FROM public.supplier_capacity sc
    WHERE sc.supplier_id = v_supplier_id 
    AND sc.date = timezone('Asia/Kolkata', now())::date
    LIMIT 1;

    RETURN COALESCE(v_capacity, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
