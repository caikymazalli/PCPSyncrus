-- Migration 017: Add user_id (NOT NULL DEFAULT '') and empresa_id to product_suppliers
-- Fixes multi-tenant support by ensuring required columns exist
-- NOTE: If migration 015 was already applied (user_id TEXT nullable), the ADD COLUMN
-- statements below will fail with "duplicate column" – that is expected and safe.
-- The runtime auto-migration in the application handles that case.

ALTER TABLE product_suppliers ADD COLUMN user_id TEXT NOT NULL DEFAULT '';
ALTER TABLE product_suppliers ADD COLUMN empresa_id TEXT;

CREATE INDEX IF NOT EXISTS idx_ps_user_id ON product_suppliers(user_id);
CREATE INDEX IF NOT EXISTS idx_ps_product_code ON product_suppliers(product_code);
CREATE INDEX IF NOT EXISTS idx_ps_product_id ON product_suppliers(product_id);
