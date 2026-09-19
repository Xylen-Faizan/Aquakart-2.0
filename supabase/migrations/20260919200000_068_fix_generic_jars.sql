-- Update generic jar product images

UPDATE public.products 
SET image_url = 'jar_20l.png' 
WHERE name = '20L Water Jar';

UPDATE public.products 
SET image_url = 'cool_jar.jpg' 
WHERE name = '20L Cool Jar (Chilled Water Dispenser)';
