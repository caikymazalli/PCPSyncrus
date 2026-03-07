/**
 * estoque-serial.test.ts
 *
 * Testes para a lógica de Liberação S/N (serial release):
 * 1. Criar um item pendente com controle de série inicializa corretamente
 *    (totalQty, identifiedQty=0, status=pending, entries=[]).
 * 2. Salvar rejeita números de série em branco.
 * 3. Salvar rejeita duplicatas (case-insensitive) dentro do mesmo item.
 * 4. Salvar com dados válidos atualiza status e entries.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import app from './estoque'
import { sessions, tenants } from '../userStore'

// ── Helpers ───────────────────────────────────────────────────────────────────

const TOKEN = 'test-token-serial-release'
const USER_ID = 'test-user-serial-release'

function setupSession() {
  sessions[TOKEN] = {
    token: TOKEN,
    userId: USER_ID,
    email: 'test-serial@test.com',
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
  tenants[USER_ID] = {
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
  delete sessions[TOKEN]
  delete tenants[USER_ID]
}

function authed(path: string, init?: RequestInit) {
  return app.request(path, {
    ...init,
    headers: {
      ...(init?.headers as Record<string, string> || {}),
      Cookie: 'pcp_session=' + TOKEN,
    },
  })
}

// ── 1. Creating a pending item ────────────────────────────────────────────────

describe('POST /estoque/api/pending-serial/create — serial controlled item', () => {
  beforeEach(() => { setupSession(); setupTenant() })
  afterEach(cleanup)

  it('creates pending item with correct totalQty, identifiedQty=0, status=pending, entries=[]', async () => {
    const res = await authed('/api/pending-serial/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productCode: 'PROD-001',
        productName: 'Produto Teste Série',
        totalQty: 3,
        unit: 'un',
        controlType: 'serie',
      }),
    })

    expect(res.status).toBe(200)
    const data = await res.json() as any
    expect(data.ok).toBe(true)
    expect(data.item).toBeDefined()
    expect(data.item.productCode).toBe('PROD-001')
    expect(data.item.totalQty).toBe(3)
    expect(data.item.identifiedQty).toBe(0)
    expect(data.item.status).toBe('pending')
    expect(data.item.entries).toEqual([])
    expect(data.item.controlType).toBe('serie')

    // Verify it was stored in the tenant
    const pending = (tenants[USER_ID].serialPendingItems as any[])
    expect(pending.length).toBe(1)
    expect(pending[0].totalQty).toBe(3)
    expect(pending[0].identifiedQty).toBe(0)
    expect(pending[0].entries).toEqual([])
  })

  it('initializes correct row count matching totalQty=5', async () => {
    const res = await authed('/api/pending-serial/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productCode: 'PROD-002',
        productName: 'Produto 5 Unidades',
        totalQty: 5,
        unit: 'un',
        controlType: 'serie',
      }),
    })
    expect(res.status).toBe(200)
    const data = await res.json() as any
    expect(data.item.totalQty).toBe(5)
    // entries should be empty — rows are UI-side, server just stores the qty
    expect(data.item.entries).toHaveLength(0)
  })

  it('replaces existing pending item for the same product', async () => {
    // Create first
    await authed('/api/pending-serial/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productCode: 'PROD-X', productName: 'Produto X', totalQty: 2, unit: 'un', controlType: 'serie' }),
    })
    // Create again for same product
    await authed('/api/pending-serial/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productCode: 'PROD-X', productName: 'Produto X', totalQty: 4, unit: 'un', controlType: 'serie' }),
    })

    const pending = (tenants[USER_ID].serialPendingItems as any[])
    expect(pending.filter((p: any) => p.productCode === 'PROD-X')).toHaveLength(1)
    expect(pending[0].totalQty).toBe(4)
  })
})

// ── 2. Saving rejects blank serial numbers ────────────────────────────────────

describe('POST /estoque/api/serial-release — rejeita números em branco', () => {
  beforeEach(() => { setupSession(); setupTenant() })
  afterEach(cleanup)

  it('retorna erro quando uma entrada tem número em branco', async () => {
    // First create a pending item
    const createRes = await authed('/api/pending-serial/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productCode: 'PROD-A', productName: 'Prod A', totalQty: 2, unit: 'un', controlType: 'serie' }),
    })
    const { item } = await createRes.json() as any

    // Try to save with a blank entry
    const res = await authed('/api/serial-release', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pendingId: item.id,
        entries: [
          { number: 'SN-0001', qty: 1 },
          { number: '',        qty: 1 },  // blank
        ],
      }),
    })

    expect(res.status).toBe(400)
    const data = await res.json() as any
    expect(data.ok).toBe(false)
    expect(data.error).toMatch(/branco/i)
  })

  it('retorna erro quando entrada tem apenas espaços', async () => {
    const createRes = await authed('/api/pending-serial/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productCode: 'PROD-B', productName: 'Prod B', totalQty: 1, unit: 'un', controlType: 'serie' }),
    })
    const { item } = await createRes.json() as any

    const res = await authed('/api/serial-release', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pendingId: item.id,
        entries: [{ number: '   ', qty: 1 }],
      }),
    })

    expect(res.status).toBe(400)
    const data = await res.json() as any
    expect(data.ok).toBe(false)
  })
})

// ── 3. Saving rejects duplicates ──────────────────────────────────────────────

describe('POST /estoque/api/serial-release — rejeita duplicatas', () => {
  beforeEach(() => { setupSession(); setupTenant() })
  afterEach(cleanup)

  it('rejeita números duplicados no mesmo payload (case-insensitive)', async () => {
    const createRes = await authed('/api/pending-serial/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productCode: 'PROD-C', productName: 'Prod C', totalQty: 3, unit: 'un', controlType: 'serie' }),
    })
    const { item } = await createRes.json() as any

    const res = await authed('/api/serial-release', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pendingId: item.id,
        entries: [
          { number: 'SN-0001', qty: 1 },
          { number: 'SN-0002', qty: 1 },
          { number: 'sn-0001', qty: 1 },  // duplicate (case-insensitive)
        ],
      }),
    })

    expect(res.status).toBe(400)
    const data = await res.json() as any
    expect(data.ok).toBe(false)
    expect(data.error).toMatch(/duplicado/i)
  })

  it('aceita números únicos e salva corretamente', async () => {
    const createRes = await authed('/api/pending-serial/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productCode: 'PROD-D', productName: 'Prod D', totalQty: 3, unit: 'un', controlType: 'serie' }),
    })
    const { item } = await createRes.json() as any

    const res = await authed('/api/serial-release', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pendingId: item.id,
        entries: [
          { number: 'SN-0001', qty: 1 },
          { number: 'SN-0002', qty: 1 },
          { number: 'SN-0003', qty: 1 },
        ],
      }),
    })

    expect(res.status).toBe(200)
    const data = await res.json() as any
    expect(data.ok).toBe(true)
    expect(data.status).toBe('complete')
    expect(data.identifiedQty).toBe(3)
    expect(data.totalQty).toBe(3)

    // Verify tenant state updated
    const pi = (tenants[USER_ID].serialPendingItems as any[]).find((p: any) => p.id === item.id)
    expect(pi.status).toBe('complete')
    expect(pi.entries).toHaveLength(3)
    expect(pi.identifiedQty).toBe(3)

    // Verify serialNumbers were registered
    const sns = (tenants[USER_ID].serialNumbers as any[])
    expect(sns).toHaveLength(3)
    expect(sns.map((s: any) => s.number).sort()).toEqual(['SN-0001', 'SN-0002', 'SN-0003'].sort())
  })

  it('marca status como partial quando identifiedQty < totalQty', async () => {
    const createRes = await authed('/api/pending-serial/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productCode: 'PROD-E', productName: 'Prod E', totalQty: 5, unit: 'un', controlType: 'serie' }),
    })
    const { item } = await createRes.json() as any

    const res = await authed('/api/serial-release', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pendingId: item.id,
        entries: [
          { number: 'SN-A1', qty: 1 },
          { number: 'SN-A2', qty: 1 },
        ],
      }),
    })

    expect(res.status).toBe(200)
    const data = await res.json() as any
    expect(data.ok).toBe(true)
    expect(data.status).toBe('partial')
    expect(data.identifiedQty).toBe(2)
    expect(data.totalQty).toBe(5)
  })
})
