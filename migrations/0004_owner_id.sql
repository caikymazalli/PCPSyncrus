-- ============================================================
-- PCP Syncrus — Migration 004: owner_id em registered_users
-- Relaciona usuários convidados ao dono da conta (tenant owner)
-- ============================================================

-- owner_id = NULL → conta principal (admin da empresa)
-- owner_id = <id do admin> → usuário convidado que pertence a essa empresa
ALTER TABLE registered_users ADD COLUMN owner_id TEXT DEFAULT NULL;

-- Índice para busca rápida de todos os membros de uma empresa
CREATE INDEX IF NOT EXISTS idx_registered_users_owner_id ON registered_users(owner_id);
