-- Migration 0064: Completa suporte a comentários/resposta em tickets
-- A tabela support_ticket_comments já existia (migration 0031) mas nunca foi
-- usada por nenhum dos dois lados (Master ou Suporte do cliente). Adiciona
-- nome/papel de quem comentou, para exibir "Suporte Syncrus" vs o nome do
-- cliente na conversa, sem precisar cruzar com outras tabelas de usuário.

ALTER TABLE support_ticket_comments ADD COLUMN author_name TEXT;
ALTER TABLE support_ticket_comments ADD COLUMN author_role TEXT DEFAULT 'cliente'; -- 'cliente' | 'suporte'