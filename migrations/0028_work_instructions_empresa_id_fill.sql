-- ============================================================
-- PCP Syncrus — Migration 028: Work instructions empresa_id fill
-- ============================================================
--
-- OBJETIVO
-- --------
-- 1. Preencher `empresa_id` em work_instructions usando registered_users
--    para registros legados que possuem NULL/vazio nessa coluna.
-- 2. Criar uma linha de versão inicial (is_current=1) para instruções
--    que ainda não possuem versão normalizada em work_instruction_versions,
--    preservando o campo `current_version` legado.
-- 3. Propagar empresa_id para as tabelas de versões, etapas, fotos e log.
--
-- PRÉ-REQUISITO
-- -------------
-- A coluna empresa_id deve existir em work_instructions antes de executar
-- esta migration. Se estiver ausente, execute primeiro:
--
--   npx vite-node scripts/d1-migrate-work-instructions.ts [DB_NAME]
--
-- IDEMPOTÊNCIA
-- ------------
-- • Os UPDATE com "WHERE empresa_id IS NULL OR empresa_id = ''" são seguros
--   para re-execução (só alteram linhas que ainda não foram preenchidas).
-- • O INSERT usa "INSERT OR IGNORE" com IDs determinísticos baseados no
--   id da instrução, portanto re-execuções são seguras.
-- ============================================================

-- ── Parte 1: Preencher empresa_id em work_instructions ────────────────────────
-- Usa a empresa_id do usuário dono (registered_users) como fallback.
UPDATE work_instructions
SET empresa_id = (
  SELECT ru.empresa_id
  FROM   registered_users ru
  WHERE  ru.id = work_instructions.user_id
  LIMIT  1
)
WHERE (empresa_id IS NULL OR empresa_id = '')
  AND user_id IS NOT NULL;

-- ── Parte 2: Criar versão normalizada para instruções sem versão ───────────────
-- Usa IDs determinísticos ('wiv_' || instruction.id) para idempotência.
-- A versão criada usa o campo current_version legado (ex.: '1.0') se disponível.
INSERT OR IGNORE INTO work_instruction_versions
  (id, user_id, empresa_id, instruction_id, version, title, description,
   is_current, status, created_at, created_by)
SELECT
  'wiv_' || wi.id,
  wi.user_id,
  wi.empresa_id,
  wi.id,
  COALESCE(wi.current_version, '1.0'),
  wi.title,
  wi.description,
  1,
  COALESCE(wi.status, 'draft'),
  COALESCE(wi.created_at, datetime('now')),
  wi.created_by
FROM work_instructions wi
WHERE NOT EXISTS (
  SELECT 1
  FROM   work_instruction_versions wiv
  WHERE  wiv.instruction_id = wi.id
    AND  wiv.is_current      = 1
);

-- ── Parte 3: Propagar empresa_id para as tabelas dependentes ──────────────────
UPDATE work_instruction_versions
SET empresa_id = (
  SELECT wi.empresa_id
  FROM   work_instructions wi
  WHERE  wi.id = work_instruction_versions.instruction_id
  LIMIT  1
)
WHERE empresa_id IS NULL OR empresa_id = '';

UPDATE work_instruction_steps
SET empresa_id = (
  SELECT wiv.empresa_id
  FROM   work_instruction_versions wiv
  WHERE  wiv.id = work_instruction_steps.version_id
  LIMIT  1
)
WHERE empresa_id IS NULL OR empresa_id = '';

UPDATE work_instruction_photos
SET empresa_id = (
  SELECT wis.empresa_id
  FROM   work_instruction_steps wis
  WHERE  wis.id = work_instruction_photos.step_id
  LIMIT  1
)
WHERE empresa_id IS NULL OR empresa_id = '';

UPDATE work_instruction_audit_log
SET empresa_id = (
  SELECT wi.empresa_id
  FROM   work_instructions wi
  WHERE  wi.id = work_instruction_audit_log.instruction_id
  LIMIT  1
)
WHERE empresa_id IS NULL OR empresa_id = '';
