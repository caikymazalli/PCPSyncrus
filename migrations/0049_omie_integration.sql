-- Migration: 0049_omie_integration.sql
-- Integração Omie ERP no Painel Financeiro
-- Executar após: 0048_financial_panel.sql

-- ── 1. Colunas Omie na tabela invoices ───────────────────────────────────────
ALTER TABLE invoices ADD COLUMN omie_codigo_lancamento    INTEGER;
ALTER TABLE invoices ADD COLUMN omie_codigo_integracao    TEXT;
ALTER TABLE invoices ADD COLUMN omie_boleto_url           TEXT;
ALTER TABLE invoices ADD COLUMN omie_boleto_linha_digitavel TEXT;
ALTER TABLE invoices ADD COLUMN omie_boleto_codigo_barras TEXT;
ALTER TABLE invoices ADD COLUMN omie_nfse_id              INTEGER;
ALTER TABLE invoices ADD COLUMN omie_nfse_numero          TEXT;
ALTER TABLE invoices ADD COLUMN omie_nfse_pdf             TEXT;
ALTER TABLE invoices ADD COLUMN omie_nfse_xml             TEXT;
ALTER TABLE invoices ADD COLUMN omie_synced_at            TEXT;

-- ── 2. Colunas Omie em platform_settings ─────────────────────────────────────
ALTER TABLE platform_settings ADD COLUMN omie_enabled            INTEGER DEFAULT 0;
ALTER TABLE platform_settings ADD COLUMN omie_app_key            TEXT;
ALTER TABLE platform_settings ADD COLUMN omie_app_secret         TEXT;
ALTER TABLE platform_settings ADD COLUMN omie_conta_corrente     TEXT;
ALTER TABLE platform_settings ADD COLUMN omie_codigo_categoria   TEXT    DEFAULT '1.01.02';
ALTER TABLE platform_settings ADD COLUMN omie_codigo_servico     TEXT;
ALTER TABLE platform_settings ADD COLUMN omie_sync_auto          INTEGER DEFAULT 0;
ALTER TABLE platform_settings ADD COLUMN omie_last_sync          TEXT;

-- ── 3. Tabela de mapeamento cliente ↔ Omie ───────────────────────────────────
CREATE TABLE IF NOT EXISTS omie_clientes (
  empresa_id        TEXT    PRIMARY KEY,
  omie_codigo       INTEGER,
  omie_integracao   TEXT    UNIQUE,
  synced_at         TEXT    DEFAULT (datetime('now')),
  FOREIGN KEY(empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
);

-- ── 4. Log de sincronização Omie ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS omie_sync_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  action      TEXT    NOT NULL,  -- 'sync','push','boleto','nfse','sync-contratos'
  invoice_id  TEXT,
  omie_ref    TEXT,
  status      TEXT    NOT NULL,  -- 'ok','error'
  message     TEXT,
  created_at  TEXT    DEFAULT (datetime('now'))
);

-- ── 5. Índices ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_invoices_omie_lancamento  ON invoices(omie_codigo_lancamento);
CREATE INDEX IF NOT EXISTS idx_invoices_omie_synced      ON invoices(omie_synced_at);
CREATE INDEX IF NOT EXISTS idx_omie_sync_log_invoice     ON omie_sync_log(invoice_id);
CREATE INDEX IF NOT EXISTS idx_omie_sync_log_created     ON omie_sync_log(created_at);
