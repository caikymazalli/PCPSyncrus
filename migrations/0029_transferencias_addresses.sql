-- Migration 0029: Add origin/destination address fields to transferencias
-- Adds endereco_origem_id and endereco_destino_id to link transfer records
-- to almoxarifado_locations entries.

ALTER TABLE transferencias ADD COLUMN endereco_origem_id TEXT;
ALTER TABLE transferencias ADD COLUMN endereco_destino_id TEXT;
