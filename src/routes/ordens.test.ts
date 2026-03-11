/**
 * ordens.test.ts
 *
 * Safeguard tests for the Ordens de Produção module.
 * Verifies:
 * 1. GET /api/:id returns the order when it exists (fixes 404 on production start).
 * 2. GET /api/:id returns 404 when order is not found.
 * 3. PUT /api/:id correctly updates all editable fields (full edit support).
 * 4. POST /api/create creates a new order.
 * 5. GET /api/list returns all orders.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import app from './ordens'
import { sessions, tenants } from '../userStore'

const TEST_TOKEN = 'test-token-ordens'
const TEST_USER_ID = 'demo-tenant'
const TEST_ORDER_ID = 'op_test_001'

function setupSession() {
  sessions[TEST_TOKEN] = {
    token: TEST_TOKEN,
    userId: TEST_USER_ID,
    email: 'test-ordens@test.com',
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

function setupTenant(withOrder = false) {
  const order = {
    id: TEST_ORDER_ID,
    code: 'OP-001',
    productName: 'Produto Teste',
    productId: '',
    quantity: 100,
    completedQuantity: 0,
    status: 'planned',
    priority: 'medium',
    startDate: '2026-03-01',
    endDate: '2026-03-31',
    plantId: '',
    plantName: 'Planta Alpha',
    pedido: 'PV-2026-001',
    cliente: 'Cliente Teste',
    notes: 'Observação de teste',
    createdAt: new Date().toISOString(),
  }
  tenants[TEST_USER_ID] = {
    productionOrders: withOrder ? [order] : [],
    products: [],
    plants: [],
  } as any
}

function teardown() {
  delete sessions[TEST_TOKEN]
  delete tenants[TEST_USER_ID]
}

const authHeader = { Cookie: `pcp_session=${TEST_TOKEN}` }

describe('Ordens de Produção API', () => {
  beforeEach(() => {
    setupSession()
    setupTenant(true)
  })
  afterEach(teardown)

  it('GET /api/:id — returns order when found', async () => {
    const res = await app.request(`/api/${TEST_ORDER_ID}`, { headers: authHeader })
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.ok).toBe(true)
    expect(body.order).toBeDefined()
    expect(body.order.id).toBe(TEST_ORDER_ID)
    expect(body.order.code).toBe('OP-001')
  })

  it('GET /api/:id — returns 404 for unknown id', async () => {
    const res = await app.request('/api/op_does_not_exist', { headers: authHeader })
    expect(res.status).toBe(404)
    const body = await res.json() as any
    expect(body.ok).toBe(false)
  })

  it('GET /api/list — returns all orders', async () => {
    const res = await app.request('/api/list', { headers: authHeader })
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.ok).toBe(true)
    expect(Array.isArray(body.orders)).toBe(true)
    expect(body.orders.length).toBe(1)
  })

  it('PUT /api/:id — updates all editable fields', async () => {
    const payload = {
      code: 'OP-001-REV',
      productName: 'Produto Atualizado',
      quantity: 200,
      startDate: '2026-04-01',
      endDate: '2026-04-30',
      priority: 'high',
      status: 'in_progress',
      cliente: 'Novo Cliente',
      pedido: 'PV-2026-002',
      notes: 'Notas atualizadas',
      plantId: 'plant-01',
      plantName: 'Planta Beta',
    }
    const res = await app.request(`/api/${TEST_ORDER_ID}`, {
      method: 'PUT',
      headers: { ...authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.ok).toBe(true)
    expect(body.order.code).toBe('OP-001-REV')
    expect(body.order.productName).toBe('Produto Atualizado')
    expect(body.order.quantity).toBe(200)
    expect(body.order.status).toBe('in_progress')
    expect(body.order.priority).toBe('high')
    expect(body.order.cliente).toBe('Novo Cliente')
    expect(body.order.plantName).toBe('Planta Beta')
  })

  it('PUT /api/:id — partial update (status only)', async () => {
    const res = await app.request(`/api/${TEST_ORDER_ID}`, {
      method: 'PUT',
      headers: { ...authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'in_progress' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.ok).toBe(true)
    expect(body.order.status).toBe('in_progress')
    expect(body.order.code).toBe('OP-001')
  })

  it('PUT /api/:id — returns 404 for unknown id', async () => {
    const res = await app.request('/api/op_nonexistent', {
      method: 'PUT',
      headers: { ...authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'in_progress' }),
    })
    expect(res.status).toBe(404)
  })

  it('POST /api/create — creates a new order', async () => {
    const payload = {
      code: 'OP-NEW-001',
      productName: 'Novo Produto',
      quantity: 50,
      startDate: '2026-05-01',
      endDate: '2026-05-31',
      priority: 'low',
      status: 'planned',
      cliente: 'Cliente Novo',
      pedido: 'PV-2026-003',
      notes: '',
      plantId: '',
      plantName: '',
    }
    const res = await app.request('/api/create', {
      method: 'POST',
      headers: { ...authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.ok).toBe(true)
    expect(body.order).toBeDefined()
    expect(body.order.productName).toBe('Novo Produto')
    expect(body.order.quantity).toBe(50)
    const tenant = tenants[TEST_USER_ID] as any
    expect(tenant.productionOrders.length).toBe(2)
  })
})
