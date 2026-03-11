-- ============================================================
-- PCP Syncrus — Migration 033: Support Tickets schema catchup
-- ============================================================
--
-- CONTEXT
-- -------
-- Migration 0031 created `support_tickets` without empresa_name,
-- atendente_id and atendente_name columns.  Migration 0032 added
-- those via ALTER TABLE, but may not have been applied in all
-- environments.  This migration ensures the columns exist.
--
-- IDEMPOTENCE
-- -----------
-- ALTER TABLE ADD COLUMN statements below will fail with
-- "duplicate column name" if migration 0032 was already applied
-- (columns already exist).  That failure is expected and safe —
-- the schema is already correct in that environment.  See
-- migration 0030 for the same pattern.
-- ============================================================

-- Ensure empresa_name is present so tenant-created tickets always
-- carry the company name visible in the Master panel.
ALTER TABLE support_tickets ADD COLUMN empresa_name  TEXT;

-- Operator-assignment tracking (filled by Master panel when
-- a support agent is assigned to a ticket).
ALTER TABLE support_tickets ADD COLUMN atendente_id   TEXT;
ALTER TABLE support_tickets ADD COLUMN atendente_name TEXT;
