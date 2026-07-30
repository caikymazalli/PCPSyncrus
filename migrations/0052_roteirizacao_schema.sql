-- ============================================================
-- PCP Syncrus — Migration 052: Módulo Roteirização de Frota
-- Controle de rotas de entrega para expedição (Brasil)
-- ============================================================

-- ── Veículos da Frota ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rot_veiculos (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  empresa_id    TEXT DEFAULT '1',
  -- Identificação
  placa         TEXT NOT NULL,
  apelido       TEXT,
  tipo          TEXT NOT NULL DEFAULT 'truck',
  -- truck (caminhão), van, utilitario, carreta, moto, pickup
  modelo        TEXT,
  marca         TEXT,
  ano           INTEGER,
  -- Capacidades
  capacidade_kg  REAL DEFAULT 0,
  capacidade_vol REAL DEFAULT 0,       -- m³
  capacidade_pal INTEGER DEFAULT 0,    -- paletes
  -- Motorista padrão
  motorista_nome  TEXT,
  motorista_cnh   TEXT,
  motorista_tel   TEXT,
  -- Rastreamento
  lat_atual     REAL,
  lon_atual     REAL,
  ultima_atualizacao TEXT,
  -- Status
  status        TEXT NOT NULL DEFAULT 'disponivel',
  -- disponivel, em_rota, manutencao, indisponivel
  cor           TEXT DEFAULT '#2980B9',  -- cor para mapa
  observacoes   TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rot_veiculos_user    ON rot_veiculos(user_id);
CREATE INDEX IF NOT EXISTS idx_rot_veiculos_empresa ON rot_veiculos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_rot_veiculos_status  ON rot_veiculos(status);

-- ── Rotas de Entrega ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rot_rotas (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  empresa_id      TEXT DEFAULT '1',
  -- Identificação
  codigo          TEXT NOT NULL,
  descricao       TEXT,
  -- Vínculo
  veiculo_id      TEXT,
  motorista_nome  TEXT,
  motorista_tel   TEXT,
  -- Datas
  data_saida_prev TEXT NOT NULL,      -- data prevista de saída
  data_saida_real TEXT,               -- data real de saída
  data_retorno_prev TEXT,
  data_retorno_real TEXT,
  -- Geo-origem
  origem_nome     TEXT NOT NULL DEFAULT 'Matriz',
  origem_endereco TEXT,
  origem_cidade   TEXT,
  origem_estado   TEXT DEFAULT 'SP',
  origem_lat      REAL DEFAULT -23.5505,
  origem_lon      REAL DEFAULT -46.6333,
  -- Totais calculados
  total_paradas   INTEGER DEFAULT 0,
  total_entregas  INTEGER DEFAULT 0,
  total_peso_kg   REAL DEFAULT 0,
  distancia_km    REAL DEFAULT 0,
  tempo_est_min   INTEGER DEFAULT 0,
  -- Status
  status          TEXT NOT NULL DEFAULT 'planejada',
  -- planejada, em_andamento, concluida, cancelada, parcial
  prioridade      TEXT DEFAULT 'normal',  -- baixa, normal, alta, urgente
  observacoes     TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rot_rotas_user    ON rot_rotas(user_id);
CREATE INDEX IF NOT EXISTS idx_rot_rotas_empresa ON rot_rotas(empresa_id);
CREATE INDEX IF NOT EXISTS idx_rot_rotas_status  ON rot_rotas(status);
CREATE INDEX IF NOT EXISTS idx_rot_rotas_data    ON rot_rotas(data_saida_prev);

-- ── Paradas / Entregas da Rota ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rot_paradas (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  empresa_id      TEXT DEFAULT '1',
  rota_id         TEXT NOT NULL,
  -- Sequência
  ordem           INTEGER NOT NULL DEFAULT 1,
  -- Destinatário
  cliente_nome    TEXT NOT NULL,
  cliente_id      TEXT,               -- FK opcional para clientes da plataforma
  documento       TEXT,               -- CPF/CNPJ do destinatário
  -- Endereço
  endereco        TEXT NOT NULL,
  numero          TEXT,
  complemento     TEXT,
  bairro          TEXT,
  cidade          TEXT NOT NULL,
  estado          TEXT NOT NULL DEFAULT 'SP',
  cep             TEXT,
  lat             REAL,
  lon             REAL,
  -- Pedido / NF
  pedido_ref      TEXT,               -- número do pedido de venda
  nf_numero       TEXT,               -- número da nota fiscal
  nf_chave        TEXT,               -- chave NFe (44 dígitos)
  -- Volumes
  volumes         INTEGER DEFAULT 1,
  peso_kg         REAL DEFAULT 0,
  valor_nf        REAL DEFAULT 0,
  -- Logística
  horario_prev    TEXT,               -- horário previsto de entrega (HH:MM)
  horario_real    TEXT,               -- horário real de entrega
  janela_ini      TEXT,               -- janela de entrega início (HH:MM)
  janela_fim      TEXT,               -- janela de entrega fim (HH:MM)
  -- Status
  status          TEXT NOT NULL DEFAULT 'pendente',
  -- pendente, em_transito, entregue, tentativa, reagendado, devolvido, cancelado
  motivo_ocorrencia TEXT,             -- motivo de falha / devolução
  assinatura_nome TEXT,               -- nome de quem recebeu
  foto_comprovante TEXT,              -- URL da foto (R2)
  observacoes     TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rot_paradas_rota    ON rot_paradas(rota_id);
CREATE INDEX IF NOT EXISTS idx_rot_paradas_user    ON rot_paradas(user_id);
CREATE INDEX IF NOT EXISTS idx_rot_paradas_status  ON rot_paradas(status);
CREATE INDEX IF NOT EXISTS idx_rot_paradas_estado  ON rot_paradas(estado);

-- ── Ocorrências / Eventos de Rota ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rot_ocorrencias (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  empresa_id  TEXT DEFAULT '1',
  rota_id     TEXT NOT NULL,
  parada_id   TEXT,
  tipo        TEXT NOT NULL,
  -- saida, chegada_parada, entrega_ok, tentativa_falha, reagendamento,
  -- devolucao, acidente, parada_inesperada, conclusao_rota
  descricao   TEXT,
  lat         REAL,
  lon         REAL,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rot_ocorr_rota  ON rot_ocorrencias(rota_id);
CREATE INDEX IF NOT EXISTS idx_rot_ocorr_user  ON rot_ocorrencias(user_id);
