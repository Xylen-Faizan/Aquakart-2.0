-- Migration: ensure_supplier_role
-- Purpose: Safely upgrades a customer to a supplier role during supplier app login

CREATE OR REPLACE FUNCTION public.ensure_supplier_role()
RETURNS void AS $$
DECLARE
    v_user_id UUID;
    v_current_role TEXT;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Get current role
    SELECT role INTO v_current_role FROM public.profiles WHERE id = v_user_id;

    IF v_current_role = 'customer' THEN
        -- Update role to supplier
        UPDATE public.profiles SET role = 'supplier' WHERE id = v_user_id;
        
        -- Create a default supplier profile if it doesn't exist
        INSERT INTO public.suppliers (profile_id, business_name, address, is_active, is_accepting_orders)
        VALUES (v_user_id, 'My Water Supply', 'Please update your business address', true, true)
        ON CONFLICT (profile_id) DO NOTHING;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
