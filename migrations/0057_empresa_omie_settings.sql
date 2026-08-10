-- Migration 0057: Credenciais do Omie por empresa
-- Até aqui a integração com o Omie usava uma única configuração global
-- (platform_settings, tabela singleton). Esta migration permite que cada
-- empresa (tenant) do PCP Syncrus configure suas próprias credenciais do
-- Omie na própria área de administração, sem depender do painel interno
-- de desenvolvedor. A configuração global antiga continua funcionando
-- como fallback (compatibilidade), caso uma empresa ainda não tenha
-- configurado a própria.

CREATE TABLE IF NOT EXISTS empresa_omie_settings (
  empresa_id            TEXT PRIMARY KEY,
  omie_app_key          TEXT,
  omie_app_secret       TEXT,
  omie_conta_corrente   TEXT,
  omie_codigo_categoria TEXT,
  omie_codigo_servico   TEXT,
  omie_enabled          INTEGER NOT NULL DEFAULT 0,
  updated_by            TEXT,
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);