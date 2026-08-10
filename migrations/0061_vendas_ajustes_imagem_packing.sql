-- Migration 0061: Ajustes de Vendas — vínculo OP↔Pedido, imagem de produto e
-- medidas de caixa/peso para geração de Packing List (Fase 3 — ajustes)

-- Liga a OP gerada automaticamente ao pedido de venda que a originou, para
-- que produtos SEM controle de série também mantenham a reserva correta
-- (reserved_qty) quando a produção concluir.
ALTER TABLE production_orders ADD COLUMN sales_order_id TEXT;

-- Imagem do produto (catálogo) — impressa em orçamentos e pedidos de venda.
ALTER TABLE products ADD COLUMN image_object_key TEXT;
ALTER TABLE products ADD COLUMN image_content_type TEXT;
ALTER TABLE products ADD COLUMN image_updated_at TEXT;

-- Medidas de caixa e peso por produto — usadas para gerar o Packing List
-- (auxilia cotação de frete interno; reutilizável em Importação, Exportação
-- e Roteirização, além de Vendas).
ALTER TABLE products ADD COLUMN units_per_box INTEGER DEFAULT 1;
ALTER TABLE products ADD COLUMN box_length_cm REAL DEFAULT 0;
ALTER TABLE products ADD COLUMN box_width_cm REAL DEFAULT 0;
ALTER TABLE products ADD COLUMN box_height_cm REAL DEFAULT 0;
ALTER TABLE products ADD COLUMN box_gross_weight_kg REAL DEFAULT 0;

CREATE TABLE IF NOT EXISTS packing_lists (
  id             TEXT PRIMARY KEY,
  empresa_id     TEXT NOT NULL,
  code           TEXT NOT NULL,
  reference_type TEXT,   -- 'pedido_venda' | 'importacao' | 'exportacao' | 'roteirizacao' | 'avulso'
  reference_id   TEXT,
  reference_code TEXT,
  notes          TEXT,
  created_by     TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_packing_lists_empresa ON packing_lists(empresa_id);
CREATE INDEX IF NOT EXISTS idx_packing_lists_reference ON packing_lists(reference_type, reference_id);

CREATE TABLE IF NOT EXISTS packing_list_items (
  id                 TEXT PRIMARY KEY,
  packing_list_id    TEXT NOT NULL,
  empresa_id         TEXT NOT NULL,
  product_code       TEXT NOT NULL,
  product_name       TEXT,
  quantity           REAL NOT NULL,
  units_per_box      INTEGER NOT NULL DEFAULT 1,
  boxes_qty          INTEGER NOT NULL DEFAULT 0,
  box_length_cm      REAL DEFAULT 0,
  box_width_cm       REAL DEFAULT 0,
  box_height_cm      REAL DEFAULT 0,
  box_gross_weight_kg REAL DEFAULT 0,
  total_gross_weight_kg REAL DEFAULT 0,
  total_volume_cbm   REAL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_packing_list_items_list ON packing_list_items(packing_list_id);