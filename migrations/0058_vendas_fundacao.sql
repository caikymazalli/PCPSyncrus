-- Migration 0058: Fundação do módulo de Vendas (Fase 1)
-- Prospect (cadastro leve, usado no orçamento) + Cliente completo (usado a
-- partir do pedido de venda, sincronizado com o Omie) + customização do
-- documento de orçamento/pedido por empresa (cabeçalho, logo, condições e
-- meios de pagamento, política de compra e venda).

CREATE TABLE IF NOT EXISTS sales_prospects (
  id                    TEXT PRIMARY KEY,
  empresa_id            TEXT NOT NULL,
  name                  TEXT NOT NULL,
  company_name          TEXT,
  phone                 TEXT,
  email                 TEXT,
  notes                 TEXT,
  converted_customer_id TEXT,   -- preenchido quando é promovido a sales_customers
  created_by            TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sales_prospects_empresa ON sales_prospects(empresa_id);

CREATE TABLE IF NOT EXISTS sales_customers (
  id                     TEXT PRIMARY KEY,
  empresa_id             TEXT NOT NULL,
  razao_social           TEXT NOT NULL,
  nome_fantasia          TEXT,
  cnpj_cpf               TEXT,
  pessoa_fisica          TEXT NOT NULL DEFAULT 'N',  -- 'S' | 'N' (mesma convenção do Omie)
  email                  TEXT,
  telefone_ddd           TEXT,
  telefone_numero        TEXT,
  endereco               TEXT,
  endereco_numero        TEXT,
  bairro                 TEXT,
  complemento            TEXT,
  cidade                 TEXT,
  estado                 TEXT,
  cep                    TEXT,
  codigo_pais            TEXT DEFAULT '1058',
  optante_simples        TEXT DEFAULT 'N',
  contribuinte           TEXT DEFAULT 'N',
  payment_terms_days     INTEGER DEFAULT 30,
  score                  TEXT,          -- 'A'|'B'|'C'|'D'|'E' — valor efetivo em uso
  score_auto             TEXT,          -- sugestão calculada pelo sistema (Fase 5)
  score_override         TEXT,          -- valor definido manualmente pelo vendedor/admin
  score_updated_at       TEXT,
  from_prospect_id       TEXT,          -- se este cliente nasceu de um prospect
  omie_codigo_cliente    INTEGER,
  omie_codigo_integracao TEXT,
  omie_synced_at         TEXT,
  notes                  TEXT,
  created_by             TEXT,
  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at             TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sales_customers_empresa ON sales_customers(empresa_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_customers_omie_integ ON sales_customers(omie_codigo_integracao);

CREATE TABLE IF NOT EXISTS sales_document_settings (
  empresa_id            TEXT PRIMARY KEY,
  header_text            TEXT,   -- texto livre exibido no topo do orçamento/pedido
  logo_object_key         TEXT,
  logo_content_type       TEXT,
  logo_updated_at         TEXT,
  payment_conditions      TEXT,  -- JSON: string[] (ex: ["30/60/90 dias","À vista 5% desc."])
  payment_methods         TEXT,  -- JSON: string[] (ex: ["Pix","Boleto","Cartão"])
  sales_policy_text       TEXT,  -- política de compra e venda / termos, exibido como rodapé
  quote_validity_days     INTEGER DEFAULT 15,
  updated_by              TEXT,
  updated_at               TEXT NOT NULL DEFAULT (datetime('now'))
);