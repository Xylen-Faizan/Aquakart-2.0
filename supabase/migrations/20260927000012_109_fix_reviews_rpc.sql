-- ============================================================================
-- 109_fix_reviews_rpc.sql
-- Fixes the get_supplier_reviews RPC to use profiles.name instead of full_name
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_supplier_reviews(
    p_supplier_id UUID,
    p_limit INTEGER DEFAULT 10,
    p_offset INTEGER DEFAULT 0
) RETURNS TABLE (
    id UUID,
    rating INTEGER,
    comment TEXT,
    created_at TIMESTAMPTZ,
    customer_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        sr.id,
        sr.rating,
        sr.comment,
        sr.created_at,
        -- Generate a privacy-safe name (e.g. "Rahul" or "Priya S.")
        COALESCE(
            (CASE 
                WHEN array_length(string_to_array(p.name, ' '), 1) > 1 
                THEN split_part(p.name, ' ', 1) || ' ' || left(split_part(p.name, ' ', 2), 1) || '.'
                ELSE p.name
            END),
            'Customer'
        ) AS customer_name
    FROM public.supplier_reviews sr
    JOIN public.profiles p ON sr.customer_id = p.id
    WHERE sr.supplier_id = p_supplier_id
    ORDER BY sr.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;
