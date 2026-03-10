/**
 * suporte-routes.test.ts
 *
 * Testes de salvaguarda para o módulo de suporte (Chamados).
 * Verifica:
 * 1. O padrão D1-first está presente no código-fonte do handler de criação de ticket
 *    (memória só é atualizada após D1 ter sucesso).
 * 2. Quando D1 falha e Queue não está disponível, a API retorna erro e NÃO atualiza memória.
 * 3. Quando D1 tem sucesso (mock), a memória é atualizada corretamente.
 * 4. markTenantModified é chamado apenas após persistência garantida.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import app from './suporte'
import { sessions, tenants } from '../userStore'

interface ApiResponse<T = Record<string, unknown>> {
  ok: boolean
  error?: string
  ticket?: Record<string, unknown>
  queued?: boolean
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const TEST_TOKEN   = 'test-token-suporte-safeguard'
const TEST_USER_ID = 'test-user-suporte-safeguard'

function setupSession() {
  sessions[TEST_TOKEN] = {
    token:     TEST_TOKEN,
    userId:    TEST_USER_ID,
    email:     'test-suporte@test.com',
    nome:      'Test User Suporte',
    empresa:   'Test Corp',
    plano:     'starter',
    role:      'admin',
    isDemo:    false,
    createdAt: new Date().toISOString(),
    expiresAt: Date.now() + 3_600_000,
    empresaId: '1',
    grupoId:   null,
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
  } as any
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
      run:   () => Promise.reject(new Error('D1 connection failed')),
      all:   () => Promise.reject(new Error('D1 connection failed')),
      first: () => Promise.reject(new Error('D1 connection failed')),
    }),
    run:   () => Promise.reject(new Error('D1 connection failed')),
    all:   () => Promise.reject(new Error('D1 connection failed')),
    first: () => Promise.reject(new Error('D1 connection failed')),
  }),
}

const successDB = {
  prepare: () => ({
    bind: () => ({
      run:   () => Promise.resolve({ success: true, results: [] }),
      all:   () => Promise.resolve({ results: [] }),
      first: () => Promise.resolve(null),
    }),
    run:   () => Promise.resolve({ success: true, results: [] }),
    all:   () => Promise.resolve({ results: [] }),
    first: () => Promise.resolve(null),
  }),
}

// ── Source-code guardrail: D1-first pattern ───────────────────────────────────

describe('suporte.ts source-code guardrails D1-first', () => {
  const src = readFileSync(resolve(__dirname, 'suporte.ts'), 'utf8')

  it('tickets handler: bloco D1 aparece antes de supportTickets.push', () => {
    const handlerStart = src.indexOf("app.post('/api/tickets'")
    const handlerEnd   = src.indexOf('\napp.', handlerStart + 1)
    const handlerBody  = src.slice(handlerStart, handlerEnd > handlerStart ? handlerEnd : undefined)

    const d1BlockPos = handlerBody.indexOf("userId !== 'demo-tenant'")
    const memPushPos = handlerBody.indexOf('supportTickets.push')
    expect(d1BlockPos).toBeGreaterThan(-1)
    expect(memPushPos).toBeGreaterThan(-1)
    expect(d1BlockPos).toBeLessThan(memPushPos)
  })

  it('tickets handler: markTenantModified importado e chamado', () => {
    expect(src).toContain("import { markTenantModified }")
    const handlerStart = src.indexOf("app.post('/api/tickets'")
    const handlerEnd   = src.indexOf('\napp.', handlerStart + 1)
    const handlerBody  = src.slice(handlerStart, handlerEnd > handlerStart ? handlerEnd : undefined)
    expect(handlerBody).toContain('markTenantModified(userId)')
  })

  it('tickets handler: sem catch{} silencioso em writes D1', () => {
    const handlerStart = src.indexOf("app.post('/api/tickets'")
    const handlerEnd   = src.indexOf('\napp.', handlerStart + 1)
    const handlerBody  = src.slice(handlerStart, handlerEnd > handlerStart ? handlerEnd : undefined)
    expect(handlerBody).not.toMatch(/catch\s*\{\s*\}/)
  })
})

// ── POST /api/tickets — D1 falhando e sem Queue (retorna erro) ────────────────

describe('POST /suporte/api/tickets — D1 falhando, sem Queue', () => {
  beforeEach(() => { setupSession(); setupTenant() })
  afterEach(cleanup)

  it('retorna erro 500 e NÃO atualiza memória quando D1 falha e Queue indisponível', async () => {
    const initial = ((tenants[TEST_USER_ID] as any).supportTickets as any[] || []).length

    const res = await authedRequest('/api/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Test Ticket', description: 'Test description' }),
    }, { DB: failingDB })

    expect(res.status).toBe(500)
    const data = await res.json() as ApiResponse
    expect(data.ok).toBe(false)

    // Memória NÃO deve ter sido atualizada
    expect(((tenants[TEST_USER_ID] as any).supportTickets as any[] || []).length).toBe(initial)
  })
})

// ── POST /api/tickets — D1 com sucesso ───────────────────────────────────────

describe('POST /suporte/api/tickets — D1 com sucesso em produção', () => {
  beforeEach(() => { setupSession(); setupTenant() })
  afterEach(cleanup)

  it('retorna 200 e atualiza memória quando D1 tem sucesso', async () => {
    const initial = ((tenants[TEST_USER_ID] as any).supportTickets as any[] || []).length

    const res = await authedRequest('/api/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Test Ticket', description: 'Test description', priority: 'high' }),
    }, { DB: successDB })

    expect(res.status).toBe(200)
    const data = await res.json() as ApiResponse
    expect(data.ok).toBe(true)
    expect(data.ticket).toBeDefined()

    expect(((tenants[TEST_USER_ID] as any).supportTickets as any[] || []).length).toBe(initial + 1)
  })

  it('ticket criado contém empresa_name a partir da sessão', async () => {
    const res = await authedRequest('/api/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Ticket com empresa', description: 'Teste empresa_name', priority: 'medium' }),
    }, { DB: successDB })

    expect(res.status).toBe(200)
    const data = await res.json() as ApiResponse
    expect(data.ok).toBe(true)
    // empresa_name deve conter o nome da empresa da sessão (não o ID/código)
    const ticket = data.ticket as Record<string, unknown>
    expect(ticket).toBeDefined()
    expect(ticket.empresa_name).toBe('Test Corp')
  })

  it('ticket criado contém atendente_id e atendente_name nulos (abertura pelo cliente)', async () => {
    const res = await authedRequest('/api/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Ticket cliente', description: 'Sem atendente', priority: 'low' }),
    }, { DB: successDB })

    expect(res.status).toBe(200)
    const data = await res.json() as ApiResponse
    const ticket = data.ticket as Record<string, unknown>
    expect(ticket.atendente_id).toBeNull()
    expect(ticket.atendente_name).toBeNull()
  })

  it('retorna erro quando title está ausente', async () => {
    const res = await authedRequest('/api/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: 'No title here' }),
    }, { DB: successDB })

    expect(res.status).toBe(400)
    const data = await res.json() as ApiResponse
    expect(data.ok).toBe(false)
  })
})
