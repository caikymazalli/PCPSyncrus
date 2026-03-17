-- Migration 0039: add missing columns to non_conformances and apontamentos
-- root_cause + corrective_action were used in code but missing from non_conformances schema
-- time_spent was used in apontamentos code but missing from schema

-- non_conformances: campos de análise e ação corretiva
ALTER TABLE non_conformances ADD COLUMN root_cause        TEXT DEFAULT '';
ALTER TABLE non_conformances ADD COLUMN corrective_action TEXT DEFAULT '';

-- apontamentos: tempo gasto por etapa (usado no relatório e front-end)
ALTER TABLE apontamentos ADD COLUMN time_spent INTEGER DEFAULT 0;
