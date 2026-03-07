-- ============================================================
-- PCP Syncrus — Migration 022: empresa_id em todas as tabelas tenant
-- ============================================================
--
-- OBJETIVO
-- --------
-- Garantir que TODAS as tabelas multi-empresa/tenant possuam a coluna
-- `empresa_id` com valor padrão '1', evitando erros 500 por coluna
-- ausente (ex.: POST /recursos/bancadas falhava porque `workbenches`
-- não tinha `empresa_id` em alguns ambientes de produção).
--
-- HISTÓRICO DO PROBLEMA
-- ---------------------
-- A migration 0011_empresa_id_defaults.sql já adicionava `empresa_id`
-- a várias tabelas (boms, apontamentos, machines, workbenches, etc.).
-- Porém, ambientes cujo schema foi criado manualmente ou que tiveram
-- as migrations aplicadas de forma parcial ficaram com schema incompleto.
-- Esta migration serve como "catch-up" para esses ambientes.
--
-- IDEMPOTÊNCIA E AVISO IMPORTANTE
-- --------------------------------
-- O SQLite/D1 NÃO suporta `ALTER TABLE ADD COLUMN IF NOT EXISTS`.
-- Se esta migration for executada em um ambiente onde as migrations
-- 0011–0021 já foram aplicadas via `wrangler d1 migrations apply`,
-- os comandos ALTER TABLE abaixo irão falhar com o erro
-- "duplicate column name: empresa_id". Isso é esperado e NÃO
-- significa perda de dados — o schema já está correto nesse ambiente.
--
-- ESTRATÉGIA RECOMENDADA PARA PRODUÇÃO
-- --------------------------------------
-- 1. Verifique o estado do schema:
--      wrangler d1 execute <DB_NAME> --remote \
--        --command "PRAGMA table_info(workbenches)"
--
-- 2. Se empresa_id aparecer na saída, o schema está correto;
--    se não aparecer, aplique esta migration:
--      wrangler d1 migrations apply <DB_NAME> --remote
--
-- 3. Se wrangler reportar "migration already applied" mas a coluna
--    ainda estiver ausente, execute os ALTER TABLE individualmente:
--      wrangler d1 execute <DB_NAME> --remote \
--        --command "ALTER TABLE workbenches ADD COLUMN empresa_id TEXT DEFAULT '1'"
--
-- TABELAS COBERTAS
-- ----------------
-- Tabelas adicionadas originalmente SEM empresa_id e depois corrigidas
-- via migrations 0011, 0015 e 0017 (que podem não ter sido aplicadas):
--   • workbenches
--   • machines
--   • boms
--   • apontamentos
--   • separation_orders
--   • stock_exits
--   • supplier_categories
--   • product_suppliers
--
-- Tabelas criadas com empresa_id na migration 0001 (já cobertas,
-- incluídas aqui apenas nos UPDATE de normalização):
--   • plants, users, suppliers, products, almoxarifados, stock_items,
--     production_orders, non_conformances, quotations, purchase_orders,
--     imports
--
-- Tabelas criadas com empresa_id na migration 0020 (já cobertas):
--   • work_instructions, work_instruction_versions,
--     work_instruction_steps, work_instruction_photos,
--     work_instruction_audit_log
-- ============================================================

-- ------------------------------------------------------------
-- PARTE 1 — Adicionar empresa_id nas tabelas que podem não ter
-- a coluna caso as migrations 0011–0017 não foram aplicadas.
--
-- ATENÇÃO: Estes ALTER TABLE irão falhar com "duplicate column name"
-- se as migrations anteriores já foram aplicadas. Esse erro é seguro
-- — o schema já está correto nesses ambientes.
-- ------------------------------------------------------------

