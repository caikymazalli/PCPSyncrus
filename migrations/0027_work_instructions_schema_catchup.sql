-- ============================================================
-- PCP Syncrus — Migration 027: Work instructions schema catch-up
-- ============================================================
--
-- OBJETIVO
-- --------
-- Criar as tabelas de instruções de trabalho normalizadas que foram
-- introduzidas na migration 0020, mas que podem não ter sido aplicadas
-- em ambientes de produção que possuem um schema legado (work_instructions
-- com coluna JSON `steps` e sem `empresa_id`).
--
-- QUANDO APLICAR
-- --------------
-- Aplique esta migration se o ambiente de produção apresentar os erros:
--   • "no such column: empresa_id" em queries de work_instructions
--   • "no such table: work_instruction_versions" ou similares
--
-- IDEMPOTÊNCIA
-- ------------
-- Todos os CREATE TABLE e CREATE INDEX abaixo usam "IF NOT EXISTS",
-- portanto são 100% seguros para re-execução.
--
-- A coluna `empresa_id` na tabela `work_instructions` já existente
-- (schema legado) deve ser adicionada através do script idempotente:
--
--   npx vite-node scripts/d1-migrate-work-instructions.ts [DB_NAME]
--
-- Esse script usa PRAGMA table_info para verificar se a coluna existe
-- antes de tentar adicioná-la.
--
-- TABELAS CRIADAS / GARANTIDAS
-- ----------------------------
--   • work_instructions          (CREATE IF NOT EXISTS — schema correto)
--   • work_instruction_versions
--   • work_instruction_steps
--   • work_instruction_photos
--   • work_instruction_audit_log
-- ============================================================

-- Garante que work_instructions existe com o schema completo.
-- Se já existir (mesmo que com schema legado), esta instrução é ignorada.
CREATE TABLE IF NOT EXISTS work_instructions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  empresa_id  TEXT,
  code        TEXT,
  title       TEXT,
  description TEXT,
  current_version TEXT,
  status      TEXT,
  created_at  TEXT,
  created_by  TEXT,
  updated_at  TEXT,
  updated_by  TEXT
);

-- Versões de instruções
CREATE TABLE IF NOT EXISTS work_instruction_versions (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL,
  empresa_id     TEXT,
  instruction_id TEXT NOT NULL,
  version        TEXT,
  title          TEXT,
  description    TEXT,
  is_current     INTEGER DEFAULT 0,
  status         TEXT,
  created_at     TEXT,
  created_by     TEXT,
  FOREIGN KEY (instruction_id) REFERENCES work_instructions(id)
);

-- Etapas
CREATE TABLE IF NOT EXISTS work_instruction_steps (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  empresa_id  TEXT,
  version_id  TEXT NOT NULL,
  step_number INTEGER,
  title       TEXT,
  description TEXT,
  observation TEXT,
  created_at  TEXT,
  created_by  TEXT,
  FOREIGN KEY (version_id) REFERENCES work_instruction_versions(id)
);

-- Fotos das etapas
CREATE TABLE IF NOT EXISTS work_instruction_photos (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL,
  empresa_id   TEXT,
  step_id      TEXT NOT NULL,
  photo_url    TEXT,
  file_name    TEXT,
  object_key   TEXT,
  content_type TEXT,
  uploaded_at  TEXT,
  uploaded_by  TEXT,
  FOREIGN KEY (step_id) REFERENCES work_instruction_steps(id)
);

-- Histórico de auditoria
CREATE TABLE IF NOT EXISTS work_instruction_audit_log (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL,
  empresa_id     TEXT,
  instruction_id TEXT,
  action         TEXT,
  details        TEXT,
  changed_by     TEXT,
  changed_at     TEXT,
  ip_address     TEXT,
  FOREIGN KEY (instruction_id) REFERENCES work_instructions(id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_work_instructions_user
  ON work_instructions(user_id);
CREATE INDEX IF NOT EXISTS idx_work_instructions_empresa
  ON work_instructions(empresa_id);
CREATE INDEX IF NOT EXISTS idx_work_instruction_versions_instruction
  ON work_instruction_versions(instruction_id);
CREATE INDEX IF NOT EXISTS idx_work_instruction_versions_user
  ON work_instruction_versions(user_id);
CREATE INDEX IF NOT EXISTS idx_work_instruction_steps_version
  ON work_instruction_steps(version_id);
CREATE INDEX IF NOT EXISTS idx_work_instruction_steps_user
  ON work_instruction_steps(user_id);
CREATE INDEX IF NOT EXISTS idx_work_instruction_photos_step
  ON work_instruction_photos(step_id);
CREATE INDEX IF NOT EXISTS idx_work_instruction_audit_log_instruction
  ON work_instruction_audit_log(instruction_id);
