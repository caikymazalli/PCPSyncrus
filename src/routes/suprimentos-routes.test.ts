/**
 * suprimentos-routes.test.ts
 *
 * Testes de salvaguarda para o módulo de suprimentos (Pedidos de Compra).
 * Verifica:
 * 1. O padrão D1-first está presente no código-fonte dos handlers de criação de PC
 *    (memória só é atualizada após D1 ter sucesso).
 * 2. Quando D1 falha, a API retorna erro e a memória NÃO é atualizada.
 * 3. Quando D1 tem sucesso (mock), a memória é atualizada corretamente.
 * 4. Em modo demo (sem db), o pedido é salvo em memória diretamente.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import app from './suprimentos'
import { sessions, tenants } from '../userStore'

interface ApiResponse<T = Record<string, unknown>> {
  ok: boolean
  error?: string
  data?: T
  message?: string
  purchaseOrder?: Record<string, unknown>
  quotation?: Record<string, unknown>
  pcCode?: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const TEST_TOKEN = 'test-token-suprimentos-safeguard'
const TEST_USER_ID = 'test-user-suprimentos-safeguard'
const TEST_QUOTATION_ID = 'quot-test-001'
const TEST_SUPPLIER_ID = 'sup-test-001'

function setupSession() {
  sessions[TEST_TOKEN] = {
    token: TEST_TOKEN,
    userId: TEST_USER_ID,
    email: 'test-suprimentos@test.com',
    nome: 'Test User',
    empresa: 'Test Corp',
    plano: 'starter',
    role: 'admin',
    isDemo: false,
    createdAt: new Date().toISOString(),
    expiresAt: Date.now() + 3_600_000,
    empresaId: '1',
    grupoId: null,
  }
}

function setupTenant(withApprovedQuotation = false) {
  const quotation = {
    id: TEST_QUOTATION_ID,
    code: 'COT-2024-0001',
    status: 'sent',
    items: [{ productCode: 'P001', quantity: 10, unitPrice: 5 }],
    supplierIds: [TEST_SUPPLIER_ID],
    supplierResponses: [
      { supplierId: TEST_SUPPLIER_ID, supplierName: 'Fornecedor Teste', totalPrice: 50 },
    ],
    createdAt: new Date().toISOString(),
  }

  const approvedQuotation = {
    ...quotation,
    status: 'approved',
  }

  tenants[TEST_USER_ID] = {
    plants: [], machines: [], workbenches: [],
    products: [], productionOrders: [], productionEntries: [],
    stockItems: [], nonConformances: [],
    suppliers: [
      { id: TEST_SUPPLIER_ID, name: 'Fornecedor Teste', type: 'nacional' },
    ],
    quotations: withApprovedQuotation ? [approvedQuotation] : [quotation],
    purchaseOrders: [], imports: [],
    boms: [], instructions: [], qualityChecks: [], users: [],
    kpis: {}, chartData: {},
    bomItems: [], productSuppliers: [], workOrders: [], routes: [],
    serialNumbers: [], serialPendingItems: [],
    warehouses: [], separationOrders: [], stockExits: [],
    supplierCategories: [], productSupplierLinks: [],
    quotationNegotiations: [],
    workInstructions: [], workInstructionVersions: [],
    workInstructionSteps: [], workInstructionPhotos: [],
    workInstructionAuditLog: [],
  }
}

function cleanup() {
  delete sessions[TEST_TOKEN]
  delete tenants[TEST_USER_ID]
}

function authedRequest(path: string, init?: RequestInit, env?: Record<string, unknown>) {
  return app.request(path, {
    ...init,
    headers: {
      ...(init?.headers as Record<string, string> || {}),
      Cookie: 'pcp_session=' + TEST_TOKEN,
    },
  }, env)
}

const failingDB = {
  prepare: () => ({
    bind: () => ({
      run: () => Promise.reject(new Error('D1 connection failed')),
      all: () => Promise.reject(new Error('D1 connection failed')),
      first: () => Promise.reject(new Error('D1 connection failed')),
    }),
    run: () => Promise.reject(new Error('D1 connection failed')),
    all: () => Promise.reject(new Error('D1 connection failed')),
    first: () => Promise.reject(new Error('D1 connection failed')),
  }),
}

const successDB = {
  prepare: () => ({
    bind: () => ({
      run: () => Promise.resolve({ success: true, results: [] }),
      all: () => Promise.resolve({ results: [] }),
      first: () => Promise.resolve(null),
    }),
    run: () => Promise.resolve({ success: true, results: [] }),
    all: () => Promise.resolve({ results: [] }),
    first: () => Promise.resolve(null),
  }),
}

// ── Source-code guardrail: D1-first ──────────────────────────────────────────

describe('suprimentos.ts source-code guardrails D1-first', () => {
  const src = readFileSync(resolve(__dirname, 'suprimentos.ts'), 'utf8')

  it('approve handler: bloco D1 aparece antes de tenant.purchaseOrders.push', () => {
    const handlerStart = src.indexOf("app.post('/api/quotations/:id/approve'")
    const handlerEnd = src.indexOf('\napp.', handlerStart + 1)
    const handlerBody = src.slice(handlerStart, handlerEnd > handlerStart ? handlerEnd : undefined)

    const d1BlockPos = handlerBody.indexOf("userId !== 'demo-tenant'")
    const memPushPos = handlerBody.lastIndexOf('tenant.purchaseOrders.push')
    expect(d1BlockPos).toBeGreaterThan(-1)
    expect(memPushPos).toBeGreaterThan(-1)
    expect(d1BlockPos).toBeLessThan(memPushPos)
  })

  it('approve handler: sem catch{} silencioso em writes D1', () => {
    const handlerStart = src.indexOf("app.post('/api/quotations/:id/approve'")
    const handlerEnd = src.indexOf('\napp.', handlerStart + 1)
    const handlerBody = src.slice(handlerStart, handlerEnd > handlerStart ? handlerEnd : undefined)
    expect(handlerBody).not.toMatch(/catch\s*\{\s*\}/)
    expect(handlerBody).not.toMatch(/console\.warn/)
  })

  it('purchase-orders/create handler: bloco D1 aparece antes de tenant.purchaseOrders.push', () => {
    const handlerStart = src.indexOf("app.post('/api/purchase-orders/create'")
    const handlerEnd = src.indexOf('\napp.', handlerStart + 1)
    const handlerBody = src.slice(handlerStart, handlerEnd > handlerStart ? handlerEnd : undefined)

    const d1BlockPos = handlerBody.indexOf("userId !== 'demo-tenant'")
    const memPushPos = handlerBody.indexOf('tenant.purchaseOrders.push')
    expect(d1BlockPos).toBeGreaterThan(-1)
    expect(memPushPos).toBeGreaterThan(-1)
    expect(d1BlockPos).toBeLessThan(memPushPos)
  })

  it('purchase-orders/create handler: inclui log [CRÍTICO] no caso de falha D1', () => {
    const handlerStart = src.indexOf("app.post('/api/purchase-orders/create'")
    const handlerEnd = src.indexOf('\napp.', handlerStart + 1)
    const handlerBody = src.slice(handlerStart, handlerEnd > handlerStart ? handlerEnd : undefined)
    expect(handlerBody).toContain('[CRÍTICO]')
  })
})

// ── POST /api/purchase-orders/create — modo demo (sem db) ────────────────────

describe('POST /suprimentos/api/purchase-orders/create — modo demo (sem db)', () => {
  beforeEach(() => { setupSession(); setupTenant(true) })
  afterEach(cleanup)

  it('retorna 200 e salva pedido em memória no modo demo', async () => {
    const initialCount = (tenants[TEST_USER_ID].purchaseOrders as any[]).length

    const res = await authedRequest('/api/purchase-orders/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quotationId: TEST_QUOTATION_ID }),
    })

    expect(res.status).toBe(200)
    const data = await res.json() as ApiResponse
    expect(data.ok).toBe(true)
    expect(data.purchaseOrder).toBeDefined()

    const tenant = tenants[TEST_USER_ID]
    expect((tenant.purchaseOrders as any[]).length).toBe(initialCount + 1)
  })

  it('retorna erro quando quotationId não é fornecido', async () => {
    const res = await authedRequest('/api/purchase-orders/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)
    const data = await res.json() as ApiResponse
    expect(data.ok).toBe(false)
  })
})

// ── POST /api/purchase-orders/create — D1 falhando em produção ───────────────

describe('POST /suprimentos/api/purchase-orders/create — D1 falhando em produção', () => {
  beforeEach(() => { setupSession(); setupTenant(true) })
  afterEach(cleanup)

  it('retorna erro 500 e NÃO atualiza memória quando D1 falha', async () => {
    const initialCount = (tenants[TEST_USER_ID].purchaseOrders as any[]).length

    const res = await authedRequest('/api/purchase-orders/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quotationId: TEST_QUOTATION_ID }),
    }, { DB: failingDB })

    expect(res.status).toBe(500)
    const data = await res.json() as ApiResponse
    expect(data.ok).toBe(false)

    // Memória NÃO deve ter sido atualizada
    const tenant = tenants[TEST_USER_ID]
    expect((tenant.purchaseOrders as any[]).length).toBe(initialCount)
  })
})

// ── POST /api/purchase-orders/create — D1 com sucesso em produção ─────────────

describe('POST /suprimentos/api/purchase-orders/create — D1 com sucesso em produção', () => {
  beforeEach(() => { setupSession(); setupTenant(true) })
  afterEach(cleanup)

  it('retorna 200 e atualiza memória quando D1 tem sucesso', async () => {
    const initialCount = (tenants[TEST_USER_ID].purchaseOrders as any[]).length

    const res = await authedRequest('/api/purchase-orders/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quotationId: TEST_QUOTATION_ID }),
    }, { DB: successDB })

    expect(res.status).toBe(200)
    const data = await res.json() as ApiResponse
    expect(data.ok).toBe(true)
    expect(data.purchaseOrder).toBeDefined()

    const tenant = tenants[TEST_USER_ID]
    expect((tenant.purchaseOrders as any[]).length).toBe(initialCount + 1)
  })
})

// ── POST /api/quotations/:id/approve — D1 falhando em produção ───────────────

describe('POST /suprimentos/api/quotations/:id/approve — D1 falhando em produção', () => {
  beforeEach(() => { setupSession(); setupTenant() })
  afterEach(cleanup)

  it('retorna erro 500 e NÃO adiciona pedido à memória quando D1 falha ao criar PC', async () => {
    const initialCount = (tenants[TEST_USER_ID].purchaseOrders as any[]).length

    // Make quotation approved first in memory so we reach the PC creation
    tenants[TEST_USER_ID].quotations[0].status = 'sent'

    const res = await authedRequest(`/api/quotations/${TEST_QUOTATION_ID}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }, { DB: failingDB })

    // Should fail (either D1 update for quotation or PC insert fails)
    expect(res.status).toBe(500)
    const data = await res.json() as ApiResponse
    expect(data.ok).toBe(false)

    // Memória NÃO deve ter PC adicionado
    const tenant = tenants[TEST_USER_ID]
    expect((tenant.purchaseOrders as any[]).length).toBe(initialCount)
  })
})

// ── POST /api/quotations/:id/approve — D1 com sucesso em produção ─────────────

describe('POST /suprimentos/api/quotations/:id/approve — D1 com sucesso em produção', () => {
  beforeEach(() => { setupSession(); setupTenant() })
  afterEach(cleanup)

  it('retorna 200 e cria pedido em memória quando D1 tem sucesso', async () => {
    const initialCount = (tenants[TEST_USER_ID].purchaseOrders as any[]).length

    const res = await authedRequest(`/api/quotations/${TEST_QUOTATION_ID}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }, { DB: successDB })

    expect(res.status).toBe(200)
    const data = await res.json() as ApiResponse
    expect(data.ok).toBe(true)
    expect(data.purchaseOrder).toBeDefined()

    const tenant = tenants[TEST_USER_ID]
    expect((tenant.purchaseOrders as any[]).length).toBe(initialCount + 1)
  })
})
