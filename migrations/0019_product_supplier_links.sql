-- Migration 0019: Create product_supplier_links table
-- Persists supplier-product links so they survive deploys (D1-backed)

CREATE TABLE IF NOT EXISTS product_supplier_links (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  empresa_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  supplier_id TEXT NOT NULL,
  supplier_name TEXT NOT NULL,
  supplier_email TEXT,
  supplier_phone TEXT,
  status TEXT DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT,

  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
  UNIQUE(product_id, supplier_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_product_supplier_links_user
  ON product_supplier_links(user_id, empresa_id);
CREATE INDEX IF NOT EXISTS idx_product_supplier_links_product
  ON product_supplier_links(product_id);
CREATE INDEX IF NOT EXISTS idx_product_supplier_links_supplier
  ON product_supplier_links(supplier_id);
