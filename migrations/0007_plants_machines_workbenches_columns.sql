-- Migration 0007: Adicionar colunas faltantes em plants, machines, workbenches
-- e corrigir user_id NULL nos registros existentes

-- plants: adicionar total_capacity, notes, status (texto) se não existirem
ALTER TABLE plants ADD COLUMN total_capacity INTEGER DEFAULT 0;
ALTER TABLE plants ADD COLUMN notes TEXT DEFAULT '';
ALTER TABLE plants ADD COLUMN status TEXT DEFAULT 'active';

-- machines: adicionar capacity, plant_name, specs
ALTER TABLE machines ADD COLUMN capacity TEXT DEFAULT '';
ALTER TABLE machines ADD COLUMN plant_name TEXT DEFAULT '';
ALTER TABLE machines ADD COLUMN specs TEXT DEFAULT '';

-- workbenches: adicionar plant_name
ALTER TABLE workbenches ADD COLUMN plant_name TEXT DEFAULT '';
