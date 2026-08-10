-- Migration 0071: Assistência Técnica — Fase 4
-- Pesquisa de satisfação enviada junto com o e-mail de conclusão do chamado.

CREATE TABLE IF NOT EXISTS tech_ticket_satisfaction (
  id            TEXT PRIMARY KEY,
  empresa_id    TEXT NOT NULL,
  ticket_id     TEXT NOT NULL,
  public_token  TEXT UNIQUE NOT NULL,
  score         INTEGER,          -- 0 a 10, null até o cliente responder
  comment       TEXT,
  responded_at  TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tech_satisfaction_ticket ON tech_ticket_satisfaction(ticket_id);
CREATE INDEX IF NOT EXISTS idx_tech_satisfaction_token ON tech_ticket_satisfaction(public_token);