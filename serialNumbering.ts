/**
 * serialNumbering.ts — Motor de geração automática de números de série.
 *
 * Regras de negócio:
 *  - Cada empresa tem uma regra padrão (product_code = NULL) e pode ter
 *    regras específicas por produto (override).
 *  - 3 tipos de formato, cobrindo os padrões mais comuns do mercado:
 *      'sequencial'      → prefixo + sequencial puro                 (ex: SN000123)
 *      'data_sequencial'  → prefixo + data de fabricação + sequencial  (ex: SN-20260728-0007)
 *      'mascara'          → máscara livre com tokens (letras+números)  (ex: {PREFIXO}{AAAA}{MM}-{SEQ})
 *  - O contador é reiniciado conforme seq_reset: never | yearly | monthly | daily.
 *  - O incremento é atômico (UPSERT + RETURNING) para evitar colisão de série
 *    quando duas OPs são criadas ao mesmo tempo.
 */

export type SerialFormatType = 'sequencial' | 'data_sequencial' | 'mascara'
export type SerialResetPolicy = 'never' | 'yearly' | 'monthly' | 'daily'

export interface SerialRule {
  id: string
  empresaId: string
  productCode: string | null
  formatType: SerialFormatType
  prefix: string
  dateFormat: string
  separator: string
  seqLength: number
  seqReset: SerialResetPolicy
  mask: string
  active: boolean
}

const FALLBACK_RULE: Omit<SerialRule, 'id' | 'empresaId' | 'productCode'> = {
  formatType: 'sequencial',
  prefix: 'SN',
  dateFormat: 'YYYYMMDD',
  separator: '-',
  seqLength: 6,
  seqReset: 'never',
  mask: '',
  active: true,
}

function rowToRule(row: any): SerialRule {
  return {
    id: row.id,
    empresaId: row.empresa_id,
    productCode: row.product_code || null,
    formatType: (row.format_type || 'sequencial') as SerialFormatType,
    prefix: row.prefix || '',
    dateFormat: row.date_format || 'YYYYMMDD',
    separator: row.separator ?? '-',
    seqLength: Number(row.seq_length) || 6,
    seqReset: (row.seq_reset || 'never') as SerialResetPolicy,
    mask: row.mask || '',
    active: row.active !== 0,
  }
}

/**
 * Busca a regra aplicável a um produto: override do produto, senão a regra
 * padrão da empresa, senão um fallback fixo (garante que a geração nunca
 * quebre por falta de configuração).
 */
export async function getRuleForProduct(
  db: D1Database | null,
  empresaId: string,
  productCode: string | null
): Promise<SerialRule> {
  if (db) {
    try {
      if (productCode) {
        const specific = await db
          .prepare('SELECT * FROM serial_numbering_rules WHERE empresa_id = ? AND product_code = ? AND active = 1')
          .bind(empresaId, productCode)
          .first()
        if (specific) return rowToRule(specific)
      }
      const def = await db
        .prepare('SELECT * FROM serial_numbering_rules WHERE empresa_id = ? AND product_code IS NULL AND active = 1')
        .bind(empresaId)
        .first()
      if (def) return rowToRule(def)
    } catch (e) {
      console.error('[serialNumbering] getRuleForProduct erro:', e)
    }
  }
  return { id: '__fallback__', empresaId, productCode: null, ...FALLBACK_RULE }
}

/** Lista todas as regras de uma empresa (padrão + overrides), para a tela de admin. */
export async function listRules(db: D1Database | null, empresaId: string): Promise<SerialRule[]> {
  if (!db) return []
  try {
    const rows = await db
      .prepare('SELECT * FROM serial_numbering_rules WHERE empresa_id = ? ORDER BY (product_code IS NULL) DESC, product_code ASC')
      .bind(empresaId)
      .all()
    return (rows.results || []).map(rowToRule)
  } catch {
    return []
  }
}

function pad2(n: number): string { return String(n).padStart(2, '0') }

/** Calcula o "bucket" de reinício do contador (ALL para 'never'). */
export function computeBucket(seqReset: SerialResetPolicy, date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = pad2(date.getMonth() + 1)
  const d = pad2(date.getDate())
  switch (seqReset) {
    case 'yearly':  return `${y}`
    case 'monthly': return `${y}${m}`
    case 'daily':   return `${y}${m}${d}`
    default:        return 'ALL'
  }
}

function formatDateToken(fmt: string, date: Date): string {
  const y = date.getFullYear()
  const m = pad2(date.getMonth() + 1)
  const d = pad2(date.getDate())
  return fmt
    .replace(/YYYY/g, String(y))
    .replace(/YY/g, String(y).slice(-2))
    .replace(/MM/g, m)
    .replace(/DD/g, d)
}

