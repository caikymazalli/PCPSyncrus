-- Migration 0043: Adicionar colunas desc_pt/desc_en em products e ncm/desc_pt/desc_en em stock_items
-- Também recria imp_prod_desc com índice se não existir

-- Adicionar desc_pt e desc_en na tabela products (para produtos cadastrados)
ALTER TABLE products ADD COLUMN desc_pt TEXT DEFAULT '';
ALTER TABLE products ADD COLUMN desc_en TEXT DEFAULT '';

-- Adicionar ncm, desc_pt, desc_en na tabela stock_items (para itens de estoque usados em importações)
ALTER TABLE stock_items ADD COLUMN ncm     TEXT DEFAULT '';
ALTER TABLE stock_items ADD COLUMN desc_pt TEXT DEFAULT '';
ALTER TABLE stock_items ADD COLUMN desc_en TEXT DEFAULT '';

-- Garantir que imp_prod_desc existe (criação segura)
CREATE TABLE IF NOT EXISTS imp_prod_desc (
  id         INTEGER  PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT     NOT NULL,
  empresa_id TEXT     DEFAULT '',
  code       TEXT     NOT NULL,
  field      TEXT     NOT NULL,
  value      TEXT     DEFAULT '',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, code, field)
);

CREATE INDEX IF NOT EXISTS idx_imp_prod_desc_user_code
  ON imp_prod_desc(user_id, code);
