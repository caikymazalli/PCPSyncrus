/**
 * moduleAccess.test.ts
 *
 * Testes de controle de acesso por módulo (empresa_modules).
 * Verifica:
 * 1. Acesso padrão 'allowed' quando não há registro no banco.
 * 2. Módulo negado ('denied') bloqueia endpoint de escrita com 403.
 * 3. Módulo em somente leitura ('read_only') bloqueia escrita com 403.
 * 4. Módulo 'allowed' permite a operação de escrita normalmente.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getEmpresaModuleAccess } from '../moduleAccess'
import app from './suprimentos'
import { sessions, tenants } from '../userStore'

// ── Helpers ────────────────────────────────────────────────────────────────────

const TEST_TOKEN    = 'test-token-module-access'
const TEST_USER_ID  = 'test-user-module-access'
const TEST_EMPRESA_ID = TEST_USER_ID  // empresa_id = owner's userId

function setupSession(overrides: Record<string, unknown> = {}) {
  sessions[TEST_TOKEN] = {
    token: TEST_TOKEN,
    userId: TEST_USER_ID,
    email: 'test-modules@test.com',
    nome: 'Test User',
    empresa: 'Test Corp',
    plano: 'starter',
    role: 'admin',
    isDemo: false,
    createdAt: new Date().toISOString(),
    expiresAt: Date.now() + 3_600_000,
    empresaId: '1',
    grupoId: null,
    ...overrides,
  }
}

function setupTenant() {
  tenants[TEST_USER_ID] = {
    plants: [], machines: [], workbenches: [],
    products: [], productionOrders: [], productionEntries: [],
    stockItems: [], nonConformances: [],
    suppliers: [{ id: 'sup-001', name: 'Fornecedor Teste', type: 'nacional' }],
    quotations: [{
      id: 'quot-mod-001',
      code: 'COT-MOD-0001',
      status: 'approved',
      items: [{ productCode: 'P001', quantity: 5, unitPrice: 10 }],
      supplierIds: ['sup-001'],
      supplierResponses: [
        { supplierId: 'sup-001', supplierName: 'Fornecedor Teste', totalPrice: 50 },
      ],
      createdAt: new Date().toISOString(),
    }],
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

// ── Mock DB builders ───────────────────────────────────────────────────────────

/** DB that returns null for empresa_modules lookup (no record) */
const dbNoRecord = {
  prepare: (sql: string) => ({
    bind: () => ({
      first: () => Promise.resolve(null),
      run: () => Promise.resolve({ success: true }),
      all: () => Promise.resolve({ results: [] }),
    }),
    run: () => Promise.resolve({ success: true }),
    all: () => Promise.resolve({ results: [] }),
    first: () => Promise.resolve(null),
  }),
}

/** Returns a DB that reports a specific access_level for empresa_modules queries */
function dbWithAccessLevel(level: string) {
  return {
    prepare: (sql: string) => ({
      bind: () => ({
        first: () => {
          if (sql.includes('empresa_modules')) {
            return Promise.resolve({ access_level: level })
          }
          // For other queries (e.g. purchase orders), return success
          return Promise.resolve({ success: true })
        },
        run: () => Promise.resolve({ success: true }),
        all: () => Promise.resolve({ results: [] }),
      }),
      run: () => Promise.resolve({ success: true }),
      all: () => Promise.resolve({ results: [] }),
      first: () => {
        if (sql.includes('empresa_modules')) {
          return Promise.resolve({ access_level: level })
        }
        return Promise.resolve(null)
      },
    }),
  }
}

/** Full DB mock: blocks empresa_modules check for a module, passes D1 inserts */
function dbDeniedModule(empresaId: string, moduleKey: string, level: string) {
  return {
    prepare: (sql: string) => {
      const isModuleCheck = sql.includes('empresa_modules') && sql.includes('SELECT')
      return {
        bind: (...args: unknown[]) => ({
          first: () => {
            if (isModuleCheck) {
              // Only deny if the args match our target empresa and module
              const [eid, mk] = args as string[]
              if (eid === empresaId && mk === moduleKey) {
                return Promise.resolve({ access_level: level })
              }
              return Promise.resolve(null)
            }
            return Promise.resolve(null)
          },
          run: () => Promise.resolve({ success: true }),
          all: () => Promise.resolve({ results: [] }),
        }),
        run: () => Promise.resolve({ success: true }),
        all: () => Promise.resolve({ results: [] }),
        first: () => Promise.resolve(null),
      }
    },
  }
}

