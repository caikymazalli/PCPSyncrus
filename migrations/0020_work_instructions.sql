-- Instruções (raiz)
CREATE TABLE IF NOT EXISTS work_instructions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  empresa_id TEXT,
  code TEXT,
  title TEXT,
  description TEXT,
  current_version TEXT,
  status TEXT,
  visibility TEXT DEFAULT 'creator',
  created_at TEXT,
  created_by TEXT,
  updated_at TEXT,
  updated_by TEXT
);

-- Versões de Instruções
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

-- Etapas
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

-- Fotos
CREATE TABLE IF NOT EXISTS work_instruction_photos (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  empresa_id TEXT,
  step_id TEXT NOT NULL,
  photo_url TEXT,
  file_name TEXT,
  object_key TEXT,
  content_type TEXT,
  uploaded_at TEXT,
  uploaded_by TEXT,
  FOREIGN KEY (step_id) REFERENCES work_instruction_steps(id)
);

-- Histórico de Auditoria (CRÍTICO para compliance)
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

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_work_instructions_user ON work_instructions(user_id);
CREATE INDEX IF NOT EXISTS idx_work_instructions_empresa ON work_instructions(empresa_id);
CREATE INDEX IF NOT EXISTS idx_work_instructions_visibility ON work_instructions(visibility);
CREATE INDEX IF NOT EXISTS idx_work_instruction_versions_instruction ON work_instruction_versions(instruction_id);
CREATE INDEX IF NOT EXISTS idx_work_instruction_steps_version ON work_instruction_steps(version_id);
CREATE INDEX IF NOT EXISTS idx_work_instruction_photos_step ON work_instruction_photos(step_id);
CREATE INDEX IF NOT EXISTS idx_work_instruction_audit_log_instruction ON work_instruction_audit_log(instruction_id);
