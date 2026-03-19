-- Migration 0045: Adicionar colunas faltantes na tabela imports
-- O código TypeScript insere code, supplier_name e modality mas o schema
-- criado em 0001 não possuía essas colunas, causando falha silenciosa no
-- INSERT e perda de dados dos processos de importação após deploy/reload.

ALTER TABLE imports ADD COLUMN code         TEXT DEFAULT '';
ALTER TABLE imports ADD COLUMN supplier_name TEXT DEFAULT '';
ALTER TABLE imports ADD COLUMN modality      TEXT DEFAULT 'maritimo';

-- Preencher retroativamente os registros existentes com valores padrão
UPDATE imports SET code = id          WHERE code         IS NULL OR code         = '';
UPDATE imports SET supplier_name = '' WHERE supplier_name IS NULL;
UPDATE imports SET modality = 'maritimo' WHERE modality  IS NULL OR modality     = '';
