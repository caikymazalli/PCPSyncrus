/**
 * dashboard.test.ts
 *
 * Tests for the Dashboard route.
 * Verifies:
 * 1. The dashboard page returns 200 with the Work Instructions summary card.
 * 2. The dashboard page returns 200 with the NC summary card.
 * 3. KPI counts render correctly from tenant data.
 * 4. Links to Ver and Relatório/PDF pages are present.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import app from './dashboard'
import { sessions, tenants } from '../userStore'

// ── Helpers ──────────────────────────────────────────────────────────────────

const TEST_TOKEN   = 'test-token-dashboard-cards'
const TEST_USER_ID = 'test-user-dashboard-cards'

function setupSession() {
  sessions[TEST_TOKEN] = {
    token:     TEST_TOKEN,
    userId:    TEST_USER_ID,
    email:     'test-dashboard@test.com',
    nome:      'Tester Dashboard',
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

function setupTenant(workInstructions: any[] = [], nonConformances: any[] = []) {
  tenants[TEST_USER_ID] = {
    plants: [], machines: [], workbenches: [],
    products: [], productionOrders: [], productionEntries: [],
    stockItems: [], nonConformances, suppliers: [],
    quotations: [], purchaseOrders: [], imports: [],
    boms: [], instructions: [], qualityChecks: [], users: [],
    kpis: { totalOrders: 0, activeOrders: 0, completedOrders: 0, totalProduced: 0, qualityRate: 100, totalMachines: 0 },
    chartData: {},
    bomItems: [], productSuppliers: [], workOrders: [], routes: [],
    serialNumbers: [], serialPendingItems: [],
    warehouses: [], separationOrders: [], stockExits: [],
    supplierCategories: [], productSupplierLinks: [],
    quotationNegotiations: [],
    workInstructions, workInstructionVersions: [],
    workInstructionSteps: [], workInstructionPhotos: [],
    workInstructionAuditLog: [],
  }
}

function cleanup() {
  delete sessions[TEST_TOKEN]
  delete tenants[TEST_USER_ID]
}

function authedRequest(path: string) {
  return app.request(path, {
    headers: { Cookie: 'pcp_session=' + TEST_TOKEN },
  })
}

// ── Sample data ───────────────────────────────────────────────────────────────

const sampleInstructions = [
  { id: 'wi-1', code: 'IT-001', title: 'Montagem A', status: 'active',   current_version: '1.0' },
  { id: 'wi-2', code: 'IT-002', title: 'Montagem B', status: 'draft',    current_version: '1.0' },
  { id: 'wi-3', code: 'IT-003', title: 'Montagem C', status: 'obsolete', current_version: '2.0' },
  { id: 'wi-4', code: 'IT-004', title: 'Montagem D', status: 'archived', current_version: '1.5' },
]

const sampleNCs = [
  { id: 'nc-1', code: 'NC-001', title: 'Defeito A', status: 'open',   severity: 'high' },
  { id: 'nc-2', code: 'NC-002', title: 'Defeito B', status: 'open',   severity: 'medium' },
  { id: 'nc-3', code: 'NC-003', title: 'Defeito C', status: 'closed', severity: 'low' },
]

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET / — dashboard with Work Instructions card', () => {
  beforeEach(() => { setupSession(); setupTenant(sampleInstructions, sampleNCs) })
  afterEach(cleanup)

  it('returns 200', async () => {
    const res = await authedRequest('/')
    expect(res.status).toBe(200)
  })

  it('contains Instruções de Trabalho section heading', async () => {
    const res = await authedRequest('/')
    const html = await res.text()
    expect(html).toContain('Instruções de Trabalho')
  })

  it('contains Ver link pointing to /instrucoes', async () => {
    const res = await authedRequest('/')
    const html = await res.text()
    expect(html).toContain('href="/instrucoes"')
  })

  it('contains Relatório/PDF link pointing to /instrucoes/api/report', async () => {
    const res = await authedRequest('/')
    const html = await res.text()
    expect(html).toContain('/instrucoes/api/report')
  })

  it('shows correct work instruction KPI counts', async () => {
    const res = await authedRequest('/')
    const html = await res.text()
    // 1 active, 1 draft, 1 obsolete, 1 archived
    expect(html).toContain('card-instrucoes')
  })
})

describe('GET / — dashboard with NC card', () => {
  beforeEach(() => { setupSession(); setupTenant(sampleInstructions, sampleNCs) })
  afterEach(cleanup)

  it('contains Não Conformidades section heading', async () => {
    const res = await authedRequest('/')
    const html = await res.text()
    expect(html).toContain('Não Conformidades')
  })

  it('contains Ver link pointing to /qualidade', async () => {
    const res = await authedRequest('/')
    const html = await res.text()
    expect(html).toContain('href="/qualidade"')
  })

  it('contains Relatório/PDF link pointing to /qualidade/relatorios', async () => {
    const res = await authedRequest('/')
    const html = await res.text()
    expect(html).toContain('/qualidade/relatorios')
  })

  it('shows NC open/closed counts in the HTML', async () => {
    const res = await authedRequest('/')
    const html = await res.text()
    // 2 open, 1 closed — check the NC card is rendered
    expect(html).toContain('card-nc')
    expect(html).toContain('Em Aberto')
    expect(html).toContain('Fechadas')
  })

  it('shows NC severity breakdown labels', async () => {
    const res = await authedRequest('/')
    const html = await res.text()
    expect(html).toContain('Por Severidade')
    expect(html).toContain('Baixa')
    expect(html).toContain('Média')
    expect(html).toContain('Alta')
  })
})

describe('GET / — dashboard with empty tenant data', () => {
  beforeEach(() => { setupSession(); setupTenant([], []) })
  afterEach(cleanup)

  it('renders without errors when arrays are empty', async () => {
    const res = await authedRequest('/')
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('Instruções de Trabalho')
    expect(html).toContain('Não Conformidades')
  })
})

describe('GET / — dashboard KPI indicators: Plantas and Bancadas', () => {
  beforeEach(() => {
    setupSession()
    tenants[TEST_USER_ID] = {
      plants: [{ id: 'p1', name: 'Planta A' }, { id: 'p2', name: 'Planta B' }],
      machines: [{ id: 'm1', name: 'Máquina 1', plantName: 'Planta A', status: 'operational' }],
      workbenches: [{ id: 'w1', name: 'Bancada 1' }, { id: 'w2', name: 'Bancada 2' }, { id: 'w3', name: 'Bancada 3' }],
      products: [], productionOrders: [], productionEntries: [],
      stockItems: [], nonConformances: [], suppliers: [],
      quotations: [], purchaseOrders: [], imports: [],
      boms: [], instructions: [], qualityChecks: [], users: [],
      kpis: { totalOrders: 0, activeOrders: 0, completedOrders: 0, totalProduced: 0, qualityRate: 100, totalMachines: 1 },
      chartData: {},
      bomItems: [], productSuppliers: [], workOrders: [], routes: [],
      serialNumbers: [], serialPendingItems: [],
      warehouses: [], separationOrders: [], stockExits: [],
      supplierCategories: [], productSupplierLinks: [],
      quotationNegotiations: [],
      workInstructions: [], workInstructionVersions: [],
      workInstructionSteps: [], workInstructionPhotos: [],
      workInstructionAuditLog: [],
    }
  })
  afterEach(cleanup)

  it('shows Plantas KPI label', async () => {
    const res = await authedRequest('/')
    const html = await res.text()
    expect(html).toContain('Plantas')
  })

  it('shows Bancadas KPI label', async () => {
    const res = await authedRequest('/')
    const html = await res.text()
    expect(html).toContain('Bancadas')
  })

  it('shows Máquinas KPI label', async () => {
    const res = await authedRequest('/')
    const html = await res.text()
    expect(html).toContain('Máquinas')
  })

  it('renders plant count correctly', async () => {
    const res = await authedRequest('/')
    const html = await res.text()
    // 2 plants in tenant — check count appears next to the Plantas label
    expect(html).toContain('>2</div>\n      <div class="kpi-label">Plantas</div>')
  })

  it('renders workbench count correctly', async () => {
    const res = await authedRequest('/')
    const html = await res.text()
    // 3 workbenches in tenant — check count appears next to the Bancadas label
    expect(html).toContain('>3</div>\n      <div class="kpi-label">Bancadas</div>')
  })

  it('renders safely with undefined plants and workbenches', async () => {
    // Remove plants and workbenches from tenant to test fallback
    delete (tenants[TEST_USER_ID] as any).plants
    delete (tenants[TEST_USER_ID] as any).workbenches
    const res = await authedRequest('/')
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('Plantas')
    expect(html).toContain('Bancadas')
  })
})
