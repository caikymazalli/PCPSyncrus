-- Migration 0041: Adicionar coluna notes à tabela products
-- O código TypeScript (import handler, PUT /api/:id, POST /api/create) referencia
-- a coluna 'notes' que não existia no schema, causando falha silenciosa no INSERT
-- e perda de dados após reload/deploy.

ALTER TABLE products ADD COLUMN notes TEXT DEFAULT '';

-- Copiar description para notes onde notes estiver vazio (retrocompatibilidade)
UPDATE products SET notes = description WHERE (notes IS NULL OR notes = '') AND (description IS NOT NULL AND description != '');
