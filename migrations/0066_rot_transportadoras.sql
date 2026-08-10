-- Migration 0066: Fase 2 — Cadastro de Transportadora reutilizável.
-- Até aqui, cada cotação de frete tinha as transportadoras digitadas como
-- texto livre, sem nenhum reaproveitamento — impossível ver histórico de
-- preço/desempenho de uma transportadora ao longo do tempo. Agora existe um
-- cadastro próprio, e tanto a cotação quanto a rota guardam o vínculo (id)
-- com a transportadora registrada, além do nome (para transportadoras
-- avulsas, digitadas na hora, que continuam funcionando sem cadastro prévio).

CREATE TABLE IF NOT EXISTS rot_transportadoras (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  empresa_id      TEXT DEFAULT '1',
  nome            TEXT NOT NULL,
  cnpj            TEXT,
  contato_nome    TEXT,
  contato_telefone TEXT,
  contato_email   TEXT,
  modais          TEXT DEFAULT '["rodoviario"]',  -- JSON array: rodoviario/aereo/maritimo/ferroviario
  status          TEXT NOT NULL DEFAULT 'ativa',   -- ativa | inativa
  observacoes     TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rot_transp_user ON rot_transportadoras(user_id);
CREATE INDEX IF NOT EXISTS idx_rot_transp_empresa ON rot_transportadoras(empresa_id);

ALTER TABLE rot_rotas ADD COLUMN transportadora_id TEXT;
CREATE INDEX IF NOT EXISTS idx_rot_rotas_transportadora ON rot_rotas(transportadora_id);