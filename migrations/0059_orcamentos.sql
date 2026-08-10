-- Migration 0059: Orçamento versionado (Fase 2 do módulo de Vendas)
-- 100% local — não integra com o Omie. Cada orçamento pode ter várias
-- versões: a versão mais recente pode ser 'rascunho' (editável livremente)
-- ou 'confirmada' (congelada). Ao confirmar, a versão vira imutável; uma
-- nova edição depois disso cria uma versão nova (nunca sobrescreve uma
-- versão já confirmada). Vinculado a um prospect OU a um cliente completo.

CREATE TABLE IF NOT EXISTS sales_quotes (
  id               TEXT PRIMARY KEY,
  empresa_id       TEXT NOT NULL,
  code             TEXT NOT NULL,
  prospect_id      TEXT,
  customer_id      TEXT,
  status           TEXT NOT NULL DEFAULT 'aberto',  -- 'aberto' | 'convertido' | 'expirado' | 'perdido'
  current_version  INTEGER NOT NULL DEFAULT 1,
  converted_order_id TEXT,   -- preenchido quando vira pedido de venda (Fase 3)
  created_by       TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sales_quotes_empresa ON sales_quotes(empresa_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_quotes_code ON sales_quotes(empresa_id, code);

CREATE TABLE IF NOT EXISTS sales_quote_versions (
  id               TEXT PRIMARY KEY,
  quote_id         TEXT NOT NULL,
  empresa_id       TEXT NOT NULL,
  version_number   INTEGER NOT NULL,
  status           TEXT NOT NULL DEFAULT 'rascunho',  -- 'rascunho' | 'confirmada'
  items_json       TEXT NOT NULL DEFAULT '[]',  -- [{productCode,name,quantity,unitPrice,total}]
  subtotal         REAL DEFAULT 0,
  discount         REAL DEFAULT 0,
  total            REAL DEFAULT 0,
  payment_condition TEXT,
  payment_method    TEXT,
  validity_days     INTEGER DEFAULT 15,
  valid_until       TEXT,
  notes             TEXT,
  created_by        TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  confirmed_at      TEXT,
  confirmed_by      TEXT,
  FOREIGN KEY (quote_id) REFERENCES sales_quotes(id)
);
CREATE INDEX IF NOT EXISTS idx_sales_quote_versions_quote ON sales_quote_versions(quote_id);