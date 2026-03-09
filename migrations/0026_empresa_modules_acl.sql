-- ============================================================
-- PCP Syncrus — Migration 026: empresa_modules ACL
-- Tabela de controle de acesso por módulo e empresa
-- ============================================================
--
-- OBJETIVO
-- --------
-- Armazenar o nível de acesso de cada módulo por empresa.
-- Se não houver registro, o acesso padrão é 'allowed'.
-- access_level pode ser: 'allowed' | 'read_only' | 'denied'
--
-- IDEMPOTÊNCIA
-- ------------
-- Usa IF NOT EXISTS em todas as instruções.
-- ============================================================

CREATE TABLE IF NOT EXISTS empresa_modules (
  id          TEXT PRIMARY KEY,
  empresa_id  TEXT NOT NULL,
  module_key  TEXT NOT NULL,
  access_level TEXT NOT NULL DEFAULT 'allowed',
  updated_at  TEXT NOT NULL,
  updated_by  TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_empresa_modules_empresa
  ON empresa_modules(empresa_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_empresa_modules_unique
  ON empresa_modules(empresa_id, module_key);
