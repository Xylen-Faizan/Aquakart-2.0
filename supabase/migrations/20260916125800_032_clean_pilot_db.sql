-- 032_clean_pilot_db.sql

-- This script safely removes all simulation data associated with the 'Amrit Dhara (Simulation)' supplier.
-- Due to strict ON DELETE CASCADE constraints throughout the Supplier OS architecture,
-- deleting the auth.users record will completely clean the pilot database (profiles, suppliers, customers, deliveries, ledgers, inventory).

DO $$
DECLARE
    v_sim_supplier_id UUID;
BEGIN
    -- Look up the simulation supplier profile
    SELECT id INTO v_sim_supplier_id 
    FROM auth.users 
    WHERE email = 'simulation@aquakart.com' 
    LIMIT 1;

    IF v_sim_supplier_id IS NOT NULL THEN
        -- Delete from auth.users (Cascades to profiles -> suppliers -> customers, inventory, ledgers, deliveries)
        DELETE FROM auth.users WHERE id = v_sim_supplier_id;
    END IF;
    
    -- Also remove the simulation product if it was uniquely added for testing (optional, but good for cleanliness)
    DELETE FROM public.products WHERE name = '20L Jar';
    
END;
$$;
