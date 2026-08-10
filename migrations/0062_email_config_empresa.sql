-- Migration 0062: Configuração de e-mail por empresa (não mais por usuário)
-- Hoje email_config é 1 registro por user_id — se quem configurou não for
-- quem depois dispara o envio (convite, cotação...), a config não é achada.
-- Adiciona empresa_id para permitir um único registro compartilhado por toda
-- a empresa, mantendo user_id como fallback de compatibilidade.

ALTER TABLE email_config ADD COLUMN empresa_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_config_empresa ON email_config(empresa_id);