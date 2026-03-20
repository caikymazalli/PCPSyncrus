-- Migration 0047: Platform Settings
-- Tabela de configurações gerais da plataforma

CREATE TABLE IF NOT EXISTS platform_settings (
  id TEXT PRIMARY KEY DEFAULT 'singleton',
  -- Branding
  platform_name TEXT NOT NULL DEFAULT 'PCPSyncrus',
  platform_logo TEXT DEFAULT NULL,
  platform_favicon TEXT DEFAULT NULL,
  primary_color TEXT NOT NULL DEFAULT '#7c3aed',
  secondary_color TEXT NOT NULL DEFAULT '#2980B9',
  accent_color TEXT NOT NULL DEFAULT '#16a34a',
  sidebar_color TEXT NOT NULL DEFAULT '#1B4F72',
  -- Notificações e alertas
  notify_trial_expiry_days INTEGER NOT NULL DEFAULT 7,
  notify_plan_limit_pct INTEGER NOT NULL DEFAULT 80,
  notify_email_sender TEXT DEFAULT 'noreply@pcpsyncrus.com.br',
  notify_email_footer TEXT DEFAULT NULL,
  alert_slack_webhook TEXT DEFAULT NULL,
  alert_email_enabled INTEGER NOT NULL DEFAULT 1,
  alert_slack_enabled INTEGER NOT NULL DEFAULT 0,
  -- Backup
  backup_enabled INTEGER NOT NULL DEFAULT 1,
  backup_frequency TEXT NOT NULL DEFAULT 'daily',
  backup_retention_days INTEGER NOT NULL DEFAULT 30,
  backup_storage_provider TEXT NOT NULL DEFAULT 'r2',
  backup_storage_bucket TEXT DEFAULT NULL,
  backup_storage_key TEXT DEFAULT NULL,
  backup_last_run TEXT DEFAULT NULL,
  backup_next_run TEXT DEFAULT NULL,
  -- Segurança
  password_min_length INTEGER NOT NULL DEFAULT 8,
  password_require_uppercase INTEGER NOT NULL DEFAULT 1,
  password_require_number INTEGER NOT NULL DEFAULT 1,
  password_require_symbol INTEGER NOT NULL DEFAULT 0,
  password_expiry_days INTEGER NOT NULL DEFAULT 0,
  session_timeout_hours INTEGER NOT NULL DEFAULT 8,
  mfa_enabled INTEGER NOT NULL DEFAULT 0,
  ip_whitelist TEXT DEFAULT NULL,
  max_login_attempts INTEGER NOT NULL DEFAULT 5,
  lockout_duration_minutes INTEGER NOT NULL DEFAULT 30,
  -- API
  api_enabled INTEGER NOT NULL DEFAULT 1,
  api_rate_limit_per_minute INTEGER NOT NULL DEFAULT 60,
  api_allowed_origins TEXT DEFAULT '*',
  api_jwt_expiry_hours INTEGER NOT NULL DEFAULT 24,
  api_log_requests INTEGER NOT NULL DEFAULT 1,
  -- Plataforma geral
  maintenance_mode INTEGER NOT NULL DEFAULT 0,
  maintenance_message TEXT DEFAULT 'Sistema em manutenção. Voltamos em breve.',
  default_language TEXT NOT NULL DEFAULT 'pt-BR',
  default_timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  date_format TEXT NOT NULL DEFAULT 'DD/MM/YYYY',
  support_email TEXT DEFAULT 'suporte@pcpsyncrus.com.br',
  support_phone TEXT DEFAULT NULL,
  privacy_policy_url TEXT DEFAULT NULL,
  terms_url TEXT DEFAULT NULL,
  -- Metadados
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT DEFAULT NULL
);

-- Inserir configuração padrão (singleton)
INSERT OR IGNORE INTO platform_settings (id) VALUES ('singleton');

-- Tabela de chaves de API externas
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  empresa_id TEXT DEFAULT NULL,
  scopes TEXT NOT NULL DEFAULT '[]',
  rate_limit INTEGER NOT NULL DEFAULT 60,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_used TEXT DEFAULT NULL,
  expires_at TEXT DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT NOT NULL
);

-- Tabela de integrações de billing
CREATE TABLE IF NOT EXISTS billing_integrations (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  name TEXT NOT NULL,
  config TEXT NOT NULL DEFAULT '{}',
  enabled INTEGER NOT NULL DEFAULT 0,
  test_mode INTEGER NOT NULL DEFAULT 1,
  webhook_url TEXT DEFAULT NULL,
  last_sync TEXT DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

