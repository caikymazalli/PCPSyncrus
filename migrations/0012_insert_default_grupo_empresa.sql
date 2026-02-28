-- Migration 0012: Inserir grupo e empresa padrão
-- Garante que existam registros com id='1' nas tabelas grupo e empresas

-- Inserir grupo padrão
INSERT OR IGNORE INTO grupo (id, name, created_at)
VALUES ('1', 'Grupo Padrão', CURRENT_TIMESTAMP);

-- Inserir empresa padrão
INSERT OR IGNORE INTO empresas (id, grupo_id, name, cnpj, created_at)
VALUES ('1', '1', 'Empresa Padrão', '00000000000000', CURRENT_TIMESTAMP);
