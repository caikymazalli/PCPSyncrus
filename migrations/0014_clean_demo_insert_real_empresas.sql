-- ========================================
-- Migration 0014: Limpar dados demo e inserir empresas reais com grupos corretos
-- ========================================

-- ========================================
-- LIMPAR DADOS DEMO
-- ========================================
DELETE FROM plants WHERE empresa_id IN ('e1', 'e2', 'e3');
DELETE FROM machines WHERE empresa_id IN ('e1', 'e2', 'e3');
DELETE FROM workbenches WHERE empresa_id IN ('e1', 'e2', 'e3');
DELETE FROM products WHERE empresa_id IN ('e1', 'e2', 'e3');
DELETE FROM boms WHERE empresa_id IN ('e1', 'e2', 'e3');
DELETE FROM production_orders WHERE empresa_id IN ('e1', 'e2', 'e3');
DELETE FROM apontamentos WHERE empresa_id IN ('e1', 'e2', 'e3');
DELETE FROM suppliers WHERE empresa_id IN ('e1', 'e2', 'e3');
DELETE FROM quotations WHERE empresa_id IN ('e1', 'e2', 'e3');
DELETE FROM purchase_orders WHERE empresa_id IN ('e1', 'e2', 'e3');
DELETE FROM imports WHERE empresa_id IN ('e1', 'e2', 'e3');
DELETE FROM stock_items WHERE empresa_id IN ('e1', 'e2', 'e3');
DELETE FROM non_conformances WHERE empresa_id IN ('e1', 'e2', 'e3');
DELETE FROM separation_orders WHERE empresa_id IN ('e1', 'e2', 'e3');
DELETE FROM stock_exits WHERE empresa_id IN ('e1', 'e2', 'e3');
DELETE FROM almoxarifados WHERE empresa_id IN ('e1', 'e2', 'e3');

DELETE FROM empresas WHERE id IN ('e1', 'e2', 'e3');
DELETE FROM grupo WHERE id = 'g1';

-- ========================================
-- INSERIR GRUPOS REAIS
-- ========================================
INSERT OR REPLACE INTO grupo (id, name, created_at)
VALUES 
  ('1', 'Woson Latam Comércio de Equipamentos Médicos Odontológicos Ltda', CURRENT_TIMESTAMP),
  ('2', 'Empresa Validação Final LTDA', CURRENT_TIMESTAMP),
  ('3', 'Cefal', CURRENT_TIMESTAMP),
  ('4', 'Escola', CURRENT_TIMESTAMP),
  ('5', 'Empresa Teste', CURRENT_TIMESTAMP),
  ('6', 'Fix Test Empresa', CURRENT_TIMESTAMP);

-- ========================================
-- INSERIR EMPRESAS REAIS
-- ========================================
INSERT OR REPLACE INTO empresas (id, grupo_id, name, cnpj, city, state, email, type, status, created_at)
VALUES 
  ('1', '1', 'Woson Latam Comércio de Equipamentos Médicos Odontológicos Ltda', '00.000.000/0001-00', '', '', 'caiky.mazalli@wosonlatam.com.br', 'filial', 'ativa', CURRENT_TIMESTAMP),
  ('2', '2', 'Empresa Validação Final LTDA', '00.000.000/0001-00', '', '', 'carlos.souza.test2@empresa.com', 'filial', 'ativa', CURRENT_TIMESTAMP),
  ('3', '3', 'Cefal', '00.000.000/0001-00', '', '', 'adauto.mazalli@gmail.com', 'filial', 'ativa', CURRENT_TIMESTAMP),
  ('4', '4', 'Escola', '00.000.000/0001-00', '', '', 'marcia.mazalli@gmail.com', 'filial', 'ativa', CURRENT_TIMESTAMP),
  ('5', '5', 'Empresa Teste', '00.000.000/0001-00', '', '', 'test_admin@teste.com', 'filial', 'ativa', CURRENT_TIMESTAMP),
  ('6', '6', 'Fix Test Empresa', '00.000.000/0001-00', '', '', 'testmember@fixtest.com', 'filial', 'ativa', CURRENT_TIMESTAMP);
