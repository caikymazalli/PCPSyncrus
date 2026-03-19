-- Migration 0044: Adicionar campos de dados físicos (peso bruto, peso líquido, CBM) em products e stock_items
-- Usados para Packing List e cálculo automático de pesos totais

ALTER TABLE products    ADD COLUMN gross_weight REAL DEFAULT 0;
ALTER TABLE products    ADD COLUMN net_weight   REAL DEFAULT 0;
ALTER TABLE products    ADD COLUMN cbm          REAL DEFAULT 0;

ALTER TABLE stock_items ADD COLUMN gross_weight REAL DEFAULT 0;
ALTER TABLE stock_items ADD COLUMN net_weight   REAL DEFAULT 0;
ALTER TABLE stock_items ADD COLUMN cbm          REAL DEFAULT 0;
