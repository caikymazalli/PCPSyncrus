-- ============================================================
-- Migration 054: Adicionar coluna obs em registered_users
-- Para persistir observações do master sobre cada cliente
-- ============================================================

ALTER TABLE registered_users ADD COLUMN obs TEXT DEFAULT '';
