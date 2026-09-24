-- Add RLS for Customers to view their own supplier relationship
CREATE POLICY "Customers can view their own supplier relationship"
    ON public.supplier_customers FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());
