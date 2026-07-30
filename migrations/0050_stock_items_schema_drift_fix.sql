-- ============================================================
-- Migration 0050: Corrige drift de schema na tabela stock_items
--
-- Problema: o código em estoque.ts usa nomes de colunas
-- diferentes dos definidos no schema original (0001).
--
-- Código envia:   current_qty  → schema tem: quantity
-- Código envia:   min_qty      → schema tem: min_quantity
-- Código envia:   max_qty      → coluna não existia
-- Código usa:     user_id      → só adicionada em 0002 (pode faltar)
-- ============================================================

-- 1. Adicionar aliases de coluna que o código TypeScript usa
--    (current_qty, min_qty, max_qty) como colunas reais

-- current_qty (alias de quantity — código sempre salva neste nome)
ALTER TABLE stock_items ADD COLUMN current_qty REAL DEFAULT 0;

-- min_qty (alias de min_quantity — código sempre salva neste nome)
ALTER TABLE stock_items ADD COLUMN min_qty REAL DEFAULT 0;

-- max_qty (coluna nova — não existia no schema original)
ALTER TABLE stock_items ADD COLUMN max_qty REAL DEFAULT 0;

-- 2. Garantir que user_id exista (pode não ter sido aplicada migration 0002)
ALTER TABLE stock_items ADD COLUMN user_id TEXT;

-- 3. Sincronizar valores existentes das colunas antigas para as novas
UPDATE stock_items
  SET current_qty = quantity,
      min_qty     = min_quantity
  WHERE current_qty = 0 AND quantity > 0;

-- 4. Índice para filtragem por tenant
CREATE INDEX IF NOT EXISTS idx_stock_items_user ON stock_items(user_id);
