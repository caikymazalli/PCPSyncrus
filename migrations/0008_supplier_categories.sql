-- Migration 0008: Criar tabela de categorias de fornecedores personalizadas
CREATE TABLE IF NOT EXISTS supplier_categories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES registered_users(id)
);