ALTER TABLE workbenches         ADD COLUMN empresa_id TEXT DEFAULT '1';
ALTER TABLE machines            ADD COLUMN empresa_id TEXT DEFAULT '1';
ALTER TABLE boms                ADD COLUMN empresa_id TEXT DEFAULT '1';
ALTER TABLE apontamentos        ADD COLUMN empresa_id TEXT DEFAULT '1';
ALTER TABLE separation_orders   ADD COLUMN empresa_id TEXT DEFAULT '1';
ALTER TABLE stock_exits         ADD COLUMN empresa_id TEXT DEFAULT '1';
ALTER TABLE supplier_categories ADD COLUMN empresa_id TEXT DEFAULT '1';
ALTER TABLE product_suppliers   ADD COLUMN empresa_id TEXT DEFAULT '1';

-- ------------------------------------------------------------
-- PARTE 2 — Normalizar registros existentes com empresa_id NULL
-- ou vazio em TODAS as tabelas tenant.
-- Estes UPDATE são idempotentes e seguros de reexecutar.
-- ------------------------------------------------------------

-- Tabelas da migration 0001 (empresa_id pode existir mas ter NULL)
UPDATE plants            SET empresa_id = '1' WHERE empresa_id IS NULL OR empresa_id = '';
UPDATE users             SET empresa_id = '1' WHERE empresa_id IS NULL OR empresa_id = '';
UPDATE suppliers         SET empresa_id = '1' WHERE empresa_id IS NULL OR empresa_id = '';
UPDATE products          SET empresa_id = '1' WHERE empresa_id IS NULL OR empresa_id = '';
UPDATE almoxarifados     SET empresa_id = '1' WHERE empresa_id IS NULL OR empresa_id = '';
UPDATE stock_items       SET empresa_id = '1' WHERE empresa_id IS NULL OR empresa_id = '';
UPDATE production_orders SET empresa_id = '1' WHERE empresa_id IS NULL OR empresa_id = '';
UPDATE non_conformances  SET empresa_id = '1' WHERE empresa_id IS NULL OR empresa_id = '';
UPDATE quotations        SET empresa_id = '1' WHERE empresa_id IS NULL OR empresa_id = '';
UPDATE purchase_orders   SET empresa_id = '1' WHERE empresa_id IS NULL OR empresa_id = '';
UPDATE imports           SET empresa_id = '1' WHERE empresa_id IS NULL OR empresa_id = '';

-- Tabelas adicionadas via 0011 (agora garantidas acima)
UPDATE workbenches         SET empresa_id = '1' WHERE empresa_id IS NULL OR empresa_id = '';
UPDATE machines            SET empresa_id = '1' WHERE empresa_id IS NULL OR empresa_id = '';
UPDATE boms                SET empresa_id = '1' WHERE empresa_id IS NULL OR empresa_id = '';
UPDATE apontamentos        SET empresa_id = '1' WHERE empresa_id IS NULL OR empresa_id = '';
UPDATE separation_orders   SET empresa_id = '1' WHERE empresa_id IS NULL OR empresa_id = '';
UPDATE stock_exits         SET empresa_id = '1' WHERE empresa_id IS NULL OR empresa_id = '';
UPDATE supplier_categories SET empresa_id = '1' WHERE empresa_id IS NULL OR empresa_id = '';
UPDATE product_suppliers   SET empresa_id = '1' WHERE empresa_id IS NULL OR empresa_id = '';

-- Tabelas de instruções de trabalho (migration 0020)
UPDATE work_instructions          SET empresa_id = '1' WHERE empresa_id IS NULL OR empresa_id = '';
UPDATE work_instruction_versions  SET empresa_id = '1' WHERE empresa_id IS NULL OR empresa_id = '';
UPDATE work_instruction_steps     SET empresa_id = '1' WHERE empresa_id IS NULL OR empresa_id = '';
UPDATE work_instruction_photos    SET empresa_id = '1' WHERE empresa_id IS NULL OR empresa_id = '';
UPDATE work_instruction_audit_log SET empresa_id = '1' WHERE empresa_id IS NULL OR empresa_id = '';
