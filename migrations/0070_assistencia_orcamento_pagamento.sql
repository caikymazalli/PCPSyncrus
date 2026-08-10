-- Migration 0070: Assistência Técnica — Fase 3
-- Orçamento de aprovação do cliente (pra reparos fora de garantia) + controle
-- de valores: quanto vai ser cobrado do cliente e quanto vai ser pago ao
-- técnico/parceiro/terceirizado por cada atendimento.

CREATE TABLE IF NOT EXISTS tech_ticket_budgets (
  id              TEXT PRIMARY KEY,
  empresa_id      TEXT NOT NULL,
  ticket_id       TEXT NOT NULL,
  code            TEXT NOT NULL,
  items_json      TEXT NOT NULL DEFAULT '[]',  -- [{description, quantity, unitValue, total}]
  visit_fee       REAL DEFAULT 0,
  total_value     REAL NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'pendente',  -- pendente | aprovado | rejeitado
  public_token    TEXT UNIQUE,
  customer_decision_at    TEXT,
  customer_decision_notes TEXT,
  created_by      TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tech_budgets_ticket ON tech_ticket_budgets(ticket_id);
CREATE INDEX IF NOT EXISTS idx_tech_budgets_token ON tech_ticket_budgets(public_token);

-- Controle de pagamento ao técnico/parceiro/terceirizado por atendimento
ALTER TABLE tech_visits ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'pendente'; -- pendente | pago
ALTER TABLE tech_visits ADD COLUMN payment_paid_at TEXT;

-- Controle de recebimento do valor aprovado pelo cliente
ALTER TABLE tech_ticket_budgets ADD COLUMN receipt_status TEXT NOT NULL DEFAULT 'pendente'; -- pendente | recebido
ALTER TABLE tech_ticket_budgets ADD COLUMN receipt_received_at TEXT;