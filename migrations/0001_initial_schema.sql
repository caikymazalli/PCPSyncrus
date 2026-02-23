-- ============================================================
-- PCP Syncrus — Schema inicial
-- ============================================================

-- Empresas / Grupo
CREATE TABLE IF NOT EXISTS grupo (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  cnpj TEXT,
  since TEXT,
  email TEXT,
  responsavel TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS empresas (
  id TEXT PRIMARY KEY,
  grupo_id TEXT NOT NULL,
  name TEXT NOT NULL,
  cnpj TEXT NOT NULL,
  city TEXT,
  state TEXT,
  email TEXT,
  type TEXT DEFAULT 'filial', -- matriz | filial
  status TEXT DEFAULT 'ativa',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (grupo_id) REFERENCES grupo(id)
);

-- Usuários
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  empresa_id TEXT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL DEFAULT 'operador',
  scope TEXT NOT NULL DEFAULT 'empresa', -- empresa | grupo
  avatar_url TEXT,
  active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);

-- Plantas
CREATE TABLE IF NOT EXISTS plants (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  name TEXT NOT NULL,
  capacity INTEGER DEFAULT 0,
  contact TEXT,
  location TEXT,
  active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);

-- Máquinas
CREATE TABLE IF NOT EXISTS machines (
  id TEXT PRIMARY KEY,
  plant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT,
  status TEXT DEFAULT 'operational', -- operational | maintenance | offline
  last_maintenance DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (plant_id) REFERENCES plants(id)
);

-- Bancadas
CREATE TABLE IF NOT EXISTS workbenches (
  id TEXT PRIMARY KEY,
  plant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  function TEXT,
  status TEXT DEFAULT 'available',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (plant_id) REFERENCES plants(id)
);

-- Fornecedores
CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  empresa_id TEXT,
  name TEXT NOT NULL,
  trade_name TEXT,
  cnpj TEXT,
  contact TEXT,
  email TEXT,
  phone TEXT,
  city TEXT,
  state TEXT,
  country TEXT DEFAULT 'Brasil',
  type TEXT DEFAULT 'nacional', -- nacional | importado
  category TEXT,
  payment_terms TEXT,
  lead_days INTEGER DEFAULT 30,
  rating REAL DEFAULT 0,
  ncm_principal TEXT,
  desc_pt TEXT,
  desc_en TEXT,
  tech_detail TEXT,
  active INTEGER DEFAULT 1,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);

-- Produtos
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  empresa_id TEXT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  unit TEXT DEFAULT 'un',
  category TEXT,
  stock_min INTEGER DEFAULT 0,
  stock_current INTEGER DEFAULT 0,
  stock_status TEXT DEFAULT 'normal',
  serial_controlled INTEGER DEFAULT 0,
  control_type TEXT DEFAULT 'serie',
  internal_production INTEGER DEFAULT 0,
  ncm TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);

-- Produto-Fornecedor (vínculo)
CREATE TABLE IF NOT EXISTS product_suppliers (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  supplier_id TEXT NOT NULL,
  priority INTEGER DEFAULT 1,
  internal_production INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
);

-- Almoxarifados
CREATE TABLE IF NOT EXISTS almoxarifados (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  city TEXT,
  state TEXT,
  responsavel_id TEXT,
  custodio_id TEXT,
  status TEXT DEFAULT 'ativo', -- ativo | manutencao | inativo
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);

-- Itens de Estoque
CREATE TABLE IF NOT EXISTS stock_items (
  id TEXT PRIMARY KEY,
  almoxarifado_id TEXT,
  empresa_id TEXT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  unit TEXT DEFAULT 'un',
  quantity REAL DEFAULT 0,
  min_quantity REAL DEFAULT 0,
  location TEXT,
  status TEXT DEFAULT 'normal',
  serial_controlled INTEGER DEFAULT 0,
  control_type TEXT DEFAULT 'serie',
  last_update DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (almoxarifado_id) REFERENCES almoxarifados(id),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);

