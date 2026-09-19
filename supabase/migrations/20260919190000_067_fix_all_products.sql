-- 067_fix_all_products.sql

-- 1. Fix missing image_urls for 20L jars that were added in migration 061
UPDATE public.products SET image_url = 'bisleri_20l.png' WHERE name = 'Bisleri 20L';
UPDATE public.products SET image_url = 'jar_20l.png' WHERE name = 'Aquacia 20L';
UPDATE public.products SET image_url = 'jar_20l.png' WHERE name = 'Kinley 20L';

-- 2. Insert missing 250ml/500ml packs that migration 066 forgot
INSERT INTO public.products (id, name, description, unit, image_url, active)
VALUES 
    (gen_random_uuid(), 'Bisleri 250ml Pack', 'Bisleri 250ml Water Bottles (Pack)', 'pack', 'bisleri_250ml.png', true),
    (gen_random_uuid(), 'Aquafina 500ml Pack', 'Aquafina 500ml Water Bottles (Pack)', 'pack', 'aquafina_500ml.png', true)
ON CONFLICT DO NOTHING;

-- 3. Ensure ALL these smaller packs are assigned to ALL active suppliers 
-- so they show up in the Brand UI and Bulk Orders UI.
INSERT INTO public.supplier_products (supplier_id, product_id, price, available)
SELECT s.id, p.id, 80, true
FROM public.suppliers s
CROSS JOIN public.products p
WHERE (p.name LIKE '%250ml%' OR p.name LIKE '%500ml%')
AND s.is_active = true
ON CONFLICT (supplier_id, product_id) DO UPDATE 
SET available = true;
