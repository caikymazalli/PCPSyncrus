-- ============================================================
-- PCP Syncrus — Migration 030: Fix Work Instructions schema drift
-- ============================================================
--
-- CONTEXT
-- -------
-- Production D1 (pcpsyncrus-production) may have a legacy `work_instructions`
-- table created before the migration system, with these columns:
--   id, user_id, title, code, version, status, product_id, operation,
--   estimated_time, steps (JSON), tools (JSON), epi (JSON), approved_by,
--   created_at, updated_at
--
-- Missing columns required by current code:
--   empresa_id, description, current_version, created_by, updated_by
--
-- Missing tables required by current code:
--   work_instruction_versions, work_instruction_steps,
--   work_instruction_photos, work_instruction_audit_log
--
-- IDEMPOTENCE
-- -----------
-- CREATE TABLE IF NOT EXISTS: safe to re-run (no-op if table exists).
-- CREATE INDEX IF NOT EXISTS: safe to re-run (no-op if index exists).
-- ALTER TABLE ADD COLUMN: will fail with "duplicate column name" if the
--   column already exists (e.g. migration 0020 or 0021 was applied).
--   This is expected and safe — the schema is already correct in that
--   environment. See migration 0022 for precedent.
-- ============================================================

-- ── Normalized tables ─────────────────────────────────────────────────────────
-- CREATE TABLE IF NOT EXISTS is idempotent; includes all required columns
-- (including R2 photo columns from migration 0021) so this migration is
-- self-contained for environments where 0020/0021 were never applied.

CREATE TABLE IF NOT EXISTS work_instruction_versions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  empresa_id TEXT,
  instruction_id TEXT NOT NULL,
  version TEXT,
  title TEXT,
  description TEXT,
  is_current INTEGER DEFAULT 0,
  status TEXT,
  created_at TEXT,
  created_by TEXT,
  FOREIGN KEY (instruction_id) REFERENCES work_instructions(id)
);

CREATE TABLE IF NOT EXISTS work_instruction_steps (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  empresa_id TEXT,
  version_id TEXT NOT NULL,
  step_number INTEGER,
  title TEXT,
  description TEXT,
  observation TEXT,
  created_at TEXT,
  created_by TEXT,
  FOREIGN KEY (version_id) REFERENCES work_instruction_versions(id)
);

CREATE TABLE IF NOT EXISTS work_instruction_photos (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  empresa_id TEXT,
  step_id TEXT NOT NULL,
  photo_url TEXT,
  file_name TEXT,
  uploaded_at TEXT,
  uploaded_by TEXT,
  object_key TEXT,
  content_type TEXT,
  FOREIGN KEY (step_id) REFERENCES work_instruction_steps(id)
);

CREATE TABLE IF NOT EXISTS work_instruction_audit_log (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  empresa_id TEXT,
  instruction_id TEXT,
  action TEXT,
  details TEXT,
  changed_by TEXT,
  changed_at TEXT,
  ip_address TEXT,
  FOREIGN KEY (instruction_id) REFERENCES work_instructions(id)
);

-- ── R2 columns on work_instruction_photos ─────────────────────────────────────
-- These are added by migration 0021. If the table above was just created by
-- this migration the ALTER will fail with "duplicate column name" (safe/expected).
-- If the table existed from migration 0020 but 0021 was never applied, these
-- ALTER TABLE statements will add the missing columns correctly.

ALTER TABLE work_instruction_photos ADD COLUMN object_key TEXT;
ALTER TABLE work_instruction_photos ADD COLUMN content_type TEXT;

-- ── Missing columns on work_instructions (legacy schema repair) ───────────────
-- ATENÇÃO: These ALTER TABLE statements will fail with "duplicate column name"
-- if migration 0020 was already applied. That is expected and safe.

ALTER TABLE work_instructions ADD COLUMN empresa_id TEXT;
ALTER TABLE work_instructions ADD COLUMN description TEXT;
ALTER TABLE work_instructions ADD COLUMN current_version TEXT;
ALTER TABLE work_instructions ADD COLUMN created_by TEXT;
ALTER TABLE work_instructions ADD COLUMN updated_by TEXT;

-- ── Indexes (idempotent) ──────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_work_instructions_user       ON work_instructions(user_id);
CREATE INDEX IF NOT EXISTS idx_work_instructions_empresa    ON work_instructions(empresa_id);
CREATE INDEX IF NOT EXISTS idx_work_instruction_versions_instruction ON work_instruction_versions(instruction_id);
CREATE INDEX IF NOT EXISTS idx_work_instruction_versions_empresa     ON work_instruction_versions(empresa_id);
CREATE INDEX IF NOT EXISTS idx_work_instruction_steps_version        ON work_instruction_steps(version_id);
CREATE INDEX IF NOT EXISTS idx_work_instruction_steps_empresa        ON work_instruction_steps(empresa_id);
CREATE INDEX IF NOT EXISTS idx_work_instruction_photos_step          ON work_instruction_photos(step_id);
CREATE INDEX IF NOT EXISTS idx_work_instruction_audit_log_instruction ON work_instruction_audit_log(instruction_id);