-- Números de Série / Lote
CREATE TABLE IF NOT EXISTS serial_numbers (
  id TEXT PRIMARY KEY,
  item_code TEXT NOT NULL,
  item_name TEXT,
  number TEXT NOT NULL,
  type TEXT DEFAULT 'serie', -- serie | lote
  quantity REAL DEFAULT 1,
  status TEXT DEFAULT 'em_estoque',
  origin TEXT,
  order_code TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT
);

-- Transferências entre almoxarifados
CREATE TABLE IF NOT EXISTS transferencias (
  id TEXT PRIMARY KEY,
  origem_id TEXT NOT NULL,
  destino_id TEXT NOT NULL,
  solicitante_id TEXT,
  separador_id TEXT,
  custodio_id TEXT,
  status TEXT DEFAULT 'pendente', -- pendente | em_transito | concluida | cancelada
  data_prevista DATE,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (origem_id) REFERENCES almoxarifados(id),
  FOREIGN KEY (destino_id) REFERENCES almoxarifados(id)
);

CREATE TABLE IF NOT EXISTS transferencia_itens (
  id TEXT PRIMARY KEY,
  transferencia_id TEXT NOT NULL,
  item_code TEXT NOT NULL,
  item_name TEXT,
  quantity REAL NOT NULL,
  serial_lot TEXT,
  FOREIGN KEY (transferencia_id) REFERENCES transferencias(id)
);

-- Ordens de Produção
CREATE TABLE IF NOT EXISTS production_orders (
  id TEXT PRIMARY KEY,
  empresa_id TEXT,
  plant_id TEXT,
  code TEXT NOT NULL UNIQUE,
  product_code TEXT,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  quantity_produced INTEGER DEFAULT 0,
  quantity_rejected INTEGER DEFAULT 0,
  start_date DATE,
  end_date DATE,
  priority TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'planned',
  pedido TEXT,
  cliente TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (plant_id) REFERENCES plants(id)
);

-- Apontamentos de Produção
CREATE TABLE IF NOT EXISTS production_entries (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  step TEXT,
  quantity_produced INTEGER DEFAULT 0,
  quantity_rejected INTEGER DEFAULT 0,
  time_minutes INTEGER DEFAULT 0,
  operator TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES production_orders(id)
);

-- Não Conformidades
CREATE TABLE IF NOT EXISTS non_conformances (
  id TEXT PRIMARY KEY,
  empresa_id TEXT,
  code TEXT NOT NULL,
  order_id TEXT,
  step TEXT,
  description TEXT,
  severity TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'open',
  responsible TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);

-- Kardex (movimentações de estoque)
CREATE TABLE IF NOT EXISTS kardex (
  id TEXT PRIMARY KEY,
  item_code TEXT NOT NULL,
  item_name TEXT,
  mov_type TEXT NOT NULL, -- entrada | saida
  quantity REAL NOT NULL,
  serial_number TEXT,
  description TEXT,
  order_code TEXT,
  pedido TEXT,
  nf TEXT,
  user_name TEXT,
  almoxarifado_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Cotações
CREATE TABLE IF NOT EXISTS quotations (
  id TEXT PRIMARY KEY,
  empresa_id TEXT,
  code TEXT NOT NULL,
  status TEXT DEFAULT 'draft',
  tipo TEXT DEFAULT 'manual',
  creator TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  approved_at DATETIME,
  approved_by TEXT
);

CREATE TABLE IF NOT EXISTS quotation_items (
  id TEXT PRIMARY KEY,
  quotation_id TEXT NOT NULL,
  product_code TEXT,
  product_name TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit TEXT DEFAULT 'un',
  FOREIGN KEY (quotation_id) REFERENCES quotations(id)
);

CREATE TABLE IF NOT EXISTS quotation_responses (
  id TEXT PRIMARY KEY,
  quotation_id TEXT NOT NULL,
  supplier_id TEXT NOT NULL,
  product_code TEXT,
  unit_price REAL,
  total_price REAL,
  delivery_days INTEGER,
  payment_terms TEXT,
  currency TEXT DEFAULT 'BRL',
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (quotation_id) REFERENCES quotations(id),
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
);

-- Pedidos de Compra
CREATE TABLE IF NOT EXISTS purchase_orders (
  id TEXT PRIMARY KEY,
  empresa_id TEXT,
  quotation_id TEXT,
  supplier_id TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  total_value REAL DEFAULT 0,
  currency TEXT DEFAULT 'BRL',
  import_flag INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  expected_delivery DATE,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id TEXT PRIMARY KEY,
  purchase_order_id TEXT NOT NULL,
  product_code TEXT,
  product_name TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit_price REAL DEFAULT 0,
  total_price REAL DEFAULT 0,
  FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id)
);

