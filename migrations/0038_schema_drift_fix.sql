-- ============================================================
-- Migration 0038: Corrige drift de schema (persistent bug fix)
-- Problema: colunas usadas pelo código TypeScript não existem
-- no D1, causando falha silenciosa no INSERT e perda de dados
-- após deploy.
-- ============================================================

-- ── 1. non_conformances: adicionar colunas faltantes ────────
-- O código em qualidade.ts insere: title, type, product, due_date
-- Nenhuma dessas colunas existe no schema original.
ALTER TABLE non_conformances ADD COLUMN title       TEXT DEFAULT '';
ALTER TABLE non_conformances ADD COLUMN type        TEXT DEFAULT 'processo';
ALTER TABLE non_conformances ADD COLUMN product     TEXT DEFAULT '';
ALTER TABLE non_conformances ADD COLUMN due_date    TEXT DEFAULT '';

-- ── 2. apontamentos: adicionar step_name ────────────────────
-- O código em apontamento.ts insere: step_name
-- A coluna não existe no schema original.
ALTER TABLE apontamentos ADD COLUMN step_name TEXT DEFAULT '';

-- ── 3. production_orders: corrigir nome da coluna ───────────
-- O código em ordens.ts insere: completed_quantity
-- O schema usa: quantity_produced
-- Adicionamos um alias para compatibilidade sem renomear.
ALTER TABLE production_orders ADD COLUMN completed_quantity INTEGER DEFAULT 0;

-- Sincroniza valores existentes entre as duas colunas
UPDATE production_orders
  SET completed_quantity = quantity_produced
  WHERE completed_quantity = 0 AND quantity_produced > 0;

-- ── 4. non_conformances: adicionar colunas de auditoria ─────
-- Usadas na hidratação mas ausentes no schema original.
ALTER TABLE non_conformances ADD COLUMN order_code  TEXT DEFAULT '';
ALTER TABLE non_conformances ADD COLUMN step_name   TEXT DEFAULT '';
ALTER TABLE non_conformances ADD COLUMN quantity_rejected INTEGER DEFAULT 0;
ALTER TABLE non_conformances ADD COLUMN operator    TEXT DEFAULT '';

-- ── 5. production_orders: adicionar plant_name ──────────────
-- Lido na hidratação em userStore.ts (r.plant_name), mas não
-- existe no schema original.
ALTER TABLE production_orders ADD COLUMN plant_name TEXT DEFAULT '';
