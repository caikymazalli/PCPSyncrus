-- ============================================================
-- PCP Syncrus — Migration 025: empresa_id + grupo_id em registered_users
-- ============================================================
--
-- OBJETIVO
-- --------
-- Adicionar as colunas `empresa_id` e `grupo_id` à tabela
-- `registered_users` para usar como fonte de verdade do vínculo
-- usuário ↔ empresa, eliminando a dependência da tabela `user_empresa`
-- que não existe em produção D1.
--
-- Com empresa_id em registered_users:
--   • O login resolve empresaId diretamente de registered_users.empresa_id
--     (em vez de fazer JOIN com user_empresa).
--   • O painel admin lista todos os usuários com mesmo empresa_id,
--     garantindo visibilidade para contas como qualidade@wosonlatam.com.br
--     que foram adicionadas diretamente ao D1.
--
-- IDEMPOTÊNCIA
-- ------------
-- O SQLite/D1 NÃO suporta ALTER TABLE ADD COLUMN IF NOT EXISTS.
-- Os ALTER TABLE abaixo falharão com "duplicate column name" se a
-- coluna já existir — esse erro é seguro e esperado em ambientes que
-- já possuem a coluna (ex.: ambientes que adicionaram a coluna
-- manualmente). Nenhum dado é perdido.
--
-- DATA FIX DE EXEMPLO
-- --------------------
-- Para vincular um usuário a uma empresa após a migração:
--   UPDATE registered_users
--   SET empresa_id = '<id-da-empresa>'
--   WHERE email = '<email-do-usuario>';
-- ============================================================

ALTER TABLE registered_users ADD COLUMN empresa_id TEXT DEFAULT NULL;
ALTER TABLE registered_users ADD COLUMN grupo_id   TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_registered_users_empresa_id ON registered_users(empresa_id);
