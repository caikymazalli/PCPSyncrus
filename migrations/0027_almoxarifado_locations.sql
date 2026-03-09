-- Migration 0027: Almoxarifado Locations
-- Adds stock address/location entries linked to each almoxarifado.

CREATE TABLE IF NOT EXISTS almoxarifado_locations (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  empresa_id  TEXT NOT NULL,
  almoxarifado_id TEXT NOT NULL,
  code        TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'active', -- active | inactive
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_alm_locations_user    ON almoxarifado_locations(user_id);
CREATE INDEX IF NOT EXISTS idx_alm_locations_empresa ON almoxarifado_locations(empresa_id);
CREATE INDEX IF NOT EXISTS idx_alm_locations_alm     ON almoxarifado_locations(almoxarifado_id);
