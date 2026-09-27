-- 105 Add ratings to get_supplier_details_for_customer

DROP FUNCTION IF EXISTS public.get_supplier_details_for_customer(UUID);

CREATE OR REPLACE FUNCTION public.get_supplier_details_for_customer(p_supplier_id UUID)
RETURNS TABLE (
    id UUID,
    profile_id UUID,
    business_name TEXT,
    description TEXT,
    phone TEXT,
    address TEXT,
    is_accepting_orders BOOLEAN,
    price NUMERIC(10,2),
    available_quantity INTEGER,
    supplier_product_id UUID,
    product_id UUID,
    product_name TEXT,
    supplier_customer_id UUID,
    average_rating NUMERIC,
    review_count INTEGER
) AS $$
DECLARE
    v_user_id UUID;
BEGIN
    v_user_id := auth.uid();

    RETURN QUERY
    SELECT 
        s.id, 
        s.profile_id, 
        s.business_name, 
        s.description, 
        s.phone, 
        s.address, 
        s.is_accepting_orders,
        COALESCE(
            (
                SELECT cpp.price 
                FROM public.customer_product_prices cpp
                JOIN public.supplier_customers sc ON cpp.supplier_customer_id = sc.id
                WHERE sc.user_id = v_user_id AND sc.supplier_id = s.id
                AND cpp.supplier_product_id = sp.id
                AND cpp.effective_until IS NULL
                LIMIT 1
            ),
            sp.price
        ) as price,
        (SELECT (
           COALESCE(sc.max_capacity, (SELECT max_capacity FROM public.supplier_capacity WHERE supplier_id = s.id ORDER BY date DESC LIMIT 1), 0)
           - COALESCE(sc.reserved_quantity, 0) 
           - COALESCE(sc.fulfilled_quantity, 0)
       ) 
       FROM public.suppliers dummy 
       LEFT JOIN public.supplier_capacity sc ON sc.supplier_id = s.id AND sc.date = timezone('Asia/Kolkata', now())::date 
       WHERE dummy.id = s.id LIMIT 1) as available_quantity,
        sp.id as supplier_product_id,
        p.id as product_id,
        p.name as product_name,
        (SELECT sc.id FROM public.supplier_customers sc WHERE sc.user_id = v_user_id AND sc.supplier_id = s.id LIMIT 1) as supplier_customer_id,
        COALESCE((SELECT ROUND(AVG(sr.rating)::numeric, 1) FROM public.supplier_reviews sr WHERE sr.supplier_id = s.id), 0.0) as average_rating,
        COALESCE((SELECT COUNT(*) FROM public.supplier_reviews sr WHERE sr.supplier_id = s.id)::integer, 0) as review_count
    FROM public.suppliers s
    JOIN public.supplier_products sp ON sp.supplier_id = s.id
    JOIN public.products p ON p.id = sp.product_id
    WHERE s.id = p_supplier_id
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
