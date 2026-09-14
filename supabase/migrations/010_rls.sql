-- 010_rls.sql
-- Harden RLS policies

CREATE OR REPLACE FUNCTION public.get_user_role() RETURNS TEXT AS $$
BEGIN
    RETURN (SELECT role FROM public.profiles WHERE id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_admin() RETURNS BOOLEAN AS $$
BEGIN
    RETURN public.get_user_role() = 'admin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.get_supplier_id() RETURNS UUID AS $$
BEGIN
    RETURN (SELECT id FROM public.suppliers WHERE profile_id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_capacity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY "profiles: SELECT own or admin" ON public.profiles FOR SELECT USING (id = auth.uid() OR public.is_admin());
CREATE POLICY "profiles: UPDATE own or admin" ON public.profiles FOR UPDATE USING (id = auth.uid() OR public.is_admin()) WITH CHECK ((id = auth.uid() AND role = (SELECT role FROM public.profiles WHERE id = auth.uid())) OR public.is_admin());

-- suppliers
CREATE POLICY "suppliers: SELECT authenticated (active or own or admin)" ON public.suppliers FOR SELECT TO authenticated USING (is_active = true OR profile_id = auth.uid() OR public.is_admin());
CREATE POLICY "suppliers: INSERT admin only" ON public.suppliers FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "suppliers: UPDATE own or admin" ON public.suppliers FOR UPDATE USING (profile_id = auth.uid() OR public.is_admin()) WITH CHECK (public.is_admin() OR (profile_id = auth.uid() AND is_active = (SELECT is_active FROM public.suppliers WHERE id = id) AND profile_id = (SELECT profile_id FROM public.suppliers WHERE id = id)));

-- products
CREATE POLICY "products: SELECT authenticated only" ON public.products FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "products: INSERT admin" ON public.products FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "products: UPDATE admin" ON public.products FOR UPDATE TO authenticated USING (public.is_admin());
CREATE POLICY "products: DELETE admin" ON public.products FOR DELETE TO authenticated USING (public.is_admin());

-- supplier_products
CREATE POLICY "supplier_products: SELECT authenticated" ON public.supplier_products FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "supplier_products: INSERT own or admin" ON public.supplier_products FOR INSERT TO authenticated WITH CHECK (supplier_id = public.get_supplier_id() OR public.is_admin());
CREATE POLICY "supplier_products: UPDATE own or admin" ON public.supplier_products FOR UPDATE TO authenticated USING (supplier_id = public.get_supplier_id() OR public.is_admin());
CREATE POLICY "supplier_products: DELETE own or admin" ON public.supplier_products FOR DELETE TO authenticated USING (supplier_id = public.get_supplier_id() OR public.is_admin());

-- supplier_capacity
CREATE POLICY "supplier_capacity: SELECT authenticated" ON public.supplier_capacity FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "supplier_capacity: INSERT admin" ON public.supplier_capacity FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "supplier_capacity: UPDATE admin" ON public.supplier_capacity FOR UPDATE TO authenticated USING (public.is_admin());
CREATE POLICY "supplier_capacity: DELETE admin" ON public.supplier_capacity FOR DELETE TO authenticated USING (public.is_admin());

-- addresses
CREATE POLICY "addresses: SELECT own or admin" ON public.addresses FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY "addresses: INSERT own or admin" ON public.addresses FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() OR public.is_admin());
CREATE POLICY "addresses: UPDATE own or admin" ON public.addresses FOR UPDATE TO authenticated USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY "addresses: DELETE own or admin" ON public.addresses FOR DELETE TO authenticated USING (user_id = auth.uid() OR public.is_admin());

-- orders
CREATE POLICY "orders: SELECT only (customer own, supplier assigned, admin all)" ON public.orders FOR SELECT TO authenticated USING (customer_id = auth.uid() OR supplier_id = public.get_supplier_id() OR public.is_admin());

-- order_items
CREATE POLICY "order_items: SELECT via order relationship" ON public.order_items FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.orders WHERE orders.id = order_items.order_id));

-- order_status_history
CREATE POLICY "order_status_history: SELECT via order relationship" ON public.order_status_history FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.orders WHERE orders.id = order_status_history.order_id));