// ── Tests: getEmpresaModuleAccess ──────────────────────────────────────────────

describe('getEmpresaModuleAccess', () => {
  it('retorna "allowed" quando não há banco de dados', async () => {
    const access = await getEmpresaModuleAccess(null, 'empresa1', 'suprimentos')
    expect(access).toBe('allowed')
  })

  it('retorna "allowed" quando não há registro no banco', async () => {
    const access = await getEmpresaModuleAccess(dbNoRecord as any, 'empresa1', 'suprimentos')
    expect(access).toBe('allowed')
  })

  it('retorna "denied" quando o registro indica "denied"', async () => {
    const db = dbWithAccessLevel('denied')
    const access = await getEmpresaModuleAccess(db as any, 'empresa1', 'suprimentos')
    expect(access).toBe('denied')
  })

  it('retorna "read_only" quando o registro indica "read_only"', async () => {
    const db = dbWithAccessLevel('read_only')
    const access = await getEmpresaModuleAccess(db as any, 'empresa1', 'suprimentos')
    expect(access).toBe('read_only')
  })

  it('retorna "allowed" quando o registro indica "allowed"', async () => {
    const db = dbWithAccessLevel('allowed')
    const access = await getEmpresaModuleAccess(db as any, 'empresa1', 'suprimentos')
    expect(access).toBe('allowed')
  })

  it('retorna "allowed" quando o banco falha (tolerância a erros)', async () => {
    const failingDb = {
      prepare: () => ({
        bind: () => ({
          first: () => Promise.reject(new Error('DB error')),
          run: () => Promise.reject(new Error('DB error')),
          all: () => Promise.reject(new Error('DB error')),
        }),
        first: () => Promise.reject(new Error('DB error')),
      }),
    }
    const access = await getEmpresaModuleAccess(failingDb as any, 'empresa1', 'suprimentos')
    expect(access).toBe('allowed')
  })
})

// ── Tests: enforcement via middleware (suprimentos route) ─────────────────────

describe('Módulo negado — bloqueia escrita no endpoint suprimentos', () => {
  beforeEach(() => {
    setupSession()
    setupTenant()
  })
  afterEach(cleanup)

  it('retorna 403 quando módulo "suprimentos" está "denied"', async () => {
    const db = dbDeniedModule(TEST_EMPRESA_ID, 'suprimentos', 'denied')
    const res = await authedRequest('/api/purchase-orders/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quotationId: 'quot-mod-001' }),
    }, { DB: db })

    expect(res.status).toBe(403)
    const data = await res.json() as { ok: boolean; error: string }
    expect(data.ok).toBe(false)
    expect(data.error).toBe('Módulo negado (somente leitura).')
  })

  it('retorna 403 quando módulo "suprimentos" está "read_only"', async () => {
    const db = dbDeniedModule(TEST_EMPRESA_ID, 'suprimentos', 'read_only')
    const res = await authedRequest('/api/purchase-orders/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quotationId: 'quot-mod-001' }),
    }, { DB: db })

    expect(res.status).toBe(403)
    const data = await res.json() as { ok: boolean; error: string }
    expect(data.ok).toBe(false)
    expect(data.error).toBe('Módulo negado (somente leitura).')
  })
})

describe('Módulo liberado — permite escrita no endpoint suprimentos', () => {
  beforeEach(() => {
    setupSession()
    setupTenant()
  })
  afterEach(cleanup)

  it('não bloqueia quando módulo "suprimentos" está "allowed" (sem registro DB)', async () => {
    // No DB → defaults to allowed → request proceeds normally
    const res = await authedRequest('/api/purchase-orders/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quotationId: 'quot-mod-001' }),
    })
    // Should not be 403 — actual result depends on business logic (200 or other)
    expect(res.status).not.toBe(403)
  })

  it('não bloqueia em modo demo (isDemo=true)', async () => {
    sessions[TEST_TOKEN] = { ...sessions[TEST_TOKEN], isDemo: true }
    const db = dbDeniedModule(TEST_EMPRESA_ID, 'suprimentos', 'denied')
    const res = await authedRequest('/api/purchase-orders/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quotationId: 'quot-mod-001' }),
    }, { DB: db })
    // Demo users bypass module access check
    expect(res.status).not.toBe(403)
  })
})
