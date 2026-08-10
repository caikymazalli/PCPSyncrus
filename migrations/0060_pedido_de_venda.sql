-- Migration 0060: Pedido de Venda (Fase 3 do módulo de Vendas)
-- Nasce a partir de um orçamento CONFIRMADO. Aqui, sim, entra a integração
-- real: verificação de estoque em tempo real, reserva automática do que já
-- existe, geração automática de Ordem de Produção para o que falta, e
-- UpsertCliente no Omie (cliente precisa existir de verdade a essa altura).

CREATE TABLE IF NOT EXISTS sales_orders (
  id                     TEXT PRIMARY KEY,
  empresa_id             TEXT NOT NULL,
  code                   TEXT NOT NULL,
  quote_id               TEXT,
  quote_version_number   INTEGER,
  customer_id            TEXT NOT NULL,
  status                 TEXT NOT NULL DEFAULT 'confirmado',
    -- 'confirmado' | 'em_producao_parcial' | 'pronto_para_expedicao' | 'entregue' | 'cancelado'
  subtotal               REAL DEFAULT 0,
  discount                REAL DEFAULT 0,
  total                   REAL DEFAULT 0,
  payment_condition       TEXT,
  payment_method          TEXT,
  omie_codigo_lancamento  INTEGER,   -- conta a receber no Omie (Fase 5)
  created_by              TEXT,
  created_at              TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sales_orders_empresa ON sales_orders(empresa_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_customer ON sales_orders(customer_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_orders_code ON sales_orders(empresa_id, code);

CREATE TABLE IF NOT EXISTS sales_order_items (
  id                    TEXT PRIMARY KEY,
  sales_order_id        TEXT NOT NULL,
  empresa_id            TEXT NOT NULL,
  product_code          TEXT NOT NULL,
  product_name          TEXT,
  quantity              REAL NOT NULL,
  unit_price            REAL NOT NULL DEFAULT 0,
  total                 REAL NOT NULL DEFAULT 0,
  qty_reserved_estoque  REAL NOT NULL DEFAULT 0,  -- quanto foi reservado do estoque já existente
  qty_producao          REAL NOT NULL DEFAULT 0,  -- quanto foi gerado como falta (via OP)
  production_order_id   TEXT,                      -- OP gerada automaticamente, se houver
  production_order_code TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sales_order_items_order ON sales_order_items(sales_order_id);

-- Rastreabilidade: qual número de série foi reservado/vendido em qual pedido/cliente
CREATE TABLE IF NOT EXISTS sales_order_serials (
  id                  TEXT PRIMARY KEY,
  sales_order_id      TEXT NOT NULL,
  sales_order_item_id TEXT NOT NULL,
  empresa_id          TEXT NOT NULL,
  serial_number_id    TEXT NOT NULL,
  serial_number       TEXT NOT NULL,
  product_code        TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'reservado',  -- 'reservado' | 'vendido'
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sales_order_serials_order ON sales_order_serials(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_sales_order_serials_customer_lookup ON sales_order_serials(empresa_id, product_code);

-- Estoque: quantidade reservada (produtos sem controle de série/lote)
ALTER TABLE stock_items ADD COLUMN reserved_qty REAL DEFAULT 0;

-- Serial: liga o serial reservado/gerado a um pedido de venda específico desde
-- o nascimento (quando a OP é gerada por falta de estoque na conversão do
-- pedido) — assim, ao ser endereçado, ele já sabe que está reservado para
-- este pedido em vez de cair como estoque genérico disponível.
ALTER TABLE serial_numbers ADD COLUMN sales_order_id TEXT;
ALTER TABLE serial_numbers ADD COLUMN sales_order_item_id TEXT;