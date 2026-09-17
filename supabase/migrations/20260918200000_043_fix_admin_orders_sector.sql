-- 043_fix_admin_orders_sector.sql
-- Fixes missing sector column on addresses table

CREATE OR REPLACE FUNCTION public.get_admin_orders(
    p_date DATE DEFAULT current_date,
    p_supplier_id UUID DEFAULT NULL,
    p_status TEXT DEFAULT NULL,
    p_sector TEXT DEFAULT NULL
)
RETURNS TABLE (
    order_id UUID,
    display_id TEXT,
    customer_name TEXT,
    supplier_name TEXT,
    sector TEXT,
    status TEXT,
    created_at TIMESTAMPTZ,
    total_amount NUMERIC
) AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    RETURN QUERY
    SELECT 
        o.id AS order_id,
        o.display_id,
        p.name AS customer_name,
        s.business_name AS supplier_name,
        'Unassigned'::TEXT AS sector,
        o.status,
        o.created_at,
        o.total AS total_amount
    FROM public.orders o
    JOIN public.profiles p ON p.id = o.customer_id
    JOIN public.suppliers s ON s.id = o.supplier_id
    LEFT JOIN public.addresses a ON a.id = o.address_id
    WHERE DATE(o.created_at AT TIME ZONE 'UTC') = p_date
      AND (p_supplier_id IS NULL OR o.supplier_id = p_supplier_id)
      AND (p_status IS NULL OR o.status = p_status)
      AND (p_sector IS NULL OR 'Unassigned' = p_sector)
    ORDER BY o.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
