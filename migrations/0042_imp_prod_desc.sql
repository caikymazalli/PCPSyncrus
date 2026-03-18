-- Migration 0042: Criar tabela imp_prod_desc para NCM/descPT/descEN por código de produto
-- Os campos descPT (descrição PT) e descEN (descrição EN) são usados na importação.
-- NCM já existe na tabela products; descPT e descEN são salvos na tabela auxiliar.

-- Tabela auxiliar para descrições de importação (por código de produto)
CREATE TABLE IF NOT EXISTS imp_prod_desc (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  empresa_id TEXT DEFAULT '',
  code TEXT NOT NULL,
  field TEXT NOT NULL,
  value TEXT DEFAULT '',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, code, field)
);

-- Índice para consultas rápidas por user_id + code
CREATE INDEX IF NOT EXISTS idx_imp_prod_desc_user_code ON imp_prod_desc(user_id, code);

