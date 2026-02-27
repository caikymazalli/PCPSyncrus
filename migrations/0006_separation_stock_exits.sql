-- Migration 0006: Separation orders and stock exits tables

CREATE TABLE IF NOT EXISTS separation_orders (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  code          TEXT NOT NULL,
  pedido        TEXT,
  cliente       TEXT,
  data_separacao TEXT,
  responsavel   TEXT,
  status        TEXT DEFAULT 'pending',
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES registered_users(id)
);

CREATE TABLE IF NOT EXISTS separation_order_items (
  id            TEXT PRIMARY KEY,
  order_id      TEXT NOT NULL,
  user_id       TEXT NOT NULL,
  product_code  TEXT,
  product_name  TEXT,
  quantity      INTEGER DEFAULT 1,
  serial_number TEXT,
  FOREIGN KEY (order_id) REFERENCES separation_orders(id)
);

CREATE TABLE IF NOT EXISTS stock_exits (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  code          TEXT NOT NULL,
  type          TEXT DEFAULT 'requisicao',
  pedido        TEXT,
  nf            TEXT,
  date          TEXT,
  responsavel   TEXT,
  notes         TEXT,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES registered_users(id)
);

CREATE TABLE IF NOT EXISTS stock_exit_items (
  id            TEXT PRIMARY KEY,
  exit_id       TEXT NOT NULL,
  user_id       TEXT NOT NULL,
  item_code     TEXT,
  item_name     TEXT,
  quantity      INTEGER DEFAULT 1,
  FOREIGN KEY (exit_id) REFERENCES stock_exits(id)
);

CREATE INDEX IF NOT EXISTS idx_separation_orders_user ON separation_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_stock_exits_user ON stock_exits(user_id);
