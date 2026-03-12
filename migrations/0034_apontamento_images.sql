-- Migration 0034: apontamento_images table
-- Stores photo metadata for Apontamento and NC evidence images.
-- Actual image data is stored in R2 (APT_PHOTOS_BUCKET binding).

CREATE TABLE IF NOT EXISTS apontamento_images (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  empresa_id  TEXT NOT NULL,
  ref_type    TEXT NOT NULL DEFAULT 'apt',   -- 'apt' | 'nc'
  ref_id      TEXT NOT NULL DEFAULT '',      -- apontamento id or NC id
  file_name   TEXT NOT NULL DEFAULT '',
  object_key  TEXT NOT NULL DEFAULT '',
  content_type TEXT NOT NULL DEFAULT 'image/jpeg',
  uploaded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_apontamento_images_ref
  ON apontamento_images (ref_type, ref_id);
