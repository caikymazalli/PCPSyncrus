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
