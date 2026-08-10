-- Migration 0072: Portal do Técnico / Empresa Terceirizada
-- Cadastro de prestador de serviço (com login próprio, separado do login
-- interno da empresa), agenda/compromissos (atendimentos da empresa +
-- compromissos externos que o próprio técnico inclui) e prevenção de
-- conflito de horário. Também adiciona cidade/região de cobertura, usada
-- pra filtrar quem pode atender um chamado por localização do cliente.

CREATE TABLE IF NOT EXISTS tech_providers (
  id             TEXT PRIMARY KEY,
  empresa_id     TEXT NOT NULL,
  name           TEXT NOT NULL,
  type           TEXT NOT NULL DEFAULT 'interno',  -- interno | parceiro | terceirizado
  email          TEXT,
  phone          TEXT,
  password_hash  TEXT,               -- login do portal (definido no primeiro acesso)
  first_access_token TEXT,           -- token de configuração de senha (primeiro acesso)
  cities         TEXT DEFAULT '[]',  -- JSON array de cidades/regiões atendidas
  bank_info      TEXT,               -- dados pra pagamento (texto livre por enquanto)
  status         TEXT NOT NULL DEFAULT 'ativo',  -- ativo | inativo
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tech_providers_empresa ON tech_providers(empresa_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tech_providers_email ON tech_providers(email);

-- Agenda unificada do técnico: atendimentos designados pela empresa +
-- compromissos externos que ele mesmo inclui (outras empresas, pessoal etc.)
-- — usada tanto pra roteirização do dia quanto pra bloquear conflito de horário.
CREATE TABLE IF NOT EXISTS tech_appointments (
  id            TEXT PRIMARY KEY,
  empresa_id    TEXT NOT NULL,
  provider_id   TEXT NOT NULL,
  title         TEXT NOT NULL,
  source        TEXT NOT NULL DEFAULT 'empresa',  -- 'empresa' | 'externo'
  visit_id      TEXT,             -- vínculo com tech_visits quando é atendimento desta empresa
  city          TEXT,
  address       TEXT,
  start_at      TEXT NOT NULL,
  end_at        TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'agendado',  -- agendado | concluido | cancelado
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tech_appointments_provider ON tech_appointments(provider_id, start_at);
CREATE INDEX IF NOT EXISTS idx_tech_appointments_visit ON tech_appointments(visit_id);

-- Liga o atendimento de campo a um prestador cadastrado (login no portal) e
-- adiciona janela de horário (antes só tinha data, sem hora — não dava pra
-- checar conflito de verdade).
ALTER TABLE tech_visits ADD COLUMN provider_id TEXT;
ALTER TABLE tech_visits ADD COLUMN scheduled_start TEXT;
ALTER TABLE tech_visits ADD COLUMN scheduled_end TEXT;