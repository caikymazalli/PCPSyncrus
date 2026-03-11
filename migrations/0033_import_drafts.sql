-- Migration 0033: Create import_drafts table for persisting product import drafts
-- Allows users to upload/paste data and continue later without losing progress

CREATE TABLE IF NOT EXISTS import_drafts (
  id          TEXT    PRIMARY KEY,
  user_id     TEXT    NOT NULL,
  empresa_id  TEXT,
  kind        TEXT    NOT NULL DEFAULT 'produtos',
  payload_json TEXT   NOT NULL,
  created_at  TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_import_drafts_user    ON import_drafts(user_id);
CREATE INDEX IF NOT EXISTS idx_import_drafts_empresa ON import_drafts(empresa_id);
CREATE INDEX IF NOT EXISTS idx_import_drafts_kind    ON import_drafts(user_id, empresa_id, kind);
