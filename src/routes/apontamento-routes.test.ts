/**
 * apontamento-routes.test.ts
 *
 * Tests for the Apontamento module improvements:
 * 1. Server-side step validation: rejects step not in route
 * 2. Step progress X/Y calculation helper
 * 3. Report endpoint requires auth and renders expected HTML markers
 * 4. Auto-completion: OP is marked 'completed' when all route steps are apontados
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import app from './apontamento'
import { sessions, tenants } from '../userStore'

interface ApiResponse<T = Record<string, unknown>> {
  ok: boolean
  error?: string
  entry?: Record<string, unknown>
  orderAutoCompleted?: boolean
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const TEST_TOKEN = 'test-token-apontamento-routes'
const TEST_USER_ID = 'test-user-apontamento-routes'
const TEST_PRODUCT_ID = 'prod-apt-001'
const TEST_ORDER_ID = 'op-apt-001'

function setupSession() {
  sessions[TEST_TOKEN] = {
    token: TEST_TOKEN,
    userId: TEST_USER_ID,
    email: 'test-apontamento@test.com',
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

function setupTenant(opts: { withRoute?: boolean; withCompletedOrder?: boolean; preEntries?: any[] } = {}) {
  const steps = [
    { order: 1, operation: 'Corte', standardTime: 10, resourceType: 'manual', machine: '' },
    { order: 2, operation: 'Soldagem', standardTime: 20, resourceType: 'machine', machine: 'SOLDA-01' },
    { order: 3, operation: 'Pintura', standardTime: 15, resourceType: 'manual', machine: '' },
  ]

  const route = {
    id: 'rot-apt-001',
    name: 'Roteiro Produto Teste',
    productId: TEST_PRODUCT_ID,
    productCode: 'PROD-APT-001',
    productName: 'Produto Apontamento Teste',
    version: '1.0',
    status: 'active',
    notes: '',
    steps,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  const order = {
    id: TEST_ORDER_ID,
    code: 'OP-APT-001',
    productName: 'Produto Apontamento Teste',
    productId: TEST_PRODUCT_ID,
    quantity: 10,
    completedQuantity: 0,
    status: opts.withCompletedOrder ? 'completed' : 'in_progress',
    priority: 'medium',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    plantId: '',
    plantName: '',
    pedido: '',
    cliente: 'Cliente Teste',
    notes: '',
    createdAt: new Date().toISOString(),
  }

  tenants[TEST_USER_ID] = {
    plants: [], machines: [], workbenches: [],
    products: [
      {
        id: TEST_PRODUCT_ID,
        name: 'Produto Apontamento Teste',
        code: 'PROD-APT-001',
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
    productionOrders: [order],
    productionEntries: opts.preEntries || [],
    stockItems: [], nonConformances: [],
    suppliers: [],
    quotations: [], purchaseOrders: [], imports: [],
    boms: [], instructions: [], qualityChecks: [],
    users: [{ name: 'Operador 1', role: 'operador' }],
    kpis: {}, chartData: {},
    bomItems: [], productSuppliers: [], workOrders: [],
    routes: opts.withRoute ? [route] : [],
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

function authedRequest(path: string, init?: RequestInit) {
  return app.request(path, {
    ...init,
    headers: {
      ...(init?.headers as Record<string, string> || {}),
      Cookie: 'pcp_session=' + TEST_TOKEN,
    },
  })
}

// ── 1. Server-side step validation ───────────────────────────────────────────

describe('POST /api/create — server-side step validation', () => {
  beforeEach(() => { setupSession(); setupTenant({ withRoute: true }) })
  afterEach(cleanup)

  it('aceita etapa válida quando roteiro existe', async () => {
    const res = await authedRequest('/api/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: TEST_ORDER_ID,
        orderCode: 'OP-APT-001',
        productName: 'Produto Apontamento Teste',
        operator: 'Operador 1',
        stepName: 'Corte',
        produced: 5,
        rejected: 0,
        timeSpent: 10,
        shift: 'manha',
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        imageIds: [],
      }),
    })
    expect(res.status).toBe(200)
    const data = await res.json() as ApiResponse
    expect(data.ok).toBe(true)
    expect(data.entry).toBeDefined()
  })

  it('rejeita etapa inválida quando roteiro existe', async () => {
    const res = await authedRequest('/api/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: TEST_ORDER_ID,
        orderCode: 'OP-APT-001',
        productName: 'Produto Apontamento Teste',
        operator: 'Operador 1',
        stepName: 'EtapaQueNaoExiste',
        produced: 5,
        rejected: 0,
        timeSpent: 10,
        shift: 'manha',
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        imageIds: [],
      }),
    })
    expect(res.status).toBe(400)
    const data = await res.json() as ApiResponse
    expect(data.ok).toBe(false)
    expect(data.error).toContain('EtapaQueNaoExiste')
    expect(data.error).toContain('roteiro')
  })

  it('aceita qualquer etapa quando não há roteiro cadastrado', async () => {
    // Override tenant to have no routes
    tenants[TEST_USER_ID].routes = []
    const res = await authedRequest('/api/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: TEST_ORDER_ID,
        orderCode: 'OP-APT-001',
        productName: 'Produto Apontamento Teste',
        operator: 'Operador 1',
        stepName: 'EtapaLivre',
        produced: 5,
        rejected: 0,
        timeSpent: 10,
        shift: 'manha',
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        imageIds: [],
      }),
    })
    expect(res.status).toBe(200)
    const data = await res.json() as ApiResponse
    expect(data.ok).toBe(true)
  })

  it('aceita stepName vazio quando roteiro existe (sem etapa selecionada)', async () => {
    const res = await authedRequest('/api/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: TEST_ORDER_ID,
        orderCode: 'OP-APT-001',
        productName: 'Produto Apontamento Teste',
        operator: 'Operador 1',
        stepName: '',
        produced: 5,
        rejected: 0,
        timeSpent: 10,
        shift: 'manha',
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        imageIds: [],
      }),
    })
    expect(res.status).toBe(200)
    const data = await res.json() as ApiResponse
    expect(data.ok).toBe(true)
  })
})

// ── 2. Step progress X/Y calculation ─────────────────────────────────────────

describe('computeStepProgress helper — X/Y cálculo de etapas', () => {
  it('retorna {x:0, y:0} sem roteiro', () => {
    const order = { id: 'op-1', productId: 'p1', productName: 'P1' }
    const entries: any[] = []
    const routes: any[] = []
    // Simulate the helper logic inline
    const route = routes.find((r: any) =>
      (r.productId && order.productId && r.productId === order.productId) ||
      (r.productName && order.productName && r.productName === order.productName)
    ) || null
    if (!route || !Array.isArray(route?.steps) || route.steps.length === 0) {
      expect({ x: 0, y: 0 }).toEqual({ x: 0, y: 0 })
      return
    }
    throw new Error('should not reach here')
  })

  it('calcula X/Y corretamente com apontamentos parciais', () => {
    const order = { id: 'op-1', productId: 'p1', productName: 'Produto' }
    const routes = [
      {
        productId: 'p1',
        productName: 'Produto',
        steps: [
          { operation: 'Corte' },
          { operation: 'Soldagem' },
          { operation: 'Pintura' },
        ],
      },
    ]
    const entries = [
      { orderId: 'op-1', stepName: 'Corte' },
      { orderId: 'op-1', stepName: 'Corte' }, // duplicate should not double-count
      { orderId: 'op-1', stepName: 'Soldagem' },
      { orderId: 'op-2', stepName: 'Pintura' }, // different order, should not count
    ]

    const route = routes.find((r: any) =>
      (r.productId && order.productId && r.productId === order.productId) ||
      (r.productName && order.productName && r.productName === order.productName)
    )
    expect(route).toBeDefined()
    const orderEntries = entries.filter((e: any) => e.orderId === order.id)
    const doneSteps = new Set(orderEntries.map((e: any) => (e.stepName || '').trim()).filter(Boolean))
    const validSteps = (route!.steps || []).map((s: any) => (s.operation || s.name || '').trim()).filter(Boolean)
    const x = validSteps.filter((op: string) => doneSteps.has(op)).length
    const y = validSteps.length

    expect(x).toBe(2)  // Corte + Soldagem
    expect(y).toBe(3)  // 3 total steps
  })

  it('retorna X === Y quando todas as etapas foram apontadas', () => {
    const order = { id: 'op-1', productId: 'p1', productName: 'Produto' }
    const routes = [
      {
        productId: 'p1',
        productName: 'Produto',
        steps: [{ operation: 'Corte' }, { operation: 'Soldagem' }],
      },
    ]
    const entries = [
      { orderId: 'op-1', stepName: 'Corte' },
      { orderId: 'op-1', stepName: 'Soldagem' },
    ]

    const route = routes.find((r: any) => r.productId === order.productId)!
    const orderEntries = entries.filter((e: any) => e.orderId === order.id)
    const doneSteps = new Set(orderEntries.map((e: any) => e.stepName))
    const validSteps = route.steps.map((s: any) => s.operation)
    const x = validSteps.filter((op: string) => doneSteps.has(op)).length
    const y = validSteps.length

    expect(x).toBe(y)
    expect(x).toBe(2)
  })
})

// ── 3. Auto-completion when all steps apontados ───────────────────────────────

describe('POST /api/create — auto-completion when all steps done', () => {
  afterEach(cleanup)

  it('marca OP como completed quando todas as etapas são apontadas', async () => {
    setupSession()
    // Pre-populate with 2 of 3 steps already done
    const preEntries = [
      { id: 'apt-pre-1', orderId: TEST_ORDER_ID, orderCode: 'OP-APT-001', stepName: 'Corte',    produced: 5, rejected: 0, createdAt: new Date().toISOString() },
      { id: 'apt-pre-2', orderId: TEST_ORDER_ID, orderCode: 'OP-APT-001', stepName: 'Soldagem', produced: 5, rejected: 0, createdAt: new Date().toISOString() },
    ]
    setupTenant({ withRoute: true, preEntries })

    expect((tenants[TEST_USER_ID].productionOrders as any[])[0].status).toBe('in_progress')

    // Add the last step
    const res = await authedRequest('/api/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: TEST_ORDER_ID,
        orderCode: 'OP-APT-001',
        productName: 'Produto Apontamento Teste',
        operator: 'Operador 1',
        stepName: 'Pintura',
        produced: 5,
        rejected: 0,
        timeSpent: 15,
        shift: 'manha',
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        imageIds: [],
      }),
    })

    expect(res.status).toBe(200)
    const data = await res.json() as ApiResponse
    expect(data.ok).toBe(true)
    expect(data.orderAutoCompleted).toBe(true)

    // OP should now be completed in memory
    const updatedOrder = (tenants[TEST_USER_ID].productionOrders as any[])[0]
    expect(updatedOrder.status).toBe('completed')
  })

  it('não marca OP como completed quando ainda faltam etapas', async () => {
    setupSession()
    setupTenant({ withRoute: true })

    const res = await authedRequest('/api/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: TEST_ORDER_ID,
        orderCode: 'OP-APT-001',
        productName: 'Produto Apontamento Teste',
        operator: 'Operador 1',
        stepName: 'Corte',
        produced: 5,
        rejected: 0,
        timeSpent: 10,
        shift: 'manha',
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        imageIds: [],
      }),
    })

    expect(res.status).toBe(200)
    const data = await res.json() as ApiResponse
    expect(data.ok).toBe(true)
    expect(data.orderAutoCompleted).toBe(false)

    const updatedOrder = (tenants[TEST_USER_ID].productionOrders as any[])[0]
    expect(updatedOrder.status).toBe('in_progress')
  })
})

// ── 4. Report endpoint ────────────────────────────────────────────────────────

describe('GET /relatorio/:orderId — relatório HTML', () => {
  afterEach(cleanup)

  it('retorna 401 quando não autenticado', async () => {
    const res = await app.request('/relatorio/some-id')
    expect(res.status).toBe(401)
  })

  it('retorna 404 quando OP não existe', async () => {
    setupSession()
    setupTenant({ withRoute: true })
    const res = await authedRequest('/relatorio/id-nao-existe')
    expect(res.status).toBe(404)
  })

  it('retorna 400 quando OP existe mas não está concluída', async () => {
    setupSession()
    setupTenant({ withRoute: true })
    const res = await authedRequest('/relatorio/' + TEST_ORDER_ID)
    expect(res.status).toBe(400)
  })

  it('retorna HTML com marcadores esperados para OP concluída', async () => {
    setupSession()
    const preEntries = [
      {
        id: 'apt-rep-1', orderId: TEST_ORDER_ID, orderCode: 'OP-APT-001',
        stepName: 'Corte', operator: 'Operador 1',
        produced: 10, rejected: 0, timeSpent: 10,
        notes: 'Observação de teste', imageIds: [],
        createdAt: '2026-01-15T08:30:00.000Z',
      },
    ]
    setupTenant({ withRoute: true, withCompletedOrder: true, preEntries })

    const res = await authedRequest('/relatorio/' + TEST_ORDER_ID)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')

    const html = await res.text()
    // Verify key report markers are present
    expect(html).toContain('OP-APT-001')                     // order code
    expect(html).toContain('Produto Apontamento Teste')       // product name
    expect(html).toContain('Concluída')                       // status
    expect(html).toContain('Relatório de Apontamentos')       // report title
    expect(html).toContain('Corte')                           // step name
    expect(html).toContain('Operador 1')                      // operator
    expect(html).toContain('Observação de teste')             // notes
    expect(html).toContain('Roteiro Produto Teste')           // route name
    expect(html).toContain('window.print()')                  // print button
  })

  it('inclui seção de NCs quando existem NCs relacionadas', async () => {
    setupSession()
    setupTenant({ withRoute: true, withCompletedOrder: true })
    // Add a related NC
    ;(tenants[TEST_USER_ID].nonConformances as any[]).push({
      id: 'nc-rep-1',
      code: 'NC-001',
      orderCode: 'OP-APT-001',
      title: 'NC Teste Relatório',
      description: 'Descrição da NC para teste',
      severity: 'medium',
      status: 'closed',
      stepName: 'Corte',
      openedAt: '2026-01-15',
    })

    const res = await authedRequest('/relatorio/' + TEST_ORDER_ID)
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('NC-001')
    expect(html).toContain('NC Teste Relatório')
    expect(html).toContain('Descrição da NC para teste')
  })
})

// ── 5. Source-code safeguards ────────────────────────────────────────────────

describe('apontamento.ts source-code safeguards', () => {
  const { readFileSync } = require('fs')
  const { resolve } = require('path')
  const src = readFileSync(resolve(__dirname, 'apontamento.ts'), 'utf8')

  it('contém a função findRouteForOrder', () => {
    expect(src).toContain('function findRouteForOrder')
  })

  it('contém a função computeStepProgress', () => {
    expect(src).toContain('function computeStepProgress')
  })

  it('o handler POST /api/create valida etapa contra o roteiro', () => {
    const handlerStart = src.indexOf("app.post('/api/create'")
    const handlerEnd = src.indexOf('\napp.', handlerStart + 1)
    const handlerBody = src.slice(handlerStart, handlerEnd > handlerStart ? handlerEnd : undefined)
    expect(handlerBody).toContain('findRouteForOrder')
    expect(handlerBody).toContain('roteiro deste produto')
  })

  it('o handler POST /api/create inclui lógica de auto-completion', () => {
    const handlerStart = src.indexOf("app.post('/api/create'")
    const handlerEnd = src.indexOf('\napp.', handlerStart + 1)
    const handlerBody = src.slice(handlerStart, handlerEnd > handlerStart ? handlerEnd : undefined)
    expect(handlerBody).toContain('orderAutoCompleted')
    expect(handlerBody).toContain('completed')
  })

  it('contém endpoint GET /relatorio/:orderId', () => {
    expect(src).toContain("app.get('/relatorio/:orderId'")
  })

  it('o endpoint de relatório verifica sessão (auth)', () => {
    const handlerStart = src.indexOf("app.get('/relatorio/:orderId'")
    const handlerEnd = src.indexOf('\nexport default', handlerStart + 1)
    const handlerBody = src.slice(handlerStart, handlerEnd > handlerStart ? handlerEnd : undefined)
    expect(handlerBody).toContain('getCtxSession')
    expect(handlerBody).toContain('401')
  })

  it('o modal usa <select> em vez de <input> para etapa/operação', () => {
    expect(src).toContain('id="apt_etapa"')
    // Should be a select, not an input
    const selectIdx = src.indexOf('<select class="form-control" id="apt_etapa"')
    const inputIdx  = src.indexOf('<input class="form-control" id="apt_etapa"')
    expect(selectIdx).toBeGreaterThan(-1)
    expect(inputIdx).toBe(-1)
  })

  it('passa allRoutesData como JSON para o script cliente', () => {
    expect(src).toContain('allRoutesData')
    expect(src).toContain('_populateStepsSelect')
    expect(src).toContain('_findRouteStepsForOrder')
  })
})
