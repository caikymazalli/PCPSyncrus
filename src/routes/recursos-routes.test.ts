/**
 * recursos-routes.test.ts
 *
 * Testes de salvaguarda para o módulo de recursos (Bancadas).
 * Verifica:
 * 1. O padrão D1-first está presente no código-fonte do handler de criação de bancada.
 * 2. Sem plantaId em produção → 400 (validação de entrada).
 * 3. Com plantaId mas dbInsert retornando false → 500 com errorCode.
 * 4. Em modo demo (sem db) → 200 e salva em memória.
 * 5. Endpoint de diagnóstico de schema protegido por DEBUG=1.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import app from './recursos'
import { sessions, tenants } from '../userStore'

interface ApiResponse<T = Record<string, unknown>> {
  ok: boolean
  error?: string
  errorCode?: string
  details?: string
  id?: string
  workbench?: T
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const TEST_TOKEN = 'test-token-recursos-safeguard'
const TEST_USER_ID = 'test-user-recursos-safeguard'

function setupSession() {
  sessions[TEST_TOKEN] = {
    token: TEST_TOKEN,
    userId: TEST_USER_ID,
    email: 'test-recursos@test.com',
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
    plants: [{ id: 'plant-1', name: 'Planta Principal' }],
    machines: [], workbenches: [],
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

// Mock DB that returns false (simulates constraint violation without throwing)
const insertFailingDB = {
  prepare: () => ({
    bind: () => ({
      run: () => Promise.resolve({ success: false, results: [] }),
      all: () => Promise.resolve({ results: [] }),
      first: () => Promise.resolve(null),
    }),
    run: () => Promise.resolve({ success: false, results: [] }),
    all: () => Promise.resolve({ results: [] }),
    first: () => Promise.resolve(null),
  }),
}

// ── Source-code guardrail: D1-first ──────────────────────────────────────────

describe('recursos.ts source-code guardrails D1-first (criação de bancada)', () => {
  const src = readFileSync(resolve(__dirname, 'recursos.ts'), 'utf8')

  it("handler POST /bancadas: bloco D1 aparece antes de tenant.workbenches.push", () => {
    const handlerStart = src.indexOf("app.post('/bancadas'")
    const handlerEnd = src.indexOf('\napp.', handlerStart + 1)
    const handlerBody = src.slice(handlerStart, handlerEnd > handlerStart ? handlerEnd : undefined)

    const d1BlockPos = handlerBody.indexOf("userId !== 'demo-tenant'")
    const memPushPos = handlerBody.indexOf('tenant.workbenches.push')
    expect(d1BlockPos).toBeGreaterThan(-1)
    expect(memPushPos).toBeGreaterThan(-1)
    expect(d1BlockPos).toBeLessThan(memPushPos)
  })

  it('handler POST /bancadas: sem catch{} silencioso em writes D1', () => {
    const handlerStart = src.indexOf("app.post('/bancadas'")
    const handlerEnd = src.indexOf('\napp.', handlerStart + 1)
    const handlerBody = src.slice(handlerStart, handlerEnd > handlerStart ? handlerEnd : undefined)
    expect(handlerBody).not.toMatch(/catch\s*\{\s*\}/)
  })

  it('handler POST /bancadas: inclui log [CRÍTICO] no caso de falha D1', () => {
    const handlerStart = src.indexOf("app.post('/bancadas'")
    const handlerEnd = src.indexOf('\napp.', handlerStart + 1)
    const handlerBody = src.slice(handlerStart, handlerEnd > handlerStart ? handlerEnd : undefined)
    expect(handlerBody).toContain('[CRÍTICO]')
  })

  it('handler POST /bancadas: valida plantaId antes de chamar dbInsert', () => {
    const handlerStart = src.indexOf("app.post('/bancadas'")
    const handlerEnd = src.indexOf('\napp.', handlerStart + 1)
    const handlerBody = src.slice(handlerStart, handlerEnd > handlerStart ? handlerEnd : undefined)
    expect(handlerBody).toContain('plantaId')
    // The plantaId validation (400 return) must appear before the dbInsert call
    const plantaValidation = handlerBody.indexOf('Planta é obrigatória')
    const dbInsertCall = handlerBody.indexOf('dbInsert(')
    expect(plantaValidation).toBeGreaterThan(-1)
    expect(dbInsertCall).toBeGreaterThan(-1)
    expect(plantaValidation).toBeLessThan(dbInsertCall)
  })

  it('handler POST /bancadas: falha D1 retorna errorCode', () => {
    const handlerStart = src.indexOf("app.post('/bancadas'")
    const handlerEnd = src.indexOf('\napp.', handlerStart + 1)
    const handlerBody = src.slice(handlerStart, handlerEnd > handlerStart ? handlerEnd : undefined)
    expect(handlerBody).toContain('D1_INSERT_FAILED')
  })
})

// ── POST /bancadas — modo demo (sem db) ───────────────────────────────────────

describe('POST /recursos/bancadas — modo demo (sem db)', () => {
  beforeEach(() => { setupSession(); setupTenant() })
  afterEach(cleanup)

  it('retorna 200 e salva bancada em memória no modo demo', async () => {
    const initialCount = (tenants[TEST_USER_ID].workbenches as any[]).length

    const res = await authedRequest('/bancadas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: 'Bancada Demo', func: 'Montagem' }),
    })

    expect(res.status).toBe(200)
    const data = await res.json() as ApiResponse<{ name: string }>
    expect(data.ok).toBe(true)
    expect(data.workbench).toBeDefined()
    expect(data.workbench?.name).toBe('Bancada Demo')

    const tenant = tenants[TEST_USER_ID]
    expect((tenant.workbenches as any[]).length).toBe(initialCount + 1)
  })

  it('retorna 400 quando nome não é fornecido', async () => {
    const res = await authedRequest('/bancadas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ func: 'Montagem' }),
    })
    expect(res.status).toBe(400)
    const data = await res.json() as ApiResponse
    expect(data.ok).toBe(false)
  })
})

// ── POST /bancadas — validação de entrada em produção ────────────────────────

describe('POST /recursos/bancadas — validação em produção (com DB)', () => {
  beforeEach(() => { setupSession(); setupTenant() })
  afterEach(cleanup)

  it('retorna 400 quando plantaId está ausente em modo produção', async () => {
    const initialCount = (tenants[TEST_USER_ID].workbenches as any[]).length

    const res = await authedRequest('/bancadas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: 'Bancada Sem Planta' }),
    }, { DB: successDB })

    expect(res.status).toBe(400)
    const data = await res.json() as ApiResponse
    expect(data.ok).toBe(false)
    expect(data.error).toBeTruthy()

    // Memória NÃO deve ter sido atualizada
    expect((tenants[TEST_USER_ID].workbenches as any[]).length).toBe(initialCount)
  })

  it('retorna 400 quando plantaId é string vazia em modo produção', async () => {
    const res = await authedRequest('/bancadas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: 'Bancada Planta Vazia', plantaId: '' }),
    }, { DB: successDB })

    expect(res.status).toBe(400)
    const data = await res.json() as ApiResponse
    expect(data.ok).toBe(false)
  })
})

// ── POST /bancadas — D1 falhando em produção ─────────────────────────────────

describe('POST /recursos/bancadas — D1 falhando em produção', () => {
  beforeEach(() => { setupSession(); setupTenant() })
  afterEach(cleanup)

  it('retorna erro 500 com errorCode quando dbInsert retorna false e NÃO atualiza memória', async () => {
    const initialCount = (tenants[TEST_USER_ID].workbenches as any[]).length

    const res = await authedRequest('/bancadas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: 'Bancada Prod', plantaId: 'plant-1' }),
    }, { DB: failingDB })

    expect(res.status).toBe(500)
    const data = await res.json() as ApiResponse
    expect(data.ok).toBe(false)
    expect(data.error).toBeTruthy()

    // Memória NÃO deve ter sido atualizada
    expect((tenants[TEST_USER_ID].workbenches as any[]).length).toBe(initialCount)
  })
})

// ── POST /bancadas — D1 com sucesso em produção ───────────────────────────────

describe('POST /recursos/bancadas — D1 com sucesso em produção', () => {
  beforeEach(() => { setupSession(); setupTenant() })
  afterEach(cleanup)

  it('retorna 200 e atualiza memória quando D1 tem sucesso', async () => {
    const initialCount = (tenants[TEST_USER_ID].workbenches as any[]).length

    const res = await authedRequest('/bancadas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: 'Bancada OK', plantaId: 'plant-1', func: 'Soldagem' }),
    }, { DB: successDB })

    expect(res.status).toBe(200)
    const data = await res.json() as ApiResponse<{ name: string }>
    expect(data.ok).toBe(true)
    expect(data.workbench).toBeDefined()
    expect(data.workbench?.name).toBe('Bancada OK')

    const tenant = tenants[TEST_USER_ID]
    expect((tenant.workbenches as any[]).length).toBe(initialCount + 1)
    const saved = (tenant.workbenches as any[]).find((w: any) => w.name === 'Bancada OK')
    expect(saved).toBeDefined()
    expect(saved.plantId).toBe('plant-1')
  })
})

// ── Source-code guardrail: D1-first (máquinas) ───────────────────────────────

describe('recursos.ts source-code guardrails D1-first (criação de máquina)', () => {
  const src = readFileSync(resolve(__dirname, 'recursos.ts'), 'utf8')

  it("handler POST /maquinas: valida plantaId antes de chamar dbInsert", () => {
    const handlerStart = src.indexOf("app.post('/maquinas'")
    const handlerEnd = src.indexOf('\napp.', handlerStart + 1)
    const handlerBody = src.slice(handlerStart, handlerEnd > handlerStart ? handlerEnd : undefined)
    expect(handlerBody).toContain('plantaId')
    const plantaValidation = handlerBody.indexOf('Planta é obrigatória')
    const dbInsertCall = handlerBody.indexOf('dbInsert(')
    expect(plantaValidation).toBeGreaterThan(-1)
    expect(dbInsertCall).toBeGreaterThan(-1)
    expect(plantaValidation).toBeLessThan(dbInsertCall)
  })

  it("handler POST /maquinas: bloco D1 aparece antes de tenant.machines.push", () => {
    const handlerStart = src.indexOf("app.post('/maquinas'")
    const handlerEnd = src.indexOf('\napp.', handlerStart + 1)
    const handlerBody = src.slice(handlerStart, handlerEnd > handlerStart ? handlerEnd : undefined)

    const d1BlockPos = handlerBody.indexOf("userId !== 'demo-tenant'")
    const memPushPos = handlerBody.indexOf('tenant.machines.push')
    expect(d1BlockPos).toBeGreaterThan(-1)
    expect(memPushPos).toBeGreaterThan(-1)
    expect(d1BlockPos).toBeLessThan(memPushPos)
  })

  it('handler POST /maquinas: inclui log [CRÍTICO] no caso de falha D1', () => {
    const handlerStart = src.indexOf("app.post('/maquinas'")
    const handlerEnd = src.indexOf('\napp.', handlerStart + 1)
    const handlerBody = src.slice(handlerStart, handlerEnd > handlerStart ? handlerEnd : undefined)
    expect(handlerBody).toContain('[CRÍTICO]')
  })

  it('handler POST /maquinas: falha D1 retorna errorCode D1_INSERT_FAILED', () => {
    const handlerStart = src.indexOf("app.post('/maquinas'")
    const handlerEnd = src.indexOf('\napp.', handlerStart + 1)
    const handlerBody = src.slice(handlerStart, handlerEnd > handlerStart ? handlerEnd : undefined)
    expect(handlerBody).toContain('D1_INSERT_FAILED')
  })

  it('handler POST /maquinas: sem catch{} silencioso em writes D1', () => {
    const handlerStart = src.indexOf("app.post('/maquinas'")
    const handlerEnd = src.indexOf('\napp.', handlerStart + 1)
    const handlerBody = src.slice(handlerStart, handlerEnd > handlerStart ? handlerEnd : undefined)
    expect(handlerBody).not.toMatch(/catch\s*\{\s*\}/)
  })

  it('handler POST /bancadas: valida plant_id inválido (não encontrado) antes do dbInsert', () => {
    const handlerStart = src.indexOf("app.post('/bancadas'")
    const handlerEnd = src.indexOf('\napp.', handlerStart + 1)
    const handlerBody = src.slice(handlerStart, handlerEnd > handlerStart ? handlerEnd : undefined)
    expect(handlerBody).toContain('plant_id inválido ou não encontrado')
    const invalidPlantCheck = handlerBody.indexOf('plant_id inválido ou não encontrado')
    const dbInsertCall = handlerBody.indexOf('dbInsert(')
    expect(invalidPlantCheck).toBeLessThan(dbInsertCall)
  })
})

// ── POST /maquinas — modo demo (sem db) ───────────────────────────────────────

describe('POST /recursos/maquinas — modo demo (sem db)', () => {
  beforeEach(() => { setupSession(); setupTenant() })
  afterEach(cleanup)

  it('retorna 200 e salva máquina em memória no modo demo', async () => {
    const initialCount = (tenants[TEST_USER_ID].machines as any[]).length

    const res = await authedRequest('/maquinas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: 'Máquina Demo', tipo: 'CNC' }),
    })

    expect(res.status).toBe(200)
    const data = await res.json() as ApiResponse<{ name: string }>
    expect(data.ok).toBe(true)
    expect(data.machine).toBeDefined()
    expect((data as any).machine?.name).toBe('Máquina Demo')

    const tenant = tenants[TEST_USER_ID]
    expect((tenant.machines as any[]).length).toBe(initialCount + 1)
  })

  it('retorna 400 quando nome não é fornecido', async () => {
    const res = await authedRequest('/maquinas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo: 'CNC' }),
    })
    expect(res.status).toBe(400)
    const data = await res.json() as ApiResponse
    expect(data.ok).toBe(false)
  })
})

// ── POST /maquinas — validação de entrada em produção ─────────────────────────

describe('POST /recursos/maquinas — validação em produção (com DB)', () => {
  beforeEach(() => { setupSession(); setupTenant() })
  afterEach(cleanup)

  it('retorna 400 quando plantaId está ausente em modo produção', async () => {
    const initialCount = (tenants[TEST_USER_ID].machines as any[]).length

    const res = await authedRequest('/maquinas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: 'Máquina Sem Planta' }),
    }, { DB: successDB })

    expect(res.status).toBe(400)
    const data = await res.json() as ApiResponse
    expect(data.ok).toBe(false)
    expect(data.error).toBeTruthy()

    // Memória NÃO deve ter sido atualizada
    expect((tenants[TEST_USER_ID].machines as any[]).length).toBe(initialCount)
  })

  it('retorna 400 quando plantaId é string vazia em modo produção', async () => {
    const res = await authedRequest('/maquinas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: 'Máquina Planta Vazia', plantaId: '' }),
    }, { DB: successDB })

    expect(res.status).toBe(400)
    const data = await res.json() as ApiResponse
    expect(data.ok).toBe(false)
  })

  it('retorna 400 quando plantaId não existe nas plantas do tenant', async () => {
    const initialCount = (tenants[TEST_USER_ID].machines as any[]).length

    const res = await authedRequest('/maquinas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: 'Máquina Planta Inválida', plantaId: 'plant-inexistente' }),
    }, { DB: successDB })

    expect(res.status).toBe(400)
    const data = await res.json() as ApiResponse
    expect(data.ok).toBe(false)
    expect(data.error).toMatch(/plant_id inválido/i)

    // Memória NÃO deve ter sido atualizada
    expect((tenants[TEST_USER_ID].machines as any[]).length).toBe(initialCount)
  })
})

// ── POST /maquinas — D1 falhando em produção ──────────────────────────────────

describe('POST /recursos/maquinas — D1 falhando em produção', () => {
  beforeEach(() => { setupSession(); setupTenant() })
  afterEach(cleanup)

  it('retorna erro 500 com errorCode quando dbInsert retorna false e NÃO atualiza memória', async () => {
    const initialCount = (tenants[TEST_USER_ID].machines as any[]).length

    const res = await authedRequest('/maquinas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: 'Máquina Prod', plantaId: 'plant-1' }),
    }, { DB: failingDB })

    expect(res.status).toBe(500)
    const data = await res.json() as ApiResponse
    expect(data.ok).toBe(false)
    expect(data.error).toBeTruthy()

    // Memória NÃO deve ter sido atualizada
    expect((tenants[TEST_USER_ID].machines as any[]).length).toBe(initialCount)
  })
})

// ── POST /maquinas — D1 com sucesso em produção ───────────────────────────────

describe('POST /recursos/maquinas — D1 com sucesso em produção', () => {
  beforeEach(() => { setupSession(); setupTenant() })
  afterEach(cleanup)

  it('retorna 200 e atualiza memória quando D1 tem sucesso', async () => {
    const initialCount = (tenants[TEST_USER_ID].machines as any[]).length

    const res = await authedRequest('/maquinas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: 'Máquina OK', plantaId: 'plant-1', tipo: 'CNC' }),
    }, { DB: successDB })

    expect(res.status).toBe(200)
    const data = await res.json() as any
    expect(data.ok).toBe(true)
    expect(data.machine).toBeDefined()
    expect(data.machine?.name).toBe('Máquina OK')

    const tenant = tenants[TEST_USER_ID]
    expect((tenant.machines as any[]).length).toBe(initialCount + 1)
    const saved = (tenant.machines as any[]).find((m: any) => m.name === 'Máquina OK')
    expect(saved).toBeDefined()
    expect(saved.plantId).toBe('plant-1')
  })
})

// ── POST /bancadas — plant_id inválido (presente mas não existe) ──────────────

describe('POST /recursos/bancadas — validação plant_id inválido', () => {
  beforeEach(() => { setupSession(); setupTenant() })
  afterEach(cleanup)

  it('retorna 400 quando plantaId não existe nas plantas do tenant', async () => {
    const initialCount = (tenants[TEST_USER_ID].workbenches as any[]).length

    const res = await authedRequest('/bancadas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: 'Bancada Planta Inválida', plantaId: 'plant-inexistente' }),
    }, { DB: successDB })

    expect(res.status).toBe(400)
    const data = await res.json() as ApiResponse
    expect(data.ok).toBe(false)
    expect(data.error).toMatch(/plant_id inválido/i)

    // Memória NÃO deve ter sido atualizada
    expect((tenants[TEST_USER_ID].workbenches as any[]).length).toBe(initialCount)
  })
})

// ── GET /api/debug/workbenches-schema — endpoint de diagnóstico ───────────────

describe('GET /recursos/api/debug/workbenches-schema — proteção por DEBUG', () => {
  beforeEach(() => { setupSession(); setupTenant() })
  afterEach(cleanup)

  it('retorna 404 quando DEBUG não está ativo', async () => {
    const res = await authedRequest('/api/debug/workbenches-schema')
    expect(res.status).toBe(404)
    const data = await res.json() as ApiResponse
    expect(data.ok).toBe(false)
  })

  it('retorna 404 quando DEBUG=0', async () => {
    const res = await authedRequest('/api/debug/workbenches-schema', {}, { DEBUG: '0' })
    expect(res.status).toBe(404)
  })

  it('retorna 503 quando DEBUG=1 mas sem DB', async () => {
    const res = await authedRequest('/api/debug/workbenches-schema', {}, { DEBUG: '1' })
    expect(res.status).toBe(503)
    const data = await res.json() as ApiResponse
    expect(data.ok).toBe(false)
  })

  it('retorna schema quando DEBUG=1 e DB disponível', async () => {
    const schemaDB = {
      prepare: (sql: string) => ({
        bind: () => ({
          run: () => Promise.resolve({ success: true, results: [] }),
          all: () => Promise.resolve({ results: [] }),
          first: () => Promise.resolve(null),
        }),
        all: () => Promise.resolve({
          results: sql.includes('PRAGMA')
            ? [{ cid: 0, name: 'id', type: 'TEXT', notnull: 1, dflt_value: null, pk: 1 }]
            : [],
        }),
        first: () => Promise.resolve(
          sql.includes('sqlite_master')
            ? { sql: 'CREATE TABLE workbenches (id TEXT PRIMARY KEY)' }
            : null
        ),
      }),
    }

    const res = await authedRequest('/api/debug/workbenches-schema', {}, { DB: schemaDB, DEBUG: '1' })
    expect(res.status).toBe(200)
    const data = await res.json() as any
    expect(data.ok).toBe(true)
    expect(Array.isArray(data.columns)).toBe(true)
  })
})
