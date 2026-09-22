-- 053_fix_supplier_rls.sql
-- Fix the RLS policy that causes "more than one row returned by a subquery used as an expression"
-- The old policy used a subquery against suppliers table for the WITH CHECK clause which returned all rows.

DROP POLICY IF EXISTS "suppliers: UPDATE own or admin" ON public.suppliers;
CREATE POLICY "suppliers: UPDATE own or admin" ON public.suppliers FOR UPDATE USING (profile_id = auth.uid() OR public.is_admin());
