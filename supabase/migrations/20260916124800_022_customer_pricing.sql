-- 022_customer_pricing.sql

-- 1. Enforce a single active price per customer + product
CREATE UNIQUE INDEX idx_active_customer_price ON public.customer_product_prices (supplier_customer_id, supplier_product_id) WHERE effective_until IS NULL;

-- 2. Refined set_customer_price RPC (Strictly supplier-scoped, secure expiration)
CREATE OR REPLACE FUNCTION public.set_customer_price(
    p_customer_id UUID,
    p_supplier_product_id UUID,
    p_price NUMERIC(10,2)
) RETURNS VOID 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_supplier_id UUID;
    v_owns_customer BOOLEAN;
    v_owns_product BOOLEAN;
BEGIN
    v_supplier_id := public.get_supplier_id();
    IF v_supplier_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated as a supplier';
    END IF;

    -- Verify ownership of customer
    SELECT EXISTS (
        SELECT 1 FROM public.supplier_customers 
        WHERE id = p_customer_id AND supplier_id = v_supplier_id
    ) INTO v_owns_customer;

    IF NOT v_owns_customer THEN 
        RAISE EXCEPTION 'Unauthorized: Customer not found or does not belong to you'; 
    END IF;

    -- Verify ownership of product
    SELECT EXISTS (
        SELECT 1 FROM public.supplier_products 
        WHERE id = p_supplier_product_id AND supplier_id = v_supplier_id
    ) INTO v_owns_product;

    IF NOT v_owns_product THEN 
        RAISE EXCEPTION 'Unauthorized: Product not found or does not belong to you'; 
    END IF;

    -- Expire current active price if it exists
    UPDATE public.customer_product_prices
    SET effective_until = NOW()
    WHERE supplier_customer_id = p_customer_id 
    AND supplier_product_id = p_supplier_product_id 
    AND effective_until IS NULL;

    -- Insert new active price
    INSERT INTO public.customer_product_prices (
        supplier_customer_id,
        supplier_product_id,
        price,
        effective_from,
        effective_until
    ) VALUES (
        p_customer_id,
        p_supplier_product_id,
        p_price,
        NOW(),
        NULL
    );
END;
$$;

-- 3. Helper function to resolve effective price (Custom price OR fallback to default)
CREATE OR REPLACE FUNCTION public.get_effective_customer_price(
    p_customer_id UUID,
    p_supplier_product_id UUID
) RETURNS NUMERIC(10,2)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_price NUMERIC(10,2);
BEGIN
    -- 1. Try to find active custom price
    SELECT price INTO v_price
    FROM public.customer_product_prices
    WHERE supplier_customer_id = p_customer_id
    AND supplier_product_id = p_supplier_product_id
    AND effective_until IS NULL;

    -- 2. If no custom price, fallback to default product price
    IF v_price IS NULL THEN
        SELECT price INTO v_price
        FROM public.supplier_products
        WHERE id = p_supplier_product_id;
    END IF;

    -- 3. Safety check
    IF v_price IS NULL THEN
        RAISE EXCEPTION 'Price resolution failed: Product not found';
    END IF;

    RETURN v_price;
END;
$$;
