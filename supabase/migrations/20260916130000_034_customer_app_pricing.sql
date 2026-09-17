-- 034_customer_app_pricing.sql
-- Add Customer App specific logic for pricing and schedules

-- 1. Add RLS for customers to view and manage their own delivery schedules
CREATE POLICY "Customers can view their own schedules" 
    ON public.customer_delivery_schedules FOR SELECT 
    TO authenticated 
    USING (
        supplier_customer_id IN (
            SELECT id FROM public.supplier_customers WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Customers can insert their own schedules" 
    ON public.customer_delivery_schedules FOR INSERT 
    TO authenticated 
    WITH CHECK (
        supplier_customer_id IN (
            SELECT id FROM public.supplier_customers WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Customers can update their own schedules" 
    ON public.customer_delivery_schedules FOR UPDATE 
    TO authenticated 
    USING (
        supplier_customer_id IN (
            SELECT id FROM public.supplier_customers WHERE user_id = auth.uid()
        )
    )
    WITH CHECK (
        supplier_customer_id IN (
            SELECT id FROM public.supplier_customers WHERE user_id = auth.uid()
        )
    );

-- 2. Update get_available_suppliers to resolve customer-specific price if logged in
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
DECLARE
    v_user_id UUID;
BEGIN
    v_user_id := auth.uid();

    RETURN QUERY
    SELECT s.id, s.profile_id, s.business_name, s.description, s.phone, s.address, s.lat, s.lng, s.is_accepting_orders,
           (6371 * acos(cos(radians(p_lat)) * cos(radians(s.lat)) * cos(radians(s.lng) - radians(p_lng)) + sin(radians(p_lat)) * sin(radians(s.lat)))) AS distance,
           (6371 * acos(cos(radians(p_lat)) * cos(radians(s.lat)) * cos(radians(s.lng) - radians(p_lng)) + sin(radians(p_lat)) * sin(radians(s.lat)))) AS distance_km,
           COALESCE(
               -- Try to get custom price for this customer and supplier
               (
                   SELECT cpp.price 
                   FROM public.customer_product_prices cpp
                   JOIN public.supplier_customers sc ON cpp.supplier_customer_id = sc.id
                   WHERE sc.user_id = v_user_id AND sc.supplier_id = s.id
                   AND cpp.supplier_product_id = (SELECT sp.id FROM public.supplier_products sp WHERE sp.supplier_id = s.id LIMIT 1)
                   AND cpp.effective_until IS NULL
                   LIMIT 1
               ),
               -- Fallback to public price
               (SELECT sp.price FROM public.supplier_products sp WHERE sp.supplier_id = s.id LIMIT 1)
           ) as price,
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

-- 3. Add an RPC to get supplier details along with resolved price
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
    supplier_customer_id UUID
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
        (SELECT (sc.max_capacity - sc.reserved_quantity - sc.fulfilled_quantity) FROM public.supplier_capacity sc WHERE sc.supplier_id = s.id AND sc.date = timezone('Asia/Kolkata', now())::date LIMIT 1) as available_quantity,
        sp.id as supplier_product_id,
        p.id as product_id,
        p.name as product_name,
        (SELECT sc.id FROM public.supplier_customers sc WHERE sc.user_id = v_user_id AND sc.supplier_id = s.id LIMIT 1) as supplier_customer_id
    FROM public.suppliers s
    JOIN public.supplier_products sp ON sp.supplier_id = s.id
    JOIN public.products p ON p.id = sp.product_id
    WHERE s.id = p_supplier_id
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
