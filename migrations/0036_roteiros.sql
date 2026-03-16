-- Migration 0036: Dedicated tables for Roteiros de Fabricação
-- Replaces the previous workaround of storing roteiros inside work_instructions.

-- ── Header table ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS roteiros (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  empresa_id  TEXT,
  product_id  TEXT,
  product_code TEXT,
  product_name TEXT,
  name        TEXT NOT NULL,
  version     TEXT NOT NULL DEFAULT '1.0',
  status      TEXT DEFAULT 'active',
  observacoes TEXT,
  is_active   INTEGER NOT NULL DEFAULT 1,
  parent_id   TEXT,
  created_at  TEXT,
  updated_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_roteiros_user_empresa_active
  ON roteiros(user_id, empresa_id, is_active);

-- ── Steps / Operations table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS roteiro_operacoes (
  id            TEXT PRIMARY KEY,
  roteiro_id    TEXT NOT NULL,
  user_id       TEXT NOT NULL,
  empresa_id    TEXT,
  order_index   INTEGER NOT NULL,
  operation     TEXT NOT NULL,
  standard_time REAL DEFAULT 0,
  resource_type TEXT DEFAULT 'manual',
  machine       TEXT,
  created_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_roteiro_operacoes_roteiro_order
  ON roteiro_operacoes(roteiro_id, order_index);