-- Importações
CREATE TABLE IF NOT EXISTS imports (
  id TEXT PRIMARY KEY,
  empresa_id TEXT,
  purchase_order_id TEXT,
  supplier_id TEXT,
  invoice_number TEXT,
  invoice_date DATE,
  value_usd REAL DEFAULT 0,
  value_eur REAL DEFAULT 0,
  value_brl REAL DEFAULT 0,
  exchange_rate REAL DEFAULT 5.52,
  currency TEXT DEFAULT 'USD',
  incoterm TEXT DEFAULT 'FOB',
  port_origin TEXT,
  port_dest TEXT,
  ncm TEXT,
  description TEXT,
  desc_en TEXT,
  modalidade TEXT DEFAULT 'maritimo', -- aereo | terrestre | maritimo
  weight_gross REAL,
  weight_net REAL,
  status TEXT DEFAULT 'draft',
  expected_arrival DATE,
  -- Impostos
  tax_ii REAL DEFAULT 0,
  tax_ipi REAL DEFAULT 0,
  tax_pis REAL DEFAULT 0,
  tax_cofins REAL DEFAULT 0,
  tax_icms REAL DEFAULT 0,
  tax_afrmm REAL DEFAULT 0,
  tax_siscomex REAL DEFAULT 0,
  total_taxes REAL DEFAULT 0,
  landed_cost_brl REAL DEFAULT 0,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id)
);

CREATE TABLE IF NOT EXISTS import_items (
  id TEXT PRIMARY KEY,
  import_id TEXT NOT NULL,
  product_code TEXT,
  ncm TEXT,
  description TEXT,
  desc_en TEXT,
  tech_detail TEXT,
  quantity REAL NOT NULL,
  unit TEXT DEFAULT 'un',
  unit_price REAL DEFAULT 0,
  subtotal REAL DEFAULT 0,
  FOREIGN KEY (import_id) REFERENCES imports(id)
);

-- Documentos de processo (fechamento)
CREATE TABLE IF NOT EXISTS process_documents (
  id TEXT PRIMARY KEY,
  process_type TEXT NOT NULL, -- import | order | quotation
  process_id TEXT NOT NULL,
  doc_type TEXT NOT NULL,
  file_name TEXT,
  file_url TEXT,
  uploaded_by TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_production_orders_empresa ON production_orders(empresa_id);
CREATE INDEX IF NOT EXISTS idx_production_orders_status ON production_orders(status);
CREATE INDEX IF NOT EXISTS idx_stock_items_empresa ON stock_items(empresa_id);
CREATE INDEX IF NOT EXISTS idx_stock_items_status ON stock_items(status);
CREATE INDEX IF NOT EXISTS idx_imports_empresa ON imports(empresa_id);
CREATE INDEX IF NOT EXISTS idx_imports_status ON imports(status);
CREATE INDEX IF NOT EXISTS idx_quotations_empresa ON quotations(empresa_id);
CREATE INDEX IF NOT EXISTS idx_kardex_item ON kardex(item_code);
CREATE INDEX IF NOT EXISTS idx_kardex_created ON kardex(created_at);
CREATE INDEX IF NOT EXISTS idx_suppliers_type ON suppliers(type);
CREATE INDEX IF NOT EXISTS idx_users_empresa ON users(empresa_id);
CREATE INDEX IF NOT EXISTS idx_transferencias_status ON transferencias(status);
