-- ============================================================
-- PCP Syncrus — Seed Data (dados iniciais)
-- ============================================================

-- Grupo
INSERT OR IGNORE INTO grupo (id, name, cnpj, since, email, responsavel) VALUES
('g1', 'Grupo Industrial Alpha', '00.000.000/0000-00', '2018', 'grupo@grupoalpha.com.br', 'Grupo Admin');

-- Empresas
INSERT OR IGNORE INTO empresas (id, grupo_id, name, cnpj, city, state, email, type, status) VALUES
('e1', 'g1', 'Empresa Alpha Ltda', '12.345.678/0001-90', 'São Paulo', 'SP', 'empresa@alpha.com.br', 'matriz', 'ativa'),
('e2', 'g1', 'Alpha Nordeste Ltda', '98.765.432/0001-10', 'Fortaleza', 'CE', 'nordeste@alpha.com.br', 'filial', 'ativa'),
('e3', 'g1', 'Alpha Sul Ind. e Com.', '11.222.333/0001-44', 'Porto Alegre', 'RS', 'sul@alpha.com.br', 'filial', 'ativa');

-- Usuários
INSERT OR IGNORE INTO users (id, empresa_id, name, email, role, scope) VALUES
('u1', 'e1', 'Carlos Silva',   'carlos@empresa.com',            'admin',     'empresa'),
('u2', 'e1', 'Ana Souza',      'ana@empresa.com',               'gestor_pcp','empresa'),
('u3', 'e1', 'João Santos',    'joao@empresa.com',              'operador',  'empresa'),
('u4', 'e1', 'Maria Lima',     'maria@empresa.com',             'qualidade', 'empresa'),
('u5', 'e1', 'Pedro Costa',    'pedro@empresa.com',             'compras',   'empresa'),
('u6', 'e2', 'Fernanda Costa', 'fernanda@alpha-nordeste.com.br','gestor_pcp','empresa'),
('u7', 'e3', 'Ricardo Mendes', 'ricardo@alphasul.com.br',       'operador',  'empresa'),
('u8', NULL, 'Grupo Admin',    'admin@grupoalpha.com.br',       'grupo_admin','grupo');

-- Plantas
INSERT OR IGNORE INTO plants (id, empresa_id, name, capacity, contact, location) VALUES
('p1', 'e1', 'Planta Alpha',  500, 'Carlos Silva',   'São Paulo, SP'),
('p2', 'e1', 'Planta Beta',   320, 'Ana Souza',      'São Paulo, SP'),
('p3', 'e2', 'Planta Gamma',  180, 'Fernanda Costa', 'Fortaleza, CE');

-- Máquinas
INSERT OR IGNORE INTO machines (id, plant_id, name, type, status) VALUES
('m1', 'p1', 'CNC Mazak 5X',        'CNC',       'operational'),
('m2', 'p1', 'Fresadora Universal', 'Fresadora', 'maintenance'),
('m3', 'p1', 'Prensa Hidráulica',   'Prensa',    'operational'),
('m4', 'p2', 'Robô Soldagem ABB',   'Robô',      'operational'),
('m5', 'p2', 'Injetora 500T',       'Injetora',  'offline'),
('m6', 'p3', 'CNC Romi 3X',         'CNC',       'operational');

-- Fornecedores
INSERT OR IGNORE INTO suppliers (id, empresa_id, name, trade_name, cnpj, contact, city, state, type, category, payment_terms, lead_days, rating, active) VALUES
('sup1','e1','Aço Brasil Ind. e Com. Ltda','AçoBrasil','12.345.678/0001-90','Roberto Lima','São Paulo','SP','nacional','Matéria-Prima','30/60 dias',7,4.5,1),
('sup2','e1','Rolamentos Tech Ltda','RolaTC','98.765.432/0001-10','Márcia Pinto','Campinas','SP','nacional','Componentes','30 dias',5,4.8,1),
('sup3','e1','Fixadores Premium Ltda','FixPrem','11.222.333/0001-44','José Alves','Santo André','SP','nacional','Fixadores','À vista',3,3.9,1),
('sup4','e1','SKF do Brasil Ltda','SKF','55.666.777/0001-22','Ana Schulz','Cajamar','SP','nacional','Componentes','30 dias',10,4.7,1),
('sup5','e1','Euro Parts GmbH','EuroParts',NULL,'Hans Mueller','Stuttgart',NULL,'importado','Componentes','60 dias',45,4.6,1);

-- Produtos
INSERT OR IGNORE INTO products (id, empresa_id, code, name, unit, category, stock_min, stock_current, stock_status, serial_controlled, control_type, internal_production) VALUES
('prod1','e1','TAM-A200','Tampa de Alumínio A200','un','Produto Acabado',50,12,'critical',1,'serie',1),
('prod2','e1','EXT-T500','Eixo Transmissão T500','un','Produto Acabado',30,28,'normal',1,'serie',1),
('prod3','e1','CRC-CM300','Carcaça Motor CM300','un','Produto Acabado',20,8,'critical',1,'lote',1),
('prod4','e1','PIN-ELA','Pino Elástico 10x40','un','Componente',200,5,'purchase_needed',0,NULL,0),
('prod5','e1','VLV-001','Válvula de Retenção 1/2"','un','Componente',100,95,'normal',0,NULL,0),
('prod6','e1','MNT-002','Mancal Deslizante 40mm','un','Componente',60,62,'normal',0,NULL,0);

