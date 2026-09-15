-- 018_fix_supplier_discovery.sql
-- Fix get_available_suppliers() to return all fields needed by the Customer app.

DROP FUNCTION IF EXISTS public.get_available_suppliers(double precision, double precision);

CREATE OR REPLACE FUNCTION public.get_available_suppliers(p_lat DOUBLE PRECISION, p_lng DOUBLE PRECISION)
RETURNS TABLE (
    id UUID,
    profile_id UUID,
    business_name TEXT,
    description TEXT,
    phone TEXT,
    address TEXT,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    is_accepting_orders BOOLEAN,
    distance DOUBLE PRECISION,
    distance_km DOUBLE PRECISION,
    price NUMERIC(10,2),
    available_quantity INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT s.id, s.profile_id, s.business_name, s.description, s.phone, s.address, s.lat, s.lng, s.is_accepting_orders,
           (6371 * acos(cos(radians(p_lat)) * cos(radians(s.lat)) * cos(radians(s.lng) - radians(p_lng)) + sin(radians(p_lat)) * sin(radians(s.lat)))) AS distance,
           (6371 * acos(cos(radians(p_lat)) * cos(radians(s.lat)) * cos(radians(s.lng) - radians(p_lng)) + sin(radians(p_lat)) * sin(radians(s.lat)))) AS distance_km,
           (SELECT sp.price FROM public.supplier_products sp WHERE sp.supplier_id = s.id LIMIT 1) as price,
           (SELECT (sc.max_capacity - sc.reserved_quantity - sc.fulfilled_quantity) FROM public.supplier_capacity sc WHERE sc.supplier_id = s.id AND sc.date = timezone('Asia/Kolkata', now())::date LIMIT 1) as available_quantity
    FROM public.suppliers s
    WHERE s.is_active = true AND s.is_accepting_orders = true
    AND EXISTS (
        SELECT 1 FROM public.supplier_capacity sc
        WHERE sc.supplier_id = s.id AND sc.date = timezone('Asia/Kolkata', now())::date
        AND (sc.max_capacity - sc.reserved_quantity - sc.fulfilled_quantity) > 0
    )
    ORDER BY distance ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
