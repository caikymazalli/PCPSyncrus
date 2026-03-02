-- Migration 0018: Add quotation_statuses and quotation_negotiations tables
-- Deploy safeguards: persistent audit trail and negotiation records

CREATE TABLE IF NOT EXISTS quotation_statuses (
  id TEXT PRIMARY KEY,
  quotation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  empresa_id TEXT DEFAULT '',
  previous_status TEXT DEFAULT '',
  new_status TEXT NOT NULL,
  changed_by TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS quotation_negotiations (
  id TEXT PRIMARY KEY,
  quotation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  empresa_id TEXT DEFAULT '',
  observations TEXT DEFAULT '',
  created_by TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_quotation_statuses_quotation ON quotation_statuses(quotation_id);
CREATE INDEX IF NOT EXISTS idx_quotation_statuses_user ON quotation_statuses(user_id);
CREATE INDEX IF NOT EXISTS idx_quotation_negotiations_quotation ON quotation_negotiations(quotation_id);
