-- 064_add_more_products.sql

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS image_url TEXT;

-- First, rename Ecosia to Aquacia
UPDATE public.products 
SET name = 'Aquacia 20L', description = 'Aquacia 20L Jar'
WHERE name = 'Aquafina 20L' OR name = 'Ecosia 20L';

-- Insert new products if they don't exist
INSERT INTO public.products (id, name, description, unit, image_url)
VALUES 
    (gen_random_uuid(), 'Aquacia 1L Pack of 12', 'Aquacia 1L Water Bottles (Pack of 12)', 'pack', 'aquacia_1l.png'),
    (gen_random_uuid(), 'Aquafina 1L Pack of 12', 'Aquafina 1L Water Bottles (Pack of 12)', 'pack', 'aquafina_1l.png'),
    (gen_random_uuid(), 'Aquafina 20L', 'Aquafina 20L Jar', 'jar', 'aquafina_20l.png'),
    (gen_random_uuid(), 'Bisleri 1L Pack of 12', 'Bisleri 1L Water Bottles (Pack of 12)', 'pack', 'bisleri_1l.png'),
    (gen_random_uuid(), 'Kinley 1L Pack of 12', 'Kinley 1L Water Bottles (Pack of 12)', 'pack', 'kinley_1l.png')
ON CONFLICT DO NOTHING;

-- Give all suppliers access to all products with a default price
INSERT INTO public.supplier_products (supplier_id, product_id, price)
SELECT s.id, p.id, 150 -- default price for packs/new items
FROM public.suppliers s
CROSS JOIN public.products p
WHERE p.name LIKE '%Pack%' OR p.name LIKE 'Aquafina%'
ON CONFLICT (supplier_id, product_id) DO NOTHING;
