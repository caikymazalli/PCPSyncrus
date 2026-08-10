-- Migration 0065: Fase 1 da melhoria de Roteirização — liga a Cotação de
-- Frete aprovada à execução real da rota. Até aqui, aprovar uma cotação só
-- mudava um contador no dashboard; a rota tinha que ser criada do zero, sem
-- nenhum dado aproveitado (transportadora vencedora, valor negociado etc.)

ALTER TABLE rot_rotas ADD COLUMN modo_transporte TEXT NOT NULL DEFAULT 'frota_propria';
  -- 'frota_propria' | 'terceirizado'
ALTER TABLE rot_rotas ADD COLUMN transportadora_nome TEXT;
ALTER TABLE rot_rotas ADD COLUMN transportadora_contato TEXT;
ALTER TABLE rot_rotas ADD COLUMN valor_frete REAL DEFAULT 0;
ALTER TABLE rot_rotas ADD COLUMN cotacao_frete_id TEXT;

CREATE INDEX IF NOT EXISTS idx_rot_rotas_cotacao ON rot_rotas(cotacao_frete_id);