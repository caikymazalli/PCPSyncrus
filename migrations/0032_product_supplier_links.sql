-- Migration: 0032_product_supplier_links
-- Creates the product_supplier_links table for explicit Fornecedor↔Produto bindings.
-- This is separate from product_suppliers (which tracks which suppliers can supply a product);
-- product_supplier_links records approved/active supplier relationships per product.

CREATE TABLE IF NOT EXISTS product_supplier_links (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL,
  empresa_id     TEXT NOT NULL DEFAULT '1',
  product_id     TEXT NOT NULL,
  supplier_id    TEXT NOT NULL,
  supplier_name  TEXT NOT NULL DEFAULT '',
  supplier_email TEXT NOT NULL DEFAULT '',
  supplier_phone TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_psl_user_id     ON product_supplier_links (user_id);
CREATE INDEX IF NOT EXISTS idx_psl_empresa_id  ON product_supplier_links (empresa_id);
CREATE INDEX IF NOT EXISTS idx_psl_product_id  ON product_supplier_links (product_id);
CREATE INDEX IF NOT EXISTS idx_psl_supplier_id ON product_supplier_links (supplier_id);
