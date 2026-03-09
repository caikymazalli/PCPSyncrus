/**
 * instrucoes.test.ts
 *
 * Safeguard tests for the Work Instructions module.
 * Verifies that:
 * 1. All client-side fetch calls use the absolute `/instrucoes/api/...` prefix
 *    (prevents 404s caused by missing route prefix).
 * 2. `viewInstruction` uses `encodeURIComponent` (prevents broken navigation
 *    for instruction IDs that contain special characters).
 * 3. The photo upload API returns a `view_url` built with string concatenation
 *    (no template-literal backtick that could confuse Vite/esbuild).
 * 4. The API routes for step CRUD respond correctly given valid tenant data.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import app from './instrucoes'
import { sessions, tenants } from '../userStore'

interface ApiResponse<T = Record<string, unknown>> {
  ok: boolean
  error?: string
  step?: T
  message?: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const TEST_TOKEN = 'test-token-instrucoes-safeguard'
const TEST_USER_ID = 'test-user-instrucoes-safeguard'
const TEST_INSTR_ID = 'instr-test-001'
const TEST_VERSION_ID = 'instrv-test-001'
const TEST_STEP_ID = 'step-test-001'

function setupSession() {
  sessions[TEST_TOKEN] = {
    token: TEST_TOKEN,
    userId: TEST_USER_ID,
    email: 'test-instrucoes@test.com',
    nome: 'Test User',
    empresa: 'Test Corp',
    plano: 'starter',
    role: 'admin',
    isDemo: false,
    createdAt: new Date().toISOString(),
    expiresAt: Date.now() + 3_600_000, // 1 hour
    empresaId: '1',
    grupoId: null,
  }
}

function setupTenant(withInstruction = false, withStep = false) {
  const instruction = {
    id: TEST_INSTR_ID,
    code: 'INSTR-001',
    title: 'Test Instruction',
    description: 'A test instruction',
    current_version: '1.0',
    status: 'draft',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  const version = {
    id: TEST_VERSION_ID,
    instruction_id: TEST_INSTR_ID,
    version: '1.0',
    is_current: true,
    status: 'draft',
    created_at: new Date().toISOString(),
  }
  const step = {
    id: TEST_STEP_ID,
    version_id: TEST_VERSION_ID,
    step_number: 1,
    title: 'Step One',
    description: 'First step',
    observation: '',
    created_at: new Date().toISOString(),
  }

  tenants[TEST_USER_ID] = {
    plants: [], machines: [], workbenches: [],
    products: [], productionOrders: [], productionEntries: [],
    stockItems: [], nonConformances: [], suppliers: [],
    quotations: [], purchaseOrders: [], imports: [],
    boms: [], instructions: [], qualityChecks: [], users: [],
    kpis: {},
    chartData: {},
    bomItems: [], productSuppliers: [], workOrders: [], routes: [],
    serialNumbers: [], serialPendingItems: [],
    warehouses: [], separationOrders: [], stockExits: [],
    supplierCategories: [], productSupplierLinks: [],
    quotationNegotiations: [],
    workInstructions: withInstruction ? [instruction] : [],
    workInstructionVersions: withInstruction ? [version] : [],
    workInstructionSteps: withInstruction && withStep ? [step] : [],
    workInstructionPhotos: [],
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
      ...(init?.headers as Record<string, string> || {}),
      Cookie: 'pcp_session=' + TEST_TOKEN,
    },
  })
}

// ── Source-code safeguard tests ───────────────────────────────────────────────

describe('instrucoes.ts source-code safeguards', () => {
  const srcPath = resolve(__dirname, 'instrucoes.ts')
  const src = readFileSync(srcPath, 'utf8')

  it('createStep fetch uses /instrucoes/api/instructions/ prefix', () => {
    expect(src).toContain("'/instrucoes/api/instructions/' + encodeURIComponent(instructionId) + '/steps'")
  })

  it('saveStep fetch uses /instrucoes/api/instructions/ prefix', () => {
    expect(src).toContain("'/instrucoes/api/instructions/' + encodeURIComponent(instructionId) + '/steps/' + encodeURIComponent(stepId)")
  })

  it('deleteStep fetch uses /instrucoes/api/instructions/ prefix', () => {
    // deleteStep reuses the same PUT URL pattern with DELETE method
    const deleteSection = src.slice(src.indexOf('async function deleteStep'))
    expect(deleteSection).toContain("'/instrucoes/api/instructions/'")
  })

  it('uploadPhoto fetch uses /instrucoes/api/instructions/ prefix', () => {
    expect(src).toContain("'/instrucoes/api/instructions/' + encodeURIComponent(instructionId) + '/photos/upload'")
  })

  it('viewInstruction uses encodeURIComponent', () => {
    expect(src).toContain("'/instrucoes/' + encodeURIComponent(id)")
  })

  it('viewOnlyInstruction uses encodeURIComponent and /view suffix', () => {
    expect(src).toContain("viewOnlyInstruction")
    const fnStart = src.indexOf('function viewOnlyInstruction')
    const fnBody = src.slice(fnStart, fnStart + 200)
    expect(fnBody).toContain("encodeURIComponent(id)")
    expect(fnBody).toContain("'/view'")
  })

  it('transitionStatus fetch uses /instrucoes/api/instructions/ prefix', () => {
    const fnStart = src.indexOf('async function transitionStatus')
    const fnBody = src.slice(fnStart, fnStart + 500)
    expect(fnBody).toContain("'/instrucoes/api/instructions/'")
    expect(fnBody).toContain("'/status'")
  })

  it('createVersion fetch uses /instrucoes/api/instructions/ prefix', () => {
    const fnStart = src.indexOf('async function createVersion')
    const fnBody = src.slice(fnStart, fnStart + 500)
    expect(fnBody).toContain("'/instrucoes/api/instructions/'")
    expect(fnBody).toContain("'/versions'")
  })

  it('view_url is built with string concatenation, not template literal', () => {
    // The line must contain string concatenation for view_url, NOT a backtick template literal
    const match = src.match(/view_url:\s*(.+)/)
    expect(match).not.toBeNull()
    const viewUrlExpr = match?.[1]
    expect(viewUrlExpr).toBeDefined()
    expect(viewUrlExpr).not.toMatch(/`/)
    expect(viewUrlExpr).toContain("'/instrucoes/api/photos/'")
  })
})

// ── Route integration tests ───────────────────────────────────────────────────

describe('GET /instrucoes (instruction list page)', () => {
  beforeEach(() => { setupSession(); setupTenant(true) })
  afterEach(cleanup)

  it('returns 200 with HTML containing viewInstruction', async () => {
    const res = await authedRequest('/')
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('viewInstruction')
    expect(html).toContain('encodeURIComponent')
  })

  it('includes the instruction list when instructions exist', async () => {
    const res = await authedRequest('/')
    const html = await res.text()
    expect(html).toContain('INSTR-001')
    expect(html).toContain('Test Instruction')
  })
})

describe('GET /instrucoes/:id (instruction view page)', () => {
  beforeEach(() => { setupSession(); setupTenant(true, true) })
  afterEach(cleanup)

  it('returns 200 with HTML containing correct API paths', async () => {
    const res = await authedRequest('/' + TEST_INSTR_ID)
    expect(res.status).toBe(200)
    const html = await res.text()
    // All client-side fetch calls must use the /instrucoes/api/ prefix
    expect(html).toContain('/instrucoes/api/instructions/')
  })

  it('HTML does not contain bare /api/instructions/ paths (would cause 404)', async () => {
    const res = await authedRequest('/' + TEST_INSTR_ID)
    const html = await res.text()
    // Must not have a fetch to /api/instructions without the /instrucoes prefix
    expect(html).not.toMatch(/fetch\(['"]\/api\/instructions/)
  })

  it('returns 200 with createStep and saveStep fetch calls using correct prefix', async () => {
    const res = await authedRequest('/' + TEST_INSTR_ID)
    const html = await res.text()
    expect(html).toContain("'/instrucoes/api/instructions/'")
  })

  it('returns not-found page for unknown instruction ID', async () => {
    const res = await authedRequest('/non-existent-id')
    expect(res.status).toBe(200) // page is still rendered, just with not-found content
    const html = await res.text()
    expect(html).toContain('não encontrada')
  })
})

describe('POST /instrucoes/api/instructions/:id/steps', () => {
  beforeEach(() => { setupSession(); setupTenant(true) })
  afterEach(cleanup)

  it('returns 200 and creates a step when given valid data', async () => {
    const res = await authedRequest('/api/instructions/' + TEST_INSTR_ID + '/steps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step_number: 1, title: 'Nova Etapa', description: '', observation: '' }),
    })
    expect(res.status).toBe(200)
    const data = await res.json() as ApiResponse<{ title: string; step_number: number }>
    expect(data.ok).toBe(true)
    expect(data.step).toBeDefined()
    expect(data.step?.title).toBe('Nova Etapa')
    expect(data.step?.step_number).toBe(1)
  })

  it('returns 400 when step_number or title is missing', async () => {
    const res = await authedRequest('/api/instructions/' + TEST_INSTR_ID + '/steps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step_number: 1 }), // missing title
    })
    expect(res.status).toBe(400)
    const data = await res.json() as ApiResponse
    expect(data.ok).toBe(false)
  })

  it('returns 404 when instruction does not exist', async () => {
    const res = await authedRequest('/api/instructions/nonexistent/steps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step_number: 1, title: 'Test' }),
    })
    expect(res.status).toBe(404)
  })
})

describe('PUT /instrucoes/api/instructions/:id/steps/:stepId', () => {
  beforeEach(() => { setupSession(); setupTenant(true, true) })
  afterEach(cleanup)

  it('returns 200 when updating a step', async () => {
    const res = await authedRequest(
      '/api/instructions/' + TEST_INSTR_ID + '/steps/' + TEST_STEP_ID,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step_number: 2, title: 'Updated Step' }),
      }
    )
    expect(res.status).toBe(200)
    const data = await res.json() as ApiResponse<{ title: string }>
    expect(data.ok).toBe(true)
    expect(data.step?.title).toBe('Updated Step')
  })
})

describe('DELETE /instrucoes/api/instructions/:id/steps/:stepId', () => {
  beforeEach(() => { setupSession(); setupTenant(true, true) })
  afterEach(cleanup)

  it('returns 200 when deleting an existing step', async () => {
    const res = await authedRequest(
      '/api/instructions/' + TEST_INSTR_ID + '/steps/' + TEST_STEP_ID,
      { method: 'DELETE' }
    )
    expect(res.status).toBe(200)
    const data = await res.json() as ApiResponse
    expect(data.ok).toBe(true)
  })

  it('returns 404 when step does not exist', async () => {
    const res = await authedRequest(
      '/api/instructions/' + TEST_INSTR_ID + '/steps/nonexistent',
      { method: 'DELETE' }
    )
    expect(res.status).toBe(404)
  })
})

// ── Read-only view route ──────────────────────────────────────────────────────

describe('GET /instrucoes/:id/view (read-only view)', () => {
  beforeEach(() => { setupSession(); setupTenant(true, true) })
  afterEach(cleanup)

  it('returns 200 with read-only HTML (no input/textarea elements)', async () => {
    const res = await authedRequest('/' + TEST_INSTR_ID + '/view')
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('wi-text')
    // Read-only view should not contain editable step inputs
    expect(html).not.toContain('data-field="step_number"')
    expect(html).not.toContain('data-field="title"')
  })

  it('shows step content in read-only divs', async () => {
    const res = await authedRequest('/' + TEST_INSTR_ID + '/view')
    const html = await res.text()
    expect(html).toContain('Step One')
  })

  it('includes print and edit links', async () => {
    const res = await authedRequest('/' + TEST_INSTR_ID + '/view')
    const html = await res.text()
    expect(html).toContain('window.print()')
    expect(html).toContain('/instrucoes/' + TEST_INSTR_ID + '"')
  })

  it('returns not-found page for unknown instruction ID', async () => {
    const res = await authedRequest('/non-existent-id/view')
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('não encontrada')
  })
})

// ── Status transition API ─────────────────────────────────────────────────────

describe('PUT /instrucoes/api/instructions/:id/status', () => {
  beforeEach(() => { setupSession(); setupTenant(true) })
  afterEach(cleanup)

  it('transitions draft → active successfully', async () => {
    const res = await authedRequest(
      '/api/instructions/' + TEST_INSTR_ID + '/status',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'active' }),
      }
    )
    expect(res.status).toBe(200)
    const data = await res.json() as ApiResponse<{ status: string }>
    expect(data.ok).toBe(true)
  })

  it('rejects invalid transition (draft → obsolete)', async () => {
    const res = await authedRequest(
      '/api/instructions/' + TEST_INSTR_ID + '/status',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'obsolete' }),
      }
    )
    expect(res.status).toBe(400)
    const data = await res.json() as ApiResponse
    expect(data.ok).toBe(false)
  })

  it('returns 404 for unknown instruction', async () => {
    const res = await authedRequest(
      '/api/instructions/nonexistent/status',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'active' }),
      }
    )
    expect(res.status).toBe(404)
  })

  it('returns 400 when status is missing', async () => {
    const res = await authedRequest(
      '/api/instructions/' + TEST_INSTR_ID + '/status',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }
    )
    expect(res.status).toBe(400)
  })
})

// ── List page button behaviour ────────────────────────────────────────────────

describe('GET /instrucoes list page button behaviour', () => {
  beforeEach(() => { setupSession(); setupTenant(true) })
  afterEach(cleanup)

  it('Visualizar button calls viewOnlyInstruction (opens /view)', async () => {
    const res = await authedRequest('/')
    const html = await res.text()
    expect(html).toContain('viewOnlyInstruction')
  })

  it('Editar button calls viewInstruction', async () => {
    const res = await authedRequest('/')
    const html = await res.text()
    expect(html).toContain('viewInstruction')
    // Ensure edit button still navigates to /instrucoes/:id (not /view)
    expect(html).not.toMatch(/onclick="viewInstruction[^"]*\/view"/)
  })
})

// ── Versions section on detail page ──────────────────────────────────────────

describe('GET /instrucoes/:id versions section', () => {
  beforeEach(() => { setupSession(); setupTenant(true, true) })
  afterEach(cleanup)

  it('detail page includes Versões section', async () => {
    const res = await authedRequest('/' + TEST_INSTR_ID)
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('Versões')
    expect(html).toContain('novaVersaoModal')
    expect(html).toContain('Nova versão')
  })

  it('detail page includes status transition buttons for draft status', async () => {
    const res = await authedRequest('/' + TEST_INSTR_ID)
    const html = await res.text()
    // The instruction in test setup has status 'draft', so Aprovar button should appear
    expect(html).toContain('Aprovar')
    expect(html).toContain('transitionStatus')
  })
})

// ── D1-first: PUT /instrucoes/api/instructions/:id/steps/:stepId ─────────────

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

// ── Source-code guardrails: D1-first in POST create handlers ─────────────────

describe('instrucoes.ts source-code guardrails D1-first (POST create instruction)', () => {
  const { readFileSync } = require('fs')
  const { resolve } = require('path')
  const src: string = readFileSync(resolve(__dirname, 'instrucoes.ts'), 'utf8')

  it('POST instruction handler: bloco D1 aparece antes da mutação de memória', () => {
    const handlerStart = src.indexOf("app.post('/api/instructions',")
    const handlerEnd = src.indexOf('\napp.', handlerStart + 1)
    const handlerBody = src.slice(handlerStart, handlerEnd > handlerStart ? handlerEnd : undefined)

    const d1BlockPos = handlerBody.indexOf("userId !== 'demo-tenant'")
    const memUpdatePos = handlerBody.indexOf('tenant.workInstructions.push(instruction)')
    expect(d1BlockPos).toBeGreaterThan(-1)
    expect(memUpdatePos).toBeGreaterThan(-1)
    expect(d1BlockPos).toBeLessThan(memUpdatePos)
  })

  it('POST instruction handler: inclui log [CRÍTICO] no caso de falha D1', () => {
    const handlerStart = src.indexOf("app.post('/api/instructions',")
    const handlerEnd = src.indexOf('\napp.', handlerStart + 1)
    const handlerBody = src.slice(handlerStart, handlerEnd > handlerStart ? handlerEnd : undefined)
    expect(handlerBody).toContain('[CRÍTICO]')
  })
})

describe('instrucoes.ts source-code guardrails D1-first (POST add step)', () => {
  const { readFileSync } = require('fs')
  const { resolve } = require('path')
  const src: string = readFileSync(resolve(__dirname, 'instrucoes.ts'), 'utf8')

  it('POST step handler: bloco D1 aparece antes da mutação de memória', () => {
    const handlerStart = src.indexOf("app.post('/api/instructions/:id/steps',")
    const handlerEnd = src.indexOf('\napp.', handlerStart + 1)
    const handlerBody = src.slice(handlerStart, handlerEnd > handlerStart ? handlerEnd : undefined)

    const d1BlockPos = handlerBody.indexOf("userId !== 'demo-tenant'")
    const memUpdatePos = handlerBody.indexOf('tenant.workInstructionSteps.push(step)')
    expect(d1BlockPos).toBeGreaterThan(-1)
    expect(memUpdatePos).toBeGreaterThan(-1)
    expect(d1BlockPos).toBeLessThan(memUpdatePos)
  })

  it('POST step handler: inclui log [CRÍTICO] no caso de falha D1', () => {
    const handlerStart = src.indexOf("app.post('/api/instructions/:id/steps',")
    const handlerEnd = src.indexOf('\napp.', handlerStart + 1)
    const handlerBody = src.slice(handlerStart, handlerEnd > handlerStart ? handlerEnd : undefined)
    expect(handlerBody).toContain('[CRÍTICO]')
  })
})

// ── Source-code guardrail: D1-first in PUT step handler ──────────────────────

describe('instrucoes.ts source-code guardrails D1-first (PUT step)', () => {
  const { readFileSync } = require('fs')
  const { resolve } = require('path')
  const src: string = readFileSync(resolve(__dirname, 'instrucoes.ts'), 'utf8')

  it('PUT step handler: bloco D1 (userId !== demo-tenant) aparece antes da mutação de memória', () => {
    const handlerStart = src.indexOf("app.put('/api/instructions/:id/steps/:stepId'")
    const handlerEnd = src.indexOf('\napp.', handlerStart + 1)
    const handlerBody = src.slice(handlerStart, handlerEnd > handlerStart ? handlerEnd : undefined)

    const d1BlockPos = handlerBody.indexOf("userId !== 'demo-tenant'")
    const memUpdatePos = handlerBody.indexOf('tenant.workInstructionSteps[stepIdx]')
    expect(d1BlockPos).toBeGreaterThan(-1)
    expect(memUpdatePos).toBeGreaterThan(-1)
    expect(d1BlockPos).toBeLessThan(memUpdatePos)
  })

  it('PUT step handler: sem catch{} silencioso em writes D1', () => {
    const handlerStart = src.indexOf("app.put('/api/instructions/:id/steps/:stepId'")
    const handlerEnd = src.indexOf('\napp.', handlerStart + 1)
    const handlerBody = src.slice(handlerStart, handlerEnd > handlerStart ? handlerEnd : undefined)
    expect(handlerBody).not.toMatch(/catch\s*\{\s*\}/)
    expect(handlerBody).not.toMatch(/catch\s*\{\s*\/\/\s*D1 unavailable/)
  })

  it('PUT step handler: inclui log [CRÍTICO] no caso de falha D1', () => {
    const handlerStart = src.indexOf("app.put('/api/instructions/:id/steps/:stepId'")
    const handlerEnd = src.indexOf('\napp.', handlerStart + 1)
    const handlerBody = src.slice(handlerStart, handlerEnd > handlerStart ? handlerEnd : undefined)
    expect(handlerBody).toContain('[CRÍTICO]')
  })

  it('PUT step handler: não usa stepIdx2 / não há bug de índice duplo', () => {
    const handlerStart = src.indexOf("app.put('/api/instructions/:id/steps/:stepId'")
    const handlerEnd = src.indexOf('\napp.', handlerStart + 1)
    const handlerBody = src.slice(handlerStart, handlerEnd > handlerStart ? handlerEnd : undefined)
    expect(handlerBody).not.toContain('stepIdx2')
  })
})

// ── Integração: PUT step — D1 falhando em produção ───────────────────────────

describe('PUT /instrucoes/api/instructions/:id/steps/:stepId — D1 falhando em produção', () => {
  beforeEach(() => { setupSession(); setupTenant(true, true) })
  afterEach(cleanup)

  it('retorna erro 500 e NÃO atualiza memória quando D1 falha', async () => {
    const originalTitle = tenants[TEST_USER_ID].workInstructionSteps[0].title

    const res = await app.request(
      '/api/instructions/' + TEST_INSTR_ID + '/steps/' + TEST_STEP_ID,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: 'pcp_session=' + TEST_TOKEN },
        body: JSON.stringify({ step_number: 2, title: 'Título Alterado' }),
      },
      { DB: failingDB }
    )

    expect(res.status).toBe(500)
    const data = await res.json() as ApiResponse
    expect(data.ok).toBe(false)

    // Memória NÃO deve ter sido alterada
    const stepInMem = tenants[TEST_USER_ID].workInstructionSteps[0]
    expect(stepInMem.title).toBe(originalTitle)
  })
})

// ── Integração: PUT step — D1 com sucesso em produção ────────────────────────

describe('PUT /instrucoes/api/instructions/:id/steps/:stepId — D1 com sucesso em produção', () => {
  beforeEach(() => { setupSession(); setupTenant(true, true) })
  afterEach(cleanup)

  it('retorna 200 e atualiza memória quando D1 tem sucesso', async () => {
    const res = await app.request(
      '/api/instructions/' + TEST_INSTR_ID + '/steps/' + TEST_STEP_ID,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: 'pcp_session=' + TEST_TOKEN },
        body: JSON.stringify({ step_number: 3, title: 'Etapa Produção OK' }),
      },
      { DB: successDB }
    )

    expect(res.status).toBe(200)
    const data = await res.json() as ApiResponse<{ title: string; step_number: number }>
    expect(data.ok).toBe(true)
    expect(data.step?.title).toBe('Etapa Produção OK')
    expect(data.step?.step_number).toBe(3)

    const stepInMem = tenants[TEST_USER_ID].workInstructionSteps[0]
    expect(stepInMem.title).toBe('Etapa Produção OK')
  })
})

// ── Integração: PUT step — modo demo (sem db) ─────────────────────────────────

describe('PUT /instrucoes/api/instructions/:id/steps/:stepId — modo demo (sem db)', () => {
  beforeEach(() => { setupSession(); setupTenant(true, true) })
  afterEach(cleanup)

  it('retorna 200 e atualiza memória no modo demo (sem db)', async () => {
    const res = await authedRequest(
      '/api/instructions/' + TEST_INSTR_ID + '/steps/' + TEST_STEP_ID,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step_number: 2, title: 'Etapa Demo' }),
      }
      // sem env.DB → modo demo
    )

    expect(res.status).toBe(200)
    const data = await res.json() as ApiResponse<{ title: string }>
    expect(data.ok).toBe(true)
    expect(data.step?.title).toBe('Etapa Demo')

    const stepInMem = tenants[TEST_USER_ID].workInstructionSteps[0]
    expect(stepInMem.title).toBe('Etapa Demo')
  })
})

// ── Integração: POST instruction — D1 falhando ───────────────────────────────

describe('POST /instrucoes/api/instructions — D1 falhando em produção', () => {
  beforeEach(() => { setupSession(); setupTenant(false) })
  afterEach(cleanup)

  it('retorna erro 500 e NÃO adiciona instrução à memória quando D1 falha', async () => {
    const initialCount = tenants[TEST_USER_ID].workInstructions.length

    const res = await app.request(
      '/api/instructions',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: 'pcp_session=' + TEST_TOKEN },
        body: JSON.stringify({ title: 'Nova Instrução', code: 'NI-001' }),
      },
      { DB: failingDB }
    )

    expect(res.status).toBe(500)
    const data = await res.json() as ApiResponse
    expect(data.ok).toBe(false)

    // Memória NÃO deve ter sido alterada
    expect(tenants[TEST_USER_ID].workInstructions.length).toBe(initialCount)
  })
})

describe('POST /instrucoes/api/instructions — D1 com sucesso em produção', () => {
  beforeEach(() => { setupSession(); setupTenant(false) })
  afterEach(cleanup)

  it('retorna 200 e adiciona instrução à memória quando D1 tem sucesso', async () => {
    const res = await app.request(
      '/api/instructions',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: 'pcp_session=' + TEST_TOKEN },
        body: JSON.stringify({ title: 'Instrução Produção OK', code: 'PROD-001' }),
      },
      { DB: successDB }
    )

    expect(res.status).toBe(200)
    const data = await res.json() as ApiResponse<{ instruction: { title: string }; version: { version: string } }>
    expect(data.ok).toBe(true)
    expect(data.instruction?.title).toBe('Instrução Produção OK')
    expect(data.version?.version).toBe('1.0')

    // Memória deve ter sido atualizada
    const found = tenants[TEST_USER_ID].workInstructions.find((i: any) => i.title === 'Instrução Produção OK')
    expect(found).toBeDefined()
  })
})

// ── Integração: POST step — D1 falhando ──────────────────────────────────────

describe('POST /instrucoes/api/instructions/:id/steps — D1 falhando em produção', () => {
  beforeEach(() => { setupSession(); setupTenant(true) })
  afterEach(cleanup)

  it('retorna erro 500 e NÃO adiciona etapa à memória quando D1 falha', async () => {
    const initialCount = tenants[TEST_USER_ID].workInstructionSteps.length

    const res = await app.request(
      '/api/instructions/' + TEST_INSTR_ID + '/steps',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: 'pcp_session=' + TEST_TOKEN },
        body: JSON.stringify({ step_number: 1, title: 'Etapa D1 Fail' }),
      },
      { DB: failingDB }
    )

    expect(res.status).toBe(500)
    const data = await res.json() as ApiResponse
    expect(data.ok).toBe(false)

    // Memória NÃO deve ter sido alterada
    expect(tenants[TEST_USER_ID].workInstructionSteps.length).toBe(initialCount)
  })
})

describe('POST /instrucoes/api/instructions/:id/steps — D1 com sucesso em produção', () => {
  beforeEach(() => { setupSession(); setupTenant(true) })
  afterEach(cleanup)

  it('retorna 200 e adiciona etapa à memória quando D1 tem sucesso', async () => {
    const res = await app.request(
      '/api/instructions/' + TEST_INSTR_ID + '/steps',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: 'pcp_session=' + TEST_TOKEN },
        body: JSON.stringify({ step_number: 1, title: 'Etapa Produção OK' }),
      },
      { DB: successDB }
    )

    expect(res.status).toBe(200)
    const data = await res.json() as ApiResponse<{ step: { title: string; step_number: number } }>
    expect(data.ok).toBe(true)
    expect(data.step?.title).toBe('Etapa Produção OK')
    expect(data.step?.step_number).toBe(1)

    // Memória deve ter sido atualizada
    const found = tenants[TEST_USER_ID].workInstructionSteps.find((s: any) => s.title === 'Etapa Produção OK')
    expect(found).toBeDefined()
  })
})

// ── GET /api/report — printable list of work instructions ────────────────────

describe('GET /instrucoes/api/report — printable report', () => {
  beforeEach(() => { setupSession(); setupTenant(true) })
  afterEach(cleanup)

  it('returns 200 with HTML content-type', async () => {
    const res = await authedRequest('/api/report')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
  })

  it('HTML contains report title', async () => {
    const res = await authedRequest('/api/report')
    const html = await res.text()
    expect(html).toContain('Relatório de Instruções de Trabalho')
  })

  it('HTML contains instruction code and title', async () => {
    const res = await authedRequest('/api/report')
    const html = await res.text()
    expect(html).toContain('INSTR-001')
    expect(html).toContain('Test Instruction')
  })

  it('HTML triggers window.print on load', async () => {
    const res = await authedRequest('/api/report')
    const html = await res.text()
    expect(html).toContain('window.print()')
  })
})

describe('GET /instrucoes/api/report — empty tenant', () => {
  beforeEach(() => { setupSession(); setupTenant(false) })
  afterEach(cleanup)

  it('returns 200 even when no instructions exist', async () => {
    const res = await authedRequest('/api/report')
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('instrução(ões)')
  })
})
