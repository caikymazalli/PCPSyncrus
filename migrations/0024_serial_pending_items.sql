-- Migration 0024: serial_pending_items
-- Stores the serial/lot release queue per tenant so data survives worker restarts.
-- empresa_id enables multi-company isolation consistent with other tables.

CREATE TABLE IF NOT EXISTS serial_pending_items (
  id           TEXT    NOT NULL PRIMARY KEY,
  user_id      TEXT    NOT NULL,
  empresa_id   TEXT,
  product_code TEXT    NOT NULL,
  product_name TEXT    NOT NULL,
  total_qty    INTEGER NOT NULL DEFAULT 1,
  identified_qty INTEGER NOT NULL DEFAULT 0,
  unit         TEXT    NOT NULL DEFAULT 'un',
  control_type TEXT    NOT NULL DEFAULT 'serie',
  status       TEXT    NOT NULL DEFAULT 'pending',
  entries_json TEXT    NOT NULL DEFAULT '[]',
  imported_at  TEXT    NOT NULL,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_serial_pending_items_user_id ON serial_pending_items (user_id);
CREATE INDEX IF NOT EXISTS idx_serial_pending_items_empresa_id ON serial_pending_items (empresa_id);
