-- Migration 0013: Migrar empresas reais com grupos por empresa
-- Remove IDs demo (e1, e2, e3) e insere empresas reais com IDs sequenciais
-- Cada empresa recebe um grupo com o mesmo nome

-- Limpar dados demo
DELETE FROM grupo WHERE id IN ('e1', 'e2', 'e3');
DELETE FROM empresas WHERE id IN ('e1', 'e2', 'e3');

-- Criar grupos com mesmo nome das empresas
INSERT OR REPLACE INTO grupo (id, name, created_at)
VALUES 
  ('1', 'Woson Latam Comércio de Equipamentos Médicos Odontológicos Ltda', CURRENT_TIMESTAMP),
  ('2', 'Empresa Validação Final LTDA', CURRENT_TIMESTAMP),
  ('3', 'Cefal', CURRENT_TIMESTAMP),
  ('4', 'Escola', CURRENT_TIMESTAMP),
  ('5', 'Empresa Teste', CURRENT_TIMESTAMP),
  ('6', 'Fix Test Empresa', CURRENT_TIMESTAMP);

-- Criar empresas com IDs sequenciais referenciando o grupo correto
INSERT OR REPLACE INTO empresas (id, grupo_id, name, cnpj, status, created_at)
VALUES 
  ('1', '1', 'Woson Latam Comércio de Equipamentos Médicos Odontológicos Ltda', '00000000000001', 'ativa', CURRENT_TIMESTAMP),
  ('2', '2', 'Empresa Validação Final LTDA', '00000000000002', 'ativa', CURRENT_TIMESTAMP),
  ('3', '3', 'Cefal', '00000000000003', 'ativa', CURRENT_TIMESTAMP),
  ('4', '4', 'Escola', '00000000000004', 'ativa', CURRENT_TIMESTAMP),
  ('5', '5', 'Empresa Teste', '00000000000005', 'ativa', CURRENT_TIMESTAMP),
  ('6', '6', 'Fix Test Empresa', '00000000000006', 'ativa', CURRENT_TIMESTAMP);
