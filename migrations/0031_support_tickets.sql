-- Migration: 0031_support_tickets
-- Creates support ticketing tables for Master and Tenant support modules.

CREATE TABLE IF NOT EXISTS support_tickets (
  id                TEXT PRIMARY KEY,
  empresa_id        TEXT NOT NULL,
  user_id           TEXT NOT NULL,
  created_by_name   TEXT,
  created_by_email  TEXT,
  assigned_to_user_id TEXT,
  title             TEXT NOT NULL,
  description       TEXT NOT NULL DEFAULT '',
  priority          TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical')),
  status            TEXT NOT NULL DEFAULT 'Criada' CHECK (status IN ('Criada','Analisando','N1','N2','N3','Resolvendo','Resolvida')),
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  resolved_at       TEXT,
  due_at            TEXT,
  last_activity_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_empresa   ON support_tickets (empresa_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status    ON support_tickets (status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_priority  ON support_tickets (priority);
CREATE INDEX IF NOT EXISTS idx_support_tickets_updated   ON support_tickets (updated_at);

CREATE TABLE IF NOT EXISTS support_ticket_comments (
  id         TEXT PRIMARY KEY,
  ticket_id  TEXT NOT NULL,
  empresa_id TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  comment    TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (ticket_id) REFERENCES support_tickets(id)
);

CREATE INDEX IF NOT EXISTS idx_support_comments_ticket  ON support_ticket_comments (ticket_id);
CREATE INDEX IF NOT EXISTS idx_support_comments_empresa ON support_ticket_comments (empresa_id);
