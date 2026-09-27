-- 104 Verified Supplier Reviews
-- Enables customers to review suppliers based ONLY on verified completed deliveries.

-- 1. Create supplier_reviews table
CREATE TABLE IF NOT EXISTS public.supplier_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    delivery_id UUID NOT NULL UNIQUE REFERENCES public.deliveries(id) ON DELETE CASCADE,
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT CHECK (length(comment) <= 1000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    CHECK (comment IS NULL OR length(trim(comment)) >= 1)
);

-- 2. Indexes for efficient lookup
CREATE INDEX IF NOT EXISTS idx_supplier_reviews_supplier_created
ON public.supplier_reviews (supplier_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_supplier_reviews_customer
ON public.supplier_reviews (customer_id);

-- 3. Row Level Security
ALTER TABLE public.supplier_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers can insert their own reviews"
ON public.supplier_reviews FOR INSERT
WITH CHECK (auth.uid() = customer_id);

CREATE POLICY "Customers can read their own reviews"
ON public.supplier_reviews FOR SELECT
USING (auth.uid() = customer_id);

CREATE POLICY "Suppliers can read reviews for their business"
ON public.supplier_reviews FOR SELECT
USING (
    supplier_id IN (
        SELECT id FROM public.suppliers WHERE profile_id = auth.uid()
    )
);

CREATE POLICY "Public can read reviews for display"
ON public.supplier_reviews FOR SELECT
USING (true);

-- 4. RPCs

-- submit_supplier_review
CREATE OR REPLACE FUNCTION public.submit_supplier_review(
    p_delivery_id UUID,
    p_rating INTEGER,
    p_comment TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_delivery RECORD;
    v_review_id UUID;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

    -- Validate input
    IF p_rating < 1 OR p_rating > 5 THEN
        RAISE EXCEPTION 'Rating must be between 1 and 5';
    END IF;

    -- Get and validate delivery
    SELECT d.id, d.status, d.supplier_id, sc.user_id, d.order_id 
    INTO v_delivery
    FROM public.deliveries d
    JOIN public.supplier_customers sc ON d.supplier_customer_id = sc.id
    WHERE d.id = p_delivery_id;

    IF v_delivery.id IS NULL THEN
        RAISE EXCEPTION 'Delivery not found';
    END IF;

    IF v_delivery.user_id != v_user_id THEN
        RAISE EXCEPTION 'Unauthorized: You can only review your own deliveries';
    END IF;

    IF v_delivery.status != 'delivered' THEN
        RAISE EXCEPTION 'Only delivered orders can be reviewed';
    END IF;

    -- Ensure no existing review (Constraint handles it, but good to give clean error)
    IF EXISTS (SELECT 1 FROM public.supplier_reviews WHERE delivery_id = p_delivery_id) THEN
        RAISE EXCEPTION 'This delivery has already been reviewed';
    END IF;

    -- Insert the review securely using server-derived IDs
    INSERT INTO public.supplier_reviews (
        supplier_id,
        customer_id,
        delivery_id,
        order_id,
        rating,
        comment
    ) VALUES (
        v_delivery.supplier_id,
        v_user_id,
        p_delivery_id,
        v_delivery.order_id,
        p_rating,
        NULLIF(trim(p_comment), '')
    )
    RETURNING id INTO v_review_id;

    RETURN v_review_id;
END;
$$;


-- get_supplier_reviews
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
                WHEN array_length(string_to_array(p.full_name, ' '), 1) > 1 
                THEN split_part(p.full_name, ' ', 1) || ' ' || left(split_part(p.full_name, ' ', 2), 1) || '.'
                ELSE p.full_name
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

-- get_reviewable_deliveries
CREATE OR REPLACE FUNCTION public.get_reviewable_deliveries() 
RETURNS TABLE (
    delivery_id UUID,
    order_id UUID,
    supplier_id UUID,
    supplier_name TEXT,
    delivery_date DATE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

    RETURN QUERY
    SELECT 
        d.id as delivery_id,
        d.order_id,
        d.supplier_id,
        s.business_name as supplier_name,
        d.delivery_date
    FROM public.deliveries d
    JOIN public.supplier_customers sc ON d.supplier_customer_id = sc.id
    JOIN public.suppliers s ON d.supplier_id = s.id
    WHERE sc.user_id = v_user_id
    AND d.status = 'delivered'
    AND NOT EXISTS (
        SELECT 1 FROM public.supplier_reviews sr WHERE sr.delivery_id = d.id
    )
    ORDER BY d.created_at DESC
    LIMIT 20; -- Only look at recent deliveries to bound the query
END;
$$;

-- Update get_available_suppliers to include rating aggregates
DROP FUNCTION IF EXISTS public.get_available_suppliers(double precision, double precision);

CREATE OR REPLACE FUNCTION public.get_available_suppliers(
    p_lat double precision DEFAULT NULL::double precision, 
    p_lng double precision DEFAULT NULL::double precision
)
 RETURNS TABLE(
    id uuid, 
    profile_id uuid, 
    business_name text, 
    description text, 
    phone text, 
    address text, 
    lat double precision, 
    lng double precision, 
    is_accepting_orders boolean, 
    distance double precision, 
    distance_km double precision, 
    price numeric, 
    available_quantity integer,
    average_rating numeric,
    review_count integer
)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
    v_user_id UUID;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

    RETURN QUERY
    SELECT s.id, s.profile_id, s.business_name, s.description, s.phone, s.address, s.lat, s.lng, s.is_accepting_orders,
           COALESCE(
               (6371 * acos(cos(radians(p_lat)) * cos(radians(s.lat)) * cos(radians(s.lng) - radians(p_lng)) + sin(radians(p_lat)) * sin(radians(s.lat)))), 
           0) as distance,
           COALESCE(
               (6371 * acos(cos(radians(p_lat)) * cos(radians(s.lat)) * cos(radians(s.lng) - radians(p_lng)) + sin(radians(p_lat)) * sin(radians(s.lat)))), 
           0) as distance_km,
           COALESCE(
               -- Try to get custom price for this customer and supplier
               (
                   SELECT cpp.price 
                   FROM public.customer_product_prices cpp
                   JOIN public.supplier_customers sc ON cpp.supplier_customer_id = sc.id
                   WHERE sc.user_id = v_user_id AND sc.supplier_id = s.id
                   AND cpp.supplier_product_id = (SELECT sp.id FROM public.supplier_products sp WHERE sp.supplier_id = s.id AND sp.available = true LIMIT 1)
                   AND cpp.effective_until IS NULL
                   LIMIT 1
               ),
               -- Fallback to public price
               (SELECT sp.price FROM public.supplier_products sp WHERE sp.supplier_id = s.id AND sp.available = true LIMIT 1)
           ) as price,
           (SELECT (
               COALESCE(sc.max_capacity, (SELECT max_capacity FROM public.supplier_capacity WHERE supplier_id = s.id ORDER BY date DESC LIMIT 1), 0)
               - COALESCE(sc.reserved_quantity, 0) 
               - COALESCE(sc.fulfilled_quantity, 0)
           ) 
           FROM public.suppliers dummy 
           LEFT JOIN public.supplier_capacity sc ON sc.supplier_id = s.id AND sc.date = timezone('Asia/Kolkata', now())::date 
           WHERE dummy.id = s.id LIMIT 1) as available_quantity,
           
           -- NEW: Review aggregates
           COALESCE((SELECT ROUND(AVG(sr.rating)::numeric, 1) FROM public.supplier_reviews sr WHERE sr.supplier_id = s.id), 0.0) as average_rating,
           COALESCE((SELECT COUNT(*) FROM public.supplier_reviews sr WHERE sr.supplier_id = s.id)::integer, 0) as review_count
           
    FROM public.suppliers s
    WHERE s.is_active = true 
    AND s.is_verified = true 
    AND s.is_accepting_orders = true
    AND EXISTS (
        SELECT 1 FROM public.supplier_products sp WHERE sp.supplier_id = s.id AND sp.available = true
    )
    AND (SELECT (
           COALESCE(sc.max_capacity, (SELECT max_capacity FROM public.supplier_capacity WHERE supplier_id = s.id ORDER BY date DESC LIMIT 1), 0)
           - COALESCE(sc.reserved_quantity, 0) 
           - COALESCE(sc.fulfilled_quantity, 0)
       ) 
       FROM public.suppliers dummy 
       LEFT JOIN public.supplier_capacity sc ON sc.supplier_id = s.id AND sc.date = timezone('Asia/Kolkata', now())::date 
       WHERE dummy.id = s.id LIMIT 1) > 0
    ORDER BY distance ASC;
END;
$function$;
