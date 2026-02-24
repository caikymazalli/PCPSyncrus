-- ============================================================
-- PCP Syncrus — Migration 003: Email config, Invites, Password Resets
-- ============================================================

-- Configuração de e-mail por tenant (SMTP / Resend)
CREATE TABLE IF NOT EXISTS email_config (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL UNIQUE,
  provider    TEXT NOT NULL DEFAULT 'resend', -- 'resend' | 'smtp'
  api_key     TEXT,          -- Resend API key (criptografado)
  smtp_host   TEXT,
  smtp_port   INTEGER DEFAULT 587,
  smtp_user   TEXT,
  smtp_pass   TEXT,          -- senha SMTP (criptografada)
  from_email  TEXT NOT NULL DEFAULT 'noreply@pcpsyncrus.com.br',
  from_name   TEXT NOT NULL DEFAULT 'PCP Syncrus',
  reply_to    TEXT,
  active      INTEGER DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Convites de usuários
CREATE TABLE IF NOT EXISTS invites (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,   -- quem convidou (tenant owner)
  email       TEXT NOT NULL,   -- e-mail convidado
  nome        TEXT,            -- nome opcional
  role        TEXT DEFAULT 'user',
  token       TEXT NOT NULL UNIQUE,
  status      TEXT DEFAULT 'pending', -- pending | accepted | expired | cancelled
  expires_at  TEXT NOT NULL,
  accepted_at TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_invites_token   ON invites(token);
CREATE INDEX IF NOT EXISTS idx_invites_user_id ON invites(user_id);
CREATE INDEX IF NOT EXISTS idx_invites_email   ON invites(email);

-- Reset de senha
CREATE TABLE IF NOT EXISTS password_resets (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL,
  token       TEXT NOT NULL UNIQUE,
  used        INTEGER DEFAULT 0,
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pwd_resets_token ON password_resets(token);
CREATE INDEX IF NOT EXISTS idx_pwd_resets_email ON password_resets(email);

-- Logs de e-mail enviados
CREATE TABLE IF NOT EXISTS email_logs (
  id          TEXT PRIMARY KEY,
  user_id     TEXT,
  to_email    TEXT NOT NULL,
  subject     TEXT NOT NULL,
  type        TEXT NOT NULL,  -- 'invite' | 'password_reset' | 'welcome' | 'notification'
  status      TEXT DEFAULT 'sent', -- 'sent' | 'failed' | 'bounced'
  provider_id TEXT,           -- ID retornado pelo provider
  error       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_email_logs_user_id ON email_logs(user_id);
