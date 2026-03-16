-- Migration 0035: adicionar coluna razao_social na tabela empresas
ALTER TABLE empresas ADD COLUMN razao_social TEXT;
