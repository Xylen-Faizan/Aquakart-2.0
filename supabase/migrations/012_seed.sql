-- 012_seed.sql
-- Seed initial data for products

-- Seed 20L Water Jar product with a fixed UUID
INSERT INTO public.products (id, name, description, unit, active)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    '20L Water Jar',
    'Standard 20 Liter Purified Drinking Water Jar',
    'jar',
    true
)
ON CONFLICT (id) DO NOTHING;

-- Comments about demo data and supplier onboarding workflow:
-- Suppliers need to be onboarded by registering an auth.user, creating a profile,
-- and then an admin creating a supplier record linked to that profile.
-- After that, suppliers can set their supplier_products (e.g. price for the 20L jar)
-- and their daily supplier_capacity.
