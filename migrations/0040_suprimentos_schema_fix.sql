-- Migration 0040: Fix purchase_orders schema drift and add quotation_responses persistence
-- purchase_orders estava usando is_import mas schema tem import_flag; adicionar ambas
-- supplier_name e approved_at/approved_by estavam faltando

ALTER TABLE purchase_orders ADD COLUMN supplier_name TEXT DEFAULT '';
ALTER TABLE purchase_orders ADD COLUMN is_import INTEGER DEFAULT 0;
ALTER TABLE purchase_orders ADD COLUMN approved_at DATETIME;
ALTER TABLE purchase_orders ADD COLUMN approved_by TEXT;
ALTER TABLE purchase_orders ADD COLUMN quotation_code TEXT DEFAULT '';

-- Sincronizar import_flag com is_import para registros existentes
UPDATE purchase_orders SET is_import = import_flag WHERE is_import = 0 AND import_flag != 0;

-- quotation_responses já existe no schema 0001, mas adicionar colunas faltantes
-- supplier_name para quando o fornecedor ainda não tem ID cadastrado
ALTER TABLE quotation_responses ADD COLUMN supplier_name TEXT DEFAULT '';
ALTER TABLE quotation_responses ADD COLUMN responded_at DATETIME;
ALTER TABLE quotation_responses ADD COLUMN notes TEXT DEFAULT '';
ALTER TABLE quotation_responses ADD COLUMN user_id TEXT;
ALTER TABLE quotation_responses ADD COLUMN empresa_id TEXT DEFAULT '1';
