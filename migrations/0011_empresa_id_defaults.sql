-- ============================================================
-- PCP Syncrus — Migration 011: empresa_id defaults e novas colunas
-- Garante que empresa_id tenha valor padrão '1' em todas as tabelas
-- ============================================================

-- Adicionar empresa_id nas tabelas que não possuem a coluna
ALTER TABLE boms ADD COLUMN empresa_id TEXT DEFAULT '1';
ALTER TABLE apontamentos ADD COLUMN empresa_id TEXT DEFAULT '1';
ALTER TABLE machines ADD COLUMN empresa_id TEXT DEFAULT '1';
ALTER TABLE workbenches ADD COLUMN empresa_id TEXT DEFAULT '1';
ALTER TABLE separation_orders ADD COLUMN empresa_id TEXT DEFAULT '1';
ALTER TABLE stock_exits ADD COLUMN empresa_id TEXT DEFAULT '1';
ALTER TABLE supplier_categories ADD COLUMN empresa_id TEXT DEFAULT '1';

-- Atualizar registros existentes que estão com empresa_id NULL ou vazio
UPDATE plants SET empresa_id = '1' WHERE empresa_id IS NULL OR empresa_id = '';
UPDATE machines SET empresa_id = '1' WHERE empresa_id IS NULL OR empresa_id = '';
UPDATE workbenches SET empresa_id = '1' WHERE empresa_id IS NULL OR empresa_id = '';
UPDATE products SET empresa_id = '1' WHERE empresa_id IS NULL OR empresa_id = '';
UPDATE boms SET empresa_id = '1' WHERE empresa_id IS NULL OR empresa_id = '';
UPDATE production_orders SET empresa_id = '1' WHERE empresa_id IS NULL OR empresa_id = '';
UPDATE apontamentos SET empresa_id = '1' WHERE empresa_id IS NULL OR empresa_id = '';
UPDATE suppliers SET empresa_id = '1' WHERE empresa_id IS NULL OR empresa_id = '';
UPDATE quotations SET empresa_id = '1' WHERE empresa_id IS NULL OR empresa_id = '';
UPDATE purchase_orders SET empresa_id = '1' WHERE empresa_id IS NULL OR empresa_id = '';
UPDATE imports SET empresa_id = '1' WHERE empresa_id IS NULL OR empresa_id = '';
UPDATE stock_items SET empresa_id = '1' WHERE empresa_id IS NULL OR empresa_id = '';
UPDATE non_conformances SET empresa_id = '1' WHERE empresa_id IS NULL OR empresa_id = '';
UPDATE separation_orders SET empresa_id = '1' WHERE empresa_id IS NULL OR empresa_id = '';
UPDATE stock_exits SET empresa_id = '1' WHERE empresa_id IS NULL OR empresa_id = '';
UPDATE supplier_categories SET empresa_id = '1' WHERE empresa_id IS NULL OR empresa_id = '';
