-- ZeroDown Initial Catalog Seed Data
-- 1. Categories
INSERT INTO categories (id, name, slug, description)
VALUES
    (1, 'Audio', 'audio', 'Premium headphones, speakers, and wireless earbuds'),
    (2, 'Wearables', 'wearables', 'Smartwatches, fitness bands, and classic timepieces'),
    (3, 'Accessories', 'accessories', 'Everyday backpacks, tech organizers, and lifestyle accessories')
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    slug = EXCLUDED.slug,
    description = EXCLUDED.description;

SELECT setval('categories_id_seq', (SELECT MAX(id) FROM categories));

-- 2. Products
INSERT INTO products (id, category_id, name, slug, description, price, old_price, stock_quantity, image_url, rating, review_count, is_active)
VALUES
    (1, 1, 'Sonic Pro Headphones', 'sonic-pro-headphones', 'Immersive audio with comfortable ergonomic ear cushions and deep bass.', 1499.00, 2499.00, 25, 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=700&auto=format&fit=crop', 4.8, 124, TRUE),
    (2, 2, 'Smart Watch Series X', 'smart-watch-series-x', 'Stay connected, monitor health metrics, and track daily fitness seamlessly.', 2299.00, 3299.00, 18, 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=700&auto=format&fit=crop', 4.7, 98, TRUE),
    (3, 3, 'Urban Everyday Backpack', 'urban-everyday-backpack', 'Water-resistant, durable minimalist backpack with dedicated laptop compartment.', 999.00, 1499.00, 30, 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=700&auto=format&fit=crop', 4.6, 76, TRUE),
    (4, 1, 'Pulse Bluetooth Speaker', 'pulse-bluetooth-speaker', 'High-definition 360-degree sound with 12 hours of continuous battery playback.', 1799.00, 2499.00, 15, 'https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=700&auto=format&fit=crop', 4.8, 112, TRUE),
    (5, 1, 'Studio Wireless Earbuds', 'studio-wireless-earbuds', 'Active noise reduction in an ultra-compact pocket-sized charging case.', 1299.00, 1999.00, 20, 'https://images.unsplash.com/photo-1606220945770-b5b6c2c55bf1?w=700&auto=format&fit=crop', 4.5, 64, TRUE),
    (6, 2, 'Classic Timepiece', 'classic-timepiece', 'Timeless stainless-steel analog watch crafted for everyday sophistication.', 1899.00, 2799.00, 12, 'https://images.unsplash.com/photo-1524805444758-089113d48a6d?w=700&auto=format&fit=crop', 4.7, 83, TRUE),
    (7, 3, 'Everyday Sunglasses', 'everyday-sunglasses', 'UV400 polarized lenses set in a featherweight matte acetate frame.', 799.00, 1199.00, 40, 'https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=700&auto=format&fit=crop', 4.4, 51, TRUE),
    (8, 3, 'Travel Tech Organizer', 'travel-tech-organizer', 'Dedicated zippered compartments for cables, chargers, adapters and accessories.', 699.00, 999.00, 35, 'https://images.unsplash.com/photo-1622560480654-d96214fdc887?w=700&auto=format&fit=crop', 4.6, 43, TRUE)
ON CONFLICT (id) DO UPDATE
SET category_id = EXCLUDED.category_id,
    name = EXCLUDED.name,
    slug = EXCLUDED.slug,
    description = EXCLUDED.description,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    stock_quantity = EXCLUDED.stock_quantity,
    image_url = EXCLUDED.image_url,
    rating = EXCLUDED.rating,
    review_count = EXCLUDED.review_count,
    is_active = EXCLUDED.is_active;

SELECT setval('products_id_seq', (SELECT MAX(id) FROM products));
