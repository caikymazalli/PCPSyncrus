-- Migration 0037: audit fields for roteiros (who created/updated)
-- Adds:
--  - created_by_user_id: who created this roteiro version
--  - updated_by_user_id: who last updated this roteiro version
--
-- NOTE: D1/SQLite does NOT support "ADD COLUMN IF NOT EXISTS".
-- If these columns already exist (e.g. migration was already applied manually),
-- this migration will fail with "duplicate column name: created_by_user_id".
-- That error indicates the schema is already correct and can be safely ignored
-- (same pattern used in migration 0022_empresa_id_everywhere.sql).
-- To verify column existence before running: PRAGMA table_info(roteiros);

ALTER TABLE roteiros ADD COLUMN created_by_user_id TEXT;
ALTER TABLE roteiros ADD COLUMN updated_by_user_id TEXT;
