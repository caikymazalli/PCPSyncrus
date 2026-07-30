-- ============================================================
-- Migration 053: Adicionar coluna status em registered_users
-- Para persistir o status do cliente (trial | active | inactive)
-- ============================================================

-- Adiciona coluna status (D1/SQLite: ALTER TABLE ADD COLUMN sem IF NOT EXISTS)
ALTER TABLE registered_users ADD COLUMN status TEXT DEFAULT 'trial';

-- Define valor padrão para todos os registros existentes
UPDATE registered_users
SET status = 'trial'
WHERE status IS NULL;
