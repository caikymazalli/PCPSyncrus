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

// ── Source-code guardrail: viewAlmoxarifadoEstoque ────────────────────────────

describe('estoque.ts source-code: viewAlmoxarifadoEstoque definida', () => {
  const src = readFileSync(resolve(__dirname, 'estoque.ts'), 'utf8')

  it('função viewAlmoxarifadoEstoque está definida no script client-side', () => {
    expect(src).toContain('function viewAlmoxarifadoEstoque(')
  })

  it('viewAlmoxarifadoEstoque abre o modal almoxarifadoEstoqueModal', () => {
    expect(src).toContain('almoxarifadoEstoqueModal')
  })
})

// ── Source-code guardrail: transfer modal uses tenant almoxarifados ───────────

describe('estoque.ts source-code: modal de transferência usa almoxarifados do tenant', () => {
  const src = readFileSync(resolve(__dirname, 'estoque.ts'), 'utf8')

  it('não contém opções hardcoded de demo no modal de transferência', () => {
    const modalStart = src.indexOf('novaTransferenciaModal')
    const modalEnd = src.indexOf('trfItemsList', modalStart)
    const modalSection = src.slice(modalStart, modalEnd)
    expect(modalSection).not.toContain('Almoxarifado Central (Alpha)')
    expect(modalSection).not.toContain('Almoxarifado Nordeste')
    expect(modalSection).not.toContain('Almoxarifado Sul')
  })

  it('modal de transferência tem select de origem com id trfOrigem', () => {
    expect(src).toContain('id="trfOrigem"')
  })

  it('modal de transferência tem select de destino com id trfDestino', () => {
    expect(src).toContain('id="trfDestino"')
  })

  it('modal de transferência tem campo Endereço de Origem', () => {
    expect(src).toContain('trfEnderecoOrigem')
  })

  it('modal de transferência tem campo Endereço de Destino', () => {
    expect(src).toContain('trfEnderecoDestino')
  })
})

// ── Source-code guardrail: Liberação S/N tab é lista somente ─────────────────

describe('estoque.ts source-code: aba Liberação S/N é lista somente', () => {
  const src = readFileSync(resolve(__dirname, 'estoque.ts'), 'utf8')

  it('aba Liberação S/N mostra coluna Almoxarifado', () => {
    // Find the div with id="tabLiberacaoSerial" (not just the onclick reference)
    const tabStart = src.indexOf('id="tabLiberacaoSerial"')
    const tabContent = src.slice(tabStart, tabStart + 4000)
    expect(tabContent).toContain('Almoxarifado')
  })

  it('aba Liberação S/N mostra coluna Endereço no Estoque', () => {
    const tabStart = src.indexOf('id="tabLiberacaoSerial"')
    const tabContent = src.slice(tabStart, tabStart + 4000)
    expect(tabContent).toContain('Endereço no Estoque')
  })
})

// ── API: POST /estoque/api/transferencia/create ───────────────────────────────

describe('POST /estoque/api/transferencia/create', () => {
  beforeEach(() => { setupSession(); setupTenant() })
  afterEach(cleanup)

  it('cria transferência com origem/destino válidos', async () => {
    const res = await authedRequest('/api/transferencia/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origemId: 'alm1',
        destinoId: 'alm2',
        origemName: 'Almoxarifado Principal',
        destinoName: 'Almoxarifado Filial',
        enderecoOrigemId: 'loc-001',
        enderecoDestinoId: 'loc-002',
        solicitante: 'Test User',
        items: [{ code: 'ITEM-001', qty: 5, serial: '' }]
      }),
    })
    expect(res.status).toBe(200)
    const data = await res.json() as any
    expect(data.ok).toBe(true)
    expect(data.transferencia).toBeDefined()
    expect(data.transferencia.status).toBe('pendente')
    expect(data.transferencia.enderecoOrigemId).toBe('loc-001')
    expect(data.transferencia.enderecoDestinoId).toBe('loc-002')

    const tfs = (tenants[TEST_USER_ID] as any).transferencias
    expect(tfs).toHaveLength(1)
    expect(tfs[0].origemId).toBe('alm1')
  })

  it('rejeita quando origem e destino são iguais', async () => {
    const res = await authedRequest('/api/transferencia/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origemId: 'alm1', destinoId: 'alm1',
        items: [{ code: 'ITEM-001', qty: 1 }]
      }),
    })
    expect(res.status).toBe(400)
    const data = await res.json() as any
    expect(data.ok).toBe(false)
  })

  it('rejeita quando não há itens', async () => {
    const res = await authedRequest('/api/transferencia/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origemId: 'alm1', destinoId: 'alm2', items: [] }),
    })
    expect(res.status).toBe(400)
  })
})

// ── API: POST /estoque/api/warehouse-location/create ─────────────────────────

describe('POST /estoque/api/warehouse-location/create', () => {
  beforeEach(() => { setupSession(); setupTenant() })
  afterEach(cleanup)

  it('cria endereço de almoxarifado em memória (modo demo)', async () => {
    const res = await authedRequest('/api/warehouse-location/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ almoxarifadoId: 'alm1', code: 'A-01-01', description: 'Prateleira A' }),
    })
    expect(res.status).toBe(200)
    const data = await res.json() as any
    expect(data.ok).toBe(true)
    expect(data.location).toBeDefined()
    expect(data.location.code).toBe('A-01-01')
    expect(data.location.almoxarifadoId).toBe('alm1')
    expect(data.location.status).toBe('active')

    const locs = (tenants[TEST_USER_ID] as any).almoxarifadoLocations
    expect(locs).toHaveLength(1)
  })

  it('rejeita quando almoxarifadoId ou code estão ausentes', async () => {
    const res = await authedRequest('/api/warehouse-location/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ almoxarifadoId: 'alm1' }),
    })
    expect(res.status).toBe(400)
  })
})

// ── Source-code guardrail: editarAlmoxarifado definida ───────────────────────

describe('estoque.ts source-code: editarAlmoxarifado definida', () => {
  const src = readFileSync(resolve(__dirname, 'estoque.ts'), 'utf8')

  it('função editarAlmoxarifado está definida no script client-side', () => {
    expect(src).toContain('function editarAlmoxarifado(')
  })

  it('editarAlmoxarifado abre o modal editAlmoxarifadoModal', () => {
    expect(src).toContain('editAlmoxarifadoModal')
  })
})
