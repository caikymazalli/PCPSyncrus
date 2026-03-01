-- Migration 016: Add multi-supplier columns to products
-- Supports up to 4 suppliers per product (1 required + 3 optional)

ALTER TABLE products ADD COLUMN supplier_id_1 TEXT;
ALTER TABLE products ADD COLUMN supplier_id_2 TEXT;
ALTER TABLE products ADD COLUMN supplier_id_3 TEXT;
ALTER TABLE products ADD COLUMN supplier_id_4 TEXT;

-- Migrate existing supplier_id to supplier_id_1
UPDATE products SET supplier_id_1 = supplier_id WHERE supplier_id IS NOT NULL AND supplier_id != '';

CREATE INDEX IF NOT EXISTS idx_products_supplier_id_1 ON products(supplier_id_1);
