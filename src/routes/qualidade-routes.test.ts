/**
 * qualidade-routes.test.ts
 *
 * Tests for the Quality (NC) reporting feature.
 * Verifies:
 * 1. The report PDF endpoint requires authentication (401 without session).
 * 2. The report PDF endpoint returns 200 with expected HTML markers for an
 *    authenticated session.
 * 3. The period filter (openedAt) correctly includes / excludes NCs based on
 *    deterministic date ranges.
 * 4. The reporting UI page returns 200 and contains the expected form elements.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import app from './qualidade'
import { sessions, tenants } from '../userStore'

// ── Helpers ──────────────────────────────────────────────────────────────────

const TEST_TOKEN   = 'test-token-qualidade-report'
const TEST_USER_ID = 'test-user-qualidade-report'

function setupSession() {
  sessions[TEST_TOKEN] = {
    token:     TEST_TOKEN,
    userId:    TEST_USER_ID,
    email:     'test-qualidade@test.com',
    nome:      'Tester Qualidade',
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

function setupTenant(ncs: any[] = []) {
  tenants[TEST_USER_ID] = {
    plants: [], machines: [], workbenches: [],
    products: [], productionOrders: [], productionEntries: [],
    stockItems: [], nonConformances: ncs, suppliers: [],
    quotations: [], purchaseOrders: [], imports: [],
    boms: [], instructions: [], qualityChecks: [], users: [],
    kpis: {},
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
}

function cleanup() {
  delete sessions[TEST_TOKEN]
  delete tenants[TEST_USER_ID]
}

function authedRequest(path: string, init?: RequestInit) {
  return app.request(path, {
    ...init,
    headers: {
      ...((init?.headers as Record<string, string>) || {}),
      Cookie: 'pcp_session=' + TEST_TOKEN,
    },
  })
}

// ── Sample NCs ────────────────────────────────────────────────────────────────

const nc1 = {
  id: 'nc-rep-001',
  code: 'NC-001',
  title: 'Dimensão fora de tolerância',
  type: 'processo',
  severity: 'high',
  status: 'open',
  responsible: 'Ana Silva',
  openedAt: '2024-06-01',
  createdAt: '2024-06-01',
  dueDate: '2024-06-15',
  description: 'Peça fora do padrão',
  orderCode: 'OP-100',
  stepName: 'Torneamento',
  quantityRejected: 5,
  operator: 'João',
  rootCause: '', correctiveAction: '', product: '', productId: '',
  department: '', images: [],
}

const nc2 = {
  id: 'nc-rep-002',
  code: 'NC-002',
  title: 'Material com defeito',
  type: 'material',
  severity: 'critical',
  status: 'closed',
  responsible: 'Carlos Melo',
  openedAt: '2024-07-10',
  createdAt: '2024-07-10',
  dueDate: '2024-07-20',
  description: 'Material com trinca',
  orderCode: 'OP-101',
  stepName: 'Inspeção',
  quantityRejected: 2,
  operator: 'Maria',
  rootCause: '', correctiveAction: '', product: '', productId: '',
  department: '', images: [],
}

const nc3 = {
  id: 'nc-rep-003',
  code: 'NC-003',
  title: 'Falha no processo',
  type: 'processo',
  severity: 'medium',
  status: 'in_analysis',
  responsible: 'Pedro Nunes',
  openedAt: '2024-08-05',
  createdAt: '2024-08-05',
  dueDate: '2024-08-20',
  description: 'Processo irregular',
  orderCode: 'OP-102',
  stepName: 'Montagem',
  quantityRejected: 1,
  operator: 'Lúcia',
  rootCause: '', correctiveAction: '', product: '', productId: '',
  department: '', images: [],
}

// ── Auth tests ────────────────────────────────────────────────────────────────

describe('GET /api/report/pdf — authentication', () => {
  it('returns 401 JSON when no session cookie is provided', async () => {
    setupTenant()
    const res = await app.request('/api/report/pdf')
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBeTruthy()
    cleanup()
  })

  it('returns 401 JSON with a completely invalid token', async () => {
    setupTenant()
    const res = await app.request('/api/report/pdf', {
      headers: { Cookie: 'pcp_session=invalid-token-xyz' },
    })
    expect(res.status).toBe(401)
    cleanup()
  })
})

// ── Basic rendering tests ─────────────────────────────────────────────────────

describe('GET /api/report/pdf — authenticated, basic output', () => {
  beforeEach(() => { setupSession(); setupTenant([nc1, nc2]) })
  afterEach(cleanup)

  it('returns 200 with HTML content-type', async () => {
    const res = await authedRequest('/api/report/pdf')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
  })

  it('HTML contains report title marker', async () => {
    const res = await authedRequest('/api/report/pdf')
    const html = await res.text()
    expect(html).toContain('Relatório de Não Conformidades')
  })

  it('HTML contains generation timestamp marker', async () => {
    const res = await authedRequest('/api/report/pdf')
    const html = await res.text()
    expect(html).toContain('Gerado em')
  })

  it('HTML contains filter summary section', async () => {
    const res = await authedRequest('/api/report/pdf')
    const html = await res.text()
    expect(html).toContain('Filtros aplicados')
  })

  it('HTML contains window.print() call for auto-print on load', async () => {
    const res = await authedRequest('/api/report/pdf')
    const html = await res.text()
    expect(html).toContain('window.print()')
  })

  it('HTML contains NC data from the tenant', async () => {
    const res = await authedRequest('/api/report/pdf')
    const html = await res.text()
    expect(html).toContain('NC-001')
    expect(html).toContain('NC-002')
    expect(html).toContain('Dimensão fora de tolerância')
  })
})

// ── Period filter tests ───────────────────────────────────────────────────────

describe('GET /api/report/pdf — period filter (openedAt)', () => {
  beforeEach(() => { setupSession(); setupTenant([nc1, nc2, nc3]) })
  afterEach(cleanup)

  it('returns all NCs when no date filter is applied', async () => {
    const res = await authedRequest('/api/report/pdf')
    const html = await res.text()
    expect(html).toContain('NC-001')
    expect(html).toContain('NC-002')
    expect(html).toContain('NC-003')
    expect(html).toContain('Total: 3 NC(s)')
  })

  it('filters NCs by start date (excludes NCs opened before start)', async () => {
    // start=2024-07-01 should exclude nc1 (2024-06-01)
    const res = await authedRequest('/api/report/pdf?start=2024-07-01')
    const html = await res.text()
    expect(html).not.toContain('NC-001')
    expect(html).toContain('NC-002')
    expect(html).toContain('NC-003')
    expect(html).toContain('Total: 2 NC(s)')
  })

  it('filters NCs by end date (excludes NCs opened after end)', async () => {
    // end=2024-07-15 should exclude nc3 (2024-08-05)
    const res = await authedRequest('/api/report/pdf?end=2024-07-15')
    const html = await res.text()
    expect(html).toContain('NC-001')
    expect(html).toContain('NC-002')
    expect(html).not.toContain('NC-003')
    expect(html).toContain('Total: 2 NC(s)')
  })

  it('filters NCs by both start and end date', async () => {
    // start=2024-07-01 end=2024-07-31 should return only nc2
    const res = await authedRequest('/api/report/pdf?start=2024-07-01&end=2024-07-31')
    const html = await res.text()
    expect(html).not.toContain('NC-001')
    expect(html).toContain('NC-002')
    expect(html).not.toContain('NC-003')
    expect(html).toContain('Total: 1 NC(s)')
  })

  it('returns empty result message when date range matches nothing', async () => {
    const res = await authedRequest('/api/report/pdf?start=2020-01-01&end=2020-12-31')
    const html = await res.text()
    expect(html).toContain('Nenhuma NC encontrada')
    expect(html).toContain('Total: 0 NC(s)')
  })
})

// ── Status filter tests ───────────────────────────────────────────────────────

describe('GET /api/report/pdf — status filter', () => {
  beforeEach(() => { setupSession(); setupTenant([nc1, nc2, nc3]) })
  afterEach(cleanup)

  it('filters NCs by a single status', async () => {
    const res = await authedRequest('/api/report/pdf?status=open')
    const html = await res.text()
    expect(html).toContain('NC-001')
    expect(html).not.toContain('NC-002')
    expect(html).not.toContain('NC-003')
    expect(html).toContain('Total: 1 NC(s)')
  })

  it('filters NCs by multiple statuses', async () => {
    const res = await authedRequest('/api/report/pdf?status=open&status=in_analysis')
    const html = await res.text()
    expect(html).toContain('NC-001')
    expect(html).not.toContain('NC-002')
    expect(html).toContain('NC-003')
    expect(html).toContain('Total: 2 NC(s)')
  })
})

// ── Report UI page tests ──────────────────────────────────────────────────────

describe('GET /relatorios — report UI page', () => {
  beforeEach(() => { setupSession(); setupTenant([nc1, nc2]) })
  afterEach(cleanup)

  it('returns 200 with HTML page', async () => {
    const res = await authedRequest('/relatorios')
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('Relatório')
  })

  it('contains filter controls', async () => {
    const res = await authedRequest('/relatorios')
    const html = await res.text()
    expect(html).toContain('rel_status')
    expect(html).toContain('rel_start')
    expect(html).toContain('rel_end')
  })

  it('contains gerarPDF function that calls the report API', async () => {
    const res = await authedRequest('/relatorios')
    const html = await res.text()
    expect(html).toContain('gerarPDF')
    expect(html).toContain('/qualidade/api/report/pdf')
  })

  it('contains allNCs dataset embedded for client-side filtering', async () => {
    const res = await authedRequest('/relatorios')
    const html = await res.text()
    expect(html).toContain('allNCs')
  })
})
