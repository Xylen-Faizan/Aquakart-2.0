-- 044_update_supplier_location.sql
-- Adds RPC to update supplier location with PostGIS point

CREATE OR REPLACE FUNCTION public.update_supplier_location(
    p_supplier_id UUID,
    p_lng DOUBLE PRECISION,
    p_lat DOUBLE PRECISION
)
RETURNS void AS $$
BEGIN
    UPDATE public.suppliers
    SET location = ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)
    WHERE id = p_supplier_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
