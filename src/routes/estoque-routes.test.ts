/**
 * estoque-routes.test.ts
 *
 * Testes de salvaguarda para o módulo de estoque (Criação de Item).
 * Verifica:
 * 1. O padrão D1-first está presente no código-fonte do handler de criação de item
 *    (memória só é atualizada após D1 ter sucesso).
 * 2. Quando D1 falha, a API retorna erro e a memória NÃO é atualizada.
 * 3. Quando D1 tem sucesso (mock), a memória é atualizada corretamente.
 * 4. Em modo demo (sem db), o item é salvo em memória diretamente.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import app from './estoque'
import { sessions, tenants } from '../userStore'

interface ApiResponse<T = Record<string, unknown>> {
  ok: boolean
  error?: string
  item?: T
  message?: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const TEST_TOKEN = 'test-token-estoque-safeguard'
const TEST_USER_ID = 'test-user-estoque-safeguard'

function setupSession() {
  sessions[TEST_TOKEN] = {
    token: TEST_TOKEN,
    userId: TEST_USER_ID,
    email: 'test-estoque@test.com',
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

function setupTenant() {
  tenants[TEST_USER_ID] = {
    plants: [], machines: [], workbenches: [],
    products: [], productionOrders: [], productionEntries: [],
    stockItems: [], nonConformances: [],
    suppliers: [],
    quotations: [], purchaseOrders: [], imports: [],
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

describe('estoque.ts source-code guardrails D1-first (criação de item)', () => {
  const src = readFileSync(resolve(__dirname, 'estoque.ts'), 'utf8')

  it('handler POST /api/item/create: bloco D1 aparece antes de tenant.stockItems.push', () => {
    const handlerStart = src.indexOf("app.post('/api/item/create'")
    const handlerEnd = src.indexOf('\napp.', handlerStart + 1)
    const handlerBody = src.slice(handlerStart, handlerEnd > handlerStart ? handlerEnd : undefined)

    const d1BlockPos = handlerBody.indexOf("userId !== 'demo-tenant'")
    const memPushPos = handlerBody.indexOf('tenant.stockItems.push')
    expect(d1BlockPos).toBeGreaterThan(-1)
    expect(memPushPos).toBeGreaterThan(-1)
    expect(d1BlockPos).toBeLessThan(memPushPos)
  })

  it('handler POST /api/item/create: sem catch{} silencioso em writes D1', () => {
    const handlerStart = src.indexOf("app.post('/api/item/create'")
    const handlerEnd = src.indexOf('\napp.', handlerStart + 1)
    const handlerBody = src.slice(handlerStart, handlerEnd > handlerStart ? handlerEnd : undefined)
    expect(handlerBody).not.toMatch(/catch\s*\{\s*\}/)
  })

  it('handler POST /api/item/create: inclui log [CRÍTICO] no caso de falha D1', () => {
    const handlerStart = src.indexOf("app.post('/api/item/create'")
    const handlerEnd = src.indexOf('\napp.', handlerStart + 1)
    const handlerBody = src.slice(handlerStart, handlerEnd > handlerStart ? handlerEnd : undefined)
    expect(handlerBody).toContain('[CRÍTICO]')
  })
})

// ── POST /api/item/create — modo demo (sem db) ────────────────────────────────

describe('POST /estoque/api/item/create — modo demo (sem db)', () => {
  beforeEach(() => { setupSession(); setupTenant() })
  afterEach(cleanup)

  it('retorna 200 e salva item em memória no modo demo', async () => {
    const initialCount = (tenants[TEST_USER_ID].stockItems as any[]).length

    const res = await authedRequest('/api/item/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Item Demo', unit: 'un' }),
    })

    expect(res.status).toBe(200)
    const data = await res.json() as ApiResponse<{ name: string }>
    expect(data.ok).toBe(true)
    expect(data.item).toBeDefined()
    expect(data.item?.name).toBe('Item Demo')

    const tenant = tenants[TEST_USER_ID]
    expect((tenant.stockItems as any[]).length).toBe(initialCount + 1)
  })

  it('retorna erro quando nome não é fornecido', async () => {
    const res = await authedRequest('/api/item/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unit: 'un' }),
    })
    expect(res.status).toBe(400)
    const data = await res.json() as ApiResponse
    expect(data.ok).toBe(false)
  })
})

// ── POST /api/item/create — D1 falhando em produção ───────────────────────────

describe('POST /estoque/api/item/create — D1 falhando em produção', () => {
  beforeEach(() => { setupSession(); setupTenant() })
  afterEach(cleanup)

  it('retorna erro 500 e NÃO atualiza memória quando D1 falha', async () => {
    const initialCount = (tenants[TEST_USER_ID].stockItems as any[]).length

    const res = await authedRequest('/api/item/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Item Produção', unit: 'kg' }),
    }, { DB: failingDB })

    expect(res.status).toBe(500)
    const data = await res.json() as ApiResponse
    expect(data.ok).toBe(false)

    // Memória NÃO deve ter sido atualizada
    const tenant = tenants[TEST_USER_ID]
    expect((tenant.stockItems as any[]).length).toBe(initialCount)
  })
})

// ── POST /api/item/create — D1 com sucesso em produção ────────────────────────

describe('POST /estoque/api/item/create — D1 com sucesso em produção', () => {
  beforeEach(() => { setupSession(); setupTenant() })
  afterEach(cleanup)

  it('retorna 200 e atualiza memória quando D1 tem sucesso', async () => {
    const initialCount = (tenants[TEST_USER_ID].stockItems as any[]).length

    const res = await authedRequest('/api/item/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Item Produção OK', unit: 'kg', currentQty: 100 }),
    }, { DB: successDB })

    expect(res.status).toBe(200)
    const data = await res.json() as ApiResponse<{ name: string }>
    expect(data.ok).toBe(true)
    expect(data.item).toBeDefined()
    expect(data.item?.name).toBe('Item Produção OK')

    const tenant = tenants[TEST_USER_ID]
    expect((tenant.stockItems as any[]).length).toBe(initialCount + 1)
    const savedItem = (tenant.stockItems as any[]).find((s: any) => s.name === 'Item Produção OK')
    expect(savedItem).toBeDefined()
  })
})
