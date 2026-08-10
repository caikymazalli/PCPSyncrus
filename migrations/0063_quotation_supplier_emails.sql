-- Migration 0063: Rastreio de envio de e-mail de cotação para fornecedores
-- A página pública de resposta já existia (/suprimentos/quote-response);
-- faltava o envio automático do link por e-mail. Esta tabela só registra
-- quando/para quem o e-mail foi disparado (não substitui supplierResponses).

CREATE TABLE IF NOT EXISTS quotation_supplier_emails (
  id             TEXT PRIMARY KEY,
  empresa_id     TEXT NOT NULL,
  quotation_id   TEXT NOT NULL,
  supplier_id    TEXT NOT NULL,
  email_sent_at  TEXT NOT NULL DEFAULT (datetime('now')),
  email_to       TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_qse_quotation_supplier ON quotation_supplier_emails(quotation_id, supplier_id);