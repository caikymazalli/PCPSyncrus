-- Migration 0028: Make serial_numbers tenant-aware and location-aware
-- Adds user_id, empresa_id, almoxarifado_id, location columns (idempotent).

ALTER TABLE serial_numbers ADD COLUMN user_id TEXT;
ALTER TABLE serial_numbers ADD COLUMN empresa_id TEXT;
ALTER TABLE serial_numbers ADD COLUMN almoxarifado_id TEXT;
ALTER TABLE serial_numbers ADD COLUMN location TEXT;

CREATE INDEX IF NOT EXISTS idx_serial_numbers_user    ON serial_numbers(user_id);
CREATE INDEX IF NOT EXISTS idx_serial_numbers_empresa ON serial_numbers(empresa_id);
CREATE INDEX IF NOT EXISTS idx_serial_numbers_alm     ON serial_numbers(almoxarifado_id);
