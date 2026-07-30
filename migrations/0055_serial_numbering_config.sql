-- Migration 0055: Configuração de numeração automática de série/lote
-- Permite definir, por empresa (regra padrão) e opcionalmente por produto
-- (override), como os números de série são compostos: sequencial puro,
-- data de fabricação + sequencial, ou máscara customizada (letras+números).
-- O contador fica em tabela separada para permitir incremento atômico e
-- reinício por período (nunca / anual / mensal / diário).

CREATE TABLE IF NOT EXISTS serial_numbering_rules (
  id           TEXT PRIMARY KEY,
  empresa_id   TEXT NOT NULL,
  product_code TEXT,                          -- NULL = regra padrão da empresa
  format_type  TEXT NOT NULL DEFAULT 'sequencial', -- 'sequencial' | 'data_sequencial' | 'mascara'
  prefix       TEXT DEFAULT '',
  date_format  TEXT DEFAULT 'YYYYMMDD',        -- usado quando format_type = 'data_sequencial'
  separator    TEXT DEFAULT '-',
  seq_length   INTEGER NOT NULL DEFAULT 6,     -- zero-padding do sequencial
  seq_reset    TEXT NOT NULL DEFAULT 'never',  -- 'never' | 'yearly' | 'monthly' | 'daily'
  mask         TEXT DEFAULT '',                -- usado quando format_type = 'mascara' (tokens {PREFIXO}{AAAA}{MM}{DD}{SEQ})
  active       INTEGER NOT NULL DEFAULT 1,
  created_by   TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Garante no máximo 1 regra padrão por empresa e 1 override por produto
CREATE UNIQUE INDEX IF NOT EXISTS idx_serial_rules_empresa_product
  ON serial_numbering_rules(empresa_id, COALESCE(product_code, '__default__'));
CREATE INDEX IF NOT EXISTS idx_serial_rules_empresa ON serial_numbering_rules(empresa_id);

CREATE TABLE IF NOT EXISTS serial_numbering_counters (
  id          TEXT PRIMARY KEY,
  empresa_id  TEXT NOT NULL,
  rule_key    TEXT NOT NULL,   -- product_code da regra específica, ou '__default__'
  bucket      TEXT NOT NULL,   -- 'ALL' | 'YYYY' | 'YYYYMM' | 'YYYYMMDD' conforme seq_reset da regra
  last_value  INTEGER NOT NULL DEFAULT 0,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_serial_counters_key
  ON serial_numbering_counters(empresa_id, rule_key, bucket);

-- Rastreabilidade: liga o serial gerado à regra que o originou
ALTER TABLE serial_numbers ADD COLUMN rule_id TEXT;
