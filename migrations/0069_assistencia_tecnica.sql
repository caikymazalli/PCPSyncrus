-- Migration 0069: Assistência Técnica / Pós-Vendas — Fase 1
-- Chamado técnico vinculado a cliente → produto comprado → número de série
-- específico (rastreabilidade que já existe em sales_order_serials), com
-- cálculo automático de garantia. Já cria o schema completo (incluindo
-- atendimento de campo e peças) para as fases seguintes não exigirem
-- mudança de estrutura depois — só a Fase 1 usa tudo isso ainda.

CREATE TABLE IF NOT EXISTS tech_occurrence_types (
  id             TEXT PRIMARY KEY,
  empresa_id     TEXT NOT NULL,
  name           TEXT NOT NULL,
  category       TEXT NOT NULL DEFAULT 'defeito',
    -- 'defeito' | 'manutencao_preventiva' | 'instalacao' | 'treinamento' | 'outro'
  default_priority TEXT NOT NULL DEFAULT 'medium',
  sla_hours      INTEGER DEFAULT 72,
  active         INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tech_occ_types_empresa ON tech_occurrence_types(empresa_id);

CREATE TABLE IF NOT EXISTS tech_tickets (
  id                     TEXT PRIMARY KEY,
  empresa_id             TEXT NOT NULL,
  code                   TEXT NOT NULL,
  customer_id            TEXT NOT NULL,        -- sales_customers.id
  sales_order_id         TEXT,                 -- pedido de origem da compra do item
  sales_order_serial_id  TEXT,                 -- sales_order_serials.id (item + serial específico)
  serial_number          TEXT,                 -- redundante por conveniência de busca/exibição
  product_code           TEXT,
  product_name           TEXT,
  occurrence_type_id     TEXT,
  title                  TEXT NOT NULL,
  description            TEXT,
  priority               TEXT NOT NULL DEFAULT 'medium',  -- low | medium | high | urgent
  status                 TEXT NOT NULL DEFAULT 'novo',
    -- novo | triagem | aguardando_visita | em_atendimento | aguardando_pecas | resolvido | cancelado
  warranty_product_status TEXT,   -- 'dentro_garantia' | 'fora_garantia' | 'nao_identificado' (snapshot na abertura)
  warranty_product_until  TEXT,   -- snapshot na abertura (data faturamento + 1 ano)
  warranty_part_status    TEXT,   -- 'dentro_garantia' | 'fora_garantia' | null (garantia de peça recém-trocada, se houver)
  warranty_part_until     TEXT,
  opened_by_name         TEXT,
  opened_by_user_id      TEXT,
  sla_due_at             TEXT,
  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at             TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at            TEXT
);
CREATE INDEX IF NOT EXISTS idx_tech_tickets_empresa ON tech_tickets(empresa_id);
CREATE INDEX IF NOT EXISTS idx_tech_tickets_customer ON tech_tickets(customer_id);
CREATE INDEX IF NOT EXISTS idx_tech_tickets_serial ON tech_tickets(serial_number);
CREATE INDEX IF NOT EXISTS idx_tech_tickets_status ON tech_tickets(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tech_tickets_code ON tech_tickets(empresa_id, code);

-- Atendimento de campo (Fase 2 usa isso pra valer, mas o schema já nasce
-- pronto pra Fase 1 já poder mostrar histórico/base instalada corretamente).
CREATE TABLE IF NOT EXISTS tech_visits (
  id                TEXT PRIMARY KEY,
  empresa_id        TEXT NOT NULL,
  ticket_id         TEXT NOT NULL,
  technician_name   TEXT,
  technician_type   TEXT DEFAULT 'interno',  -- 'interno' | 'parceiro' | 'terceirizado'
  technician_contact TEXT,
  scheduled_date    TEXT,
  status            TEXT NOT NULL DEFAULT 'agendado', -- agendado | realizado | cancelado
  public_token      TEXT UNIQUE,
  km_traveled       REAL DEFAULT 0,
  visit_cost        REAL DEFAULT 0,   -- valor da visita técnica (pago ao terceirizado)
  report_text       TEXT,
  arrived_at        TEXT,
  departed_at       TEXT,
  customer_signature_name TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_tech_visits_ticket ON tech_visits(ticket_id);
CREATE INDEX IF NOT EXISTS idx_tech_visits_token ON tech_visits(public_token);

CREATE TABLE IF NOT EXISTS tech_visit_parts (
  id                  TEXT PRIMARY KEY,
  empresa_id          TEXT NOT NULL,
  visit_id            TEXT NOT NULL,
  ticket_id           TEXT NOT NULL,   -- redundante, evita join extra pra consulta de histórico
  serial_number       TEXT,            -- número de série do equipamento sendo atendido (não da peça)
  product_code         TEXT,
  description          TEXT NOT NULL,
  quantity              REAL DEFAULT 1,
  unit_cost             REAL DEFAULT 0,
  covered_by_warranty   INTEGER NOT NULL DEFAULT 0,
  charged_value         REAL DEFAULT 0,  -- valor cobrado do cliente (se fora de garantia)
  part_warranty_until   TEXT,            -- data desta troca + 3 meses (garantia da peça)
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tech_visit_parts_visit ON tech_visit_parts(visit_id);
CREATE INDEX IF NOT EXISTS idx_tech_visit_parts_serial ON tech_visit_parts(serial_number, product_code);

CREATE TABLE IF NOT EXISTS tech_visit_photos (
  id          TEXT PRIMARY KEY,
  empresa_id  TEXT NOT NULL,
  visit_id    TEXT NOT NULL,
  object_key  TEXT NOT NULL,
  content_type TEXT,
  caption     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tech_visit_photos_visit ON tech_visit_photos(visit_id);