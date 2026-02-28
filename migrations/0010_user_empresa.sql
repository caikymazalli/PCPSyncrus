-- ============================================================
-- PCP Syncrus — Migration 010: Tabela user_empresa + colunas de sessão
-- Implementa hierarquia Grupo → Empresa → Usuário
-- ============================================================

-- Tabela de vínculo usuário ↔ empresa (multi-tenant)
CREATE TABLE IF NOT EXISTS user_empresa (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  empresa_id TEXT NOT NULL,
  role TEXT DEFAULT 'user',
  permissions TEXT DEFAULT '[]',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
  UNIQUE(user_id, empresa_id)
);

CREATE INDEX IF NOT EXISTS idx_user_empresa_user ON user_empresa(user_id);
CREATE INDEX IF NOT EXISTS idx_user_empresa_empresa ON user_empresa(empresa_id);

-- Adicionar colunas de grupo/empresa à tabela de sessões
ALTER TABLE sessions ADD COLUMN grupo_id TEXT;
ALTER TABLE sessions ADD COLUMN empresa_id TEXT;
ALTER TABLE sessions ADD COLUMN empresa_name TEXT;
