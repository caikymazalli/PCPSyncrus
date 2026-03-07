-- ============================================================
-- PCP Syncrus — Migration 023: Colunas de logo no grupo
-- ============================================================
-- Adiciona suporte a logo do grupo armazenado no R2.
-- NOTA: SQLite/D1 não suporta ALTER TABLE ADD COLUMN IF NOT EXISTS.
-- Estas alterações podem falhar com "duplicate column name" se a
-- migration já foi aplicada — esse erro é seguro e pode ser ignorado.
-- ============================================================

ALTER TABLE grupo ADD COLUMN logo_object_key TEXT;
ALTER TABLE grupo ADD COLUMN logo_content_type TEXT;
ALTER TABLE grupo ADD COLUMN logo_updated_at TEXT;
