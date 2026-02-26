-- Migration 005: Add missing columns to products and suppliers
-- Only adds columns that don't exist yet

-- Products: add missing columns
ALTER TABLE products ADD COLUMN type TEXT DEFAULT 'external';
ALTER TABLE products ADD COLUMN stock_max INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN price REAL DEFAULT 0;
ALTER TABLE products ADD COLUMN supplier_id TEXT;
ALTER TABLE products ADD COLUMN critical_percentage INTEGER DEFAULT 50;