/** Monta a string final do serial a partir da regra + valor sequencial. */
export function formatSerial(rule: SerialRule, seqValue: number, date: Date = new Date()): string {
  const seqStr = String(seqValue).padStart(rule.seqLength, '0')
  const sep = rule.separator ?? '-'

  if (rule.formatType === 'mascara' && rule.mask) {
    return rule.mask
      .replace(/\{PREFIXO\}/g, rule.prefix || '')
      .replace(/\{AAAA\}/g, String(date.getFullYear()))
      .replace(/\{AA\}/g, String(date.getFullYear()).slice(-2))
      .replace(/\{MM\}/g, pad2(date.getMonth() + 1))
      .replace(/\{DD\}/g, pad2(date.getDate()))
      .replace(/\{SEQ\}/g, seqStr)
  }

  const parts: string[] = []
  if (rule.prefix) parts.push(rule.prefix)
  if (rule.formatType === 'data_sequencial') parts.push(formatDateToken(rule.dateFormat || 'YYYYMMDD', date))
  parts.push(seqStr)
  return parts.join(sep)
}

/**
 * Reserva atomicamente um intervalo de `qty` números sequenciais para a
 * chave/bucket informados, retornando o último valor após o incremento.
 * Usa UPSERT com RETURNING (suportado pelo D1/SQLite ≥3.35); se a runtime
 * não suportar RETURNING, cai para um loop otimista de leitura+escrita.
 */
export async function reserveSequenceRange(
  db: D1Database,
  empresaId: string,
  ruleKey: string,
  bucket: string,
  qty: number
): Promise<{ from: number; to: number }> {
  try {
    const row = await db.prepare(
      `INSERT INTO serial_numbering_counters (id, empresa_id, rule_key, bucket, last_value, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(empresa_id, rule_key, bucket)
       DO UPDATE SET last_value = last_value + excluded.last_value, updated_at = datetime('now')
       RETURNING last_value`
    ).bind(`snc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, empresaId, ruleKey, bucket, qty).first<{ last_value: number }>()

    const to = Number(row?.last_value)
    if (Number.isFinite(to)) return { from: to - qty + 1, to }
  } catch (e) {
    console.error('[serialNumbering] RETURNING indisponível, usando fallback otimista:', e)
  }

  // Fallback: leitura + escrita com retry (sem RETURNING)
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await db
      .prepare('SELECT last_value FROM serial_numbering_counters WHERE empresa_id = ? AND rule_key = ? AND bucket = ?')
      .bind(empresaId, ruleKey, bucket)
      .first<{ last_value: number }>()

    const current = existing?.last_value || 0
    const to = current + qty
    try {
      if (existing) {
        await db.prepare('UPDATE serial_numbering_counters SET last_value = ?, updated_at = datetime(\'now\') WHERE empresa_id = ? AND rule_key = ? AND bucket = ? AND last_value = ?')
          .bind(to, empresaId, ruleKey, bucket, current).run()
      } else {
        await db.prepare('INSERT INTO serial_numbering_counters (id, empresa_id, rule_key, bucket, last_value, updated_at) VALUES (?, ?, ?, ?, ?, datetime(\'now\'))')
          .bind(`snc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, empresaId, ruleKey, bucket, to).run()
      }
      return { from: current + 1, to }
    } catch {
      // colisão de concorrência — tenta de novo
      continue
    }
  }
  throw new Error('Não foi possível reservar sequencial de série (concorrência).')
}

/**
 * Gera `qty` números de série para um produto, aplicando a regra vigente
 * (override do produto ou padrão da empresa). Retorna apenas as strings —
 * quem chama é responsável por persistir em `serial_numbers`.
 */
export async function generateSerials(
  db: D1Database | null,
  empresaId: string,
  productCode: string | null,
  qty: number,
  date: Date = new Date()
): Promise<{ serials: string[]; rule: SerialRule }> {
  const rule = await getRuleForProduct(db, empresaId, productCode)
  if (qty <= 0) return { serials: [], rule }

  const ruleKey = rule.productCode || '__default__'
  const bucket = computeBucket(rule.seqReset, date)

  if (!db) {
    // Sem D1 (modo demo) — gera em memória, sem persistência de contador real.
    const base = Math.floor(Math.random() * 1000)
    const serials = Array.from({ length: qty }, (_, i) => formatSerial(rule, base + i + 1, date))
    return { serials, rule }
  }

  const { from, to } = await reserveSequenceRange(db, empresaId, ruleKey, bucket, qty)
  const serials: string[] = []
  for (let v = from; v <= to; v++) serials.push(formatSerial(rule, v, date))
  return { serials, rule }
}

