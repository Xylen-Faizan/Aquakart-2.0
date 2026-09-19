-- 066_add_250ml_500ml_products.sql

INSERT INTO public.products (id, name, description, unit, image_url)
VALUES 
    (gen_random_uuid(), 'Aquacia 250ml Pack', 'Aquacia 250ml Water Bottles (Pack)', 'pack', 'aquacia_250ml.png'),
    (gen_random_uuid(), 'Aquacia 500ml Pack', 'Aquacia 500ml Water Bottles (Pack)', 'pack', 'aquacia_500ml.png'),
    (gen_random_uuid(), 'Aquafina 250ml Pack', 'Aquafina 250ml Water Bottles (Pack)', 'pack', 'aquafina_250ml.png'),
    (gen_random_uuid(), 'Bisleri 500ml Pack', 'Bisleri 500ml Water Bottles (Pack)', 'pack', 'bisleri_500ml.png'),
    (gen_random_uuid(), 'Kinley 250ml Pack', 'Kinley 250ml Water Bottles (Pack)', 'pack', 'kinley_250ml.png'),
    (gen_random_uuid(), 'Kinley 500ml Pack', 'Kinley 500ml Water Bottles (Pack)', 'pack', 'kinley_500ml.png')
ON CONFLICT DO NOTHING;

-- Give all suppliers access to all new products with a default price
INSERT INTO public.supplier_products (supplier_id, product_id, price)
SELECT s.id, p.id, 80 -- default price for smaller packs
FROM public.suppliers s
CROSS JOIN public.products p
WHERE p.name LIKE '%250ml%' OR p.name LIKE '%500ml%'
ON CONFLICT (supplier_id, product_id) DO NOTHING;
