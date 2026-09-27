-- 100_remove_branded_products.sql

-- Replace unverified branded product images/names with generic equivalents
-- per legal compliance requirements.

UPDATE public.products
SET 
  name = 'Generic Packaged Water 20L',
  description = 'Generic packaged drinking water 20L Jar'
WHERE id = 'b1b1b1b1-1111-1111-1111-111111111111';

UPDATE public.products
SET 
  name = 'AquaKart Original 20L',
  description = 'Original AquaKart-created 20L Jar'
WHERE id = 'e2e2e2e2-2222-2222-2222-222222222222';

UPDATE public.products
SET 
  name = 'Supplier Purified Water 20L',
  description = 'Supplier-provided purified water 20L Jar'
WHERE id = 'a3a3a3a3-3333-3333-3333-333333333333';