/** Preview do próximo número (sem consumir o contador) — usado na tela de admin. */
export async function previewNextSerial(
  db: D1Database | null,
  empresaId: string,
  productCode: string | null,
  rule?: SerialRule
): Promise<string> {
  const r = rule || await getRuleForProduct(db, empresaId, productCode)
  const ruleKey = r.productCode || '__default__'
  const bucket = computeBucket(r.seqReset)
  let current = 0
  if (db) {
    try {
      const row = await db
        .prepare('SELECT last_value FROM serial_numbering_counters WHERE empresa_id = ? AND rule_key = ? AND bucket = ?')
        .bind(empresaId, ruleKey, bucket)
        .first<{ last_value: number }>()
      current = row?.last_value || 0
    } catch { current = 0 }
  }
  return formatSerial(r, current + 1)
}

// ── Ciclo de vida do serial nascido em produção ──────────────────────────────
// em_producao → (OP concluída) → pendente_enderecamento → (endereço definido) → em_estoque
export const SERIAL_STATUS = {
  EM_PRODUCAO: 'em_producao',
  PENDENTE_ENDERECAMENTO: 'pendente_enderecamento',
  EM_ESTOQUE: 'em_estoque',
} as const

/**
 * Ponto único de integração de estoque com sistemas externos (ex: Omie).
 * Hoje é um stub que só registra em log — quando a integração real com o Omie
 * for implementada (ver avaliação de viabilidade anterior), este é o lugar
 * certo para disparar a atualização de saldo, mantendo a cadeia
 * OP → Serial → Estoque → Omie sempre consistente e em um único ponto de disparo,
 * em vez de espalhado pelas rotas.
 */
export async function notifyStockChangeToOmie(params: {
  empresaId: string
  productCode: string
  quantityDelta: number
  reason: string
}): Promise<void> {
  console.log('[omie-stub] Estoque alterado (integração real pendente):', params)
}

/**
 * Ao concluir uma Ordem de Produção (via apontamento ou marcação manual),
 * transiciona os seriais 'em_producao' vinculados a ela para
 * 'pendente_enderecamento': o item já conta como estoque disponível
 * (dispara o gancho de sincronismo de estoque), mas ainda depende de
 * endereçamento físico + etiqueta do endereço para ficar 100% disponível.
 * Retorna os seriais afetados para a tela solicitar a impressão da etiqueta
 * do número de série antes de finalizar.
 */
export async function completeSerialsForOrder(
  db: D1Database | null,
  userId: string,
  empresaId: string,
  tenant: any,
  orderCode: string,
  productCode: string
): Promise<Array<{ id: string; number: string; itemCode: string; itemName: string }>> {
  if (!Array.isArray(tenant.serialNumbers)) tenant.serialNumbers = []
  const affected = tenant.serialNumbers.filter(
    (s: any) => s.orderCode === orderCode && s.status === SERIAL_STATUS.EM_PRODUCAO
  )
  if (affected.length === 0) return []

  for (const s of affected) s.status = SERIAL_STATUS.PENDENTE_ENDERECAMENTO

  if (db && userId !== 'demo-tenant') {
    try {
      await db.prepare(
        `UPDATE serial_numbers SET status = ? WHERE order_code = ? AND empresa_id = ? AND status = ?`
      ).bind(SERIAL_STATUS.PENDENTE_ENDERECAMENTO, orderCode, empresaId, SERIAL_STATUS.EM_PRODUCAO).run()
    } catch (e) {
      console.error('[serialNumbering] Falha ao atualizar status dos seriais na conclusão da OP:', e)
    }
  }

  // Incrementa a quantidade em estoque do produto — a série já entra como
  // disponível (só falta endereçamento físico). Isso é o que, no futuro,
  // alimentará a sincronização de saldo com o Omie.
  if (Array.isArray(tenant.stockItems) && productCode) {
    const stockIdx = tenant.stockItems.findIndex((s: any) => s.code === productCode)
    if (stockIdx !== -1) {
      tenant.stockItems[stockIdx].quantity = (tenant.stockItems[stockIdx].quantity || 0) + affected.length
      if (db && userId !== 'demo-tenant') {
        try {
          await db.prepare(`UPDATE stock_items SET quantity = quantity + ? WHERE code = ? AND empresa_id = ?`)
            .bind(affected.length, productCode, empresaId).run()
        } catch (e) {
          console.error('[serialNumbering] Falha ao incrementar stock_items na conclusão da OP:', e)
        }
      }
    } else {
      console.warn(`[serialNumbering] Produto ${productCode} concluiu produção mas não tem registro em stock_items — quantidade não pôde ser incrementada automaticamente.`)
    }
  }

  await notifyStockChangeToOmie({
    empresaId, productCode, quantityDelta: affected.length,
    reason: `Conclusão da OP ${orderCode}`,
  })

  return affected.map((s: any) => ({ id: s.id, number: s.number, itemCode: s.itemCode, itemName: s.itemName }))
}
