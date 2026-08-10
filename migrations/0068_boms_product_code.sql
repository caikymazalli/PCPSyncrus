-- Migration 0068: BOM precisava de product_code (só tinha product_id) —
-- o resto do sistema (listagem, filtro por produto) já filtrava BOM por
-- product_code, então todo BOM cadastrado pela tela real nunca aparecia
-- corretamente filtrado. Corrigido aqui + no código que grava/lê BOM.
-- Também é pré-requisito para o motor de MRP (Planejamento), que precisa
-- casar BOM ↔ Ordem de Produção pelo código do produto.

ALTER TABLE boms ADD COLUMN product_code TEXT;
CREATE INDEX IF NOT EXISTS idx_boms_product_code ON boms(product_code);