-- Almoxarifados
INSERT OR IGNORE INTO almoxarifados (id, empresa_id, name, code, city, state, responsavel_id, custodio_id, status) VALUES
('alm1','e1','Almoxarifado Central',   'ALM-001','São Paulo',    'SP','u1','u2','ativo'),
('alm2','e2','Almoxarifado Nordeste',  'ALM-002','Fortaleza',    'CE','u6','u6','ativo'),
('alm3','e3','Almoxarifado Sul',       'ALM-003','Porto Alegre', 'RS','u7','u7','manutencao');

-- Itens de Estoque
INSERT OR IGNORE INTO stock_items (id, almoxarifado_id, empresa_id, code, name, category, unit, quantity, min_quantity, location, status, serial_controlled, control_type) VALUES
('si1','alm1','e1','MAT-001','Barra Aço SAE 1045 Ø50','Matéria-Prima','m',80,100,'A-01-01','critical',0,NULL),
('si2','alm1','e1','ROL-001','Rolamento 6205-2RS','Componente','un',250,200,'B-02-03','normal',1,'serie'),
('si3','alm1','e1','ANL-001','Anel de Retenção','Componente','un',180,300,'B-03-01','critical',0,NULL),
('si4','alm1','e1','MAT-010','Lingote Ferro Fundido GG-25','Matéria-Prima','kg',320,200,'A-02-01','normal',0,NULL),
('si5','alm1','e1','PAR-001','Parafuso M8x25','Fixador','un',1200,500,'C-01-05','normal',0,NULL),
('si6','alm1','e1','MAT-005','Chapa Al 6061 3mm','Matéria-Prima','kg',200,400,'A-01-03','purchase_needed',0,NULL),
('si7','alm1','e1','MAT-015','Bloco Aço 8620','Matéria-Prima','kg',200,400,'A-02-03','purchase_needed',0,NULL);

-- Ordens de Produção
INSERT OR IGNORE INTO production_orders (id, empresa_id, plant_id, code, product_code, product_name, quantity, quantity_produced, quantity_rejected, start_date, end_date, priority, status, pedido, cliente) VALUES
('op1','e1','p1','OP-2024-001','TAM-A200','Tampa de Alumínio A200',100,100,2,'2024-01-10','2024-01-20','high','completed','PV-001','Metalúrgica Santos'),
('op2','e1','p1','OP-2024-002','EXT-T500','Eixo Transmissão T500',50,50,1,'2024-01-15','2024-01-25','medium','completed','PV-002','Ind. Mecânica Ltda'),
('op3','e1','p2','OP-2024-003','CRC-CM300','Carcaça Motor CM300',30,18,0,'2024-02-01',NULL,'urgent','in_progress','PV-003','Motores Brasil'),
('op4','e1','p1','OP-2024-004','TAM-A200','Tampa de Alumínio A200',200,0,0,'2024-02-10',NULL,'high','planned','PV-004','AutoPeças Sul'),
('op5','e1','p2','OP-2024-005','PIN-ELA','Pino Elástico 10x40',500,0,0,'2024-02-12',NULL,'medium','planned',NULL,NULL),
('op6','e1','p1','OP-2024-006','VLV-001','Válvula de Retenção 1/2"',80,0,0,'2024-02-15',NULL,'low','planned','PV-005','Hidráulica Tech'),
('op7','e1','p2','OP-2024-007','MNT-002','Mancal Deslizante 40mm',40,40,3,'2024-01-20','2024-01-28','medium','completed','PV-006','Rolamentos Cia'),
('op8','e1','p1','OP-2024-008','EXT-T500','Eixo Transmissão T500',25,0,0,'2024-02-08',NULL,'high','in_progress','PV-007','Transmissões SA');

-- Não Conformidades
INSERT OR IGNORE INTO non_conformances (id, empresa_id, code, order_id, step, description, severity, status) VALUES
('nc1','e1','NC-2024-001','op1','Usinagem','Dimensional fora de tolerância no furo Ø25','high','open'),
('nc2','e1','NC-2024-002','op2','Montagem','Folga excessiva no acoplamento','medium','in_analysis'),
('nc3','e1','NC-2024-003','op7','Acabamento','Ranhuras superficiais no diâmetro externo','low','closed');

-- Cotações
INSERT OR IGNORE INTO quotations (id, empresa_id, code, status, tipo, creator) VALUES
('cot1','e1','COT-2024-001','pending_approval','manual','Carlos Silva'),
('cot2','e1','COT-2024-002','awaiting_responses','manual','Pedro Costa'),
('cot3','e1','COT-2024-003','approved','critico','Carlos Silva'),
('cot4','e1','COT-2024-004','sent','manual','Pedro Costa');

-- Pedidos de Compra
INSERT OR IGNORE INTO purchase_orders (id, empresa_id, supplier_id, code, total_value, currency, import_flag, status, expected_delivery) VALUES
('pc1','e1','sup5','PC-2024-001',15000.00,'EUR',1,'in_transit','2024-03-10'),
('pc2','e1','sup2','PC-2024-002',3200.00,'BRL',0,'delivered','2024-02-05');

-- Importações
INSERT OR IGNORE INTO imports (id, empresa_id, purchase_order_id, supplier_id, invoice_number, invoice_date, value_eur, value_brl, exchange_rate, currency, incoterm, port_origin, port_dest, ncm, description, modalidade, status, expected_arrival, tax_ii, tax_ipi, tax_pis, tax_cofins, tax_icms, tax_afrmm, tax_siscomex, total_taxes, landed_cost_brl) VALUES
('imp1','e1','pc1','sup5','INV-2024-0089','2024-01-15',15000.00,82800.00,5.52,'EUR','FOB','Hamburg','Santos','8483.40.90','Rolamentos de esferas de contato angular','maritimo','customs','2024-03-10',
 4968.00, 1656.00, 1324.80, 6102.00, 14904.00, 1656.00, 214.50, 30825.30, 113625.30);
