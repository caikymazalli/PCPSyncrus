-- ============================================================
-- PCP Syncrus — Migration 002: Auth tables + missing tables
-- ============================================================

-- Tabela de usuários registrados (auth)
CREATE TABLE IF NOT EXISTS registered_users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  pwd_hash TEXT NOT NULL,
  nome TEXT NOT NULL,
  sobrenome TEXT,
  empresa TEXT NOT NULL,
  plano TEXT DEFAULT 'starter',
  role TEXT DEFAULT 'admin',
  tel TEXT,
  setor TEXT,
  porte TEXT,
  is_demo INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  last_login TEXT,
  trial_start TEXT,
  trial_end TEXT
);

-- Tabela de sessões (auth)
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  nome TEXT NOT NULL,
  empresa TEXT NOT NULL,
  plano TEXT NOT NULL,
  role TEXT NOT NULL,
  is_demo INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

-- Tabela de boms (lista de materiais)
CREATE TABLE IF NOT EXISTS boms (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  component_id TEXT,
  component_name TEXT NOT NULL,
  component_code TEXT,
  quantity REAL DEFAULT 1,
  unit TEXT DEFAULT 'un',
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- Tabela de instruções de trabalho
CREATE TABLE IF NOT EXISTS work_instructions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  code TEXT NOT NULL,
  version TEXT DEFAULT '1.0',
  status TEXT DEFAULT 'draft',
  product_id TEXT,
  operation TEXT,
  estimated_time INTEGER DEFAULT 0,
  steps TEXT DEFAULT '[]',
  tools TEXT DEFAULT '[]',
  epi TEXT DEFAULT '[]',
  approved_by TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de apontamentos de produção
CREATE TABLE IF NOT EXISTS apontamentos (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  order_id TEXT,
  order_code TEXT,
  product_name TEXT,
  operator TEXT,
  machine TEXT,
  start_time TEXT,
  end_time TEXT,
  produced INTEGER DEFAULT 0,
  rejected INTEGER DEFAULT 0,
  reason TEXT,
  notes TEXT,
  shift TEXT DEFAULT 'manha',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de not conformances com user_id
-- (a tabela non_conformances existe mas sem user_id — adicionar coluna)
ALTER TABLE non_conformances ADD COLUMN user_id TEXT;
ALTER TABLE production_orders ADD COLUMN user_id TEXT;
ALTER TABLE production_entries ADD COLUMN user_id TEXT;
ALTER TABLE products ADD COLUMN user_id TEXT;
ALTER TABLE suppliers ADD COLUMN user_id TEXT;
ALTER TABLE stock_items ADD COLUMN user_id TEXT;
ALTER TABLE quotations ADD COLUMN user_id TEXT;
ALTER TABLE purchase_orders ADD COLUMN user_id TEXT;
ALTER TABLE imports ADD COLUMN user_id TEXT;
ALTER TABLE plants ADD COLUMN user_id TEXT;
ALTER TABLE machines ADD COLUMN user_id TEXT;
ALTER TABLE workbenches ADD COLUMN user_id TEXT;
ALTER TABLE almoxarifados ADD COLUMN user_id TEXT;
ALTER TABLE transferencias ADD COLUMN user_id TEXT;
ALTER TABLE kardex ADD COLUMN user_id TEXT;
