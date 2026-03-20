-- Migration 0048: Financial Panel — payment_transactions + índices extras
-- Tabela centralizada de transações financeiras (complementa invoices)

CREATE TABLE IF NOT EXISTS payment_transactions (
  id TEXT PRIMARY KEY,
  invoice_id TEXT,
  user_id TEXT NOT NULL,
  empresa_id TEXT DEFAULT '1',
  empresa_name TEXT DEFAULT '',
  plan TEXT NOT NULL DEFAULT 'starter',
  type TEXT NOT NULL DEFAULT 'monthly',       -- monthly | setup | upgrade | refund | manual
  amount REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',     -- pending | paid | overdue | cancelled | refunded | failed
  due_date TEXT NOT NULL,
  paid_at TEXT DEFAULT NULL,
  payment_method TEXT DEFAULT '',             -- boleto | pix | credit_card | manual | free
  external_ref TEXT DEFAULT '',
  gateway TEXT DEFAULT '',                    -- stripe | asaas | pagseguro | manual
  notes TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ptx_user        ON payment_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_ptx_status      ON payment_transactions(status);
CREATE INDEX IF NOT EXISTS idx_ptx_due_date    ON payment_transactions(due_date);
CREATE INDEX IF NOT EXISTS idx_ptx_invoice     ON payment_transactions(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoices_due    ON invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_paid   ON invoices(paid_at);

