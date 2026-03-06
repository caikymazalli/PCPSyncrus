/**
 * engenharia-routes.test.ts
 *
 * Testes de salvaguarda para o módulo de engenharia (Roteiros).
 * Verifica:
 * 1. O padrão D1-first está presente no código-fonte dos handlers de roteiros
 *    (memória só é atualizada após D1 ter sucesso).
 * 2. Em modo demo (sem db), o roteiro é salvo em memória diretamente.
 * 3. Quando D1 falha, a API retorna erro e a memória NÃO é atualizada.
 * 4. Quando D1 tem sucesso (mock), a memória é atualizada corretamente.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import app from './engenharia'
import { sessions, tenants } from '../userStore'

interface ApiResponse<T = Record<string, unknown>> {
  ok: boolean
  error?: string
  data?: T
  message?: string
  route?: Record<string, unknown>
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const TEST_TOKEN = 'test-token-engenharia-routes-safeguard'
const TEST_USER_ID = 'test-user-engenharia-routes-safeguard'
const TEST_ROUTE_ID = 'rot-test-001'
const TEST_PRODUCT_ID = 'prod-test-001'

function setupSession() {
  sessions[TEST_TOKEN] = {
    token: TEST_TOKEN,
    userId: TEST_USER_ID,
    email: 'test-engenharia@test.com',
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

function setupTenant(withRoute = false) {
  const route = {
    id: TEST_ROUTE_ID,
    name: 'Roteiro Teste',
    productId: TEST_PRODUCT_ID,
    productCode: 'PROD-001',
    productName: 'Produto Teste',
    version: '1.0',
    status: 'active',
    notes: '',
    steps: [{ name: 'Corte', standardTime: 10 }],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  tenants[TEST_USER_ID] = {
    plants: [], machines: [], workbenches: [],
    products: [
      {
        id: TEST_PRODUCT_ID,
        name: 'Produto Teste',
        code: 'PROD-001',
        unit: 'un',
        type: 'internal',
        stockMin: 0,
        stockMax: 0,
        stockCurrent: 0,
        stockStatus: 'normal',
        serialControlled: false,
        controlType: '',
        criticalPercentage: 50,
        supplierId: '',
        supplierName: '',
        price: 0,
        notes: '',
        createdAt: new Date().toISOString(),
      },
    ],
    productionOrders: [], productionEntries: [],
    stockItems: [], nonConformances: [],
    suppliers: [],
    quotations: [], purchaseOrders: [], imports: [],
    boms: [], instructions: [], qualityChecks: [], users: [],
    kpis: {}, chartData: {},
    bomItems: [], productSuppliers: [], workOrders: [],
    routes: withRoute ? [route] : [],
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

// ── Source-code safeguard tests ───────────────────────────────────────────────

describe('engenharia.ts source-code safeguards (D1-first roteiros)', () => {
  const src = readFileSync(resolve(__dirname, 'engenharia.ts'), 'utf8')

  it('o handler POST /api/route/create não contém catch{} silencioso em writes D1', () => {
    const handlerStart = src.indexOf("app.post('/api/route/create'")
    const handlerEnd = src.indexOf('\napp.', handlerStart + 1)
    const handlerBody = src.slice(handlerStart, handlerEnd > handlerStart ? handlerEnd : undefined)
    // Não deve ter catch silencioso (variações de espaçamento)
    expect(handlerBody).not.toMatch(/catch\s*\{\s*\/\/\s*D1 unavailable/)
    expect(handlerBody).not.toMatch(/catch\s*\{\s*\}/)
  })

  it('a atualização de memória (tenant.routes.push) ocorre APÓS o bloco D1 no POST', () => {
    const handlerStart = src.indexOf("app.post('/api/route/create'")
    const handlerEnd = src.indexOf('\napp.', handlerStart + 1)
    const handlerBody = src.slice(handlerStart, handlerEnd > handlerStart ? handlerEnd : undefined)

    const d1BlockPos = handlerBody.indexOf("userId !== 'demo-tenant'")
    const memUpdatePos = handlerBody.indexOf('tenant.routes.push')
    expect(d1BlockPos).toBeGreaterThan(-1)
    expect(memUpdatePos).toBeGreaterThan(-1)
    expect(d1BlockPos).toBeLessThan(memUpdatePos)
  })

  it('o handler DELETE /api/route/:id não contém catch{} silencioso em writes D1', () => {
    const handlerStart = src.indexOf("app.delete('/api/route/:id'")
    const handlerEnd = src.indexOf('\napp.', handlerStart + 1)
    const handlerBody = src.slice(handlerStart, handlerEnd > handlerStart ? handlerEnd : undefined)
    expect(handlerBody).not.toMatch(/catch\s*\{\s*\}/)
  })

  it('a remoção de memória (tenant.routes.splice) ocorre APÓS o bloco D1 no DELETE', () => {
    const handlerStart = src.indexOf("app.delete('/api/route/:id'")
    const handlerEnd = src.indexOf('\napp.', handlerStart + 1)
    const handlerBody = src.slice(handlerStart, handlerEnd > handlerStart ? handlerEnd : undefined)

    const d1BlockPos = handlerBody.indexOf("userId !== 'demo-tenant'")
    const memRemovePos = handlerBody.indexOf('tenant.routes.splice')
    expect(d1BlockPos).toBeGreaterThan(-1)
    expect(memRemovePos).toBeGreaterThan(-1)
    expect(d1BlockPos).toBeLessThan(memRemovePos)
  })

  it('inclui log [ENGENHARIA][ROTEIROS] no handler de criação', () => {
    const handlerStart = src.indexOf("app.post('/api/route/create'")
    const handlerEnd = src.indexOf('\napp.', handlerStart + 1)
    const handlerBody = src.slice(handlerStart, handlerEnd > handlerStart ? handlerEnd : undefined)
    expect(handlerBody).toContain('[ENGENHARIA][ROTEIROS]')
  })

  it('inclui log [CRÍTICO] no catch do handler de criação', () => {
    const handlerStart = src.indexOf("app.post('/api/route/create'")
    const handlerEnd = src.indexOf('\napp.', handlerStart + 1)
    const handlerBody = src.slice(handlerStart, handlerEnd > handlerStart ? handlerEnd : undefined)
    expect(handlerBody).toContain('[CRÍTICO]')
  })
})

// ── POST /api/route/create — modo demo (sem db) ───────────────────────────────

describe('POST /engenharia/api/route/create — modo demo (sem db)', () => {
  beforeEach(() => { setupSession(); setupTenant() })
  afterEach(cleanup)

  it('retorna 200 e salva roteiro em memória no modo demo', async () => {
    const initialCount = (tenants[TEST_USER_ID].routes as any[]).length

    const res = await authedRequest('/api/route/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Roteiro Demo',
        productId: TEST_PRODUCT_ID,
        productCode: 'PROD-001',
        productName: 'Produto Teste',
        version: '1.0',
        status: 'active',
        steps: [{ name: 'Corte', standardTime: 10 }],
      }),
    })

    expect(res.status).toBe(200)
    const data = await res.json() as ApiResponse
    expect(data.ok).toBe(true)
    expect(data.route).toBeDefined()

    const tenant = tenants[TEST_USER_ID]
    expect((tenant.routes as any[]).length).toBe(initialCount + 1)
  })

  it('retorna erro quando nome não é fornecido', async () => {
    const res = await authedRequest('/api/route/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId: TEST_PRODUCT_ID }),
    })
    expect(res.status).toBe(400)
    const data = await res.json() as ApiResponse
    expect(data.ok).toBe(false)
  })

  it('retorna erro quando productId não é fornecido', async () => {
    const res = await authedRequest('/api/route/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Roteiro Teste' }),
    })
    expect(res.status).toBe(400)
    const data = await res.json() as ApiResponse
    expect(data.ok).toBe(false)
  })
})

// ── POST /api/route/create — D1 falhando em produção ─────────────────────────

describe('POST /engenharia/api/route/create — D1 falhando em produção', () => {
  beforeEach(() => { setupSession(); setupTenant() })
  afterEach(cleanup)

  it('retorna erro 500 e NÃO atualiza memória quando D1 falha', async () => {
    const initialCount = (tenants[TEST_USER_ID].routes as any[]).length

    const res = await authedRequest('/api/route/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Roteiro Producao',
        productId: TEST_PRODUCT_ID,
        productCode: 'PROD-001',
        productName: 'Produto Teste',
        version: '1.0',
        status: 'active',
        steps: [{ name: 'Corte', standardTime: 10 }],
      }),
    }, { DB: failingDB })

    expect(res.status).toBe(500)
    const data = await res.json() as ApiResponse
    expect(data.ok).toBe(false)

    // Memória NÃO deve ter sido atualizada
    const tenant = tenants[TEST_USER_ID]
    expect((tenant.routes as any[]).length).toBe(initialCount)
  })
})

// ── POST /api/route/create — D1 com sucesso em produção ──────────────────────

describe('POST /engenharia/api/route/create — D1 com sucesso em produção', () => {
  beforeEach(() => { setupSession(); setupTenant() })
  afterEach(cleanup)

  it('retorna 200 e atualiza memória quando D1 tem sucesso', async () => {
    const initialCount = (tenants[TEST_USER_ID].routes as any[]).length

    const res = await authedRequest('/api/route/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Roteiro Producao OK',
        productId: TEST_PRODUCT_ID,
        productCode: 'PROD-001',
        productName: 'Produto Teste',
        version: '1.0',
        status: 'active',
        steps: [{ name: 'Montagem', standardTime: 20 }],
      }),
    }, { DB: successDB })

    expect(res.status).toBe(200)
    const data = await res.json() as ApiResponse
    expect(data.ok).toBe(true)
    expect(data.route).toBeDefined()

    const tenant = tenants[TEST_USER_ID]
    expect((tenant.routes as any[]).length).toBe(initialCount + 1)
    const savedRoute = (tenant.routes as any[]).find((r: any) => r.name === 'Roteiro Producao OK')
    expect(savedRoute).toBeDefined()
  })
})

// ── DELETE /api/route/:id — modo demo (sem db) ────────────────────────────────

describe('DELETE /engenharia/api/route/:id — modo demo (sem db)', () => {
  beforeEach(() => { setupSession(); setupTenant(true) })
  afterEach(cleanup)

  it('retorna 200 e remove roteiro de memória no modo demo', async () => {
    const initialCount = (tenants[TEST_USER_ID].routes as any[]).length
    expect(initialCount).toBe(1)

    const res = await authedRequest(`/api/route/${TEST_ROUTE_ID}`, { method: 'DELETE' })
    expect(res.status).toBe(200)
    const data = await res.json() as ApiResponse
    expect(data.ok).toBe(true)

    const tenant = tenants[TEST_USER_ID]
    expect((tenant.routes as any[]).length).toBe(0)
  })

  it('retorna 404 quando roteiro não existe', async () => {
    const res = await authedRequest('/api/route/non-existent-id', { method: 'DELETE' })
    expect(res.status).toBe(404)
    const data = await res.json() as ApiResponse
    expect(data.ok).toBe(false)
  })
})

// ── DELETE /api/route/:id — D1 falhando em produção ──────────────────────────

describe('DELETE /engenharia/api/route/:id — D1 falhando em produção', () => {
  beforeEach(() => { setupSession(); setupTenant(true) })
  afterEach(cleanup)

  it('retorna erro 500 e NÃO remove da memória quando D1 falha', async () => {
    const initialCount = (tenants[TEST_USER_ID].routes as any[]).length
    expect(initialCount).toBe(1)

    const res = await authedRequest(`/api/route/${TEST_ROUTE_ID}`, {
      method: 'DELETE',
    }, { DB: failingDB })

    expect(res.status).toBe(500)
    const data = await res.json() as ApiResponse
    expect(data.ok).toBe(false)

    // Memória NÃO deve ter sido alterada
    const tenant = tenants[TEST_USER_ID]
    expect((tenant.routes as any[]).length).toBe(initialCount)
    const route = (tenant.routes as any[]).find((r: any) => r.id === TEST_ROUTE_ID)
    expect(route).toBeDefined()
  })
})

// ── DELETE /api/route/:id — D1 com sucesso em produção ───────────────────────

describe('DELETE /engenharia/api/route/:id — D1 com sucesso em produção', () => {
  beforeEach(() => { setupSession(); setupTenant(true) })
  afterEach(cleanup)

  it('retorna 200 e remove roteiro de memória quando D1 tem sucesso', async () => {
    const initialCount = (tenants[TEST_USER_ID].routes as any[]).length
    expect(initialCount).toBe(1)

    const res = await authedRequest(`/api/route/${TEST_ROUTE_ID}`, {
      method: 'DELETE',
    }, { DB: successDB })

    expect(res.status).toBe(200)
    const data = await res.json() as ApiResponse
    expect(data.ok).toBe(true)

    const tenant = tenants[TEST_USER_ID]
    expect((tenant.routes as any[]).length).toBe(0)
  })
})

// ── BOM: Source-code guardrail D1-first ──────────────────────────────────────

describe('engenharia.ts source-code guardrails D1-first (BOM)', () => {
  const src = readFileSync(resolve(__dirname, 'engenharia.ts'), 'utf8')

  it('handler POST /api/bom/create: bloco D1 aparece antes de tenant.bomItems.push', () => {
    const handlerStart = src.indexOf("app.post('/api/bom/create'")
    const handlerEnd = src.indexOf('\napp.', handlerStart + 1)
    const handlerBody = src.slice(handlerStart, handlerEnd > handlerStart ? handlerEnd : undefined)

    const d1BlockPos = handlerBody.indexOf("userId !== 'demo-tenant'")
    const memPushPos = handlerBody.indexOf('tenant.bomItems.push')
    expect(d1BlockPos).toBeGreaterThan(-1)
    expect(memPushPos).toBeGreaterThan(-1)
    expect(d1BlockPos).toBeLessThan(memPushPos)
  })

  it('handler POST /api/bom/create: sem catch{} silencioso em writes D1', () => {
    const handlerStart = src.indexOf("app.post('/api/bom/create'")
    const handlerEnd = src.indexOf('\napp.', handlerStart + 1)
    const handlerBody = src.slice(handlerStart, handlerEnd > handlerStart ? handlerEnd : undefined)
    expect(handlerBody).not.toMatch(/catch\s*\{\s*\}/)
  })

  it('handler POST /api/bom/create: inclui log [CRÍTICO] no caso de falha D1', () => {
    const handlerStart = src.indexOf("app.post('/api/bom/create'")
    const handlerEnd = src.indexOf('\napp.', handlerStart + 1)
    const handlerBody = src.slice(handlerStart, handlerEnd > handlerStart ? handlerEnd : undefined)
    expect(handlerBody).toContain('[CRÍTICO]')
  })
})

// ── POST /api/bom/create — modo demo (sem db) ─────────────────────────────────

describe('POST /engenharia/api/bom/create — modo demo (sem db)', () => {
  beforeEach(() => { setupSession(); setupTenant() })
  afterEach(cleanup)

  it('retorna 200 e salva BOM em memória no modo demo', async () => {
    const initialCount = (tenants[TEST_USER_ID].bomItems as any[]).length

    const res = await authedRequest('/api/bom/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: TEST_PRODUCT_ID,
        productName: 'Produto Teste',
        componentName: 'Componente Demo',
        componentCode: 'COMP-001',
        quantity: 2,
        unit: 'un',
      }),
    })

    expect(res.status).toBe(200)
    const data = await res.json() as ApiResponse & { bom?: Record<string, unknown> }
    expect(data.ok).toBe(true)
    expect(data.bom).toBeDefined()

    const tenant = tenants[TEST_USER_ID]
    expect((tenant.bomItems as any[]).length).toBe(initialCount + 1)
  })

  it('retorna erro quando productId ou componentName não é fornecido', async () => {
    const res = await authedRequest('/api/bom/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId: TEST_PRODUCT_ID }),
    })
    expect(res.status).toBe(400)
    const data = await res.json() as ApiResponse
    expect(data.ok).toBe(false)
  })
})

// ── POST /api/bom/create — D1 falhando em produção ───────────────────────────

describe('POST /engenharia/api/bom/create — D1 falhando em produção', () => {
  beforeEach(() => { setupSession(); setupTenant() })
  afterEach(cleanup)

  it('retorna erro 500 e NÃO atualiza memória quando D1 falha', async () => {
    const initialCount = (tenants[TEST_USER_ID].bomItems as any[]).length

    const res = await authedRequest('/api/bom/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: TEST_PRODUCT_ID,
        productName: 'Produto Teste',
        componentName: 'Componente Produção',
        quantity: 1,
        unit: 'kg',
      }),
    }, { DB: failingDB })

    expect(res.status).toBe(500)
    const data = await res.json() as ApiResponse
    expect(data.ok).toBe(false)

    // Memória NÃO deve ter sido atualizada
    const tenant = tenants[TEST_USER_ID]
    expect((tenant.bomItems as any[]).length).toBe(initialCount)
  })
})

// ── POST /api/bom/create — D1 com sucesso em produção ────────────────────────

describe('POST /engenharia/api/bom/create — D1 com sucesso em produção', () => {
  beforeEach(() => { setupSession(); setupTenant() })
  afterEach(cleanup)

  it('retorna 200 e atualiza memória quando D1 tem sucesso', async () => {
    const initialCount = (tenants[TEST_USER_ID].bomItems as any[]).length

    const res = await authedRequest('/api/bom/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: TEST_PRODUCT_ID,
        productName: 'Produto Teste',
        componentName: 'Componente Produção OK',
        componentCode: 'COMP-OK',
        quantity: 3,
        unit: 'un',
      }),
    }, { DB: successDB })

    expect(res.status).toBe(200)
    const data = await res.json() as ApiResponse & { bom?: Record<string, unknown> }
    expect(data.ok).toBe(true)
    expect(data.bom).toBeDefined()

    const tenant = tenants[TEST_USER_ID]
    expect((tenant.bomItems as any[]).length).toBe(initialCount + 1)
    const savedBom = (tenant.bomItems as any[]).find((b: any) => b.componentName === 'Componente Produção OK')
    expect(savedBom).toBeDefined()
  })
})
