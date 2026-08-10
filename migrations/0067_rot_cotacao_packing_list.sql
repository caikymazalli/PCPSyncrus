-- Migration 0067: Fase 4 — Integração do Packing List com a Cotação de Frete.
-- Antes, o volume/peso da cotação era sempre digitado manualmente de novo,
-- mesmo quando já existia um Packing List gerado (ex: a partir de um Pedido
-- de Venda). Agora a cotação pode importar os volumes diretamente dele.

ALTER TABLE rot_cotacoes_frete ADD COLUMN packing_list_id TEXT;
CREATE INDEX IF NOT EXISTS idx_rot_cotfrete_packing ON rot_cotacoes_frete(packing_list_id);