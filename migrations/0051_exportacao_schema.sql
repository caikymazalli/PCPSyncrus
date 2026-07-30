-- ============================================================
-- PCP Syncrus — Migration 051: Módulo Exportação
-- Gestão de clientes internacionais e invoices de vendas
-- de produtos produzidos para exportação.
-- ============================================================

-- ── Clientes de Exportação ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exp_clientes (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  empresa_id    TEXT DEFAULT '1',
  -- Identificação
  razao_social  TEXT NOT NULL,
  nome_fantasia TEXT,
  pais          TEXT NOT NULL DEFAULT 'Brasil',
  cidade        TEXT,
  estado        TEXT,
  endereco      TEXT,
  cep           TEXT,
  -- Dados fiscais/comerciais
  tax_id        TEXT,             -- CNPJ / VAT / EIN / etc.
  tipo_doc      TEXT DEFAULT 'CNPJ',  -- CNPJ, VAT, EIN, NIF...
  moeda         TEXT NOT NULL DEFAULT 'USD',
  incoterm      TEXT DEFAULT 'FOB',   -- EXW, FOB, CIF, DAP, DDP...
  condicao_pgto TEXT DEFAULT '30 dias',
  limite_credito REAL DEFAULT 0,
  -- Contato
  contato_nome  TEXT,
  contato_email TEXT,
  contato_tel   TEXT,
  contato_cargo TEXT,
  -- Status
  status        TEXT NOT NULL DEFAULT 'ativo',   -- ativo, inativo, prospecto, bloqueado
  categoria     TEXT DEFAULT 'cliente',           -- cliente, distribuidor, agente, prospecto
  observacoes   TEXT,
  -- Auditoria
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_exp_clientes_user    ON exp_clientes(user_id);
CREATE INDEX IF NOT EXISTS idx_exp_clientes_empresa ON exp_clientes(empresa_id);
CREATE INDEX IF NOT EXISTS idx_exp_clientes_pais    ON exp_clientes(pais);
CREATE INDEX IF NOT EXISTS idx_exp_clientes_status  ON exp_clientes(status);

-- ── Commercial Invoices (Faturas de Venda para Exportação) ───────────────────
CREATE TABLE IF NOT EXISTS exp_invoices (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  empresa_id    TEXT DEFAULT '1',
  -- Referências
  numero        TEXT NOT NULL,          -- Número da invoice (ex: INV-2025-001)
  cliente_id    TEXT NOT NULL,
  -- Datas
  data_emissao  TEXT NOT NULL,
  data_embarque TEXT,
  data_vencimento TEXT,
  -- Logística
  incoterm      TEXT DEFAULT 'FOB',
  porto_origem  TEXT,
  porto_destino TEXT,
  modal         TEXT DEFAULT 'maritimo', -- maritimo, aereo, rodoviario, ferroviario
  transportadora TEXT,
  bl_awb        TEXT,                   -- Bill of Lading / Air Waybill
  -- Financeiro
  moeda         TEXT NOT NULL DEFAULT 'USD',
  subtotal      REAL DEFAULT 0,
  desconto      REAL DEFAULT 0,
  frete         REAL DEFAULT 0,
  seguro        REAL DEFAULT 0,
  total         REAL DEFAULT 0,
  total_brl     REAL DEFAULT 0,         -- Convertido para BRL (taxa do dia)
  taxa_cambio   REAL DEFAULT 1,
  -- Status
  status        TEXT NOT NULL DEFAULT 'rascunho',
  -- rascunho, emitida, aprovada, embarcada, entregue, paga, cancelada
  status_pgto   TEXT NOT NULL DEFAULT 'pendente',
  -- pendente, parcial, pago, vencido, cancelado
  -- Documentação
  ncm_principal TEXT,
  packing_list  TEXT,                   -- JSON array de volumes
  documentos    TEXT DEFAULT '[]',      -- JSON array de docs (CI, PL, BL, CO...)
  observacoes   TEXT,
  -- Auditoria
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_exp_invoices_user     ON exp_invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_exp_invoices_empresa  ON exp_invoices(empresa_id);
CREATE INDEX IF NOT EXISTS idx_exp_invoices_cliente  ON exp_invoices(cliente_id);
CREATE INDEX IF NOT EXISTS idx_exp_invoices_status   ON exp_invoices(status);
CREATE INDEX IF NOT EXISTS idx_exp_invoices_numero   ON exp_invoices(numero);

-- ── Itens da Invoice ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exp_invoice_items (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  empresa_id    TEXT DEFAULT '1',
  invoice_id    TEXT NOT NULL,
  -- Produto
  produto_id    TEXT,                   -- FK para products (opcional)
  codigo        TEXT NOT NULL,
  descricao     TEXT NOT NULL,
  ncm           TEXT,
  -- Quantidades
  quantidade    REAL NOT NULL DEFAULT 1,
  unidade       TEXT DEFAULT 'PC',
  peso_unit     REAL DEFAULT 0,         -- kg por unidade
  peso_total    REAL DEFAULT 0,         -- kg total
  -- Financeiro
  preco_unit    REAL NOT NULL DEFAULT 0,
  desconto_pct  REAL DEFAULT 0,
  preco_total   REAL NOT NULL DEFAULT 0,
  -- Origem
  pais_origem   TEXT DEFAULT 'Brasil',
  created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_exp_items_invoice ON exp_invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_exp_items_user    ON exp_invoice_items(user_id);

-- ── Pagamentos de Invoices ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exp_pagamentos (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  empresa_id    TEXT DEFAULT '1',
  invoice_id    TEXT NOT NULL,
  -- Dados do pagamento
  data_pgto     TEXT NOT NULL,
  valor         REAL NOT NULL,
  moeda         TEXT NOT NULL DEFAULT 'USD',
  valor_brl     REAL DEFAULT 0,
  taxa_cambio   REAL DEFAULT 1,
  forma_pgto    TEXT DEFAULT 'wire',  -- wire, carta_credito, cheque, antecipado
  banco_origem  TEXT,
  referencia    TEXT,
  observacoes   TEXT,
  created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_exp_pgto_invoice ON exp_pagamentos(invoice_id);
CREATE INDEX IF NOT EXISTS idx_exp_pgto_user    ON exp_pagamentos(user_id);

-- ── Proforma Invoices (cotações/orçamentos antes da venda) ──────────────────
CREATE TABLE IF NOT EXISTS exp_proformas (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  empresa_id    TEXT DEFAULT '1',
  numero        TEXT NOT NULL,
  cliente_id    TEXT NOT NULL,
  data_emissao  TEXT NOT NULL,
  data_validade TEXT,
  incoterm      TEXT DEFAULT 'FOB',
  moeda         TEXT DEFAULT 'USD',
  total         REAL DEFAULT 0,
  status        TEXT DEFAULT 'ativa',  -- ativa, expirada, aceita, recusada, convertida
  invoice_id    TEXT,                  -- invoice gerada a partir desta proforma
  itens         TEXT DEFAULT '[]',     -- JSON array de itens
  observacoes   TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_exp_proformas_user    ON exp_proformas(user_id);
CREATE INDEX IF NOT EXISTS idx_exp_proformas_cliente ON exp_proformas(cliente_id);
