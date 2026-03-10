-- Migration: 0032_support_tickets_fields
-- Adds empresa_name, atendente_id, atendente_name to support_tickets for
-- standardised client display and operator-assignment tracking.

ALTER TABLE support_tickets ADD COLUMN empresa_name  TEXT;
ALTER TABLE support_tickets ADD COLUMN atendente_id   TEXT;
ALTER TABLE support_tickets ADD COLUMN atendente_name TEXT;
