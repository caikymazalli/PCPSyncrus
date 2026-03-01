-- Migration 015: Add user_id, empresa_id, product_code columns to product_suppliers
-- Enables tenant-scoped persistence and lookup by product code

ALTER TABLE product_suppliers ADD COLUMN user_id TEXT;
ALTER TABLE product_suppliers ADD COLUMN empresa_id TEXT;
ALTER TABLE product_suppliers ADD COLUMN product_code TEXT;

CREATE INDEX IF NOT EXISTS idx_product_suppliers_user ON product_suppliers(user_id);
CREATE INDEX IF NOT EXISTS idx_product_suppliers_product_code ON product_suppliers(product_code, user_id);
